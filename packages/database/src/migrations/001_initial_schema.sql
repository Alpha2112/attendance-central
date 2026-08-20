-- ============================================================================
-- Enterprise Attendance Platform - Initial Schema Migration (001)
-- MySQL 8.4 Compatible with Range Partitioning and Idempotency Constraints
-- ============================================================================

-- Migration Tracking Table
CREATE TABLE IF NOT EXISTS _schema_migrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  executed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1. Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_org_tenant (tenant_id),
  INDEX idx_org_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Branches
CREATE TABLE IF NOT EXISTS branches (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NULL,
  organization_id BIGINT NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  metadata JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_branch_code (organization_id, code),
  INDEX idx_branch_org (organization_id),
  CONSTRAINT fk_branch_organization FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Device Types
CREATE TABLE IF NOT EXISTS device_types (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  vendor VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  protocol VARCHAR(50) NOT NULL,
  adapter_key VARCHAR(100) NOT NULL,
  capabilities JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_device_type (vendor, model, protocol),
  INDEX idx_devtype_adapter (adapter_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Devices
CREATE TABLE IF NOT EXISTS devices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NULL,
  organization_id BIGINT NOT NULL,
  branch_id BIGINT NULL,
  device_type_id BIGINT NULL,
  device_code VARCHAR(100) NOT NULL,
  serial_number VARCHAR(150) NULL,
  name VARCHAR(255) NOT NULL,
  vendor VARCHAR(50) NOT NULL,
  model VARCHAR(100) NULL,
  protocol VARCHAR(50) NULL,
  connection_mode VARCHAR(30) NOT NULL DEFAULT 'PUSH',
  host VARCHAR(255) NULL,
  port INT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  secret_reference VARCHAR(500) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'REGISTERED',
  last_seen_at DATETIME(6) NULL,
  last_sync_at DATETIME(6) NULL,
  firmware_version VARCHAR(100) NULL,
  metadata JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_device_org_code (organization_id, device_code),
  INDEX idx_device_branch (branch_id),
  INDEX idx_device_vendor (vendor),
  INDEX idx_device_status_seen (status, last_seen_at),
  INDEX idx_device_serial (serial_number),
  CONSTRAINT fk_device_organization FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_device_branch FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE SET NULL,
  CONSTRAINT fk_device_type FOREIGN KEY (device_type_id) REFERENCES device_types (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Device Employee Mappings
CREATE TABLE IF NOT EXISTS device_employee_mappings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NULL,
  organization_id BIGINT NOT NULL,
  device_id BIGINT NOT NULL,
  external_employee_id VARCHAR(100) NOT NULL,
  vendor_user_id VARCHAR(150) NOT NULL,
  vendor_employee_code VARCHAR(150) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  metadata JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_device_vendor_user (device_id, vendor_user_id),
  INDEX idx_mapping_org_emp (organization_id, external_employee_id),
  INDEX idx_mapping_status (status),
  CONSTRAINT fk_mapping_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Raw Punch Logs (Partitioned by Range on event_date)
CREATE TABLE IF NOT EXISTS raw_punch_logs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  event_date DATE NOT NULL,
  tenant_id BIGINT NULL,
  organization_id BIGINT NOT NULL,
  device_id BIGINT NOT NULL,
  vendor VARCHAR(50) NOT NULL,
  vendor_event_id VARCHAR(150) NULL,
  vendor_user_id VARCHAR(150) NOT NULL,
  device_time DATETIME(6) NOT NULL,
  received_at DATETIME(6) NOT NULL,
  vendor_verification_code VARCHAR(100) NULL,
  vendor_punch_code VARCHAR(100) NULL,
  raw_payload JSON NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  normalization_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  normalization_error_code VARCHAR(100) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id, event_date),
  INDEX idx_raw_dev_time (device_id, device_time),
  INDEX idx_raw_org_received (organization_id, received_at),
  INDEX idx_raw_user_time (vendor_user_id, device_time),
  INDEX idx_raw_norm_status (normalization_status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (YEAR(event_date) * 100 + MONTH(event_date)) (
  PARTITION p202601 VALUES LESS THAN (202602),
  PARTITION p202602 VALUES LESS THAN (202603),
  PARTITION p202603 VALUES LESS THAN (202604),
  PARTITION p202604 VALUES LESS THAN (202605),
  PARTITION p202605 VALUES LESS THAN (202606),
  PARTITION p202606 VALUES LESS THAN (202607),
  PARTITION p202607 VALUES LESS THAN (202608),
  PARTITION p202608 VALUES LESS THAN (202609),
  PARTITION p202609 VALUES LESS THAN (202610),
  PARTITION p202610 VALUES LESS THAN (202611),
  PARTITION p202611 VALUES LESS THAN (202612),
  PARTITION p202612 VALUES LESS THAN (202701),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- 7. Attendance Logs (Partitioned by Range on event_date with DB Idempotency Constraint)
CREATE TABLE IF NOT EXISTS attendance_logs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  event_date DATE NOT NULL,
  tenant_id BIGINT NULL,
  organization_id BIGINT NOT NULL,
  branch_id BIGINT NULL,
  employee_id VARCHAR(100) NOT NULL,
  device_id BIGINT NOT NULL,
  vendor VARCHAR(50) NOT NULL,
  raw_log_id BIGINT NOT NULL,
  punch_time DATETIME(6) NOT NULL,
  punch_time_utc DATETIME(6) NOT NULL,
  device_timestamp DATETIME(6) NULL,
  received_at DATETIME(6) NOT NULL,
  punch_type VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
  verification_type VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
  clock_offset_seconds INT NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'PUSH',
  vendor_event_id VARCHAR(150) NULL,
  event_fingerprint VARCHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id, event_date),
  UNIQUE KEY uq_attendance_fingerprint (event_fingerprint, event_date),
  INDEX idx_att_emp_time (employee_id, punch_time_utc, id),
  INDEX idx_att_dev_time (device_id, punch_time_utc, id),
  INDEX idx_att_org_time (organization_id, punch_time_utc, id),
  INDEX idx_att_branch_time (branch_id, punch_time_utc, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (YEAR(event_date) * 100 + MONTH(event_date)) (
  PARTITION p202601 VALUES LESS THAN (202602),
  PARTITION p202602 VALUES LESS THAN (202603),
  PARTITION p202603 VALUES LESS THAN (202604),
  PARTITION p202604 VALUES LESS THAN (202605),
  PARTITION p202605 VALUES LESS THAN (202606),
  PARTITION p202606 VALUES LESS THAN (202607),
  PARTITION p202607 VALUES LESS THAN (202608),
  PARTITION p202608 VALUES LESS THAN (202609),
  PARTITION p202609 VALUES LESS THAN (202610),
  PARTITION p202610 VALUES LESS THAN (202611),
  PARTITION p202611 VALUES LESS THAN (202612),
  PARTITION p202612 VALUES LESS THAN (202701),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- 8. Device Status Logs (Partitioned by Range on event_date)
CREATE TABLE IF NOT EXISTS device_status_logs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  event_date DATE NOT NULL,
  organization_id BIGINT NOT NULL,
  device_id BIGINT NOT NULL,
  status VARCHAR(30) NOT NULL,
  latency_ms INT NULL,
  clock_offset_seconds INT NULL,
  error_code VARCHAR(100) NULL,
  metadata JSON NULL,
  observed_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id, event_date),
  INDEX idx_devstat_dev_time (device_id, observed_at),
  INDEX idx_devstat_org_time (organization_id, observed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (YEAR(event_date) * 100 + MONTH(event_date)) (
  PARTITION p202601 VALUES LESS THAN (202602),
  PARTITION p202602 VALUES LESS THAN (202603),
  PARTITION p202603 VALUES LESS THAN (202604),
  PARTITION p202604 VALUES LESS THAN (202605),
  PARTITION p202605 VALUES LESS THAN (202606),
  PARTITION p202606 VALUES LESS THAN (202607),
  PARTITION p202607 VALUES LESS THAN (202608),
  PARTITION p202608 VALUES LESS THAN (202609),
  PARTITION p202609 VALUES LESS THAN (202610),
  PARTITION p202610 VALUES LESS THAN (202611),
  PARTITION p202611 VALUES LESS THAN (202612),
  PARTITION p202612 VALUES LESS THAN (202701),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- 9. Sync Jobs
CREATE TABLE IF NOT EXISTS sync_jobs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  device_id BIGINT NOT NULL,
  job_type VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
  requested_by VARCHAR(100) NOT NULL,
  requested_at DATETIME(6) NOT NULL,
  started_at DATETIME(6) NULL,
  completed_at DATETIME(6) NULL,
  records_received BIGINT NOT NULL DEFAULT 0,
  records_inserted BIGINT NOT NULL DEFAULT 0,
  duplicates BIGINT NOT NULL DEFAULT 0,
  errors BIGINT NOT NULL DEFAULT 0,
  retry_count INT NOT NULL DEFAULT 0,
  error_code VARCHAR(100) NULL,
  error_message TEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_sync_job_dev (device_id, status),
  INDEX idx_sync_job_org (organization_id, requested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Sync Checkpoints
CREATE TABLE IF NOT EXISTS sync_checkpoints (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT NOT NULL,
  stream_type VARCHAR(50) NOT NULL,
  last_vendor_event_id VARCHAR(150) NULL,
  last_event_time DATETIME(6) NULL,
  `cursor` JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_sync_checkpoint (device_id, stream_type),
  CONSTRAINT fk_checkpoint_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Integrations
CREATE TABLE IF NOT EXISTS integrations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NULL,
  organization_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  endpoint_url VARCHAR(1000) NOT NULL,
  auth_type VARCHAR(50) NOT NULL DEFAULT 'NONE',
  secret_reference VARCHAR(500) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  retry_limit INT NOT NULL DEFAULT 5,
  timeout_ms INT NOT NULL DEFAULT 10000,
  metadata JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_int_org_status (organization_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Integration Subscriptions
CREATE TABLE IF NOT EXISTS integration_subscriptions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  integration_id BIGINT NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  filter_rules JSON NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_integration_event (integration_id, event_type),
  CONSTRAINT fk_sub_integration FOREIGN KEY (integration_id) REFERENCES integrations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Outbox Events (Transactional Outbox Pattern)
CREATE TABLE IF NOT EXISTS outbox_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(100) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(100) NOT NULL,
  payload JSON NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  available_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  published_at DATETIME(6) NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  INDEX idx_outbox_status_avail (status, available_at),
  INDEX idx_outbox_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Delivery Attempts
CREATE TABLE IF NOT EXISTS delivery_attempts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  integration_id BIGINT NOT NULL,
  outbox_event_id VARCHAR(100) NOT NULL,
  attempt_number INT NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL,
  http_status_code INT NULL,
  latency_ms INT NULL,
  request_payload JSON NULL,
  response_excerpt TEXT NULL,
  error_message TEXT NULL,
  next_retry_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX idx_deliv_int_time (integration_id, created_at),
  INDEX idx_deliv_outbox (outbox_event_id),
  CONSTRAINT fk_deliv_integration FOREIGN KEY (integration_id) REFERENCES integrations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. API Clients (Machine-to-Machine Auth)
CREATE TABLE IF NOT EXISTS api_clients (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  client_id VARCHAR(100) NOT NULL UNIQUE,
  client_name VARCHAR(255) NOT NULL,
  client_secret_hash VARCHAR(255) NOT NULL,
  roles JSON NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_apiclient_org (organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. Audit Logs (Immutable Security & Operations Trail)
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NULL,
  organization_id BIGINT NOT NULL,
  actor_type VARCHAR(50) NOT NULL,
  actor_id VARCHAR(100) NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(100) NOT NULL,
  before_state JSON NULL,
  after_state JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  correlation_id VARCHAR(100) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX idx_audit_org_time (organization_id, created_at),
  INDEX idx_audit_resource (resource_type, resource_id),
  INDEX idx_audit_correlation (correlation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
