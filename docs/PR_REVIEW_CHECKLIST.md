# Pull Request Review Checklist

## Architecture

- [ ] Change respects service/module boundaries.
- [ ] Vendor code is isolated.
- [ ] No HRMS employee-master logic added.
- [ ] No new architectural dependency without ADR.

## Reliability

- [ ] Retries are bounded.
- [ ] Timeouts exist.
- [ ] Idempotency considered.
- [ ] Failure cannot silently lose punches.
- [ ] Checkpoint/offset behavior is safe.

## Database

- [ ] Migration reviewed.
- [ ] Indexes justified.
- [ ] Query pattern scales.
- [ ] No large OFFSET pagination.
- [ ] Unique keys support idempotency.
- [ ] Partition constraints considered.

## Security

- [ ] No secrets committed.
- [ ] Logs redact sensitive values.
- [ ] Backend authorization exists.
- [ ] Input is validated.
- [ ] Least privilege considered.

## Events / APIs

- [ ] Schema compatibility reviewed.
- [ ] Version updated if breaking.
- [ ] Unknown enum values are safe.
- [ ] Examples/docs updated.

## Tests

- [ ] Unit tests added/updated.
- [ ] Integration tests added where required.
- [ ] Failure/retry scenario covered.
- [ ] Tests were actually run.

## Operations

- [ ] Metrics/logs sufficient.
- [ ] Health/readiness impact considered.
- [ ] Graceful shutdown considered.
- [ ] Runbook/docs updated when operational behavior changed.
