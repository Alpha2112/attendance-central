-- ============================================================================
-- Enterprise Attendance Platform - Migration 006
-- Tenants registry + webhook tenant payload identifier.
--
-- Introduces Tenants as first-class records. An Organization belongs to a
-- Tenant (organizations.tenant_id -> tenants.id), so one Tenant owns many
-- Organizations. The webhook form selects a Tenant, then an Organization scoped
-- to it, and sends their CODE strings in the delivered payload (organizationId /
-- tenantId) for the receiver to match on.
--
-- Applied once and tracked in _schema_migrations by the migrator.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenants (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_tenant_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The tenant code string injected into each delivered payload as `tenantId`
-- (mirrors payload_organization_id). Blank = no tenantId sent.
ALTER TABLE integrations
  ADD COLUMN payload_tenant_id VARCHAR(255) NULL AFTER payload_organization_id;
