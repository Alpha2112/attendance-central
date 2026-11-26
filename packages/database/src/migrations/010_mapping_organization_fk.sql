-- ============================================================================
-- Enterprise Attendance Platform - Migration 010
-- Referential integrity for employee ↔ organization (and tenant) mappings.
--
-- device_employee_mappings.organization_id was NOT NULL but had no foreign key,
-- so the column could hold an id that points at no real organization. The
-- application layer already validates the organization on create/update; this
-- migration enforces the same rule at the database level so nothing — a manual
-- SQL write, a bug, or a future code path — can bind a mapping to a
-- non-existent organization.
--
--   - organization_id -> organizations(id): ON DELETE RESTRICT. The column is
--     NOT NULL, so it cannot be nulled out; RESTRICT instead refuses to delete
--     an organization while employee mappings still reference it (reassign or
--     remove the mappings first). ON UPDATE CASCADE keeps ids in sync.
--   - tenant_id -> tenants(id): ON DELETE SET NULL. The column is nullable, so a
--     deleted tenant simply detaches its mappings rather than blocking.
--
-- Pre-checked: no existing rows violate either constraint, so the ALTER applies
-- cleanly. Applied once and tracked in _schema_migrations by the migrator.
-- ============================================================================

ALTER TABLE device_employee_mappings
  ADD CONSTRAINT fk_mapping_organization
    FOREIGN KEY (organization_id) REFERENCES organizations (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_mapping_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
