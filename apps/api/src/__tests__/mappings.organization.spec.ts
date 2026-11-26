import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';

/**
 * Backend test: mapping an employee to an organization.
 *
 * Exercises the real MappingsService organization-resolution logic with the
 * @attendance/database repositories mocked (no live DB), proving that a mapping
 * is bound to the correct organization whether the caller supplies a numeric
 * id, a numeric string, or an organization CODE — and that an unknown
 * organization is rejected and an edit re-binds the organization.
 */

// Hoisted mock fns shared between the mocked repository classes and the tests.
const h = vi.hoisted(() => ({
  orgFindById: vi.fn(),
  orgFindByCode: vi.fn(),
  deviceFindByOrgAndCode: vi.fn(),
  deviceListByOrg: vi.fn(),
  mappingCreateOrUpdate: vi.fn(),
  mappingUpdate: vi.fn(),
  mappingFindById: vi.fn(),
}));

vi.mock('@attendance/database', () => ({
  DatabaseClient: class {},
  DeviceEmployeeMappingRepository: class {
    createOrUpdate = h.mappingCreateOrUpdate;
    update = h.mappingUpdate;
    findById = h.mappingFindById;
  },
  DeviceRepository: class {
    findByOrgAndCode = h.deviceFindByOrgAndCode;
    listByOrg = h.deviceListByOrg;
  },
  OrganizationRepository: class {
    findById = h.orgFindById;
    findByCode = h.orgFindByCode;
  },
}));

// Imported after the mock is registered.
const { MappingsService } = await import('../modules/mappings/mappings.service.js');

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

function makeService() {
  // DatabaseClient + logger are not used directly (repos are mocked), so any
  // object satisfies the manual construction that bypasses Nest DI.
  return new MappingsService({} as never, logger as never);
}

function mappingRow(organizationId: number) {
  return {
    id: 10,
    tenant_id: null,
    organization_id: organizationId,
    device_id: 57,
    external_employee_id: 'EMP-1001',
    vendor_user_id: '1001',
    vendor_employee_code: '1001',
    status: 'ACTIVE',
    metadata: { employeeName: 'Sarah Jenkins', department: 'Region EMEA' },
    created_at: new Date(),
    updated_at: new Date(),
    device_code: 'DEV-HQ-ZK01',
    device_name: 'HQ Main Entrance Turnstile',
    vendor: 'ZKTECO',
  };
}

describe('MappingsService — employee ↔ organization binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.mappingCreateOrUpdate.mockResolvedValue(10);
    h.mappingUpdate.mockResolvedValue(undefined);
    h.mappingFindById.mockResolvedValue(mappingRow(1));
  });

  it('binds the mapping to an organization given by numeric id', async () => {
    h.orgFindById.mockResolvedValue({ id: 5, code: 'ORG-REG', name: 'Region EMEA' });
    h.mappingFindById.mockResolvedValue(mappingRow(5));

    const svc = makeService();
    const result = await svc.create({
      externalEmployeeId: 'EMP-1001',
      employeeName: 'Sarah Jenkins',
      department: 'Region EMEA',
      deviceId: 57,
      vendorUserId: '1001',
      organizationId: 5,
      status: 'ACTIVE',
    });

    expect(h.orgFindById).toHaveBeenCalledWith(5);
    expect(h.orgFindByCode).not.toHaveBeenCalled();
    expect(h.mappingCreateOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 5, deviceId: 57, externalEmployeeId: 'EMP-1001' }),
    );
    expect(result.organization_id).toBe(5);
  });

  it('resolves an organization CODE to its id', async () => {
    h.orgFindByCode.mockResolvedValue({ id: 7, code: 'ORG-TECHIVE', name: 'Techive' });
    h.mappingFindById.mockResolvedValue(mappingRow(7));

    const svc = makeService();
    await svc.create({
      externalEmployeeId: 'EMP-1002',
      deviceId: 57,
      vendorUserId: '1002',
      organizationId: 'ORG-TECHIVE',
    });

    expect(h.orgFindByCode).toHaveBeenCalledWith('ORG-TECHIVE');
    expect(h.mappingCreateOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 7 }),
    );
  });

  it('treats a numeric string as an id (not a code)', async () => {
    h.orgFindById.mockResolvedValue({ id: 9, code: 'ORG-9', name: 'Branch' });
    const svc = makeService();
    await svc.create({
      externalEmployeeId: 'EMP-1003',
      deviceId: 57,
      vendorUserId: '1003',
      organizationId: '9',
    });

    expect(h.orgFindById).toHaveBeenCalledWith(9);
    expect(h.mappingCreateOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 9 }),
    );
  });

  it('defaults to organization 1 when none is supplied', async () => {
    const svc = makeService();
    await svc.create({
      externalEmployeeId: 'EMP-1004',
      deviceId: 57,
      vendorUserId: '1004',
    });

    expect(h.orgFindById).not.toHaveBeenCalled();
    expect(h.orgFindByCode).not.toHaveBeenCalled();
    expect(h.mappingCreateOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 1 }),
    );
  });

  it('rejects an organization id that does not exist', async () => {
    h.orgFindById.mockResolvedValue(null);
    const svc = makeService();

    await expect(
      svc.create({
        externalEmployeeId: 'EMP-1005',
        deviceId: 57,
        vendorUserId: '1005',
        organizationId: 999999,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(h.mappingCreateOrUpdate).not.toHaveBeenCalled();
  });

  it('rejects an organization code that does not exist', async () => {
    h.orgFindByCode.mockResolvedValue(null);
    const svc = makeService();

    await expect(
      svc.create({
        externalEmployeeId: 'EMP-1006',
        deviceId: 57,
        vendorUserId: '1006',
        organizationId: 'NOPE',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('re-binds the organization on update when a new one is supplied', async () => {
    h.mappingFindById.mockResolvedValue(mappingRow(1)); // existing on org 1
    h.orgFindById.mockResolvedValue({ id: 5, code: 'ORG-REG', name: 'Region EMEA' });

    const svc = makeService();
    await svc.update(10, { organizationId: 5, department: 'Region EMEA' });

    expect(h.orgFindById).toHaveBeenCalledWith(5);
    expect(h.mappingUpdate).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ organizationId: 5 }),
    );
  });

  it('keeps the current organization on update when none is supplied', async () => {
    h.mappingFindById.mockResolvedValue(mappingRow(3));
    const svc = makeService();
    await svc.update(10, { status: 'INACTIVE' });

    expect(h.orgFindById).not.toHaveBeenCalled();
    // organizationId is left undefined so the repo does not touch the column.
    expect(h.mappingUpdate).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ organizationId: undefined, status: 'INACTIVE' }),
    );
  });
});
