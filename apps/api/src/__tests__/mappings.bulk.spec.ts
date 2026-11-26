import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Backend tests for bulk employee-mapping validation & import.
 * Mocks the @attendance/database repositories (no live DB) and drives the real
 * MappingsService bulk logic.
 */

const h = vi.hoisted(() => ({
  orgList: vi.fn(),
  deviceFindAll: vi.fn(),
  mappingFindAll: vi.fn(),
  mappingCreateOrUpdate: vi.fn(),
}));

vi.mock('@attendance/database', () => ({
  DatabaseClient: class {},
  DeviceEmployeeMappingRepository: class {
    findAll = h.mappingFindAll;
    createOrUpdate = h.mappingCreateOrUpdate;
  },
  DeviceRepository: class {
    findAll = h.deviceFindAll;
  },
  OrganizationRepository: class {
    list = h.orgList;
  },
}));

const { MappingsService } = await import('../modules/mappings/mappings.service.js');

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const makeService = () => new MappingsService({} as never, logger as never);

const ORGS = [
  { id: 1, code: 'ORG-TECHIVE', name: 'Techive' },
  { id: 5, code: 'ORG-REG', name: 'Region EMEA' },
];
const DEVICES = [
  { id: 57, organization_id: 1, device_code: 'DEV-HQ-ZK01', name: 'HQ Turnstile' },
  { id: 58, organization_id: 5, device_code: 'DEV-REG-01', name: 'Region Door' },
];
const EXISTING = [{ device_id: 57, vendor_user_id: '9999', external_employee_id: 'EMP-EXIST' }];

describe('MappingsService — bulk validate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.orgList.mockResolvedValue(ORGS);
    h.deviceFindAll.mockResolvedValue(DEVICES);
    h.mappingFindAll.mockResolvedValue(EXISTING);
    h.mappingCreateOrUpdate.mockResolvedValue(100);
  });

  it('accepts a valid row', async () => {
    const res = await makeService().validateBulk([
      { rowId: 'a', externalEmployeeId: 'EMP-1', vendorUserId: '1001', organizationId: 'ORG-TECHIVE', deviceId: 57 },
    ]);
    expect(res.summary).toMatchObject({ total: 1, valid: 1, errors: 0, warnings: 0, willCreate: 1 });
    expect(res.rows[0]?.level).toBe('valid');
    expect(res.rows[0]?.normalized.organizationId).toBe(1);
    expect(res.rows[0]?.normalized.deviceName).toBe('HQ Turnstile');
  });

  it('flags missing required fields as errors', async () => {
    const res = await makeService().validateBulk([{ rowId: 'b', organizationId: 'ORG-TECHIVE', deviceId: 57 }]);
    const fields = res.rows[0]?.issues.map((i) => i.field) ?? [];
    expect(res.rows[0]?.level).toBe('error');
    expect(fields).toContain('externalEmployeeId');
    expect(fields).toContain('vendorUserId');
  });

  it('rejects an unknown organization', async () => {
    const res = await makeService().validateBulk([
      { externalEmployeeId: 'EMP-2', vendorUserId: '1002', organizationId: 'ORG-NOPE', deviceId: 57 },
    ]);
    expect(res.rows[0]?.level).toBe('error');
    expect(res.rows[0]?.issues.some((i) => i.field === 'organizationId')).toBe(true);
  });

  it('rejects an unknown target terminal', async () => {
    const res = await makeService().validateBulk([
      { externalEmployeeId: 'EMP-3', vendorUserId: '1003', organizationId: 'ORG-TECHIVE', deviceId: 999 },
    ]);
    expect(res.rows[0]?.issues.some((i) => i.field === 'deviceId')).toBe(true);
  });

  it('detects duplicate vendor user id on the same terminal within the file', async () => {
    const res = await makeService().validateBulk([
      { rowId: '1', externalEmployeeId: 'EMP-A', vendorUserId: '1001', organizationId: 'ORG-TECHIVE', deviceId: 57 },
      { rowId: '2', externalEmployeeId: 'EMP-B', vendorUserId: '1001', organizationId: 'ORG-TECHIVE', deviceId: 57 },
    ]);
    expect(res.rows[0]?.level).toBe('valid');
    expect(res.rows[1]?.level).toBe('error');
    expect(res.rows[1]?.issues.some((i) => i.message.includes('row 1'))).toBe(true);
  });

  it('warns (not errors) when a mapping already exists in the system', async () => {
    const res = await makeService().validateBulk([
      { externalEmployeeId: 'EMP-NEW', vendorUserId: '9999', organizationId: 'ORG-TECHIVE', deviceId: 57 },
    ]);
    expect(res.rows[0]?.level).toBe('warning');
    expect(res.rows[0]?.willUpdate).toBe(true);
    expect(res.summary.willUpdate).toBe(1);
  });

  it('rejects an invalid status', async () => {
    const res = await makeService().validateBulk([
      { externalEmployeeId: 'EMP-5', vendorUserId: '1005', organizationId: 'ORG-TECHIVE', deviceId: 57, status: 'PENDING' },
    ]);
    expect(res.rows[0]?.issues.some((i) => i.field === 'status')).toBe(true);
  });

  it('applies global defaults for org and device', async () => {
    const res = await makeService().validateBulk(
      [{ externalEmployeeId: 'EMP-6', vendorUserId: '1006' }],
      { organizationId: 'ORG-REG', deviceId: 58, status: 'ACTIVE' },
    );
    expect(res.rows[0]?.level).toBe('valid');
    expect(res.rows[0]?.normalized.organizationId).toBe(5);
    expect(res.rows[0]?.normalized.deviceId).toBe(58);
  });

  it('resolves a device by code within the row organization', async () => {
    const res = await makeService().validateBulk([
      { externalEmployeeId: 'EMP-7', vendorUserId: '1007', organizationId: 'ORG-REG', deviceCode: 'DEV-REG-01' },
    ]);
    expect(res.rows[0]?.level).toBe('valid');
    expect(res.rows[0]?.normalized.deviceId).toBe(58);
  });
});

describe('MappingsService — bulk import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.orgList.mockResolvedValue(ORGS);
    h.deviceFindAll.mockResolvedValue(DEVICES);
    h.mappingFindAll.mockResolvedValue(EXISTING);
    h.mappingCreateOrUpdate.mockResolvedValue(100);
  });

  it('imports valid rows and skips error rows', async () => {
    const res = await makeService().importBulk([
      { rowId: 'ok', externalEmployeeId: 'EMP-1', vendorUserId: '1001', organizationId: 'ORG-TECHIVE', deviceId: 57 },
      { rowId: 'bad', vendorUserId: '1002', organizationId: 'ORG-TECHIVE', deviceId: 57 }, // missing employee id
    ]);
    expect(res.summary).toMatchObject({ total: 2, imported: 1, skipped: 1, failed: 0 });
    expect(h.mappingCreateOrUpdate).toHaveBeenCalledTimes(1);
    expect(h.mappingCreateOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 1, deviceId: 57, externalEmployeeId: 'EMP-1' }),
    );
    const ok = res.results.find((r) => r.rowId === 'ok');
    const bad = res.results.find((r) => r.rowId === 'bad');
    expect(ok?.status).toBe('imported');
    expect(bad?.status).toBe('skipped');
  });

  it('marks an existing mapping as updated, not imported', async () => {
    const res = await makeService().importBulk([
      { rowId: 'u', externalEmployeeId: 'EMP-EXIST', vendorUserId: '9999', organizationId: 'ORG-TECHIVE', deviceId: 57 },
    ]);
    expect(res.summary.updated).toBe(1);
    expect(res.results[0]?.status).toBe('updated');
  });

  it('reports a row as failed when the repository throws', async () => {
    h.mappingCreateOrUpdate.mockRejectedValueOnce(new Error('DB down'));
    const res = await makeService().importBulk([
      { rowId: 'f', externalEmployeeId: 'EMP-9', vendorUserId: '1009', organizationId: 'ORG-TECHIVE', deviceId: 57 },
    ]);
    expect(res.summary.failed).toBe(1);
    expect(res.results[0]?.status).toBe('failed');
    expect(res.results[0]?.message).toContain('DB down');
  });

  it('does not write anything for an all-invalid batch', async () => {
    const res = await makeService().importBulk([
      { rowId: 'x', organizationId: 'ORG-NOPE', deviceId: 999 },
    ]);
    expect(h.mappingCreateOrUpdate).not.toHaveBeenCalled();
    expect(res.summary.skipped).toBe(1);
  });
});
