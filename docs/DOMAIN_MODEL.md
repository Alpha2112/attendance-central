# Domain Model

## 1. Domain Boundary

The attendance platform is an integration and attendance-event system.

It is not the employee master.

External HRMS owns:

- name;
- department;
- position;
- employment status;
- shift;
- payroll;
- salary;
- leave;
- other HR profile attributes.

The attendance platform owns:

- organizations/branches needed for routing and device ownership;
- devices;
- vendor/device employee mapping;
- raw device events;
- normalized attendance events;
- sync state;
- integration delivery state;
- audit state.

---

## 2. Main Entities

### Organization

Represents a company/business entity using the platform.

Important fields:

- `id`
- `code`
- `name`
- `timezone`
- `status`

### Branch

Represents a site/location.

Important fields:

- `id`
- `organization_id`
- `code`
- `name`
- `timezone`

### Device Type

Describes:

- vendor;
- model;
- protocol;
- adapter key;
- capabilities.

### Device

Represents a configured attendance device or logical vendor endpoint.

Examples:

- physical ZKTeco terminal;
- Hikvision terminal;
- BioStar server connection acting as the event source.

### Device Employee Mapping

Maps device/vendor identity to the HRMS employee ID.

Example:

```text
device_id = DEV-001
vendor_user_id = 457
external_employee_id = EMP-000457
```

### Raw Punch Log

Immutable record of what the vendor/device provided.

### Attendance Log

Canonical normalized attendance fact exposed to downstream systems.

### Sync Job

Tracks a requested or scheduled synchronization operation.

### Sync Checkpoint

Durable cursor/state indicating safely processed vendor history.

### Integration

Represents an outbound target:

- HRMS;
- ERP;
- payroll;
- external platform.

### Outbox Event

Transactional record indicating a durable event must be published.

### Delivery Attempt

Records one outbound delivery attempt and result.

### Audit Log

Immutable security/operations trail.

---

## 3. Attendance Event Semantics

Canonical punch types:

```text
IN
OUT
BREAK_IN
BREAK_OUT
UNKNOWN
```

Canonical verification types:

```text
FACE
FINGERPRINT
CARD
PALM
PIN
QR
UNKNOWN
```

Never fabricate semantics.

If a vendor value cannot be reliably normalized:

- set `UNKNOWN`;
- preserve the vendor value in raw metadata.

---

## 4. Employee Mapping Lifecycle

### Known Mapping

```text
vendor_user_id
    ↓
mapping
    ↓
external employee_id
    ↓
normalized attendance
```

### Missing Mapping

```text
raw event
    ↓
no mapping found
    ↓
persist raw event
    ↓
normalization_status = PENDING_MAPPING
    ↓
operator/API adds mapping
    ↓
reprocess
```

A missing mapping must never discard the punch.

---

## 5. Idempotency Identity

Preferred uniqueness sources:

1. reliable vendor event ID scoped to device;
2. deterministic event fingerprint.

Fingerprint inputs may include:

- organization/tenant;
- device;
- vendor user ID;
- device timestamp;
- vendor event type;
- verification type;
- vendor event ID when available.

The normalized database must provide the final uniqueness barrier.

---

## 6. Punch Facts vs Attendance Interpretation

This platform records punch facts.

It does not determine:

- worked hours;
- lateness;
- overtime;
- schedule violations;
- first-in/last-out business rules.

Those are downstream HRMS/workforce-management responsibilities.

---

## 7. State Models

### Device Status

Suggested values:

```text
REGISTERED
ONLINE
OFFLINE
DEGRADED
AUTH_ERROR
DISABLED
UNKNOWN
```

### Normalization Status

```text
PENDING
NORMALIZED
DUPLICATE
PENDING_MAPPING
FAILED
```

### Sync Job Status

```text
QUEUED
RUNNING
COMPLETED
FAILED
CANCELLED
```

### Delivery Status

```text
PENDING
DELIVERING
SUCCEEDED
RETRY_SCHEDULED
FAILED
DEAD_LETTER
```
