# Enterprise Attendance Platform — SRE & Operations Runbook

## Overview

This runbook guides Site Reliability Engineers (SRE) and operations teams in maintaining, diagnosing, and operating the **Enterprise Attendance Integration Platform** in production.

---

## 1. Service Level Objectives (SLOs)

| Metric                                      | Target                                             | Error Budget Window |
| :------------------------------------------ | :------------------------------------------------- | :------------------ |
| **API Gateway Availability**                | $\ge 99.95\%$ uptime                               | 21.6 mins / 30 days |
| **Biometric Punch Ingestion Latency (p95)** | $\le 100\text{ ms}$ (Terminal $\to$ Kafka)         | 30 days rolling     |
| **Normalization End-to-End Latency (p99)**  | $\le 500\text{ ms}$ (Raw $\to$ MySQL $\to$ Outbox) | 30 days rolling     |
| **Outbound Webhook Delivery Success**       | $\ge 99.9\%$ (within retry budget)                 | 30 days rolling     |
| **Idempotency Guarantee**                   | $100\%$ zero duplicate records                     | Strict              |

---

## 2. Health Probes & Graceful Draining

### A. Liveness vs Readiness Semantics

- **Liveness Probe (`/api/v1/health/liveness`)**: Evaluates basic process memory and event loop responsiveness. Does **NOT** fail when an external physical terminal is unreachable.
- **Readiness Probe (`/api/v1/health/readiness`)**: Verifies connectivity to MySQL, Kafka, and Redis clusters.

### B. Graceful Shutdown & Draining Workflow

When Kubernetes or Docker sends a `SIGTERM` signal:

1. Pod transitions to `Terminating` and stops receiving new ingress traffic.
2. In-flight database transactions are committed.
3. Kafka consumer commits the latest processed offset and closes consumer groups.
4. Outbox batch dispatcher finishes active HTTP dispatches before closing sockets.
5. Process exits cleanly within `terminationGracePeriodSeconds` (30s).

---

## 3. Incident Response Playbooks

### Playbook A: High Kafka Consumer Lag Alert (`HighKafkaConsumerLag`)

1. **Identify Lagging Topic**:
   ```bash
   pnpm run kafka:status
   ```
2. **Inspect Consumer Group Lag**:
   Check consumer group `attendance-normalizer-group` lag in Kafka UI (`http://localhost:8080`).
3. **Remediation**:
   - Check if database write latency is elevated (`attendance_logs` lock contention).
   - Scale normalizer replicas in Kubernetes up to match the partition count:
     ```bash
     kubectl scale deployment attendance-integration -n attendance-platform --replicas=6
     ```

---

### Playbook B: Outbound Webhook Delivery Failure Spike (`OutboxDeliveryFailureSpike`)

1. **Identify Failing Integration Destination**:
   Query `delivery_attempts` for HTTP 5xx errors or connection timeouts:
   ```sql
   SELECT integration_id, http_status_code, COUNT(*)
   FROM delivery_attempts
   WHERE created_at >= NOW() - INTERVAL 15 MINUTE AND status = 'RETRYABLE'
   GROUP BY integration_id, http_status_code;
   ```
2. **Inspect Outbox Backlog**:
   ```sql
   SELECT status, COUNT(*) FROM outbox_events GROUP BY status;
   ```
3. **Remediation**:
   - The platform automatically isolates the failing integration and schedules retries with exponential backoff and jitter. Unrelated integrations continue unimpeded.
   - If the downstream HRMS has recovered, trigger batch outbox dispatch:
     ```bash
     pnpm run outbox:process-once
     ```

---

### Playbook C: Hardware RTC Clock Drift Warning (`HardwareClockDriftCritical`)

1. **Identify Drifting Terminal**:
   Query device clock status from Prometheus alert annotation.
2. **Synchronize Device RTC Clock**:
   Trigger clock sync command via API Gateway or Collector CLI:
   ```bash
   curl -X POST http://localhost:4000/api/v1/devices/{deviceId}/sync-clock -H "Authorization: Bearer $TOKEN"
   ```
