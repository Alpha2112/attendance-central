# Architecture Implementation Backlog & Sequence

This document defines the prioritized roadmap, dependency sequence, and contract ownership for the Enterprise Attendance Integration Platform, coordinated by the **Lead Architect (Agent 00)**.

---

## 1. Dependency Graph & Phase Sequencing

```mermaid
graph TD
    Phase00["00. Lead Architect (Architecture & Backlog)"]
    Phase01["01. Foundation (Monorepo, Infra, Core Packages, API/Dashboard Shells)"]
    Phase02["02. Database (Migrations, Entities, Outbox Schema, Partitioning)"]
    Phase03["03. Event / Domain (Canonical Events, Normalizer Engine, Deduplication)"]
    Phase04["04. Mock Device (Simulators: Push, Polling, Heartbeats, Edge Cases)"]
    Phase05["05. Collector Control (Lifecycle, Push Receiver, Poller Engine, Lock Coordinator)"]
    Phase06["06. ZKTeco Adapter (Standalone TCP/Push Connector)"]
    Phase07["07. Hikvision Adapter (ISAPI / Push Event Connector)"]
    Phase08["08. Suprema Adapter (BioStar 2 API / Webhook Connector)"]
    Phase09["09. Integration Dispatcher (Outbox Publisher, Webhook Dispatcher, Signatures)"]
    Phase10["10. Frontend Dashboard (Live Stream, Device Management, Reconciliation UI)"]
    Phase11["11. Security Hardening (Vault Provider, M2M OAuth, Rate Limiting, Redaction)"]
    Phase12["12. DevOps / SRE (Kubernetes/Helm, OpenTelemetry, Prometheus, Alerting)"]
    Phase13["13. QA / Reliability (Chaos, Replay, DLQ Recovery, Soak Testing)"]
    Phase14["14. Independent Reviewer (Security, Performance, Contract Audit)"]
    Phase15["15. Documentation Consolidation (Runbooks, OpenAPI specs, Deployment Guide)"]

    Phase00 --> Phase01
    Phase01 --> Phase02
    Phase01 --> Phase03
    Phase02 --> Phase04
    Phase03 --> Phase04
    Phase04 --> Phase05
    Phase05 --> Phase06 & Phase07 & Phase08
    Phase05 --> Phase09
    Phase09 --> Phase10
    Phase06 & Phase07 & Phase08 --> Phase10
    Phase10 --> Phase11
    Phase11 --> Phase12
    Phase12 --> Phase13
    Phase13 --> Phase14
    Phase14 --> Phase15
```

---

## 2. Phase Breakdown & Acceptance Criteria

### Phase 00: Lead Architect (Active)

- **Scope**: Target architecture validation, ADR maintenance, contract ownership, prioritized backlog.
- **Deliverables**: `docs/BACKLOG.md`, contract governance rules in `packages/contracts`.

### Phase 01: Foundation (Active)

- **Scope**: Monorepo scaffolding, strict TypeScript, shared packages (`contracts`, `config`, `logging`, `database`, `redis`, `kafka`, `observability`), NestJS Fastify API, Next.js dashboard shell, Docker Compose, baseline CI.
- **Deliverables**: Verified builds, typecheck, lint, and unit test suites across all packages and apps.

### Phase 02: Database & Storage Engine

- **Scope**: Database schema migrations (MySQL 8.4), Knex/Kysely/Prisma integration, monthly range partitioning for `raw_punch_logs` and `attendance_logs`, keyset pagination queries, transactional outbox table.
- **Dependencies**: Phase 01.

### Phase 03: Event Domain & Normalization Engine

- **Scope**: Normalization worker subscribing to `attendance.raw.v1`, employee ID resolution lookup, canonical punch & verification mapping, event fingerprinting / deduplication, transactional persistence + outbox generation.
- **Dependencies**: Phase 01, Phase 02.

### Phase 04: Mock Device & Emulation Suite

- **Scope**: Programmable mock device simulator supporting push punches, polling endpoints, simulated clock drift, network timeouts, duplicate burst punches.
- **Dependencies**: Phase 01, Phase 03.

### Phase 05: Collector Control Service

- **Scope**: Device connection lifecycle manager, health probes, polling job coordinator with Redis distributed locking, raw event ingestion endpoints publishing to `attendance.raw.v1`.
- **Dependencies**: Phase 04.

### Phases 06–08: Vendor Adapters (ZKTeco, Hikvision, Suprema)

- **Scope**: Plugin-based adapters implementing the standard device connector interface. SDK isolation boundaries, protocol translation, and raw event publishing.
- **Dependencies**: Phase 05.

### Phase 09: Outbound Integration Dispatcher

- **Scope**: Transactional outbox publisher to `attendance.normalized.v1`, webhook worker with HMAC-SHA256 signatures, exponential backoff with jitter, dead-letter queue routing (`attendance.dlq.v1`), and replay APIs.
- **Dependencies**: Phase 03, Phase 05.

### Phase 10: Operational Frontend Dashboard

- **Scope**: Full dashboard views for device inventory, live punch telemetry, mapping management, sync job triggers, integration audit, and alert center.
- **Dependencies**: Phase 09.

### Phases 11–15: Production Hardening, DevOps, QA, Audit & Docs

- **Scope**: Secret management integration (Vault/AWS), OpenTelemetry distributed tracing, Prometheus metrics, chaos and load testing, contract compliance audit, final operational runbooks.
- **Dependencies**: Phase 10.

---

## 3. Public Contract Ownership Rules

1. **Contracts Package (`packages/contracts`)** is the single source of truth for:
   - Kafka topic names and schema versions.
   - Domain models, status enums, and validation schemas.
   - API request/response envelopes and keyset pagination types.
2. **Backward Compatibility**: Any contract modification must be additive. Breaking schema modifications require incrementing the topic version (e.g., `attendance.raw.v2`) and filing an ADR.
3. **Vendor Isolation**: Vendor-specific payloads must only be encapsulated inside the `rawPayload` field and vendor-specific adapter modules.
