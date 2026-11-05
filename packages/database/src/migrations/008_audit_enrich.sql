-- 008_audit_enrich.sql
-- Enrich the existing audit_logs table for the System Logs module. Purely
-- additive (new nullable columns + indexes) — no existing column is changed,
-- so all current functionality is preserved.

ALTER TABLE audit_logs
  ADD COLUMN actor_name VARCHAR(255) NULL AFTER actor_id,
  ADD COLUMN actor_role VARCHAR(100) NULL AFTER actor_name,
  ADD COLUMN module VARCHAR(100) NULL AFTER action,
  ADD COLUMN description VARCHAR(1000) NULL AFTER module,
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' AFTER description;

-- Indexes to keep filtered / paginated reads efficient.
ALTER TABLE audit_logs
  ADD INDEX idx_audit_action (action),
  ADD INDEX idx_audit_actor (actor_id),
  ADD INDEX idx_audit_status (status),
  ADD INDEX idx_audit_created (created_at);
