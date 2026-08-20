# ADR 003 — MySQL as Primary Operational Database

## Status
Accepted

## Context
The platform needs strong relational integrity for:
- devices;
- mappings;
- attendance;
- sync jobs;
- integrations;
- outbox;
- audit.

Expected scale is millions of attendance records per month, not internet-scale billions per day.

## Decision
Use MySQL 8+ as the primary relational database.

## Reasons
- Proven relational database.
- Appropriate for expected write volume.
- Supports replication/read scaling.
- Supports range partitioning for log lifecycle.
- Strong transactional semantics for outbox pattern.
- Fits existing requirement.

## Alternatives
### PostgreSQL
Excellent alternative, but MySQL is the selected platform requirement.

### ClickHouse
Not suitable as the primary transactional system; may be added for analytics.

## Consequences
- High-volume table design must account for partitioning and unique-key constraints.
- Use keyset pagination.
- Use raw SQL where ORM abstractions are insufficient for partitioning.
