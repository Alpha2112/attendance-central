import { type DatabaseClient } from '@attendance/database';
import { type KafkaProducer } from '@attendance/kafka';
import { KAFKA_TOPICS } from '@attendance/contracts';
import {
  WebhookDispatcher,
  type IntegrationSubscriptionDetails,
} from '../webhook/webhook.dispatcher.js';
import { type AppLogger } from '@attendance/logging';
import { randomUUID } from 'node:crypto';

export interface OutboxRow {
  id: number;
  event_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  organization_id: number | null;
  payload: string | Record<string, unknown>;
  status: string;
  attempt_count: number;
}

export class OutboxDispatcher {
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private readonly webhookDispatcher: WebhookDispatcher;

  constructor(
    private readonly db: DatabaseClient,
    private readonly kafkaProducer?: KafkaProducer,
    private readonly logger?: AppLogger,
  ) {
    this.webhookDispatcher = new WebhookDispatcher(db, logger);
  }

  /**
   * Processes a single batch of pending outbox events.
   */
  public async processBatch(
    limit = 20,
  ): Promise<{ processed: number; succeeded: number; failed: number }> {
    const rows = (await this.db.query(
      `SELECT id, event_id, event_type, aggregate_type, aggregate_id, organization_id, payload, status, attempt_count
       FROM outbox_events
       WHERE status = 'PENDING' AND available_at <= NOW(6)
       ORDER BY available_at ASC, id ASC
       LIMIT ?`,
      [limit],
    )) as OutboxRow[];

    const outboxRows: OutboxRow[] = Array.isArray(rows) ? rows : [];
    let succeeded = 0;
    let failed = 0;

    for (const row of outboxRows) {
      const payloadObj = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      const eventType = row.event_type;

      // Find active subscriptions for this event type, scoped to the event's
      // organization, then keep only those whose filter rules match the event.
      const allSubscribers = await this.getSubscribers(eventType, row.organization_id);
      const subscribers = allSubscribers.filter((s) =>
        this.matchesFilter(s.filterRules, payloadObj),
      );

      if (subscribers.length === 0) {
        // No external webhooks registered, mark as published
        await this.db.query(
          `UPDATE outbox_events SET status = 'PUBLISHED', published_at = NOW(6) WHERE id = ?`,
          [row.id],
        );
        succeeded++;
        continue;
      }

      let allSucceeded = true;
      let earliestNextRetry: Date | undefined;

      for (const subscriber of subscribers) {
        const attempt = (row.attempt_count || 0) + 1;
        // Build the delivered payload from this integration's optional identifiers
        // (depends on the subscription setting). organizationId falls back to the
        // event's own org when not overridden; tenantId is included only when set.
        const subPayload: Record<string, unknown> = { ...payloadObj };
        if (subscriber.payloadOrganizationId != null && subscriber.payloadOrganizationId !== '') {
          subPayload['organizationId'] = subscriber.payloadOrganizationId;
        }
        if (subscriber.tenantId != null && subscriber.tenantId !== '') {
          subPayload['tenantId'] = subscriber.tenantId;
        }
        const result = await this.webhookDispatcher.dispatch(
          subscriber,
          row.event_id,
          subPayload,
          attempt,
        );

        if (!result.success) {
          allSucceeded = false;
          if (
            result.nextRetryAt &&
            (!earliestNextRetry || result.nextRetryAt < earliestNextRetry)
          ) {
            earliestNextRetry = result.nextRetryAt;
          }
        }
      }

      if (allSucceeded) {
        await this.db.query(
          `UPDATE outbox_events SET status = 'PUBLISHED', published_at = NOW(6), attempt_count = attempt_count + 1 WHERE id = ?`,
          [row.id],
        );
        succeeded++;
      } else if (earliestNextRetry) {
        await this.db.query(
          `UPDATE outbox_events SET available_at = ?, attempt_count = attempt_count + 1, last_error = 'Webhook delivery failed, scheduled retry' WHERE id = ?`,
          [earliestNextRetry, row.id],
        );
        failed++;
      } else {
        // Permanent failure / retry limit exceeded
        await this.db.query(
          `UPDATE outbox_events SET status = 'FAILED', attempt_count = attempt_count + 1, last_error = 'Max retries exceeded' WHERE id = ?`,
          [row.id],
        );
        failed++;

        // Emit to DLQ
        if (this.kafkaProducer) {
          await this.kafkaProducer.publish({
            topic: KAFKA_TOPICS.DEAD_LETTER_QUEUE,
            key: `outbox:${row.event_id}`,
            value: {
              dlqId: randomUUID(),
              failedAt: new Date().toISOString(),
              sourceTopic: 'outbox_events',
              reason: 'INTEGRATION_DISPATCH_EXHAUSTED',
              errorMessage: 'Max retry attempts exceeded across integration subscribers',
              payload: payloadObj,
            },
          });
        }
      }
    }

    return { processed: outboxRows.length, succeeded, failed };
  }

  /**
   * Starts background outbox polling loop.
   */
  public start(pollIntervalMs = 3000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const loop = async () => {
      if (!this.isRunning) return;
      try {
        await this.processBatch(25);
      } catch (err: unknown) {
        this.logger?.error(
          { error: err instanceof Error ? err.message : String(err) },
          'Outbox batch processing error',
        );
      } finally {
        if (this.isRunning) {
          this.pollTimer = setTimeout(loop, pollIntervalMs);
        }
      }
    };

    loop().catch(() => {});
  }

  /**
   * Stops background polling.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async getSubscribers(
    eventType: string,
    organizationId?: number | null,
  ): Promise<IntegrationSubscriptionDetails[]> {
    try {
      const conditions = [`s.event_type = ?`, `s.status = 'ACTIVE'`, `i.status = 'ACTIVE'`];
      const params: unknown[] = [eventType];
      // Scope delivery to the event's company so one tenant's punches never reach
      // another tenant's endpoints. A null org on the event means unscoped (legacy).
      if (organizationId !== undefined && organizationId !== null) {
        conditions.push(`i.organization_id = ?`);
        params.push(organizationId);
      }

      const rows = (await this.db.query(
        `SELECT i.id, i.organization_id, i.payload_tenant_id, i.payload_organization_id, i.name, i.target_type, i.endpoint_url,
                i.auth_type, i.secret_reference, i.retry_limit, i.timeout_ms, s.filter_rules
         FROM integrations i
         INNER JOIN integration_subscriptions s ON s.integration_id = i.id
         WHERE ${conditions.join(' AND ')}`,
        params,
      )) as Array<{
        id: number;
        organization_id: string;
        payload_tenant_id: string | null;
        payload_organization_id: string | null;
        name: string;
        target_type: string;
        endpoint_url: string;
        auth_type: string;
        secret_reference: string;
        retry_limit?: number;
        timeout_ms?: number;
        filter_rules?: Record<string, unknown> | string | null;
      }>;

      if (!Array.isArray(rows)) return [];

      return rows.map((r) => ({
        id: r.id,
        organizationId: r.organization_id,
        tenantId: r.payload_tenant_id ?? null,
        payloadOrganizationId: r.payload_organization_id ?? null,
        name: r.name,
        targetType: r.target_type,
        endpointUrl: r.endpoint_url,
        authType: r.auth_type,
        secretReference: r.secret_reference,
        retryLimit: r.retry_limit || 5,
        timeoutMs: r.timeout_ms || 10000,
        filterRules:
          typeof r.filter_rules === 'string'
            ? (JSON.parse(r.filter_rules) as Record<string, unknown>)
            : (r.filter_rules ?? null),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Returns true when a subscription's filter rules match the event payload.
   * Supported keys (all optional, ANDed together):
   *   - branchId:   number | string | array — matches payload.branchId
   *   - deviceCode: string | array           — matches payload.deviceId (device code)
   *   - punchType:  string | array           — matches payload.punchType
   * An empty/absent ruleset matches everything.
   */
  private matchesFilter(
    rules: Record<string, unknown> | null | undefined,
    payload: Record<string, unknown>,
  ): boolean {
    if (!rules || Object.keys(rules).length === 0) return true;

    const matchOne = (ruleValue: unknown, eventValue: unknown): boolean => {
      if (ruleValue === undefined || ruleValue === null) return true;
      const candidates = Array.isArray(ruleValue) ? ruleValue : [ruleValue];
      return candidates.map((v) => String(v)).includes(String(eventValue));
    };

    if ('branchId' in rules && !matchOne(rules['branchId'], payload['branchId'])) return false;
    if ('deviceCode' in rules && !matchOne(rules['deviceCode'], payload['deviceId'])) return false;
    if ('punchType' in rules && !matchOne(rules['punchType'], payload['punchType'])) return false;
    return true;
  }
}
