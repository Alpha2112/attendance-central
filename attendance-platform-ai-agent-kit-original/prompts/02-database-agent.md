# Database Agent Prompt


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

Implement the production-oriented MySQL schema and data access foundation.

## Read

- `docs/DATABASE.md`
- `docs/DOMAIN_MODEL.md`
- ADR 003
- ADR 005

## Implement

Tables/migrations for:
- organizations;
- branches;
- device_types;
- devices;
- device_employee_mappings;
- raw_punch_logs;
- attendance_logs;
- sync_jobs;
- sync_checkpoints;
- device_status_logs;
- integrations;
- integration_subscriptions;
- outbox_events;
- delivery_attempts;
- api_clients;
- audit_logs.

Also:
- indexes;
- foreign keys where appropriate;
- repository/data access abstractions;
- test fixtures;
- seed data;
- migration tests.

## Special Requirements

- No employee HR profile table.
- `external_employee_id` is the stored HRMS identity.
- Plan high-volume attendance/raw tables for monthly partitioning.
- Validate unique-key design against partitioning.
- Add DB-level idempotency constraint.
- Never store plaintext credentials.

## Do Not

- build Kafka consumers;
- implement vendor SDK logic;
- implement dashboard UI.

## Acceptance

- clean database can migrate from zero.
- migration can run repeatedly in CI as intended.
- key access patterns have indexes.
- duplicate attendance is rejected at authoritative boundary.
- repository integration tests pass against real MySQL container.
