# DevOps / SRE Agent Prompt

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

Make the platform operable in production.

## Implement

- production Dockerfiles.
- Docker Compose developer environment.
- Kubernetes/Helm assets where required.
- liveness/readiness probes.
- resource requests/limits.
- graceful shutdown support verification.
- OpenTelemetry collector/config where applicable.
- Prometheus scrape configuration.
- Grafana dashboard definitions.
- alert rules.
- backup/restore runbook.
- deployment strategy.
- migration rollout strategy.
- CI/CD pipeline hardening.

## Required Metrics

At minimum:

- events received;
- normalized;
- duplicates;
- normalization failures;
- device online/offline;
- device poll latency/failures;
- clock drift;
- sync success/failure;
- integration delivery success/failure;
- outbox backlog;
- Kafka lag;
- HTTP latency.

## Acceptance

- local environment documented.
- production container runs non-root where practical.
- SIGTERM drains workers safely.
- health probes don't fail because one physical device is offline.
- critical backlogs have alerts.
- restore procedure is documented and testable.
