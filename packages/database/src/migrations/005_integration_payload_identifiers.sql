-- ============================================================================
-- Enterprise Attendance Platform - Migration 005
-- Optional per-integration payload identifiers.
--
-- Lets an integration (webhook subscription) optionally override the
-- organizationId it sends, alongside the existing tenant_id. Both are optional:
--   - set  -> injected into every delivered payload (organizationId / tenantId)
--   - blank -> organizationId falls back to the event's own org; tenantId omitted
-- The receiver mirrors exactly which identifiers arrive.
--
-- Applied once and tracked in _schema_migrations by the migrator.
-- ============================================================================

ALTER TABLE integrations
  ADD COLUMN payload_organization_id VARCHAR(255) NULL AFTER tenant_id;
