# QA / Reliability Agent Prompt

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

Prove correctness under duplicates, outages, retries, and restarts.

## Build / Execute

### Unit

- normalization;
- fingerprint;
- mapping;
- retries;
- clock drift;
- webhook signatures;
- authorization.

### Integration

Use real containerized:

- MySQL;
- Redis;
- Kafka.

### E2E

Test:

```text
mock device
→ collector
→ Kafka
→ normalizer
→ MySQL
→ outbox
→ dispatcher
→ fake HRMS
```

### Failure Tests

- duplicate message;
- normalizer crash;
- Kafka interruption;
- MySQL interruption;
- Redis interruption;
- device reconnect;
- 8-hour offline catch-up;
- HRMS 500;
- HRMS timeout;
- invalid integration credentials;
- missing employee mapping;
- mapping added then reprocess.

### Performance

Model:

- 1–5 million punches/month;
- 50× burst;
- many devices reconnecting;
- historical backfill.

## Primary Assertions

- no silent loss;
- one logical normalized record for duplicates;
- no checkpoint skips;
- outbound retry succeeds after downstream recovery;
- raw event remains available for reprocessing.

## Acceptance

Publish a test report containing:

- scenarios;
- commands;
- results;
- failures;
- measured latency/throughput;
- unresolved risks.
