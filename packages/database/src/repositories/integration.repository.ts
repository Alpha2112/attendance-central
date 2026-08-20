import { DatabaseClient } from '../pool.js';
import {
  type IntegrationEntity,
  type IntegrationSubscriptionEntity,
  type DeliveryAttemptEntity,
} from '../entities/integration.entity.js';
import { type ApiClientEntity } from '../entities/api-client.entity.js';
import { type ResultSetHeader } from 'mysql2/promise';

export class IntegrationRepository {
  constructor(private readonly client: DatabaseClient) {}

  public async findById(id: number): Promise<IntegrationEntity | null> {
    const rows = await this.client.query<IntegrationEntity[]>(
      'SELECT * FROM integrations WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] || null;
  }

  public async listActiveSubscriptions(eventType: string): Promise<
    (IntegrationSubscriptionEntity & {
      endpoint_url: string;
      secret_reference: string | null;
      timeout_ms: number;
      retry_limit: number;
    })[]
  > {
    return this.client.query<
      (IntegrationSubscriptionEntity & {
        endpoint_url: string;
        secret_reference: string | null;
        timeout_ms: number;
        retry_limit: number;
      })[]
    >(
      `SELECT s.*, i.endpoint_url, i.secret_reference, i.timeout_ms, i.retry_limit
       FROM integration_subscriptions s
       JOIN integrations i ON i.id = s.integration_id
       WHERE s.event_type = ? AND s.status = 'ACTIVE' AND i.status = 'ACTIVE'`,
      [eventType],
    );
  }

  public async recordDeliveryAttempt(
    attempt: Omit<DeliveryAttemptEntity, 'id' | 'created_at' | 'constructor'>,
  ): Promise<number> {
    const result = await this.client.query<ResultSetHeader>(
      `INSERT INTO delivery_attempts (
        integration_id, outbox_event_id, attempt_number, status,
        http_status_code, latency_ms, request_payload, response_excerpt,
        error_message, next_retry_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attempt.integration_id,
        attempt.outbox_event_id,
        attempt.attempt_number,
        attempt.status,
        attempt.http_status_code || null,
        attempt.latency_ms || null,
        attempt.request_payload ? JSON.stringify(attempt.request_payload) : null,
        attempt.response_excerpt || null,
        attempt.error_message || null,
        attempt.next_retry_at || null,
      ],
    );
    return result.insertId;
  }

  public async findApiClientByClientId(clientId: string): Promise<ApiClientEntity | null> {
    const rows = await this.client.query<ApiClientEntity[]>(
      'SELECT * FROM api_clients WHERE client_id = ? AND status = "ACTIVE" LIMIT 1',
      [clientId],
    );
    return rows[0] || null;
  }
}
