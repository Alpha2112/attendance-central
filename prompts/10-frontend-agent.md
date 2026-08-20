# Frontend / Dashboard Agent Prompt

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

Build the enterprise operations dashboard using existing backend APIs/contracts.

## Stack

- Next.js
- React
- TypeScript
- Tailwind
- shadcn/ui
- Recharts or ECharts

## Pages

- Dashboard
- Devices
- Device Detail
- Live Attendance
- Punch Logs
- Employee Mappings
- Synchronization
- Integrations
- Integration Detail
- Alerts
- Audit Logs
- Settings

## Dashboard Metrics

Display:

- total devices;
- online/offline/degraded;
- punches today;
- punches last hour;
- failed syncs;
- failed deliveries;
- normalization errors;
- device health by vendor;
- punch volume chart;
- recent alerts.

## UX Requirements

- desktop-first enterprise control center;
- responsive;
- keyboard accessible;
- color is not the only status cue;
- strong filters;
- loading/empty/error states;
- cursor pagination;
- realtime live feed via SSE/WebSocket abstraction.

## Rules

- never connect directly to MySQL/Kafka from browser.
- backend performs authorization.
- do not duplicate attendance business logic in UI.

## Acceptance

- main operational flows are navigable.
- device status and live attendance are visible.
- errors are actionable.
- WCAG-friendly semantics/focus states.
- frontend tests cover critical flows.
