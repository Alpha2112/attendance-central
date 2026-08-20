# Collector Agent Prompt

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

Implement the vendor-neutral device collector framework and orchestration.

## Read

- `docs/DEVICE_ADAPTER_GUIDE.md`
- ADR 004
- `docs/EVENT_CONTRACTS.md`

## Implement

- AttendanceDeviceAdapter interface if not already implemented.
- capability interfaces.
- adapter registry.
- connector lifecycle.
- device connection testing.
- polling orchestration.
- reconciliation orchestration.
- Redis distributed lock per device.
- scheduling jitter.
- adaptive backoff for offline devices.
- raw event publication to Kafka.
- device heartbeat/status.
- graceful shutdown.

Use the mock adapter for the first end-to-end flow.

## Rules

- do not normalize attendance inside collector.
- do not write directly to downstream HRMS.
- a device failure must not block other devices.
- checkpoint advancement must be safe.

## Acceptance

- mock device → collector → raw Kafka topic works.
- duplicate mock events can be emitted.
- collector restarts safely.
- locks prevent concurrent same-device sync where required.
- retry/backoff is tested.
- graceful SIGTERM path is tested or validated.
