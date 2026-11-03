-- ============================================================================
-- Enterprise Attendance Platform - Migration 004
-- Real-time outbound webhook dispatch.
--
-- Adds an organization scope to the transactional outbox so the dispatcher can
-- route each punch event only to that company's registered webhook endpoints
-- (per-company / per-branch / per-device delivery). Branch/device/punch-type
-- filtering reuses the existing integration_subscriptions.filter_rules JSON, so
-- no further schema change is required.
--
-- Applied once and tracked in _schema_migrations by the migrator.
-- ============================================================================

ALTER TABLE outbox_events
  ADD COLUMN organization_id BIGINT NULL AFTER aggregate_id,
  ADD INDEX idx_outbox_org_status (organization_id, status, available_at);
