import { type RowDataPacket } from 'mysql2/promise';

export interface IntegrationEntity extends RowDataPacket {
  id: number;
  tenant_id: number | null;
  organization_id: number;
  name: string;
  target_type: string;
  endpoint_url: string;
  auth_type: string;
  secret_reference: string | null;
  status: string;
  retry_limit: number;
  timeout_ms: number;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface IntegrationSubscriptionEntity extends RowDataPacket {
  id: number;
  integration_id: number;
  event_type: string;
  filter_rules: Record<string, unknown> | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface DeliveryAttemptEntity extends RowDataPacket {
  id: number;
  integration_id: number;
  outbox_event_id: string;
  attempt_number: number;
  status: string;
  http_status_code: number | null;
  latency_ms: number | null;
  request_payload: unknown;
  response_excerpt: string | null;
  error_message: string | null;
  next_retry_at: Date | null;
  created_at: Date;
}
