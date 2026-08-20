# Database Design

## 1. Database Role

MySQL is the authoritative persistent store for:

- device registry;
- mappings;
- raw attendance;
- normalized attendance;
- sync checkpoints/jobs;
- integration delivery state;
- audit.

Redis is not authoritative for attendance correctness.

---

## 2. Core Tables

### organizations

```text
id BIGINT PK
tenant_id BIGINT NULL
code VARCHAR(50)
name VARCHAR(255)
timezone VARCHAR(64)
status VARCHAR(30)
created_at DATETIME(6)
updated_at DATETIME(6)
```

### branches

```text
id BIGINT PK
tenant_id BIGINT NULL
organization_id BIGINT NOT NULL
code VARCHAR(50)
name VARCHAR(255)
timezone VARCHAR(64)
metadata JSON
created_at DATETIME(6)
updated_at DATETIME(6)
```

### device_types

```text
id BIGINT PK
vendor VARCHAR(50)
model VARCHAR(100)
protocol VARCHAR(50)
adapter_key VARCHAR(100)
capabilities JSON
created_at DATETIME(6)
updated_at DATETIME(6)
```

### devices

```text
id BIGINT PK
tenant_id BIGINT NULL
organization_id BIGINT NOT NULL
branch_id BIGINT NULL
device_type_id BIGINT NULL

device_code VARCHAR(100)
serial_number VARCHAR(150)
name VARCHAR(255)

vendor VARCHAR(50)
model VARCHAR(100)
protocol VARCHAR(50)
connection_mode VARCHAR(30)

host VARCHAR(255)
port INT NULL
timezone VARCHAR(64)

secret_reference VARCHAR(500)

status VARCHAR(30)
last_seen_at DATETIME(6) NULL
last_sync_at DATETIME(6) NULL

firmware_version VARCHAR(100) NULL
metadata JSON

created_at DATETIME(6)
updated_at DATETIME(6)
```

Recommended unique/indexes:

```text
UNIQUE (organization_id, device_code)
INDEX (branch_id)
INDEX (vendor)
INDEX (status, last_seen_at)
INDEX (serial_number)
```

### device_employee_mappings

```text
id BIGINT PK
tenant_id BIGINT NULL
organization_id BIGINT NOT NULL
device_id BIGINT NOT NULL

external_employee_id VARCHAR(100) NOT NULL
vendor_user_id VARCHAR(150) NOT NULL
vendor_employee_code VARCHAR(150) NULL

status VARCHAR(30)
metadata JSON

created_at DATETIME(6)
updated_at DATETIME(6)
```

Recommended:

```text
UNIQUE (device_id, vendor_user_id)
INDEX (organization_id, external_employee_id)
```

### raw_punch_logs

```text
id BIGINT
event_date DATE NOT NULL

tenant_id BIGINT NULL
organization_id BIGINT NOT NULL
device_id BIGINT NOT NULL

vendor VARCHAR(50) NOT NULL
vendor_event_id VARCHAR(150) NULL
vendor_user_id VARCHAR(150) NOT NULL

device_time DATETIME(6)
received_at DATETIME(6) NOT NULL

vendor_verification_code VARCHAR(100) NULL
vendor_punch_code VARCHAR(100) NULL

raw_payload JSON
payload_hash BINARY(32)

normalization_status VARCHAR(30)
normalization_error_code VARCHAR(100) NULL

created_at DATETIME(6)
```

Recommended access indexes:

```text
(device_id, device_time)
(organization_id, received_at)
(vendor_user_id, device_time)
(normalization_status, created_at)
```

### attendance_logs

```text
id BIGINT
event_date DATE NOT NULL

tenant_id BIGINT NULL
organization_id BIGINT NOT NULL
branch_id BIGINT NULL

employee_id VARCHAR(100) NOT NULL
device_id BIGINT NOT NULL
vendor VARCHAR(50) NOT NULL

raw_log_id BIGINT NOT NULL

punch_time DATETIME(6) NOT NULL
punch_time_utc DATETIME(6) NOT NULL
device_timestamp DATETIME(6) NULL
received_at DATETIME(6) NOT NULL

punch_type VARCHAR(30)
verification_type VARCHAR(30)

clock_offset_seconds INT NULL

source VARCHAR(30)
vendor_event_id VARCHAR(150) NULL

event_fingerprint BINARY(32) NOT NULL

created_at DATETIME(6)
```

Primary query indexes:

```text
(employee_id, punch_time_utc, id)
(device_id, punch_time_utc, id)
(organization_id, punch_time_utc, id)
(branch_id, punch_time_utc, id)
```

Idempotency must use a database-enforced unique key that is compatible with the chosen partitioning strategy.

### sync_jobs

```text
id BIGINT PK
organization_id BIGINT NOT NULL
device_id BIGINT NOT NULL

job_type VARCHAR(50)
status VARCHAR(30)

requested_by VARCHAR(100)
requested_at DATETIME(6)

started_at DATETIME(6) NULL
completed_at DATETIME(6) NULL

records_received BIGINT DEFAULT 0
records_inserted BIGINT DEFAULT 0
duplicates BIGINT DEFAULT 0
errors BIGINT DEFAULT 0

retry_count INT DEFAULT 0
error_code VARCHAR(100) NULL
error_message TEXT NULL
```

### sync_checkpoints

```text
id BIGINT PK
device_id BIGINT NOT NULL
stream_type VARCHAR(50) NOT NULL

last_vendor_event_id VARCHAR(150) NULL
last_event_time DATETIME(6) NULL
cursor JSON NULL

updated_at DATETIME(6)
```

Recommended:

```text
UNIQUE (device_id, stream_type)
```

### integrations

Contains configuration metadata but not plaintext secrets.

### outbox_events

Must be inserted in the same database transaction as the corresponding business change.

Suggested fields:

```text
id BIGINT PK
event_id VARCHAR(100) UNIQUE
event_type VARCHAR(100)
aggregate_type VARCHAR(100)
aggregate_id VARCHAR(100)
payload JSON
status VARCHAR(30)
available_at DATETIME(6)
created_at DATETIME(6)
published_at DATETIME(6) NULL
attempt_count INT
```

### delivery_attempts

Store:

- integration;
- event;
- attempt number;
- requested timestamp;
- response status;
- safe response excerpt;
- latency;
- retry schedule;
- final status.

### audit_logs

Append-only logical audit trail.

---

## 3. Partitioning

High-volume tables should be designed for monthly range partitions:

- `raw_punch_logs`;
- `attendance_logs`;
- possibly `device_status_logs`.

Use `event_date` to simplify lifecycle operations.

Example logical partitions:

```text
p202608
p202609
p202610
```

Before final migration implementation, validate every PRIMARY/UNIQUE key against MySQL partition-key requirements.

---

## 4. Pagination

Attendance API uses keyset pagination.

Recommended ordering:

```text
ORDER BY punch_time_utc DESC, id DESC
```

Cursor encodes:

- timestamp;
- ID.

Avoid large OFFSET queries.

---

## 5. Retention

Define retention separately for:

- raw payloads;
- normalized attendance;
- status history;
- delivery logs;
- audit logs.

Never delete data solely for storage convenience without business/legal retention policy.

---

## 6. Read Scaling

When required:

- writes stay on primary;
- read-heavy attendance/reporting queries may use replicas;
- APIs requiring immediate read-after-write correctness must use the primary or an appropriate consistency mechanism.

---

## 7. Backups

Production database requirements:

- automated full backups;
- binary-log/PITR capability;
- encrypted backup storage;
- restore drills;
- documented RPO/RTO targets.
