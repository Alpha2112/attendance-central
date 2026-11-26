-- ============================================================================
-- Enterprise Attendance Platform - Migration 009
-- Organization hierarchy (unlimited-depth parent/child tree).
--
-- Organizations become a self-referencing tree via `parent_id`:
--   - parent_id IS NULL  -> a root (top-level) organization
--   - parent_id = X       -> a child of organization X
-- Any depth is supported (root -> child -> grand-child -> ... -> leaf), so an
-- operator can model their real structure, e.g.
--   Holding Group (root)
--     └─ Region EMEA
--         └─ Country Office
--             └─ Branch / Site
--
-- Deleting a parent promotes its direct children to roots (ON DELETE SET NULL)
-- rather than cascading, so no sub-tree is ever silently destroyed. Cycle
-- prevention (an org cannot become its own ancestor) is enforced in the
-- application layer.
--
-- Applied once and tracked in _schema_migrations by the migrator.
-- ============================================================================

ALTER TABLE organizations
  ADD COLUMN parent_id BIGINT NULL AFTER tenant_id,
  ADD INDEX idx_org_parent (parent_id),
  ADD CONSTRAINT fk_org_parent
    FOREIGN KEY (parent_id) REFERENCES organizations (id) ON DELETE SET NULL;
