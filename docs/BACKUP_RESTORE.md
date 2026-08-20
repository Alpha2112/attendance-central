# Enterprise Database Backup & Disaster Recovery Guide

## Overview

This guide details the procedures for backing up, restoring, and archiving the **MySQL 8.4 Range-Partitioned Attendance Database**, **Redis State Store**, and **Kafka Topics**.

---

## 1. MySQL 8.4 Partitioned Database Backup Strategy

### A. Daily Consistent Physical / Logical Backup

To create a transaction-safe, consistent dump without locking operational tables:

```bash
mysqldump \
  --host=127.0.0.1 \
  --port=3307 \
  --user=attendance_user \
  --password=attendance_pass \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --hex-blob \
  --databases attendance_db > backup_attendance_$(date +%Y%m%d_%H%M%S).sql
```

### B. Point-in-Time Recovery (PITR) with Binary Logs

Ensure binary logging is active in MySQL (`log_bin=ON`, `binlog_format=ROW`):

1. **Restore Full Baseline Snapshot**:
   ```bash
   mysql -h 127.0.0.1 -P 3307 -u root -p attendance_db < backup_attendance_baseline.sql
   ```
2. **Apply Binary Logs up to Target Timestamp**:
   ```bash
   mysqlbinlog \
     --start-datetime="2026-08-17 00:00:00" \
     --stop-datetime="2026-08-17 14:30:00" \
     /var/lib/mysql/binlog.000001 | mysql -h 127.0.0.1 -P 3307 -u root -p attendance_db
   ```

---

## 2. Monthly Partition Maintenance & Archival

The `attendance_logs` and `raw_punch_logs` tables are partitioned monthly by range on `event_date`:

### Adding Future Year Partitions

```sql
ALTER TABLE attendance_logs REORGANIZE PARTITION p_future INTO (
  PARTITION p202701 VALUES LESS THAN (202702),
  PARTITION p202702 VALUES LESS THAN (202703),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);
```

### Cold Storage Archival of Partitions (> 2 Years Old)

```sql
-- 1. Exchange partition with standalone archive table
ALTER TABLE attendance_logs EXCHANGE PARTITION p202401 WITH TABLE attendance_logs_archive_202401;

-- 2. Export archive table to S3 Parquet / compressed cold storage
-- 3. Drop emptied partition
ALTER TABLE attendance_logs DROP PARTITION p202401;
```

---

## 3. Disaster Recovery Drill Verification Checklist

- [ ] Daily MySQL snapshot verified in non-production staging environment.
- [ ] Database unique constraint `uq_attendance_fingerprint` tested for idempotency following restore.
- [ ] Kafka consumer group offset replay tested from `attendance.raw.v1` offset 0.
- [ ] Outbox pending records re-dispatched safely without duplicate HRMS deliveries.
