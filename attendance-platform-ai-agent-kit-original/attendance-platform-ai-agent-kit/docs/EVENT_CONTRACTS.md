# Event Contracts

## 1. Contract Principles

- Every event has a stable `eventId`.
- Every event has `schemaVersion`.
- Timestamps use ISO 8601.
- UTC timestamp is always available for normalized attendance.
- Vendor payloads are untrusted.
- Schemas must evolve additively where possible.
- Consumers must ignore unknown optional fields.
- Events are immutable after publication.

---

## 2. Kafka Topics

Recommended initial topics:

```text
attendance.raw.v1
attendance.normalized.v1
attendance.normalization-failed.v1

device.status.v1
device.command.v1
device.command-result.v1

sync.requested.v1
sync.completed.v1
sync.failed.v1

integration.delivery.v1
integration.delivery-failed.v1

attendance.dlq.v1
```

---

## 3. RawAttendanceEvent

```ts
export interface RawAttendanceEvent {
  eventId: string;
  schemaVersion: 1;

  tenantId?: string;
  organizationId: string;
  branchId?: string;

  deviceId: string;
  deviceSerialNumber?: string;

  vendor: string;
  adapter: string;

  vendorEventId?: string;
  vendorUserId: string;

  deviceTime: string;
  receivedAt: string;

  vendorPunchType?: string;
  vendorVerificationType?: string;

  source:
    | "PUSH"
    | "PULL"
    | "REALTIME"
    | "RECONCILIATION"
    | "IMPORT";

  rawPayload: unknown;
  metadata?: Record<string, unknown>;
}
```

### Recommended Kafka key

```text
tenantId + organizationId + deviceId
```

The key should preserve ordering for one device.

---

## 4. AttendanceEvent

```ts
export interface AttendanceEvent {
  eventId: string;
  schemaVersion: 1;

  tenantId?: string;
  organizationId: string;
  branchId?: string;

  employeeId: string;

  deviceId: string;
  vendor: string;

  punchTime: string;
  punchTimeUtc: string;

  punchType:
    | "IN"
    | "OUT"
    | "BREAK_IN"
    | "BREAK_OUT"
    | "UNKNOWN";

  verificationType:
    | "FACE"
    | "FINGERPRINT"
    | "CARD"
    | "PALM"
    | "PIN"
    | "QR"
    | "UNKNOWN";

  receivedAt: string;

  source:
    | "PUSH"
    | "PULL"
    | "REALTIME"
    | "RECONCILIATION"
    | "IMPORT";

  rawEventId: string;
  eventFingerprint: string;
}
```

---

## 5. Device Status Event

```ts
export interface DeviceStatusEvent {
  eventId: string;
  schemaVersion: 1;

  organizationId: string;
  deviceId: string;

  status:
    | "ONLINE"
    | "OFFLINE"
    | "DEGRADED"
    | "AUTH_ERROR"
    | "DISABLED"
    | "UNKNOWN";

  observedAt: string;
  latencyMs?: number;
  clockOffsetSeconds?: number;

  errorCode?: string;
  metadata?: Record<string, unknown>;
}
```

---

## 6. Sync Requested Event

```ts
export interface SyncRequestedEvent {
  eventId: string;
  schemaVersion: 1;

  organizationId: string;
  deviceId: string;

  syncJobId: string;

  type:
    | "ATTENDANCE"
    | "RECONCILIATION"
    | "STATUS";

  from?: string;
  to?: string;

  requestedAt: string;
  requestedBy: string;
}
```

---

## 7. Webhook Envelope

Outbound webhook payloads use a stable envelope.

```json
{
  "event_id": "evt_01K...",
  "event_type": "attendance.punch.created",
  "event_version": 1,
  "occurred_at": "2026-08-15T05:04:32Z",
  "data": {
    "employee_id": "EMP-000457",
    "punch_time": "2026-08-15T08:04:32+03:00",
    "punch_time_utc": "2026-08-15T05:04:32Z",
    "punch_type": "IN",
    "verification_type": "FACE",
    "device_id": "DEV-HQ-001",
    "vendor": "HIKVISION"
  }
}
```

The same `event_id` must be reused across retries.

---

## 8. Compatibility Rules

### Safe additive changes
- add optional field;
- add new event type;
- add new enum value only if consumers safely handle unknowns.

### Breaking changes
Require a new version:
- rename/remove field;
- change type;
- change semantic meaning;
- change required/optional guarantees.

Breaking Kafka event changes use a new topic/schema version.

---

## 9. Error Events

Normalization failure must contain enough context to reprocess without exposing secrets.

Include:
- raw event ID;
- device ID;
- error code;
- safe error message;
- retryable boolean;
- observed timestamp.

Never include:
- passwords;
- tokens;
- communication keys.
