-- ============================================================================
-- Enterprise Attendance Platform - Seed Data Migration (002)
-- Standard Device Types, Organizations, Test Devices, and Mappings
-- ============================================================================

-- Seed Device Types
INSERT INTO device_types (vendor, model, protocol, adapter_key, capabilities)
VALUES
  ('ZKTECO', 'SilkBio-101TC', 'STANDALONE_TCP', 'zkteco-standalone', JSON_OBJECT('push', true, 'pull', true, 'biometrics', JSON_ARRAY('FACE', 'FINGERPRINT', 'CARD', 'PIN'))),
  ('ZKTECO', 'ProFace-X', 'PUSH_HTTP', 'zkteco-push', JSON_OBJECT('push', true, 'pull', false, 'biometrics', JSON_ARRAY('FACE', 'PALM', 'CARD', 'PIN', 'QR'))),
  ('HIKVISION', 'DS-K1T671MF', 'ISAPI_HTTP', 'hikvision-isapi', JSON_OBJECT('push', true, 'pull', true, 'biometrics', JSON_ARRAY('FACE', 'CARD', 'PIN', 'QR'))),
  ('SUPREMA', 'BioStation 3', 'BIOSTAR2_API', 'suprema-biostar2', JSON_OBJECT('push', true, 'pull', true, 'biometrics', JSON_ARRAY('FACE', 'FINGERPRINT', 'CARD', 'PIN', 'QR')))
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP(6);

-- Seed Default Organization
INSERT INTO organizations (code, name, timezone, status)
VALUES
  ('ORG-TECHIVE', 'Techive Enterprise Solutions', 'Asia/Riyadh', 'ACTIVE')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP(6);

-- Seed Default Branch
INSERT INTO branches (organization_id, code, name, timezone)
SELECT id, 'BR-HQ-01', 'Riyadh HQ Campus', 'Asia/Riyadh'
FROM organizations
WHERE code = 'ORG-TECHIVE'
LIMIT 1
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP(6);

-- Seed Test Devices
INSERT INTO devices (organization_id, branch_id, device_type_id, device_code, serial_number, name, vendor, model, protocol, connection_mode, host, port, timezone, status)
SELECT 
  org.id,
  br.id,
  dt.id,
  'DEV-HQ-ZK01',
  'ZK-SN-99881122',
  'HQ Main Entrance Turnstile (ZKTeco)',
  'ZKTECO',
  'SilkBio-101TC',
  'STANDALONE_TCP',
  'PUSH',
  '192.168.10.101',
  4370,
  'Asia/Riyadh',
  'ONLINE'
FROM organizations org
JOIN branches br ON br.organization_id = org.id AND br.code = 'BR-HQ-01'
JOIN device_types dt ON dt.vendor = 'ZKTECO' AND dt.model = 'SilkBio-101TC'
WHERE org.code = 'ORG-TECHIVE'
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP(6);

INSERT INTO devices (organization_id, branch_id, device_type_id, device_code, serial_number, name, vendor, model, protocol, connection_mode, host, port, timezone, status)
SELECT 
  org.id,
  br.id,
  dt.id,
  'DEV-HQ-HIK01',
  'HIK-SN-55443322',
  'HQ Executive Wing (Hikvision)',
  'HIKVISION',
  'DS-K1T671MF',
  'ISAPI_HTTP',
  'PUSH',
  '192.168.10.102',
  80,
  'Asia/Riyadh',
  'ONLINE'
FROM organizations org
JOIN branches br ON br.organization_id = org.id AND br.code = 'BR-HQ-01'
JOIN device_types dt ON dt.vendor = 'HIKVISION' AND dt.model = 'DS-K1T671MF'
WHERE org.code = 'ORG-TECHIVE'
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP(6);

-- Seed Device Employee Mappings (External HRMS EMP-000457)
INSERT INTO device_employee_mappings (organization_id, device_id, external_employee_id, vendor_user_id, vendor_employee_code, status)
SELECT 
  d.organization_id,
  d.id,
  'EMP-000457',
  '457',
  '457',
  'ACTIVE'
FROM devices d
WHERE d.device_code = 'DEV-HQ-ZK01'
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP(6);

INSERT INTO device_employee_mappings (organization_id, device_id, external_employee_id, vendor_user_id, vendor_employee_code, status)
SELECT 
  d.organization_id,
  d.id,
  'EMP-000457',
  'EMP457',
  'EMP457',
  'ACTIVE'
FROM devices d
WHERE d.device_code = 'DEV-HQ-HIK01'
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP(6);

-- Seed API Client for M2M Integration
INSERT INTO api_clients (organization_id, client_id, client_name, client_secret_hash, roles, status)
SELECT
  org.id,
  'client_hrms_gateway',
  'HRMS Ingestion Service',
  'sha256_mock_secret_hash_for_testing',
  JSON_ARRAY('ATTENDANCE_INGEST', 'DEVICE_READ', 'MAPPING_WRITE'),
  'ACTIVE'
FROM organizations org
WHERE org.code = 'ORG-TECHIVE'
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP(6);
