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
      `SELECT id, event_id, event_type, aggregate_type, aggregate_id, payload, status, attempt_count 
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

      // Find active subscriptions for this event type
      const subscribers = await this.getSubscribers(eventType);

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
        const result = await this.webhookDispatcher.dispatch(
          subscriber,
          row.event_id,
          payloadObj,
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

  private async getSubscribers(eventType: string): Promise<IntegrationSubscriptionDetails[]> {
    try {
      const rows = (await this.db.query(
        `SELECT i.id, i.organization_id, i.name, i.target_type, i.endpoint_url, 
                i.auth_type, i.secret_reference, i.retry_limit, i.timeout_ms
         FROM integrations i
         INNER JOIN integration_subscriptions s ON s.integration_id = i.id
         WHERE s.event_type = ? AND s.status = 'ACTIVE' AND i.status = 'ACTIVE'`,
        [eventType],
      )) as Array<{
        id: number;
        organization_id: string;
        name: string;
        target_type: string;
        endpoint_url: string;
        auth_type: string;
        secret_reference: string;
        retry_limit?: number;
        timeout_ms?: number;
      }>;

      if (!Array.isArray(rows)) return [];

      return rows.map((r) => ({
        id: r.id,
        organizationId: r.organization_id,
        name: r.name,
        targetType: r.target_type,
        endpointUrl: r.endpoint_url,
        authType: r.auth_type,
        secretReference: r.secret_reference,
        retryLimit: r.retry_limit || 5,
        timeoutMs: r.timeout_ms || 10000,
      }));
    } catch {
      return [];
    }
  }
}
