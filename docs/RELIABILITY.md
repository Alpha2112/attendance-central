# Reliability Engineering & Chaos Resilience Specification

## 1. Principles of Platform Resilience

1. **Transactional Outbox Isolation**:
   External downstream systems (HRMS, payroll, webhooks) must never run inside the database transaction that writes attendance. Downstream failures cannot roll back or block physical biometric ingestions.

2. **Deterministic Idempotency Boundary**:
   Every punch is hashed into a SHA-256 fingerprint from `(organizationId, employeeId, deviceId, punchTimeUtc, punchType)` backed by a MySQL unique constraint.

3. **Safe Unmapped Identity Holding**:
   A punch from an unmapped terminal user ID is never dropped. The raw punch is preserved in `raw_punch_logs` and can be reprocessed as soon as HRMS employee master data is synchronized.

4. **Exponential Backoff with Jitter**:
   Retryable webhook dispatches use the formula:
   $$\text{Delay} = \text{baseDelay} \times 2^{\text{attempt} - 1} \pm \text{jitter}(20\%)$$
   to prevent thundering herd spikes against recovering downstream servers.

5. **Permanent Error Fast-Fail**:
   Permanent HTTP errors (400, 401, 403, 404) immediately transition the outbox attempt to `PERMANENT_FAILED`, preventing wasted cluster compute.
