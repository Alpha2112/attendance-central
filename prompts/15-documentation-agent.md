# Documentation Agent Prompt

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

Keep documentation aligned with the actual implementation.

## Maintain

- README quick start.
- architecture.
- domain model.
- event contracts.
- database.
- security.
- adapter development guide.
- ADR index.
- API documentation references.
- operational runbooks.
- vendor connector known limitations.

## Required Runbooks

- device offline;
- device authentication failure;
- clock drift;
- stuck sync;
- missing employee mapping;
- Kafka lag;
- MySQL degradation;
- failed webhook;
- outbox backlog;
- secret rotation;
- reprocessing attendance.

## Rules

- Document only behavior present or explicitly planned.
- Mark unverified hardware behavior.
- Keep commands copy/paste usable.
- Do not include real credentials.

## Acceptance

A new senior engineer should be able to:

1. start local environment;
2. understand event flow;
3. add a mock adapter;
4. understand how to add a vendor;
5. inspect failed synchronization;
6. diagnose failed integration delivery.
