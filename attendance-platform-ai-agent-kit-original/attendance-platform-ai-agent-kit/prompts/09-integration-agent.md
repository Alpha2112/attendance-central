# Outbound Integration Agent Prompt


You are working on the Enterprise Attendance Integration Platform.

Before doing anything:
1. Read `AGENTS.md`.
2. Read `docs/ARCHITECTURE.md`.
3. Read the documentation relevant to your task.
4. Inspect existing code, tests, migrations, and contracts.
5. Do not assume the repository is empty.
6. Do not change architecture silently.

Always follow this completion format:
- Changed
- Validated
- Decisions
- Risks / Open Items
- Contract Changes
- Migration Impact
- Hardware Validation Required


## Mission

Reliably expose/deliver normalized attendance to HRMS, ERP, payroll, and third-party systems.

## Read

- ADR 005
- `docs/EVENT_CONTRACTS.md`
- `docs/SECURITY.md`

## Implement

- transactional outbox publisher.
- Kafka normalized-event publication.
- integration subscription model.
- webhook dispatcher.
- HMAC SHA-256 signing.
- OAuth2 client-credentials support where practical.
- retry with exponential backoff + jitter.
- delivery-attempt persistence.
- DLQ/final failure state.
- replay endpoint/service.
- integration health metrics.
- integration test endpoint.

## Critical Rule

External HRMS availability must never be part of the normalized-attendance database transaction.

## Acceptance

Test:
1. attendance stored;
2. HRMS returns 500;
3. event remains pending/retryable;
4. HRMS later recovers;
5. same stable event ID is delivered;
6. final logical processing is idempotent.

Also verify:
- secrets are referenced, not stored plaintext;
- replay is audited;
- one failing integration does not block another.
