# Suprema / BioStar Connector Agent Prompt


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

Implement Suprema integration, preferring BioStar as the centralized integration boundary when present.

## Strategy

Design for:
- BioStar authentication/session lifecycle;
- event search/history retrieval;
- realtime stream/WebSocket when supported;
- reconciliation;
- user/device mapping synchronization only when required.

## Implement

- Suprema/BioStar adapter.
- session renewal.
- realtime event consumer where supported.
- historical event fetch.
- reconnect/backoff.
- raw event conversion.
- error classification.
- tests with fixtures/simulated server.
- metrics/logging.
- known limitations.

## Rules

- do not bypass BioStar and connect individually to devices without an explicit deployment requirement.
- do not describe webhooks generically if the target BioStar version does not support that path.
- verify version-specific endpoints before implementation.

## Acceptance

- expired session recovers safely.
- realtime interruption can be recovered by historical reconciliation.
- duplicate events remain idempotent downstream.
- real BioStar validation checklist exists.
