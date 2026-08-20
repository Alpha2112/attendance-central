import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PunchesController } from '../modules/punches/punches.controller.js';
import { PunchesService, type PunchLogItem } from '../modules/punches/punches.service.js';

describe('PunchesController', () => {
  let controller: PunchesController;
  let service: PunchesService;

  const mockPunchItem: PunchLogItem = {
    id: 101,
    eventDate: '2026-08-18',
    employeeId: 'EMP-1001',
    employeeName: 'Sarah Jenkins',
    department: 'Engineering & Biometrics',
    deviceId: 57,
    deviceCode: 'DEV-HQ-HIK01',
    deviceName: 'HQ Turnstile 02 (Exit Face Term)',
    vendor: 'HIKVISION',
    punchType: 'IN',
    verificationType: 'FACE',
    punchTime: '8/18/2026, 8:00:00 PM',
    punchTimeUtc: '2026-08-18T17:00:00.000Z',
    receivedAt: '2026-08-18T17:00:00.050Z',
    source: 'PULL',
    cardNo: 'CRD-88910',
    fingerprint: '3a189f81d1192e20b355881a293810ff82910398210984928104819028491028',
  };

  beforeEach(() => {
    service = {
      getHistoricalLogs: vi.fn().mockResolvedValue({
        items: [mockPunchItem],
        total: 1,
        nextCursor: undefined,
      }),
      getLiveFeed: vi.fn().mockResolvedValue([mockPunchItem]),
      syncFromDevice: vi.fn().mockResolvedValue({
        success: true,
        syncedCount: 30,
        newCount: 5,
        duplicateCount: 25,
        deviceCode: 'DEV-HQ-HIK01',
        events: [mockPunchItem],
      }),
      ingestSimulatedPunch: vi.fn().mockResolvedValue(mockPunchItem),
    } as unknown as PunchesService;

    controller = new PunchesController(service);
  });

  it('should query historical punch logs', async () => {
    const res = await controller.getHistoricalLogs({ limit: 10 });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.employeeId).toBe('EMP-1001');
    expect(res.items[0]?.vendor).toBe('HIKVISION');
    expect(res.items[0]?.fingerprint).toBe(mockPunchItem.fingerprint);
  });

  it('should return real-time live punch feed', async () => {
    const feed = await controller.getLiveFeed(10);
    expect(feed).toHaveLength(1);
    expect(feed[0]?.punchType).toBe('IN');
    expect(feed[0]?.verificationType).toBe('FACE');
  });

  it('should trigger real hardware event sync from Hikvision terminal', async () => {
    const syncRes = await controller.syncFromDevice('DEV-HQ-HIK01');
    expect(syncRes.success).toBe(true);
    expect(syncRes.syncedCount).toBe(30);
    expect(syncRes.deviceCode).toBe('DEV-HQ-HIK01');
  });

  it('should simulate/ingest a test punch event', async () => {
    const ingested = await controller.simulatePunch({
      deviceCode: 'DEV-HQ-HIK01',
      employeeId: 'EMP-1001',
      vendorUserId: '1001',
      punchType: 'IN',
      verificationType: 'FACE',
    });
    expect(ingested.employeeId).toBe('EMP-1001');
    expect(ingested.verificationType).toBe('FACE');
  });
});
