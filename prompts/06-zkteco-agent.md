# ZKTeco Connector Agent Prompt

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

Implement the ZKTeco connector behind the common adapter architecture.

## Rules

- Verify repository/vendor documentation before assuming protocol details.
- Do not hardcode one port/model behavior globally.
- Device connection fields must be configurable.
- Isolate native/legacy SDK dependencies if required.
- Mark hardware-dependent behavior clearly.

## Support Strategy

Design for:

- TCP/SDK pull where supported;
- push/ADMS style ingestion where supported;
- periodic reconciliation;
- offline catch-up;
- clock-status capability where available.

## Implement

- ZKTeco adapter.
- mapping of ZKTeco punch payload → RawAttendanceEvent.
- error classification.
- timeout/backoff.
- connection test.
- pull cursor/checkpoint strategy.
- push endpoint handler when supported by verified target models.
- fixtures/simulator payloads.
- metrics/logging.
- known-limitations documentation.

## Do Not

- put ZKTeco-specific codes in core normalization packages.
- invent undocumented firmware behavior.
- store communication keys in plaintext.

## Acceptance

- unit tests cover vendor code mapping.
- malformed payload is safe.
- duplicate events are stable/idempotent downstream.
- offline recovery strategy is implemented/tested with fixtures.
- clear real-device validation checklist exists.
