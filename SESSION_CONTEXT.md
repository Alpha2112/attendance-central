# SESSION_CONTEXT — Real-time Webhook Integration

> Resume notes for continuing the attendance webhook integration across two projects.
> Written 2026-10-28. The **sender** side (this repo) is built and verified.
> **Update 2026-10-28 (session 2):** the **receiver** side (Existing Attendance
> System) is now implemented, tested, and verified against real sender-signed
> deliveries. See §6 for the receiver implementation.

## Project roles

| Project | Role |
|---|---|
| **Logs Data Collector** (this repo) | **Sender.** Captures device punches, and on each new punch delivers a signed webhook to each company's endpoint in real time. Already implemented and verified. |
| **Existing Attendance System** | **Receiver.** Must expose an HTTP endpoint, verify the signature, and idempotently process + store attendance records. **Not open in this session — inspect it next session.** |

Flow: `device punch → attendance_logs + outbox_events (same DB txn) → OutboxDispatcher (poll ~2s) → signed HTTP POST → Existing Attendance System`.

---

## 1. Webhook configuration (sender side — done)

- **Event type delivered:** `attendance.normalized.v1`
- **HTTP method:** `POST`, body = compact JSON (no pretty-printing)
- **Endpoint URL:** per subscription, configured in the dashboard (per company). Each webhook is scoped to one `organization_id`; a company only receives its own punches.
- **Delivery semantics:** transactional outbox, **at-least-once**. Retries use exponential backoff + jitter up to `retry_limit` (default 5), then the event is marked `FAILED` and sent to the DLQ. A slow/failing endpoint never blocks ingestion.
- **Optional routing filters** per subscription (`integration_subscriptions.filter_rules`): `branchId`, `deviceCode`, `punchType` — omit to deliver everything for that company.
- **Signing modes (choose per webhook):**
  - `HMAC_SHA256` (default) — shared secret; receiver holds the same secret.
  - `ED25519` — sender signs with a private key; receiver verifies with a **public key** (safe to share; sender never exposes the private key).

### Request headers sent

| Header | Meaning |
|---|---|
| `Content-Type` | `application/json` |
| `X-Attendance-Event-Id` | Stable unique id for the event — **use this for idempotency/dedupe** |
| `X-Attendance-Timestamp` | Unix ms; part of the signed content (use for replay protection) |
| `X-Attendance-Signature` | `sha256=<hex>` (HMAC) **or** `ed25519=<base64>` (Ed25519) |
| `X-Attendance-Signature-Algorithm` | `HMAC_SHA256` or `ED25519` |
| `X-Attendance-Attempt` | Delivery attempt number (1, 2, …) |
| `User-Agent` | `Enterprise-Attendance-Integration-Platform/1.0` |

---

## 2. Event payload structure

Compact JSON. Representative body (field values illustrative):

```json
{
  "eventId": "8ba87180-1730-4085-b9ca-ffa8ba8ca3ca",
  "schemaVersion": 1,
  "organizationId": "ORG-TECHIVE",
  "branchId": 5,
  "employeeId": "EMP-0001",
  "deviceId": "SUP-GSDK-01",
  "vendor": "SUPREMA",
  "punchType": "IN",
  "verificationType": "FACE",
  "punchTime": "2026-10-28T14:33:19.155Z",
  "punchTimeUtc": "2026-10-28T14:33:19.155Z",
  "receivedAt": "2026-10-28T14:33:19.155Z",
  "source": "REALTIME",
  "eventFingerprint": "e58ee8f27164cd617e01aa73a9fb3ec94cc7eeb8aa6b08e6bf6866a7a71f7c05",
  "metadata": { "realtime": true }
}
```

Notes:
- `employeeId` = the external employee identifier (HRMS id, or a fallback `EMP-<vendorUserId>` if no mapping). `deviceId` = the device **code** (not numeric id). `branchId` may be `null`.
- `punchType`: `IN` | `OUT` | `BREAK_IN` | `BREAK_OUT` | `UNKNOWN`. `verificationType`: `FACE` | `FINGERPRINT` | `CARD` | ...
- `source`: `REALTIME` (Suprema), `PUSH`/`PULL` (Hikvision).
- `eventFingerprint` is a deterministic SHA-256 — a secondary natural dedupe key.

---

## 3. Signature verification requirements (receiver side — to implement)

Signed content is always: **`` `${X-Attendance-Timestamp}.${rawRequestBody}` ``** — compute over the **raw body bytes**, before JSON parsing/re-serialization.

**HMAC-SHA256** (`X-Attendance-Signature-Algorithm: HMAC_SHA256`):
```js
const signed = `${req.headers['x-attendance-timestamp']}.${rawBody}`;
const expected = 'sha256=' + crypto.createHmac('sha256', SIGNING_KEY).update(signed).digest('hex');
const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers['x-attendance-signature']));
```

**Ed25519** (`X-Attendance-Signature-Algorithm: ED25519`):
```js
const signed = `${req.headers['x-attendance-timestamp']}.${rawBody}`;
const sig = Buffer.from(req.headers['x-attendance-signature'].replace('ed25519=', ''), 'base64');
const ok = crypto.verify(null, Buffer.from(signed), PUBLIC_KEY_PEM, sig);
```

Also required on the receiver:
- **Replay protection:** reject if `X-Attendance-Timestamp` is outside an acceptable window (e.g. ±5 min).
- **Idempotency:** dedupe on `X-Attendance-Event-Id` (at-least-once delivery means retries/duplicates are expected). `eventFingerprint` is a backup key.
- **Response contract:** return **2xx** on success. Any non-2xx (or timeout) is treated as a failed delivery and **retried** (5xx/429/timeouts retried; other 4xx are permanent → no retry).

**Key provisioning (do NOT store the actual secret in this file):**
- Per-integration keys are **derived from a master key**, never stored. HMAC secret = `HMAC-SHA256(master, "webhook:integration:<id>")`; Ed25519 keypair seeded from `HMAC-SHA256(master, "webhook:ed25519:<id>")`.
- Master key env var: **`WEBHOOK_SIGNING_MASTER_KEY`** (set in this repo's `.env`; has an insecure dev default — set a real one for prod).
- The **HMAC signing key** (HMAC mode) or the **Ed25519 public key** (Ed25519 mode) is shown in the dashboard **Details** modal for each webhook — copy it from there into the receiver's config. **Prefer Ed25519 for the external receiver** (it cannot forge events).

---

## 4. Remaining integration tasks

### Receiver implementation (Existing Attendance System) — DONE (session 2)
- [x] Inspected the Existing Attendance System (Laravel 13 modular monolith, Inertia/React, database-per-tenant, control + tenant connections).
- [x] Added an HTTP `POST` endpoint reading the **raw body** on the stateless `api` middleware group (no CSRF/session).
- [x] Signature verification for **both** HMAC-SHA256 and Ed25519, plus ±tolerance replay check.
- [x] Idempotent persistence keyed on `X-Attendance-Event-Id`; same-key+same-body returns `duplicate` (200), same-key+different-body is a `payload_conflict` (409). `eventFingerprint` stored as a secondary key.
- [x] Maps `organizationId` → tenant (control-plane registry) and `employeeId` → `employees.employee_code` (unmapped punches are still recorded).
- [x] Returns 2xx on success/duplicate; 4xx permanent rejections; 5xx (retryable) on unexpected failure.
- [x] Supports both signing modes; prefer Ed25519 (receiver holds only the public key).
- [x] Verified end-to-end against deliveries signed by this repo's real `WebhookSigner` (HMAC + Ed25519).

### Sender configuration (this repo — mostly done)
- [ ] Register the receiver's real endpoint URL as an integration (dashboard → **Register Subscription**, choose signing mode, set filters).
- [ ] Set a production `WEBHOOK_SIGNING_MASTER_KEY` in `.env`.
- [ ] End-to-end test: trigger a real punch (or **Test Dispatch**) and confirm the receiver verifies + stores it.

---

## 5. Where things live (this repo) + how to run

**Code**
- Signer: `packages/integration/src/webhook/webhook-signer.ts`
- Dispatcher: `packages/integration/src/outbox/outbox.dispatcher.ts`, `packages/integration/src/webhook/webhook.dispatcher.ts`
- Dispatcher runner (starts in API): `apps/api/src/modules/integrations/webhook-dispatcher.runner.ts`
- Punch → outbox enqueue: `apps/api/src/modules/punches/punches.service.ts`
- Integrations API: `apps/api/src/modules/integrations/` (service, controller, dto)
- Dashboard UI: `apps/dashboard/src/app/integrations/page.tsx`
- Migration: `packages/database/src/migrations/004_webhook_dispatch.sql` (adds `outbox_events.organization_id`)
- Decision record: `docs/adr/009-realtime-webhook-dispatcher.md`

**API endpoints** (base `http://localhost:4000`)
- `GET /api/v1/integrations` · `GET /api/v1/integrations/stats` · `GET /api/v1/integrations/:id` (detail incl. signing material)
- `POST /api/v1/integrations` (register) · `PUT /api/v1/integrations/:id` (update) · `DELETE /api/v1/integrations/:id`
- `POST /api/v1/integrations/:id/test` (signed test dispatch)
- Dashboard: `http://localhost:3001/integrations`

**Run**
- Infra + monitoring: `pnpm docker:up` · everything incl. Suprema gateway: `pnpm docker:up:all`
- API: `pnpm dev:api` (dispatcher starts automatically on boot) · Dashboard: `pnpm dev:dashboard`
- DB migrations: `pnpm migrate:up` (004 already applied)

**Verified this session:** real HTTP delivery with HMAC **and** Ed25519 signatures both verifying; per-company + branch/device/punch-type filtering; outbox → `PUBLISHED`; `delivery_attempts` recorded; 15/15 integration tests pass; API + dashboard build/typecheck/lint clean.

---

## 6. Receiver implementation (Existing Attendance System)

Repo: `../attendance system` (Laravel 13, PHP 8.3, modular monolith, database-per-tenant).

**Endpoint**
- `POST /api/v1/integrations/attendance/webhook` — raw-body ingestion on the stateless `api` middleware group (route name `api.integrations.attendance.webhook`).

**Module** `app/Modules/AttendanceCapture/`
- `Presentation/Http/Controllers/WebhookReceiverController.php` — reads raw body + headers, maps results/exceptions to HTTP status.
- `Application/Actions/IngestAttendanceWebhook.php` — the single capture Action: header/JSON validation → org lookup → replay check → signature verify → tenant bind → idempotent persist.
- `Application/Exceptions/WebhookRejectedException.php` — carries the HTTP status (4xx permanent / 5xx retryable).
- `Domain/Services/WebhookSignatureVerifier.php` — HMAC-SHA256 (`sha256=<hex>`) and Ed25519 (`ed25519=<base64>`; accepts PEM or raw-base64 public key).
- `Infrastructure/Database/Models/WebhookIntegration.php` — **control-plane** registry row (see below).
- `Infrastructure/Database/Models/AttendanceEvent.php` — **tenant-plane** append-only ledger.
- `Infrastructure/Tenancy/WebhookTenantBinder.php` — binds the tenant connection from `organization_id` → tenant (skips rebind under SQLite dev/test).

**Operator UI (Inertia/React, left sidebar)**
- `resources/js/modules/attendance-capture/pages/WebhookIntegrations.tsx` — "Webhook Integrations": register/edit/remove trusted senders (paste HMAC secret or Ed25519 public key, map organizationId → tenant, choose replay window, enable/disable). Shows the receiver endpoint URL with a copy button. Controller: `WebhookIntegrationController` (routes `tenant.integrations.{index,store,update,destroy}` under `/tenant/integrations`). Stored key material is never sent back to the browser.
- `resources/js/modules/attendance-capture/pages/AttendanceLog.tsx` — "Attendance Capture": read-only ledger of received punches with a detail drawer. Controller: `AttendanceEventController` (`tenant.attendance.events.index`).

**Migrations**
- Control: `database/migrations/control/2026_01_01_000008_create_control_webhook_integrations_table.php`
- Tenant: `database/migrations/tenant/2026_01_01_000030_create_attendance_events_table.php`

**Dependency note:** `openssl_verify` can't do Ed25519 and `ext-sodium` is off in this environment, so `paragonie/sodium_compat` was added (pure-PHP fallback for `sodium_crypto_sign_verify_detached`). Production servers with `ext-sodium` use the native implementation automatically.

**Register a sender (control plane) — one row per sender `organizationId`:**
```sql
INSERT INTO webhook_integrations
  (id, tenant_id, organization_id, name, signature_algorithm,
   ed25519_public_key, replay_tolerance_seconds, is_active, created_at, updated_at)
VALUES
  (<uuid>, '<tenant uuid>', 'ORG-TECHIVE', 'Logs Data Collector', 'ED25519',
   '<Ed25519 public key from sender dashboard Details>', 300, 1, NOW(), NOW());
-- For HMAC mode: signature_algorithm='HMAC_SHA256', set hmac_secret=<hex> instead.
```

**Tests:** `tests/Feature/AttendanceWebhookTest.php` — 10 tests (HMAC + Ed25519 accept, idempotent duplicate, payload conflict, bad signature, stale timestamp, unknown/inactive org, unmapped employee, malformed JSON). Full receiver suite: 44/44 pass, Pint clean. Cross-project contract verified by signing with this repo's real `WebhookSigner` and verifying with the receiver's `WebhookSignatureVerifier`.
