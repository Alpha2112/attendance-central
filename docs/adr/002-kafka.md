# ADR 002 — Kafka as Durable Event Backbone

## Status

Accepted

## Context

The platform needs:

- durable ingestion;
- replay;
- multiple independent consumers;
- normalization;
- outbound integration;
- asynchronous processing;
- recoverability after outages.

## Decision

Use Kafka as the primary durable event backbone.

## Reasons

- Replayable retained log.
- Consumer-group horizontal scaling.
- Decouples unreliable devices from downstream systems.
- Supports separate raw/normalized/integration streams.
- Enables later analytics consumers without connector changes.

## Alternatives

### RabbitMQ

Simpler for work queues and a valid MVP alternative, but weaker fit for long-retention replay-oriented architecture.

### Redis Streams

Useful for medium-scale streaming but Redis already serves cache/lock/heartbeat responsibilities.

## Consequences

- Need topic/schema governance.
- Need consumer lag monitoring.
- Consumers must be idempotent.
- Operational Kafka expertise is required.
