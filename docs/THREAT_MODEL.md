# Enterprise Attendance Integration Platform — Threat Model & Security Hardening

## Overview

This threat model outlines the attack surfaces, threat vectors, vulnerability evaluations, and implemented mitigations across the **Enterprise Attendance Integration Platform** according to **STRIDE** principles and enterprise security standards.

---

## 1. Threat Modeling Matrix

| Threat Vector                                | STRIDE Category                    | Impact   | Implemented Mitigation                                                                                                                                                     | Verification Status                                                             |
| :------------------------------------------- | :--------------------------------- | :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------ |
| **1. Stolen Device Credentials**             | Information Disclosure             | High     | Plaintext credentials are strictly forbidden. System uses `secret_reference` (e.g. `env:HIK_PASS` or Vault ARN). Passwords redacted from all logs.                         | **Enforced & Tested** (`DefaultSecretProvider`, `CredentialSanitizer`)          |
| **2. Compromised Hardware Terminal**         | Tampering / Elevation              | High     | Network segmentation on isolated Biometric VLAN. Terminals cannot query MySQL, Kafka, or HRMS directly. Terminals restricted strictly to their assigned `organization_id`. | **Enforced & Tested** (`RbacGuard.assertTenantAccess`)                          |
| **3. Forged Device Push Requests**           | Spoofing / Tampering               | High     | Push endpoints validate device authorization, device serial matching, and strict Zod runtime schemas before accepting raw payloads.                                        | **Enforced & Tested** (`RawAttendanceEventSchema`)                              |
| **4. Webhook Tampering & Man-in-the-Middle** | Tampering                          | High     | Outbound webhooks signed with cryptographic HMAC SHA-256 (`X-Attendance-Signature: sha256=...`). Transmitted over TLS 1.2+ HTTPS.                                          | **Enforced & Tested** (`WebhookVerifier`)                                       |
| **5. Biometric Replay Attacks**              | Spoofing / Repetition              | High     | Webhook timestamp drift validation ($\le 300\text{s}$) combined with deterministic SHA-256 event fingerprinting at the database unique constraint level.                   | **Enforced & Tested** (`generateEventFingerprint`, `uq_attendance_fingerprint`) |
| **6. Cross-Tenant Data Access**              | Information Disclosure / Tampering | Critical | Strict multi-tenant RBAC enforcement (`RbacGuard.assertTenantAccess`). Non-platform-admin requests are rejected with hard authorization exceptions.                        | **Enforced & Tested** (`security.spec.ts`)                                      |
| **7. SQL / API Injection**                   | Tampering / Info Disclosure        | Critical | Strict parameterized prepared statements across all MySQL interactions. Complete absence of dynamic SQL string interpolation.                                              | **Enforced & Tested** (`@attendance/database`)                                  |
| **8. Sensitive Credential Leakage in Logs**  | Information Disclosure             | High     | Recursive `CredentialSanitizer` redacting passwords, session tokens (`bs-session-id`), communication keys, and private keys.                                               | **Enforced & Tested** (`CredentialSanitizer`)                                   |
| **9. Administrative Privilege Abuse**        | Repudiation                        | High     | Immutable `audit_logs` capturing actor identity, action type, before/after diffs, and correlation IDs.                                                                     | **Enforced & Tested** (`audit_logs` schema & `ReplayService`)                   |
| **10. Brute-Force & Denial of Service**      | Denial of Service                  | Medium   | Distributed sliding-window rate limiting backed by Redis atomic token counters.                                                                                            | **Enforced & Tested** (`RateLimiter`)                                           |

---

## 2. Cryptographic Standards

### A. HMAC SHA-256 Webhook Signing

- **Algorithm**: `HMAC-SHA256(secret, timestamp + "." + payload)`
- **Header**: `X-Attendance-Signature: sha256=<hex_digest>`
- **Timing Defense**: `crypto.timingSafeEqual` prevents side-channel timing attacks.
- **Clock Skew Threshold**: $\pm 300$ seconds (5 minutes).

### B. Idempotency Fingerprint

- **Algorithm**: `SHA256(organizationId | employeeId | deviceId | punchTimeUtc | punchType)`
- **Database Barrier**: `UNIQUE KEY uq_attendance_fingerprint (event_fingerprint, event_date)`

---

## 3. Network Segmentation & Firewalling Guidance

```
+-------------------------------------------------------------+
|                      BIOMETRIC DEVICE VLAN                  |
|  [ZKTeco Terminals]   [Hikvision Terminals]   [Suprema]     |
+-------------------------------------------------------------+
                              |
               [FIREWALL: Port 80, 443, 4370 Only]
                              v
+-------------------------------------------------------------+
|                     COLLECTOR & INGESTION                   |
|       - Device Adapters (ISAPI, Standalone, BioStar 2)      |
|       - Push Listeners                                      |
+-------------------------------------------------------------+
                              |
                     [INTERNAL NETWORK]
                              v
+-------------------------------------------------------------+
|                   CORE DATA BACKBONE                        |
|  [MySQL 8.4 (Port 3307)]  [Kafka 9092]  [Redis 6379]        |
+-------------------------------------------------------------+
```
