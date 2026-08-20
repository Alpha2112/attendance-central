# Architecture

## 1. Purpose

The platform centralizes attendance events from heterogeneous biometric/attendance devices and exposes one normalized attendance interface to HRMS, ERP, payroll, analytics, and third-party systems.

The platform intentionally does not own HR employee master data.

---

## 2. High-Level Architecture

```text
Biometric / Attendance Devices
        │
        ├── ZKTeco
        ├── Hikvision
        ├── Suprema / BioStar
        └── Future vendors
        │
        ▼
Vendor Connector / Adapter Layer
        │
        ▼
attendance.raw.v1
        │
        ▼
Kafka
        │
        ▼
Normalization Service
        │
        ├── Resolve device user → external employee_id
        ├── Normalize punch type
        ├── Normalize verification type
        ├── Preserve timestamps/raw metadata
        ├── Detect duplicates
        └── Persist normalized event
        │
        ├──────────────► MySQL
        │
        └──────────────► attendance.normalized.v1
                              │
                              ▼
                    Integration Dispatcher
                              │
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
               HRMS          ERP        Third Party
                 ▲
                 │
              REST API
                 ▲
                 │
             API Gateway

Operations:
- Redis: locks, heartbeat, cache, short dedupe
- OpenTelemetry: tracing/log context
- Prometheus: metrics
- Grafana: operational dashboards
- Secret manager: device/integration credentials
```

---

## 3. Deployable Units

Initial system should avoid excessive microservice fragmentation.

Recommended deployables:

- `api`
- `dashboard`
- `collector-control`
- `normalizer`
- `scheduler`
- `integration-dispatcher`
- `outbox-publisher`
- vendor connector workers as needed

A vendor connector may run inside a shared collector process only when runtime/library isolation is not required.

---

## 4. Core Principles

### Vendor isolation

Core domain modules never import vendor SDKs.

### Durable ingestion

Raw events are persisted and/or placed on a durable event stream before downstream business distribution.

### At-least-once processing

Duplicates are expected. Idempotency is mandatory.

### Raw + normalized event separation

The platform stores both:

- what the vendor/device actually emitted;
- the canonical normalized attendance event.

### HRMS boundary

HRMS owns employee data. Attendance owns only:

- `employee_id`;
- device/vendor mapping;
- attendance facts.

### Push + reconciliation

Where possible, realtime push/event subscriptions are paired with periodic historical reconciliation.

### Fault isolation

One broken:

- device;
- vendor;
- connector;
- integration;
  must not stop unrelated processing.

---

## 5. Primary Processing Flow

```text
Device Event
  ↓
Vendor Adapter
  ↓
RawAttendanceEvent
  ↓
Kafka attendance.raw.v1
  ↓
Raw persistence
  ↓
Mapping + normalization
  ↓
Idempotency check
  ↓
attendance_logs
  ↓
Transactional outbox
  ↓
Kafka attendance.normalized.v1
  ↓
External integrations
```

---

## 6. Offline Recovery

Polling/reconciliation jobs maintain a durable checkpoint.

Example:

```text
last event time: 10:30
reconnect time: 15:00
reconciliation starts: 10:25
```

The overlap is intentional.

Duplicates in the overlap window are eliminated by idempotency.

Never advance a checkpoint beyond data that has not been durably accepted.

---

## 7. Service Boundaries

### API

Responsibilities:

- device CRUD;
- device status queries;
- attendance queries;
- mapping management;
- sync commands;
- integration configuration;
- audit/query interfaces.

### Collector Control

Responsibilities:

- adapter registration;
- device connection orchestration;
- health/state;
- push endpoint routing;
- connector lifecycle.

### Scheduler

Responsibilities:

- periodic polling;
- reconciliation;
- retry scheduling;
- jitter;
- distributed locks.

### Normalizer

Responsibilities:

- validate raw events;
- resolve employee mappings;
- normalize types/timestamps;
- persist attendance;
- enforce idempotency;
- create outbox entries;
- route failures.

### Integration Dispatcher

Responsibilities:

- webhook/API delivery;
- authentication/signing;
- retry;
- DLQ;
- delivery history;
- replay.

### Dashboard

Responsibilities:

- operations;
- not system-of-record logic.

---

## 8. Scalability Assumptions

Initial target:

- 500+ devices;
- 20,000+ employees;
- 1–5 million punches/month;
- multiple branches;
- future multi-tenancy.

This is not extreme event-stream throughput. Reliability, heterogeneity, replay, and auditability are the main complexity drivers.

Scale services independently:

- connectors by device/vendor;
- normalizers by Kafka partitions;
- integration dispatchers by destination backlog;
- API horizontally;
- read replicas for reporting/query load when required.

---

## 9. Time Handling

Every device/branch has an IANA timezone.

Store:

- original device timestamp;
- normalized timestamp;
- UTC timestamp;
- received timestamp;
- clock drift when known.

Do not derive payroll work duration in this platform.

---

## 10. Multi-Tenancy

Even if the first deployment is single-tenant, architecture should support a future `tenant_id`.

A future tenancy change must not require rewriting event contracts from scratch.

Tenant isolation affects:

- authorization;
- database queries;
- Kafka keys;
- logs/metrics;
- integrations;
- audit.

---

## 11. Failure Model

Assume:

- devices disconnect;
- networks partition;
- requests time out;
- events repeat;
- events arrive out of order;
- timestamps drift;
- connectors restart;
- Kafka redelivers;
- databases fail over;
- HRMS endpoints fail;
- credentials expire.

The system must recover without silent attendance loss.

---

## 12. Frontend & Operations Control Plane (shadcn/ui)

The operational management dashboard is implemented in `apps/dashboard` using:

- **Framework**: Next.js 15 (App Router, React 19, Strict TypeScript)
- **UI Architecture**: **shadcn/ui** design system built on Radix UI primitives and Tailwind CSS.
- **Tokens & Theming**: Semantic CSS variables (Zinc / Slate dark mode palette) in `globals.css` with `components.json` registry configuration.
- **Component Primitives**: Located in `apps/dashboard/src/components/ui/` (`Button`, `Card`, `Badge`, `Tabs`, `Separator`, `Avatar`, `Tooltip`, etc.) for zero runtime overhead and 100% codebase ownership.
- **Real-Time Integration**: Direct telemetry polling against backend API `/health/ready` and future WebSocket event streaming.
- **Scope**: Device inventory management, real-time punch feeds, identity mapping configuration, sync job orchestration, and delivery outbox monitoring.
