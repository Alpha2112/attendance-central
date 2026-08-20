# Event / Domain Agent Prompt


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

Implement canonical domain types, schemas, normalization primitives, and event-contract packages.

## Read

- `docs/DOMAIN_MODEL.md`
- `docs/EVENT_CONTRACTS.md`
- ADR 002
- ADR 004

## Preferred Scope

```text
packages/events/**
packages/domain/**
packages/validation/**
packages/errors/**
```

## Implement

- DeviceVendor type.
- DeviceCapability types.
- RawAttendanceEvent.
- AttendanceEvent.
- DeviceStatusEvent.
- Sync events.
- Webhook envelope types.
- schema validation.
- schemaVersion.
- serialization/deserialization tests.
- punch-type normalization contract.
- verification-type normalization contract.
- deterministic event fingerprint helper.
- typed domain errors.

## Rules

- Untrusted payloads use `unknown`.
- Unknown vendor codes never crash generic normalization.
- Event IDs are stable.
- Breaking contract changes require explicit versioning.

## Do Not

- implement specific ZKTeco/Hikvision/Suprema protocol calls;
- change database schema without coordination;
- deliver webhooks.

## Acceptance

- strict TypeScript.
- validation rejects malformed contracts.
- round-trip serialization tests pass.
- fingerprint is deterministic.
- unknown enums map safely where normalization helper is responsible.
