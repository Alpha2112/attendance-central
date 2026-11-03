import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { type DatabaseClient } from '@attendance/database';
import { type AppLogger } from '@attendance/logging';
import { WebhookSigner } from './webhook-signer.js';

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  latencyMs: number;
  error?: string;
  isRetryable: boolean;
  nextRetryAt?: Date;
}

export interface IntegrationSubscriptionDetails {
  id: number;
  organizationId: string;
  /** Optional tenant id injected into the delivered payload as `tenantId`. */
  tenantId?: string | null;
  /** Optional organizationId override injected into the delivered payload. */
  payloadOrganizationId?: string | null;
  name: string;
  targetType: string;
  endpointUrl: string;
  authType: string;
  secretReference?: string;
  retryLimit: number;
  timeoutMs: number;
  /** Optional per-subscription routing filter (branchId / deviceCode / punchType). */
  filterRules?: Record<string, unknown> | null;
}

export class WebhookDispatcher {
  private readonly signer: WebhookSigner;

  constructor(
    private readonly db?: DatabaseClient,
    private readonly logger?: AppLogger,
    signer?: WebhookSigner,
  ) {
    this.signer = signer ?? new WebhookSigner();
  }

  /**
   * Dispatches a webhook payload to an integration endpoint with HMAC SHA-256 signing.
   */
  public async dispatch(
    integration: IntegrationSubscriptionDetails,
    outboxEventId: string,
    payload: unknown,
    attemptNumber = 1,
  ): Promise<WebhookDeliveryResult> {
    const start = Date.now();
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const timestamp = Date.now().toString();

    // 1. Sign the payload with the integration's derived key (HMAC or Ed25519).
    //    Nothing is stored; the key is recomputable from the master key.
    const { header: signature, algorithm } = this.signer.sign(
      integration.id,
      integration.authType,
      payloadStr,
      timestamp,
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Attendance-Event-Id': outboxEventId,
      'X-Attendance-Timestamp': timestamp,
      'X-Attendance-Signature': signature,
      'X-Attendance-Signature-Algorithm': algorithm,
      'X-Attendance-Attempt': String(attemptNumber),
      'User-Agent': 'Enterprise-Attendance-Integration-Platform/1.0',
    };

    try {
      const response = await this.executeHttpRequest(
        integration.endpointUrl,
        payloadStr,
        headers,
        integration.timeoutMs || 10000,
      );

      const latencyMs = Date.now() - start;
      const isSuccess = response.statusCode >= 200 && response.statusCode < 300;
      const isRetryable = !isSuccess && (response.statusCode >= 500 || response.statusCode === 429);

      let nextRetryAt: Date | undefined;
      if (isRetryable && attemptNumber < integration.retryLimit) {
        nextRetryAt = this.calculateNextRetry(attemptNumber);
      }

      // Record delivery attempt in database
      await this.recordDeliveryAttempt({
        integrationId: integration.id,
        outboxEventId,
        attemptNumber,
        status: isSuccess ? 'SUCCESS' : isRetryable ? 'RETRYABLE' : 'FAILED',
        httpStatusCode: response.statusCode,
        latencyMs,
        requestPayload: payloadStr,
        responseExcerpt: response.body.substring(0, 500),
        error: isSuccess ? undefined : `HTTP ${response.statusCode}`,
        nextRetryAt,
      });

      return {
        success: isSuccess,
        statusCode: response.statusCode,
        latencyMs,
        isRetryable,
        nextRetryAt,
        error: isSuccess
          ? undefined
          : `HTTP ${response.statusCode}: ${response.body.substring(0, 200)}`,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const errMsg = err instanceof Error ? err.message : String(err);
      const isRetryable = attemptNumber < integration.retryLimit;
      const nextRetryAt = isRetryable ? this.calculateNextRetry(attemptNumber) : undefined;

      await this.recordDeliveryAttempt({
        integrationId: integration.id,
        outboxEventId,
        attemptNumber,
        status: isRetryable ? 'RETRYABLE' : 'FAILED',
        latencyMs,
        requestPayload: payloadStr,
        error: errMsg,
        nextRetryAt,
      });

      return {
        success: false,
        latencyMs,
        error: errMsg,
        isRetryable,
        nextRetryAt,
      };
    }
  }

  /**
   * Computes HMAC SHA-256 signature over payload + timestamp.
   */
  public computeHmacSignature(payload: string, timestamp: string, secret: string): string {
    const signedData = `${timestamp}.${payload}`;
    const hmac = crypto.createHmac('sha256', secret).update(signedData).digest('hex');
    return `sha256=${hmac}`;
  }

  /**
   * Calculates next retry timestamp using exponential backoff with jitter.
   */
  public calculateNextRetry(attempt: number): Date {
    const baseDelayMs = 1000;
    const maxDelayMs = 60000;
    const exponential = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
    const jitter = (Math.random() - 0.5) * 0.2 * exponential; // +/- 20% jitter
    const delay = Math.max(1000, Math.round(exponential + jitter));

    return new Date(Date.now() + delay);
  }

  private async executeHttpRequest(
    urlStr: string,
    body: string,
    headers: Record<string, string>,
    timeoutMs: number,
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? https : http;

      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port ? parseInt(url.port, 10) : isHttps ? 443 : 80,
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          headers: {
            ...headers,
            'Content-Length': Buffer.byteLength(body).toString(),
          },
          timeout: timeoutMs,
        },
        (res) => {
          let rawData = '';
          res.on('data', (chunk) => {
            rawData += chunk;
          });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode ?? 500,
              body: rawData,
            });
          });
        },
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Webhook dispatch timeout after ${timeoutMs}ms to ${urlStr}`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(body);
      req.end();
    });
  }

  private async recordDeliveryAttempt(data: {
    integrationId: number;
    outboxEventId: string;
    attemptNumber: number;
    status: string;
    httpStatusCode?: number;
    latencyMs?: number;
    requestPayload?: string;
    responseExcerpt?: string;
    error?: string;
    nextRetryAt?: Date;
  }): Promise<void> {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO delivery_attempts (
          integration_id, outbox_event_id, attempt_number, status,
          http_status_code, latency_ms, request_payload, response_excerpt,
          error_message, next_retry_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.integrationId,
          data.outboxEventId,
          data.attemptNumber,
          data.status,
          data.httpStatusCode ?? null,
          data.latencyMs ?? null,
          // request_payload is a JSON column; pass the already-serialized JSON
          // string (mysql2 rejects a bound plain object here).
          data.requestPayload ?? null,
          data.responseExcerpt ?? null,
          data.error ?? null,
          data.nextRetryAt ?? null,
        ],
      );
    } catch (err: unknown) {
      this.logger?.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'Failed to record delivery attempt in database',
      );
    }
  }
}
