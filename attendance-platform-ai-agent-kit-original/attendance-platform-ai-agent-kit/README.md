# Enterprise Attendance Integration Platform — AI Agent Starter Kit

This repository starter kit defines the architecture, domain contracts, engineering rules, and agent-specific implementation prompts for an enterprise attendance-device integration platform.

## Mission

Build a centralized platform that:

1. Connects to attendance devices and vendor platforms.
2. Collects raw attendance punch events.
3. Maps vendor/device user identifiers to an external HRMS `employee_id`.
4. Normalizes vendor-specific punches into a canonical attendance format.
5. Stores raw and normalized events safely.
6. Exposes attendance through APIs.
7. Reliably distributes normalized attendance to HRMS/ERP/payroll/third-party systems.
8. Provides an operational dashboard for devices, live attendance, synchronization, integrations, alerts, and audit history.

The platform is **not an HRMS**. Employee profile, payroll, leave, shift, salary, and similar HR data remain in external HRMS systems.

---

## Recommended Stack

### Backend
- Node.js LTS
- TypeScript
- NestJS
- Fastify

### Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Recharts or Apache ECharts

### Data / Messaging
- MySQL 8+
- Redis
- Kafka

### Operations
- Docker / Docker Compose
- Kubernetes or Helm when production scale requires it
- OpenTelemetry
- Prometheus
- Grafana
- Centralized structured logging
- Vault or cloud secret manager

---

## Repository Documentation

```text
/docs/
    ARCHITECTURE.md
    DOMAIN_MODEL.md
    EVENT_CONTRACTS.md
    DATABASE.md
    SECURITY.md
    DEVICE_ADAPTER_GUIDE.md
    AGENT_WORKFLOW.md
    TASK_TEMPLATE.md
    PR_REVIEW_CHECKLIST.md

/docs/adr/
    001-node-typescript.md
    002-kafka.md
    003-mysql.md
    004-adapter-architecture.md
    005-transactional-outbox.md

/prompts/
    00-lead-architect-agent.md
    01-foundation-agent.md
    02-database-agent.md
    03-event-domain-agent.md
    04-mock-device-agent.md
    05-collector-agent.md
    06-zkteco-agent.md
    07-hikvision-agent.md
    08-suprema-agent.md
    09-integration-agent.md
    10-frontend-agent.md
    11-security-agent.md
    12-devops-sre-agent.md
    13-qa-reliability-agent.md
    14-reviewer-agent.md
    15-documentation-agent.md

AGENTS.md
README.md
```

---

## Recommended Implementation Sequence

Do not ask one AI agent to build the complete platform in one pass.

Use this sequence:

1. Lead Architect
2. Foundation
3. Database
4. Event / Domain
5. Mock Device
6. Collector
7. End-to-end validation using mock devices
8. First real vendor connector
9. Remaining vendor connectors
10. Integration / outbound delivery
11. Frontend dashboard
12. Security hardening
13. DevOps / SRE productionization
14. QA / reliability validation
15. Independent reviewer
16. Documentation consolidation

The first major milestone is:

```text
Mock Device
    ↓
Collector
    ↓
Kafka raw event
    ↓
Normalizer
    ↓
MySQL
    ↓
REST API
    ↓
Dashboard
```

A duplicate punch submitted many times must produce exactly one logical normalized attendance event.

---

## How to Use the Agent Prompts

Each file in `/prompts` is intended to be given to one AI coding agent together with access to the repository.

The agent must first read:

1. `AGENTS.md`
2. `docs/ARCHITECTURE.md`
3. Relevant ADRs
4. Relevant domain/event/database documentation
5. The prompt assigned to that agent

Do not allow an implementation agent to redefine architecture independently.

Architecture changes require:
- a proposed ADR;
- review by the Lead Architect agent;
- compatibility review;
- migration impact review.

---

## Key Correctness Rule

The most important platform guarantee is:

> If a valid physical attendance punch can eventually be retrieved from a device or vendor platform, the system should eventually persist one logically correct normalized attendance event, preserve the raw source event, and reliably expose or deliver the normalized event downstream without silent loss.

The system assumes:
- duplicate delivery is possible;
- delayed events are possible;
- out-of-order events are possible;
- devices go offline;
- integrations go offline;
- workers restart;
- networks fail.

Therefore the design uses:
- at-least-once ingestion;
- idempotency;
- reconciliation;
- retries;
- transactional outbox;
- durable raw storage;
- replay;
- DLQ handling;
- auditability.

---

## Scope Boundary

The central platform stores only the attendance identity required for integration.

Typical normalized data:

```json
{
  "employee_id": "EMP-000457",
  "device_id": "DEV-HQ-001",
  "vendor": "HIKVISION",
  "punch_time": "2026-08-15T08:04:32+03:00",
  "punch_time_utc": "2026-08-15T05:04:32Z",
  "punch_type": "IN",
  "verification_type": "FACE"
}
```

Do not duplicate employee master records from HRMS.

---

## First Development Goal

Before real vendor SDK/API integration, prove the architecture using simulators.

Acceptance scenario:

```text
Given:
  device = DEV-001
  vendor user = 457
  mapping = 457 → EMP-000457

When:
  the mock device sends a punch

Then:
  raw event is persisted
  normalized event is persisted
  REST API returns employee_id EMP-000457
  dashboard displays the event

And:
  sending the same event 10 times still creates one logical attendance record
```
