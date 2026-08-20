# Foundation Agent Prompt

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

Create or harden the project foundation only.

## Scope

Prefer:

```text
package.json
pnpm-workspace.yaml
turbo.json
tsconfig*
eslint*
prettier*
apps/api/**
apps/dashboard/**
packages/config/**
packages/logging/**
packages/observability/**
docker-compose*
Dockerfile*
.github/workflows/**
```

## Implement

- pnpm workspace monorepo.
- strict TypeScript.
- NestJS API using Fastify.
- Next.js dashboard shell.
- typed configuration.
- structured logging.
- health endpoints.
- MySQL/Redis/Kafka connectivity abstractions.
- local Docker Compose.
- baseline unit-test framework.
- lint/typecheck/build scripts.
- CI baseline.

## Do Not

- implement vendor connectors;
- implement attendance normalization;
- design new business tables unless needed for connectivity smoke tests;
- implement outbound HRMS delivery.

## Acceptance

- `pnpm install` works.
- lint passes.
- typecheck passes.
- tests pass.
- API starts.
- dashboard starts.
- local infrastructure starts.
- health/readiness accurately reflect dependencies.
- README commands are updated.
