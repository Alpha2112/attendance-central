# ADR 007: Zero-Plaintext Secret Provider & HMAC Webhook Signatures

## Status

Accepted

## Context

Device credentials, API client secrets, and downstream webhook authentication keys must be strictly protected against leaks in database dumps, audit snapshots, and log streams.

## Decision

1. Never store plaintext secrets. Store dynamic secret references formatted as `env:VAR_NAME` or `vault:PATH#KEY`.
2. Provide `@attendance/security` `DefaultSecretProvider` for runtime resolution.
3. Sign outbound webhooks using `HMAC-SHA256(secret, timestamp + "." + payload)` and validate timestamp skew ($\le 300\text{s}$) to defeat replay attacks.
4. Redact sensitive credentials recursively using `CredentialSanitizer`.

## Consequences

- **Positive**: Complete defense-in-depth; zero exposure in database backups, logs, or API responses; cryptographic proof of origin for outbound webhooks.
