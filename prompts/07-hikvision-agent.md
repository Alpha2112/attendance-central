# Hikvision Connector Agent Prompt

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

Implement the Hikvision attendance connector behind the common adapter contract.

## Strategy

Prefer verified HTTP/ISAPI capabilities where available.

Design for:

- HTTPS;
- supported authentication modes;
- realtime event subscription/stream where verified;
- historical event retrieval;
- periodic reconciliation;
- capability differences across firmware/models.

## Implement

- Hikvision adapter.
- session/auth handling abstraction.
- connection test.
- historical fetch.
- realtime subscription when supported by target devices.
- reconnect/backoff.
- RawAttendanceEvent conversion.
- fixture-based tests.
- status/metrics.
- known firmware/model limitations document.

## Security

- credentials come from secret manager abstraction.
- avoid logging auth headers.
- validate certificates according to environment policy.

## Acceptance

- no ISAPI assumptions leak into core packages.
- auth failure is classified separately from transient network failure.
- realtime disconnect/reconnect is tested with simulator/fixtures.
- reconciliation can recover missed realtime events.
- real-device validation checklist exists.
