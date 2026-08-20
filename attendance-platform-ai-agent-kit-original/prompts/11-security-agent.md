# Security Agent Prompt


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

Threat-model and harden the platform without changing core functional scope.

## Read

- `docs/SECURITY.md`
- architecture and ADRs

## Implement / Review

- OIDC admin authentication integration boundary.
- machine authentication.
- backend RBAC.
- rate limiting.
- CORS/security headers.
- secret-provider abstraction.
- log redaction.
- audit trail.
- webhook HMAC verification/signing utilities.
- replay protection.
- input-validation review.
- dependency/secret scanning in CI.
- least-privilege guidance.
- network segmentation deployment guidance.

## Threat Model

Cover:
- stolen device credential;
- compromised device;
- forged push request;
- webhook tampering;
- replay attack;
- cross-organization data access;
- SQL/API injection;
- leaked logs;
- admin privilege abuse;
- supply-chain compromise.

## Acceptance

- no plaintext secrets in DB/schema/examples.
- authorization tests prove cross-org denial.
- redaction tests exist.
- webhook signature tests exist.
- threat model and remediation list documented.
