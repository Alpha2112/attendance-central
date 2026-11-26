-- 011: Manual vs automatic sync-source tracking on attendance_logs.
-- sync_mode distinguishes rows written by the automatic poller / realtime stream
-- (AUTOMATIC) from those committed through the manual terminal-sync workflow
-- (MANUAL). sync_job_id links a manually synced row to its sync_jobs audit record.
-- Existing rows default to AUTOMATIC (the only path that existed before), so this
-- is fully backward-compatible.
ALTER TABLE attendance_logs
  ADD COLUMN sync_mode VARCHAR(20) NOT NULL DEFAULT 'AUTOMATIC' AFTER source,
  ADD COLUMN sync_job_id BIGINT NULL AFTER sync_mode;
