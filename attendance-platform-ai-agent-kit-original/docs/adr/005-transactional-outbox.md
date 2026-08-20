# ADR 005 — Transactional Outbox for Outbound Events

## Status
Accepted

## Context
Persisting attendance and immediately calling an HRMS creates a dual-write failure:

```text
database succeeds
HTTP call fails
```

or:

```text
HTTP succeeds
database transaction fails
```

## Decision
Use a transactional outbox.

The same MySQL transaction writes:
- normalized attendance;
- outbox event.

A separate publisher sends outbox events to Kafka.

Integration workers deliver downstream.

## Reasons
- Prevents lost outbound events.
- Makes retries independent from attendance ingestion.
- Supports replay and auditing.
- Keeps HRMS availability out of the critical attendance transaction.

## Consequences
- Outbox publisher requires monitoring.
- Duplicate publication is possible and must be handled idempotently.
- Outbox retention/cleanup is required.
