# ADR 001 — Node.js + TypeScript

## Status
Accepted

## Context
The platform is integration-heavy and dominated by:
- HTTP;
- TCP;
- WebSockets;
- Kafka;
- Redis;
- database IO;
- timers and scheduled polling.

## Decision
Use Node.js LTS and TypeScript as the primary runtime/language.

Use:
- NestJS for backend applications;
- Fastify as HTTP adapter;
- Next.js/React/TypeScript for dashboard.

## Reasons
- Strong asynchronous IO model.
- One language across backend and frontend.
- Good fit for long-running integration workers.
- Strong type safety with TypeScript.
- Mature Kafka/Redis/MySQL/HTTP/WebSocket ecosystem.
- Easier shared event-contract packages.

## Alternatives
### Python
Viable and strong for async integration, but introduces a second primary language if dashboard remains TypeScript.

### Java/.NET
Excellent enterprise choices, but not selected for this implementation because the team wants Node.js/Python and the workload does not require switching ecosystems.

## Consequences
- Vendor SDKs that cannot be accessed reliably from Node must be isolated behind a bridge process.
- CPU-heavy workloads should not block Node's event loop.
- Strict TypeScript is mandatory.
