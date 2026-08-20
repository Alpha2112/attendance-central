# AI Agent Workflow

## 1. Operating Model

Use a Lead Architect agent to coordinate architecture and scope.

Implementation agents receive narrowly defined work.

Recommended flow:

```text
User / Technical Lead
        ↓
Lead Architect Agent
        ↓
Scoped Task
        ↓
Implementation Agent
        ↓
QA / Reliability Agent
        ↓
Reviewer Agent
        ↓
Merge-ready change
```

---

## 2. No Giant One-Pass Builds

Do not ask one agent to:
- scaffold;
- design schema;
- write all vendor integrations;
- implement dashboard;
- productionize;
in one task.

Large prompts create inconsistent decisions and hidden integration defects.

---

## 3. Task Size

A good agent task should usually have:
- one subsystem;
- explicit allowed directories;
- explicit forbidden scope;
- 3–10 acceptance criteria;
- defined tests.

Example:

```text
Task:
Implement canonical attendance event contracts.

Allowed:
packages/events/**

Do not:
change database
implement Kafka consumers
implement vendor connectors

Acceptance:
strict TypeScript
Zod schemas
serialization tests
schemaVersion
typecheck/test pass
```

---

## 4. Required Agent Loop

Every implementation agent:

```text
inspect
  ↓
understand contracts
  ↓
plan smallest coherent change
  ↓
implement
  ↓
test
  ↓
lint/typecheck
  ↓
self-review diff
  ↓
document
  ↓
handoff
```

---

## 5. Handoff Format

Every handoff includes:

```text
Changed
Validated
Decisions
Open Items
Contract Changes
Migration Impact
Hardware Validation Needed
```

---

## 6. Parallel Work

Safe parallel work examples:
- dashboard shell vs database migration;
- vendor connector fixtures vs documentation;
- security threat model vs mock-device simulator.

Unsafe parallel work examples:
- two agents modifying the same public event contract;
- two agents designing different schemas for the same table;
- two agents changing Kafka topic names.

The Lead Architect owns coordination for public contracts.

---

## 7. Architecture Changes

An agent proposing a material change must create an ADR draft.

Examples:
- replacing Kafka;
- changing ORM;
- changing event schema semantics;
- changing tenant model;
- changing outbox design;
- introducing direct HRMS writes from normalizer.

Do not silently implement architecture changes.
