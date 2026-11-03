# ADR 009 — Real-time Outbound Webhook Dispatcher

## Status

Accepted

## Context

[ADR 005](005-transactional-outbox.md) established the transactional outbox, and
`packages/integration` already contains a `WebhookDispatcher` (HMAC signing, retry
with exponential backoff + jitter, delivery recording, DLQ on exhaustion) and an
`OutboxDispatcher` (poll `outbox_events` → fan out to subscribers). Two gaps
remained before punches could reach external company systems in real time:

1. **Nothing enqueued live punches** into `outbox_events`. The API's
   `PunchesService` persisted punches and published to Kafka, but never wrote the
   outbox row, so the dispatcher had nothing to send.
2. **Nothing ran the dispatcher** inside the deployed API process.

Three capabilities were also requested: per-company endpoints, per-branch/device
filtering, and an asymmetric (public/private key) signing option in addition to
the shared-secret HMAC.

## Decision

- **Enqueue on persist.** When a *new* normalized punch is committed
  (`insertIdempotent` reports `inserted`), the API writes an `outbox_events` row in
  the **same MySQL transaction** (`runInTransaction`). `event_id` is the punch
  fingerprint, giving database-level idempotency (`INSERT ... ` on the unique
  `event_id`). Duplicate punches never enqueue twice.
- **Co-located dispatcher.** The API process starts the existing `OutboxDispatcher`
  on boot (poll loop), so dispatch runs beside ingestion — no separate worker to
  deploy, matching the collector co-location decision.
- **Per-company routing.** `outbox_events` gains `organization_id`
  ([migration 004](../../packages/database/src/migrations/004_webhook_dispatch.sql)).
  The dispatcher only matches integrations belonging to that organization.
- **Per-branch/device/type filtering.** Reuses the existing
  `integration_subscriptions.filter_rules` JSON (`branchId`, `deviceCode`,
  `punchType`); a subscription whose rules don't match the event is skipped.
- **Two signing modes, both derived — nothing stored.** A shared `WebhookSigner`
  derives per-integration key material from a single master key
  (`WEBHOOK_SIGNING_MASTER_KEY`):
  - `HMAC_SHA256` (default): `X-Attendance-Signature: sha256=<hmac>` over
    `${timestamp}.${body}`, key = `HMAC(master, "webhook:integration:<id>")`.
  - `ED25519`: deterministic keypair seeded from
    `HMAC(master, "webhook:ed25519:<id>")`; `X-Attendance-Signature: ed25519=<base64>`.
    Only the **public key** is exposed (detail view); the private key is never
    stored and never shown.
  The same `WebhookSigner` powers both the live dispatcher and the dashboard
  detail/test views, so the key shown to operators is exactly the key that signs
  real deliveries.

## Reasons

- Honors ADR 005 and ADR 007 (zero plaintext secrets): no signing secret or private
  key is persisted; everything is recomputable from the master key.
- Reuses existing dispatcher/signing machinery (AGENTS.md §3) instead of adding a
  parallel implementation.
- One failing company endpoint cannot block ingestion or other tenants (AGENTS.md
  §4): delivery is decoupled, retried independently, and DLQ'd on exhaustion.

## Consequences

- The master key must be set and rotated operationally; rotating it rotates every
  integration's derived key, so receivers must be re-provisioned on rotation.
- The dispatcher poll loop and outbox backlog require monitoring.
- At-least-once delivery means receivers must dedupe on `X-Attendance-Event-Id`.
- The raw audit log row (`raw_punch_logs`) is written before the transaction; an
  orphan raw row is possible if the transaction rolls back, which is harmless
  (append-only audit; attendance + outbox remain atomic together).
