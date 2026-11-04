// Raw DB rows are typed as `any` to satisfy DatabaseClient.query's mysql2
// RowDataPacket/ResultSetHeader constraint (mysql2 is not a direct dependency of
// this app), matching the convention used across the API's data-access code.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { DatabaseClient } from '@attendance/database';
import { WebhookSigner } from '@attendance/integration';
import { AppLogger } from '@attendance/logging';
import { LOGGER_TOKEN } from '../logging/logging.module.js';
import { CreateIntegrationDto } from './dto/create-integration.dto.js';
import { UpdateIntegrationDto } from './dto/update-integration.dto.js';

const ORG_ID = 1;
const DEFAULT_EVENT_TYPE = 'attendance.normalized.v1';

export interface IntegrationListItem {
  id: number;
  name: string;
  targetType: string;
  endpointUrl: string;
  authType: string;
  status: string;
  eventTypes: string[];
  todayCount: number;
  todaySuccess: number;
  successRate: number;
  avgLatencyMs: number;
}

@Injectable()
export class IntegrationsService {
  // Same signer the live dispatcher uses, so the key/signature shown in the UI is
  // exactly what signs real deliveries. All key material is derived, never stored.
  private readonly signer = new WebhookSigner();

  constructor(
    @Inject(DatabaseClient) private readonly db: DatabaseClient,
    @Inject(LOGGER_TOKEN) private readonly logger: AppLogger,
  ) {}

  /** Deterministic per-integration HMAC signing secret (derived, never stored). */
  public signingSecret(integrationId: number): string {
    return this.signer.hmacSecret(integrationId);
  }

  /** Signs `${timestamp}.${payload}` for an integration using its configured algorithm. */
  private computeSignature(
    integrationId: number,
    authType: string,
    payload: string,
    timestamp: string,
  ): string {
    return this.signer.sign(integrationId, authType, payload, timestamp).header;
  }

  private sampleEvent(): Record<string, unknown> {
    const now = new Date();
    return {
      eventId: crypto.randomUUID(),
      schemaVersion: 1,
      organizationId: 'ORG-TECHIVE',
      employeeId: 'EMP-0001',
      deviceId: 'SUP-GSDK-01',
      vendor: 'SUPREMA',
      punchType: 'IN',
      verificationType: 'FACE',
      punchTime: now.toISOString(),
      punchTimeUtc: now.toISOString(),
      receivedAt: now.toISOString(),
      source: 'REALTIME',
      eventFingerprint: crypto
        .createHash('sha256')
        .update(`EMP-0001:${now.toISOString()}`)
        .digest('hex'),
    };
  }

  public async list(): Promise<IntegrationListItem[]> {
    const rows = await this.db.query<any[]>(
      `SELECT i.id, i.name, i.target_type, i.endpoint_url, i.auth_type, i.status,
        (SELECT COUNT(*) FROM delivery_attempts da WHERE da.integration_id = i.id AND da.created_at >= CURDATE()) AS today_count,
        (SELECT COUNT(*) FROM delivery_attempts da WHERE da.integration_id = i.id AND da.created_at >= CURDATE() AND da.status = 'SUCCESS') AS today_success,
        (SELECT ROUND(AVG(da.latency_ms)) FROM delivery_attempts da WHERE da.integration_id = i.id AND da.latency_ms IS NOT NULL AND da.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)) AS avg_latency
       FROM integrations i
       WHERE i.organization_id = ?
       ORDER BY i.id ASC`,
      [ORG_ID],
    );

    const items: IntegrationListItem[] = [];
    for (const r of rows) {
      const id = Number(r['id']);
      const eventTypes = await this.eventTypesFor(id);
      const todayCount = Number(r['today_count'] ?? 0);
      const todaySuccess = Number(r['today_success'] ?? 0);
      items.push({
        id,
        name: String(r['name']),
        targetType: String(r['target_type']),
        endpointUrl: String(r['endpoint_url']),
        authType: String(r['auth_type']),
        status: String(r['status']),
        eventTypes,
        todayCount,
        todaySuccess,
        successRate: todayCount > 0 ? Math.round((todaySuccess / todayCount) * 10000) / 100 : 100,
        avgLatencyMs: Number(r['avg_latency'] ?? 0),
      });
    }
    return items;
  }

  private async eventTypesFor(integrationId: number): Promise<string[]> {
    const rows = await this.db.query<any[]>(
      `SELECT event_type FROM integration_subscriptions WHERE integration_id = ? AND status = 'ACTIVE'`,
      [integrationId],
    );
    const types = rows.map((r) => String(r['event_type']));
    return types.length > 0 ? types : [DEFAULT_EVENT_TYPE];
  }

  public async stats(): Promise<{
    backlog: number;
    deliveries24h: number;
    successRate: number;
    avgLatencyMs: number;
    activeEndpoints: number;
  }> {
    const backlogRows = await this.db.query<any[]>(
      `SELECT COUNT(*) AS n FROM outbox_events WHERE status = 'PENDING'`,
    );
    const deliveryRows = await this.db.query<any[]>(
      `SELECT COUNT(*) AS total,
         SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success,
         ROUND(AVG(latency_ms)) AS avg_latency
       FROM delivery_attempts WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
    );
    const endpointRows = await this.db.query<any[]>(
      `SELECT COUNT(*) AS n FROM integrations WHERE organization_id = ? AND status = 'ACTIVE'`,
      [ORG_ID],
    );

    const total = Number(deliveryRows[0]?.['total'] ?? 0);
    const success = Number(deliveryRows[0]?.['success'] ?? 0);
    return {
      backlog: Number(backlogRows[0]?.['n'] ?? 0),
      deliveries24h: total,
      successRate: total > 0 ? Math.round((success / total) * 10000) / 100 : 100,
      avgLatencyMs: Number(deliveryRows[0]?.['avg_latency'] ?? 0),
      activeEndpoints: Number(endpointRows[0]?.['n'] ?? 0),
    };
  }

  private async getRow(id: number): Promise<Record<string, unknown>> {
    const rows = await this.db.query<any[]>(
      `SELECT * FROM integrations WHERE id = ? AND organization_id = ?`,
      [id, ORG_ID],
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException(`Integration ${id} not found`);
    }
    return row;
  }

  /** Full detail including the derived signing material, example body, headers, and verify snippet. */
  public async getDetail(id: number): Promise<Record<string, unknown>> {
    const row = await this.getRow(id);
    const authType = String(row['auth_type'] || 'HMAC_SHA256').toUpperCase();
    const isEd25519 = authType === 'ED25519';
    const isSigned = authType !== 'NONE';
    const eventTypes = await this.eventTypesFor(id);
    const filterRules = await this.filterRulesFor(id);
    const sample = this.sampleEvent();
    // Compact JSON is exactly what is sent and signed, so the example body,
    // timestamp and signature below are mutually reproducible by the receiver.
    const payload = JSON.stringify(sample);
    const timestamp = Date.now().toString();
    const signature = isSigned ? this.computeSignature(id, authType, payload, timestamp) : null;

    const hmacKey = isEd25519 ? null : this.signingSecret(id);
    const ed = isEd25519 ? this.signer.ed25519PublicKey(id) : null;

    const verifySnippet = isEd25519
      ? [
          "const crypto = require('crypto');",
          '// PUBLIC_KEY_PEM is the Ed25519 public key shown above (safe to store).',
          "const signed = `${req.headers['x-attendance-timestamp']}.${rawBody}`;",
          "const sig = Buffer.from(req.headers['x-attendance-signature'].replace('ed25519=', ''), 'base64');",
          'const ok = crypto.verify(null, Buffer.from(signed), PUBLIC_KEY_PEM, sig);',
        ].join('\n')
      : [
          "const crypto = require('crypto');",
          "const signed = `${req.headers['x-attendance-timestamp']}.${rawBody}`;",
          "const expected = 'sha256=' + crypto.createHmac('sha256', SIGNING_KEY).update(signed).digest('hex');",
          "const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers['x-attendance-signature']));",
        ].join('\n');

    const exampleHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Attendance-Event-Id': String(sample['eventId']),
      'X-Attendance-Timestamp': timestamp,
      ...(signature
        ? {
            'X-Attendance-Signature': signature,
            'X-Attendance-Signature-Algorithm': authType,
          }
        : {}),
      'X-Attendance-Attempt': '1',
      'User-Agent': 'Enterprise-Attendance-Integration-Platform/1.0',
    };

    return {
      id,
      name: String(row['name']),
      targetType: String(row['target_type']),
      endpointUrl: String(row['endpoint_url']),
      tenantId: row['payload_tenant_id'] ? String(row['payload_tenant_id']) : null,
      organizationId: row['payload_organization_id'] ? String(row['payload_organization_id']) : null,
      authType: String(row['auth_type']),
      status: String(row['status']),
      secretReference: row['secret_reference'] ? String(row['secret_reference']) : null,
      retryLimit: Number(row['retry_limit'] ?? 5),
      timeoutMs: Number(row['timeout_ms'] ?? 10000),
      eventTypes,
      filterRules,
      signing: {
        mode: isEd25519 ? 'ASYMMETRIC' : isSigned ? 'HMAC' : 'NONE',
        algorithm: isEd25519 ? 'Ed25519' : isSigned ? 'HMAC-SHA256' : 'NONE',
        signingKey: hmacKey,
        publicKeyPem: ed?.pem ?? null,
        publicKeyBase64: ed?.base64 ?? null,
        signatureHeader: 'X-Attendance-Signature',
        timestampHeader: 'X-Attendance-Timestamp',
        signedContent: '`${X-Attendance-Timestamp}.${rawRequestBody}`',
        exampleSignature: signature,
      },
      exampleHeaders,
      exampleBody: payload,
      verifySnippet,
    };
  }

  private async filterRulesFor(integrationId: number): Promise<Record<string, unknown> | null> {
    const rows = await this.db.query<any[]>(
      `SELECT filter_rules FROM integration_subscriptions
       WHERE integration_id = ? AND filter_rules IS NOT NULL LIMIT 1`,
      [integrationId],
    );
    const raw = rows[0]?.['filter_rules'];
    if (!raw) return null;
    return typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : raw;
  }

  /** Builds a routing filter_rules object from the DTO's branch/device/punch fields. */
  private buildFilterRules(
    dto: CreateIntegrationDto | UpdateIntegrationDto,
  ): Record<string, unknown> | null {
    const rules: Record<string, unknown> = {};
    if (dto.filterRules) {
      try {
        const parsed =
          typeof dto.filterRules === 'string' ? JSON.parse(dto.filterRules) : dto.filterRules;
        if (parsed && typeof parsed === 'object') Object.assign(rules, parsed);
      } catch {
        /* ignore malformed advanced JSON */
      }
    }
    if (dto.branchId !== undefined && dto.branchId !== null && String(dto.branchId) !== '') {
      rules['branchId'] = dto.branchId;
    }
    if (dto.deviceCode) rules['deviceCode'] = dto.deviceCode;
    if (dto.punchTypes) {
      const types = dto.punchTypes
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      if (types.length) rules['punchType'] = types;
    }
    return Object.keys(rules).length ? rules : null;
  }

  public async create(dto: CreateIntegrationDto): Promise<Record<string, unknown>> {
    const eventTypes = (dto.eventTypes || DEFAULT_EVENT_TYPE)
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    const filterRules = this.buildFilterRules(dto);

    const res = await this.db.query<any>(
      `INSERT INTO integrations
        (organization_id, payload_tenant_id, payload_organization_id, name, target_type, endpoint_url, auth_type, secret_reference, status, retry_limit, timeout_ms, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ORG_ID,
        dto.tenantId?.trim() || null,
        dto.organizationId?.trim() || null,
        dto.name,
        dto.targetType || 'WEBHOOK',
        dto.endpointUrl,
        dto.authType || 'HMAC_SHA256',
        `derived:integration-signing-key`,
        dto.status || 'ACTIVE',
        dto.retryLimit ?? 5,
        dto.timeoutMs ?? 10000,
        JSON.stringify({ createdVia: 'dashboard' }),
      ],
    );
    const newId = res.insertId;

    for (const eventType of eventTypes) {
      await this.db.query(
        `INSERT IGNORE INTO integration_subscriptions (integration_id, event_type, status, filter_rules)
         VALUES (?, ?, 'ACTIVE', ?)`,
        [newId, eventType, filterRules ? JSON.stringify(filterRules) : null],
      );
    }

    return this.getDetail(newId);
  }

  /** Updates an existing integration's endpoint, signing mode, status, retry/timeout, events, filters. */
  public async update(id: number, dto: UpdateIntegrationDto): Promise<Record<string, unknown>> {
    await this.getRow(id);

    const sets: string[] = [];
    const params: unknown[] = [];
    const setCol = (col: string, val: unknown) => {
      sets.push(`${col} = ?`);
      params.push(val);
    };
    if (dto.name !== undefined) setCol('name', dto.name);
    if (dto.targetType !== undefined) setCol('target_type', dto.targetType);
    if (dto.endpointUrl !== undefined) setCol('endpoint_url', dto.endpointUrl);
    if (dto.tenantId !== undefined) setCol('payload_tenant_id', dto.tenantId?.trim() || null);
    if (dto.organizationId !== undefined) setCol('payload_organization_id', dto.organizationId?.trim() || null);
    if (dto.authType !== undefined) setCol('auth_type', dto.authType);
    if (dto.status !== undefined) setCol('status', dto.status);
    if (dto.retryLimit !== undefined) setCol('retry_limit', dto.retryLimit);
    if (dto.timeoutMs !== undefined) setCol('timeout_ms', dto.timeoutMs);

    if (sets.length > 0) {
      params.push(id, ORG_ID);
      await this.db.query(
        `UPDATE integrations SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`,
        params,
      );
    }

    // Replace subscriptions/filters when event types or any filter field were provided.
    const filterTouched =
      dto.filterRules !== undefined ||
      dto.branchId !== undefined ||
      dto.deviceCode !== undefined ||
      dto.punchTypes !== undefined;
    if (dto.eventTypes !== undefined || filterTouched) {
      const filterRules = this.buildFilterRules(dto);
      const existing = await this.eventTypesFor(id);
      const eventTypes = (dto.eventTypes ? dto.eventTypes : existing.join(','))
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);
      await this.db.query(`DELETE FROM integration_subscriptions WHERE integration_id = ?`, [id]);
      for (const eventType of eventTypes) {
        await this.db.query(
          `INSERT IGNORE INTO integration_subscriptions (integration_id, event_type, status, filter_rules)
           VALUES (?, ?, 'ACTIVE', ?)`,
          [id, eventType, filterRules ? JSON.stringify(filterRules) : null],
        );
      }
    }

    return this.getDetail(id);
  }

  public async remove(id: number): Promise<{ success: boolean }> {
    await this.getRow(id);
    await this.db.query(`DELETE FROM integrations WHERE id = ? AND organization_id = ?`, [
      id,
      ORG_ID,
    ]);
    return { success: true };
  }

  /**
   * Sends a signed sample webhook to the integration endpoint and records the attempt.
   * Returns the real HTTP result plus the exact signed request that was sent.
   */
  public async testDispatch(id: number): Promise<Record<string, unknown>> {
    const row = await this.getRow(id);
    const endpointUrl = String(row['endpoint_url']);
    const timeoutMs = Number(row['timeout_ms'] ?? 10000);
    const authType = String(row['auth_type'] || 'HMAC_SHA256').toUpperCase();
    const isSigned = authType !== 'NONE';

    const sample = this.sampleEvent();
    const payload = JSON.stringify(sample);
    const timestamp = Date.now().toString();
    const signature = isSigned ? this.computeSignature(id, authType, payload, timestamp) : null;
    const eventId = String(sample['eventId']);
    const signingKeyShown =
      authType === 'ED25519' ? this.signer.ed25519PublicKey(id).pem : this.signingSecret(id);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Attendance-Event-Id': eventId,
      'X-Attendance-Timestamp': timestamp,
      ...(signature
        ? {
            'X-Attendance-Signature': signature,
            'X-Attendance-Signature-Algorithm': authType,
          }
        : {}),
      'X-Attendance-Attempt': '1',
      'User-Agent': 'Enterprise-Attendance-Integration-Platform/1.0',
    };

    const start = Date.now();
    let httpStatus: number | null = null;
    let responseExcerpt = '';
    let error: string | null = null;
    let success = false;

    try {
      const response = await this.httpPost(endpointUrl, payload, headers, timeoutMs);
      httpStatus = response.statusCode;
      responseExcerpt = response.body.slice(0, 500);
      success = response.statusCode >= 200 && response.statusCode < 300;
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : String(err);
    }
    const latencyMs = Date.now() - start;

    try {
      await this.db.query(
        `INSERT INTO delivery_attempts
          (integration_id, outbox_event_id, attempt_number, status, http_status_code, latency_ms, request_payload, response_excerpt, error_message)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          eventId,
          success ? 'SUCCESS' : 'FAILED',
          httpStatus,
          latencyMs,
          payload, // valid JSON string for the JSON column
          responseExcerpt || null,
          error,
        ],
      );
    } catch (err: unknown) {
      this.logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'Failed to record test delivery attempt',
      );
    }

    return {
      success,
      httpStatus,
      latencyMs,
      error,
      responseExcerpt,
      endpointUrl,
      // Echo back the exact signed request so the UI can show what was sent.
      sentRequest: { headers, body: payload, signingKey: signingKeyShown },
    };
  }

  private httpPost(
    urlStr: string,
    body: string,
    headers: Record<string, string>,
    timeoutMs: number,
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      let url: URL;
      try {
        url = new URL(urlStr);
      } catch {
        reject(new Error(`Invalid endpoint URL: ${urlStr}`));
        return;
      }
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? https : http;
      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port ? parseInt(url.port, 10) : isHttps ? 443 : 80,
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          headers: { ...headers, 'Content-Length': Buffer.byteLength(body).toString() },
          timeout: timeoutMs,
        },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: raw }));
        },
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Webhook dispatch timeout after ${timeoutMs}ms to ${urlStr}`));
      });
      req.on('error', (err) => reject(err));
      req.write(body);
      req.end();
    });
  }
}
