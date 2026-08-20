# Security Architecture

## 1. Security Goals

Protect:
- device credentials;
- integration credentials;
- employee identifiers;
- attendance history;
- administrative actions;
- external integration trust.

Attendance data may affect payroll and compliance, so integrity and auditability are primary goals.

---

## 2. Network Segmentation

Recommended:

```text
Biometric Device VLAN
        ↓
Firewall
        ↓
Collector / Integration Network
        ↓
Internal Platform Network
        ↓
Database / Kafka / Redis
```

Devices must not directly access:
- MySQL;
- Redis;
- Kafka;
- HRMS database;
- payroll database.

---

## 3. Secrets

Never store plaintext device credentials in MySQL.

Store:

```text
secret_reference = vault://attendance/prod/devices/DEV-123
```

Support an abstraction over:
- HashiCorp Vault;
- AWS Secrets Manager;
- Azure Key Vault;
- GCP Secret Manager.

Local development may use a safe local provider.

Never log:
- passwords;
- tokens;
- HMAC secrets;
- communication keys;
- session IDs.

---

## 4. Authentication

### Human/admin users
Prefer OIDC.

### Machine-to-machine
Prefer OAuth2 client credentials.

### Legacy clients
API keys may be supported with:
- strict scope;
- rotation;
- rate limits;
- audit.

---

## 5. Authorization

Suggested roles:

```text
SUPER_ADMIN
ORGANIZATION_ADMIN
DEVICE_ADMIN
OPERATOR
INTEGRATION_ADMIN
AUDITOR
READ_ONLY
```

Authorization is enforced in backend services.

Frontend hiding is not authorization.

---

## 6. Outbound Webhook Security

Support:
- HMAC SHA-256 signatures;
- OAuth2 client credentials;
- bearer token for controlled legacy systems;
- optional mTLS.

Recommended headers:

```text
X-Attendance-Event-Id
X-Attendance-Timestamp
X-Attendance-Signature
```

Signature input should include:
- timestamp;
- event ID;
- exact request body.

Consumers should reject:
- old timestamps outside tolerance;
- invalid signatures;
- duplicate event IDs when already processed.

---

## 7. Input Validation

Treat all vendor/device payloads as hostile/untrusted.

Use schema validation for:
- APIs;
- Kafka events;
- push-device endpoints;
- webhook configuration;
- adapter payload conversion.

Enforce:
- maximum body sizes;
- timeouts;
- safe JSON parsing;
- allowlisted enum transformations.

---

## 8. API Security

Apply:
- TLS;
- security headers;
- CORS allowlist;
- rate limiting;
- authentication;
- authorization;
- request validation;
- structured error handling.

Use CSRF protection where cookie-authenticated browser actions require it.

---

## 9. Biometric Privacy

Do not centralize biometric templates unless a later explicit requirement demands it.

The attendance platform normally stores only:

```text
employee_id
verification_type
device
timestamp
result/event
```

Avoid:
- face templates;
- fingerprint templates;
- palm templates.

---

## 10. Audit

Audit at minimum:
- device create/update/delete;
- credential rotation;
- mapping changes;
- manual sync/replay;
- clock changes;
- integration create/update/disable;
- delivery replay;
- attendance reprocessing;
- manual attendance modification;
- authentication failures.

Audit fields:
- actor;
- action;
- resource;
- timestamp;
- IP;
- correlation ID;
- before/after safe values.

Redact secrets.

---

## 11. Logging

Use structured logging.

Safe example:

```json
{
  "level": "error",
  "service": "hikvision-connector",
  "deviceId": "DEV-123",
  "correlationId": "corr-...",
  "errorCode": "DEVICE_TIMEOUT",
  "message": "Device connection timed out"
}
```

Never include sensitive payloads by default.

---

## 12. Supply Chain

CI should include:
- dependency audit;
- SAST;
- secret scanning;
- container scanning;
- lockfile enforcement.

Production images should:
- run non-root where possible;
- use minimal base images;
- pin major dependencies/images;
- avoid development tooling.
