-- ============================================================================
-- Enterprise Attendance Platform - Migration 003
-- Retarget the Suprema device type from the BioStar 2 REST integration to the
-- Suprema G-SDK (Device Gateway) integration.
--
-- Deterministic & idempotent: safe to run multiple times. Existing Suprema device
-- rows keep resolving because the collector still registers the SUPREMA /
-- SUPREMA:BIOSTAR2 adapter keys alongside SUPREMA:GSDK.
-- ============================================================================

UPDATE device_types
SET protocol = 'GSDK',
    adapter_key = 'suprema-gsdk',
    updated_at = CURRENT_TIMESTAMP(6)
WHERE vendor = 'SUPREMA'
  AND model = 'BioStation 3'
  AND adapter_key = 'suprema-biostar2';
