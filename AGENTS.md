# AGENTS.md — Engineering Rules for AI Agents

All AI coding agents working in this repository must follow these rules.

## 1. Read Before Changing Code

Before implementing a task, read:

1. `README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/DOMAIN_MODEL.md`
4. `docs/EVENT_CONTRACTS.md`
5. relevant ADRs
6. the assigned agent prompt
7. existing tests and nearby modules
8. `Enterprise Attendance Integration Platform — Master Engineering.md`

Do not assume the repository is empty.

---

## 2. Architecture Rules

- Vendor-specific behavior belongs only inside device connector/adapter modules.
- Core attendance-domain code must not import vendor SDKs.
- HRMS owns employee master data.
- This platform stores only the external employee identifier and vendor/device mappings required to resolve attendance.
- Kafka is the durable event backbone.
- MySQL is authoritative persistent storage.
- Redis is temporary/distributed state, not the final correctness boundary.
- Outbound integrations must not run inside the attendance database transaction.
- Use the transactional outbox pattern.
- Assume at-least-once delivery.
- Every consumer must be idempotent.
- Raw device events must not be silently discarded.
- Missing employee mappings must not cause data loss.
- Preserve original device timestamps and raw payloads.
- Unknown vendor values must map to a safe `UNKNOWN` state while retaining raw vendor metadata.

---

## 3. TypeScript Rules

- TypeScript strict mode is required.
- Avoid `any`.
- Use `unknown` for untrusted external payloads.
- Validate external data at boundaries.
- Prefer explicit domain types.
- Prefer immutable data structures where practical.
- Public package APIs must be documented.
- Do not add duplicate utility abstractions without checking existing packages.

---

## 4. Reliability Rules

Every network operation must define:

- timeout;
- retry policy;
- retryable vs permanent error classification;
- cancellation behavior;
- structured logs;
- metrics where operationally important.

Do not aggressively retry:

- invalid credentials;
- unsupported operations;
- malformed permanent payloads.

Use exponential backoff and jitter for transient failures.

One failing device, tenant, connector, or integration must not block unrelated work.

---

## 5. Database Rules

- Use migrations for every schema change.
- Migrations must be deterministic.
- Add indexes only for justified access patterns.
- Attendance pagination must be cursor/keyset based.
- Do not use large OFFSET pagination.
- Design log tables for monthly partitioning.
- Respect MySQL partition/unique-key constraints.
- Database-level uniqueness/idempotency is the final duplicate barrier.
- Never store plaintext device or integration secrets.

---

## 6. Kafka Rules

- Topic names are versioned.
- Message schemas are versioned.
- Message keys must preserve required ordering.
- Do not commit offsets before durable processing succeeds.
- Failed permanent messages must go to a DLQ or explicit failed state.
- Consumers must safely tolerate duplicate messages.
- Contract changes must remain backward compatible when possible.

---

## 7. Security Rules

Never:

- commit secrets;
- log passwords/tokens/communication keys;
- include secrets in audit before/after snapshots;
- trust frontend authorization;
- accept unvalidated external payloads.

Always:

- use least privilege;
- use secret references;
- redact sensitive logs;
- apply backend RBAC;
- validate authentication/authorization;
- protect outbound webhooks with signatures or strong machine authentication.

---

## 8. Testing Rules

Every meaningful change requires tests.

At minimum:

- unit tests for domain logic;
- integration tests for database/messaging when touched;
- regression tests for bugs;
- contract tests for public events/APIs.

Before completion run:

- lint;
- typecheck;
- tests relevant to the task;
- build where applicable.

Do not state that a feature works if it was not validated.

Hardware-dependent behavior must be labeled:

- implemented;
- automatically tested;
- requires real-device validation.

---

## 9. Scope Discipline

Each agent must stay inside its assigned scope.

Do not:

- redesign unrelated modules;
- rename public contracts without need;
- introduce a new framework because it is preferred personally;
- make broad refactors unrelated to the task;
- implement future features without an accepted requirement.

If a task requires an architecture change, stop implementation at the safe boundary and propose an ADR.

---

## 10. Completion Report

Every coding-agent completion message should include:

### Changed

Files/modules added or modified.

### Validated

Commands/tests actually run and their results.

### Decisions

Any material implementation decisions made.

### Risks / Open Items

Anything requiring hardware, secrets, infrastructure, or future work.

### Compatibility

Whether event/API/schema contracts changed.

Do not hide incomplete work.
