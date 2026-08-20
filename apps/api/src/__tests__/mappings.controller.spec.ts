import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MappingsController } from '../modules/mappings/mappings.controller.js';
import { MappingsService } from '../modules/mappings/mappings.service.js';

describe('MappingsController', () => {
  let controller: MappingsController;
  let service: MappingsService;

  const mockMapping = {
    id: 1,
    tenant_id: null,
    organization_id: 1,
    device_id: 57,
    external_employee_id: 'EMP-1001',
    vendor_user_id: '1001',
    vendor_employee_code: '1001',
    status: 'ACTIVE',
    metadata: { employeeName: 'Sarah Jenkins', department: 'Engineering' },
    created_at: new Date(),
    updated_at: new Date(),
    device_code: 'DEV-HQ-HIK01',
    device_name: 'HQ Turnstile 02 (Exit Face Term)',
    vendor: 'HIKVISION',
  };

  beforeEach(() => {
    service = {
      findAll: vi.fn().mockResolvedValue([mockMapping]),
      findById: vi.fn().mockResolvedValue(mockMapping),
      create: vi.fn().mockResolvedValue(mockMapping),
      update: vi.fn().mockResolvedValue({ ...mockMapping, status: 'INACTIVE' }),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as MappingsService;

    controller = new MappingsController(service);
  });

  it('should list all mappings', async () => {
    const list = await controller.listMappings();
    expect(list).toHaveLength(1);
    expect(list[0]?.external_employee_id).toBe('EMP-1001');
    expect(list[0]?.vendor).toBe('HIKVISION');
  });

  it('should get single mapping by ID', async () => {
    const item = await controller.getMapping(1);
    expect(item.id).toBe(1);
    expect(item.vendor_user_id).toBe('1001');
  });

  it('should create new mapping with Hikvision device', async () => {
    const created = await controller.createMapping({
      externalEmployeeId: 'EMP-1001',
      employeeName: 'Sarah Jenkins',
      department: 'Engineering',
      deviceCode: 'DEV-HQ-HIK01',
      vendorUserId: '1001',
      status: 'ACTIVE',
    });
    expect(created.id).toBe(1);
    expect(service.create).toHaveBeenCalled();
  });

  it('should update existing mapping', async () => {
    const updated = await controller.updateMapping(1, { status: 'INACTIVE' });
    expect(updated.status).toBe('INACTIVE');
    expect(service.update).toHaveBeenCalledWith(1, { status: 'INACTIVE' });
  });

  it('should delete mapping by ID', async () => {
    const res = await controller.deleteMapping(1);
    expect(res).toEqual({ success: true, id: 1 });
    expect(service.delete).toHaveBeenCalledWith(1);
  });
});
