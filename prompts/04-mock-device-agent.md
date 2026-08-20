# Mock Device / Simulator Agent Prompt

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

Build deterministic device simulators that allow the architecture to be tested before real hardware exists.

## Implement

Simulator capabilities:

- normal punches;
- duplicate punches;
- delayed punches;
- out-of-order punches;
- malformed payloads;
- clock drift;
- offline/reconnect;
- auth failure;
- network timeout;
- large historical batch;
- reconnect plus overlapping reconciliation window.

Provide at least one mock adapter implementing the real adapter contract.

## Requirements

Simulators must allow tests to specify:

- vendor user ID;
- device time;
- event ID;
- event type;
- verification type;
- failure mode;
- latency;
- batch size.

## Do Not

- pretend to emulate undocumented proprietary byte protocols exactly.
- encode production vendor assumptions into generic simulator logic.

## Acceptance

- deterministic seeded test runs.
- simulator can generate 10 duplicate copies of one logical punch.
- simulator can model 8-hour offline history followed by replay.
- tests validate raw event contract.
- documentation explains how to run simulator locally.
