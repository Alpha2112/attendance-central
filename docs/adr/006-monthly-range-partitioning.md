# ADR 006: Monthly Range Partitioning for High-Volume Attendance Logs

## Status

Accepted

## Context

The platform must scale to 1–5+ million punches per month with multi-year historical retention without query degradation, bloated B-Tree indexes, or expensive full-table vacuum operations.

## Decision

Implement MySQL 8.4 Range Partitioning on `attendance_logs` and `raw_punch_logs` by `event_date` (format: `YYYYMM`).
Composite unique index: `UNIQUE KEY uq_attendance_fingerprint (event_fingerprint, event_date)` to satisfy MySQL partitioning unique constraint rules while enforcing mathematical idempotency.

## Consequences

- **Positive**: Blazing fast queries pruning old partitions; zero-downtime historical partition drops (`ALTER TABLE ... DROP PARTITION`); isolated partition locking.
- **Trade-off**: The partitioning key `event_date` must be present in composite unique indexes.
