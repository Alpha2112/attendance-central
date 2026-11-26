import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for ManualSyncService — the staged manual terminal sync.
 * The DB repositories and vendor adapters are mocked; fingerprinting and
 * normalization use the REAL @attendance/contracts so dedup is exercised for real.
 */

const h = vi.hoisted(() => ({
  findById: vi.fn(),
  findByOrgAndCode: vi.fn(),
  findMapping: vi.fn(),
  insertIdempotent: vi.fn(),
  outboxCreate: vi.fn().mockResolvedValue(1),
  createJob: vi.fn().mockResolvedValue(42),
  updateJobProgress: vi.fn().mockResolvedValue(undefined),
  findJobById: vi.fn(),
  listJobs: vi.fn().mockResolvedValue([]),
  fetchLogs: vi.fn(),
  dbQuery: vi.fn(),
}));

vi.mock('@attendance/database', () => ({
  DatabaseClient: class {},
  DeviceRepository: class {
    findById = h.findById;
    findByOrgAndCode = h.findByOrgAndCode;
  },
  AttendanceLogRepository: class {
    insertIdempotent = h.insertIdempotent;
  },
  DeviceEmployeeMappingRepository: class {
    findMapping = h.findMapping;
  },
  OutboxRepository: class {
    create = h.outboxCreate;
  },
  SyncRepository: class {
    createJob = h.createJob;
    updateJobProgress = h.updateJobProgress;
    findJobById = h.findJobById;
    listJobs = h.listJobs;
  },
  runInTransaction: async (_db: unknown, fn: (conn: unknown) => unknown) => fn({}),
}));

const adapterStub = () => ({
  HikvisionDeviceAdapter: class {
    fetchLogs = h.fetchLogs;
  },
});
vi.mock('@attendance/adapter-hikvision', () => ({
  HikvisionDeviceAdapter: class {
    fetchLogs = h.fetchLogs;
  },
  ISAPIClient: class {},
}));
vi.mock('@attendance/adapter-suprema', () => ({
  SupremaDeviceAdapter: class {
    fetchLogs = h.fetchLogs;
  },
}));
vi.mock('@attendance/adapter-zkteco', () => ({
  ZKTecoDeviceAdapter: class {
    fetchLogs = h.fetchLogs;
  },
}));
vi.mock('@attendance/adapter-anviz', () => ({
  AnvizDeviceAdapter: class {
    fetchLogs = h.fetchLogs;
  },
}));
void adapterStub;

const { ManualSyncService } = await import('../modules/punches/manual-sync.service.js');

const DEVICE = {
  id: 1,
  device_code: 'DEV-HQ-HIK01',
  name: 'HQ Turnstile',
  vendor: 'HIKVISION',
  organization_id: 1,
  branch_id: null,
  serial_number: 'HIK-1',
  connection_mode: 'PULL',
  status: 'ONLINE',
  host: '127.0.0.1',
  port: 80,
  timezone: 'UTC',
  metadata: {},
  created_at: new Date(),
  updated_at: new Date(),
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
const db = { query: h.dbQuery } as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

function rawEvent(vendorUserId: string, deviceTime: string, vendorEventId: string) {
  return {
    eventId: '00000000-0000-0000-0000-000000000000',
    schemaVersion: 1 as const,
    organizationId: 'ORG-TECHIVE',
    deviceId: 'DEV-HQ-HIK01',
    vendor: 'HIKVISION',
    adapter: 'hikvision-isapi',
    vendorEventId,
    vendorUserId,
    deviceTime,
    receivedAt: new Date().toISOString(),
    vendorPunchType: 'IN',
    vendorVerificationType: 'FACE',
    source: 'PUSH',
    rawPayload: {},
    metadata: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.createJob.mockResolvedValue(42);
  h.findById.mockResolvedValue(DEVICE);
  h.findByOrgAndCode.mockResolvedValue(DEVICE);
  // loadExisting SELECTs return nothing by default; count returns 0; raw insert returns id.
  h.dbQuery.mockImplementation(async (sql: string) => {
    if (/^\s*SELECT DISTINCT vendor_event_id/i.test(sql)) return [];
    if (/^\s*SELECT DISTINCT event_fingerprint/i.test(sql)) return [];
    if (/^\s*SELECT COUNT/i.test(sql)) return [{ c: 0 }];
    if (/INSERT INTO raw_punch_logs/i.test(sql)) return { insertId: 10 };
    return [];
  });
});

describe('ManualSyncService.fetch', () => {
  it('rejects a malformed or inverted date range', async () => {
    const svc = new ManualSyncService(db, logger);
    await expect(svc.fetch(1, 'nope', '2026-11-30', 'tester')).rejects.toThrow(/YYYY-MM-DD/);
    await expect(svc.fetch(1, '2026-12-01', '2026-11-01', 'tester')).rejects.toThrow(
      /on or before/,
    );
  });

  it('normalizes, validates, flags unmapped + in-batch duplicates, and filters out-of-range', async () => {
    h.findMapping.mockImplementation(async (_devId: number, vendorUserId: string) =>
      vendorUserId === '1001'
        ? { external_employee_id: 'EMP-1001', metadata: { employeeName: 'Sarah Jenkins' } }
        : null,
    );
    h.fetchLogs.mockResolvedValue({
      events: [
        rawEvent('1001', '2026-11-10T08:00:00.000Z', 'S1'), // valid, mapped
        rawEvent('9999', '2026-11-10T09:00:00.000Z', 'S2'), // unmapped -> warning
        rawEvent('1001', '2026-11-10T08:00:00.000Z', 'S3'), // same fingerprint as S1 -> dup in batch
        rawEvent('1002', '2026-12-05T08:00:00.000Z', 'S4'), // out of range -> filtered
      ],
      hasMore: false,
    });

    const svc = new ManualSyncService(db, logger);
    const res = await svc.fetch('DEV-HQ-HIK01', '2026-11-01', '2026-11-30', 'tester');

    expect(res.jobId).toBe(42);
    expect(res.vendor).toBe('HIKVISION');
    expect(res.dateRangeSupported).toBe(true);
    expect(res.candidates).toHaveLength(3); // S4 filtered out
    expect(res.summary.total).toBe(3);
    expect(res.summary.duplicatesInBatch).toBe(1);
    expect(res.summary.willImport).toBe(2); // S1 + S2 (S3 is a batch duplicate)

    const mapped = res.candidates.find((c) => c.deviceRecordId === 'S1')!;
    expect(mapped.externalEmployeeId).toBe('EMP-1001');
    expect(mapped.employeeName).toBe('Sarah Jenkins');
    expect(mapped.willImport).toBe(true);

    const unmapped = res.candidates.find((c) => c.deviceRecordId === 'S2')!;
    expect(unmapped.mapped).toBe(false);
    expect(unmapped.level).toBe('warning');

    const batchDup = res.candidates.find((c) => c.deviceRecordId === 'S3')!;
    expect(batchDup.duplicateInBatch).toBe(true);
    expect(batchDup.willImport).toBe(false);

    // A job was created and marked FETCHED.
    expect(h.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: 1,
        jobType: 'MANUAL',
        requestedBy: 'tester',
        dateFrom: '2026-11-01',
        dateTo: '2026-11-30',
      }),
    );
    expect(h.updateJobProgress).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ status: 'FETCHED' }),
    );
  });

  it('flags already-synced records (present in attendance_logs) as non-importable', async () => {
    h.findMapping.mockResolvedValue({ external_employee_id: 'EMP-1001', metadata: {} });
    h.fetchLogs.mockResolvedValue({
      events: [rawEvent('1001', '2026-11-10T08:00:00.000Z', 'S1')],
      hasMore: false,
    });
    // Device record already stored -> alreadySynced
    h.dbQuery.mockImplementation(async (sql: string) => {
      if (/^\s*SELECT DISTINCT vendor_event_id/i.test(sql)) return [{ vendor_event_id: 'S1' }];
      if (/^\s*SELECT DISTINCT event_fingerprint/i.test(sql)) return [];
      return [];
    });

    const svc = new ManualSyncService(db, logger);
    const res = await svc.fetch(1, '2026-11-01', '2026-11-30', 'tester');
    expect(res.summary.alreadySynced).toBe(1);
    expect(res.summary.willImport).toBe(0);
    expect(res.candidates[0]!.willImport).toBe(false);
  });

  it('skips non-identity events (UNKNOWN_USER) instead of inventing employees', async () => {
    h.findMapping.mockResolvedValue(null);
    h.fetchLogs.mockResolvedValue({
      events: [
        rawEvent('UNKNOWN_USER', '2026-11-10T08:00:00.000Z', 'S1'), // door/exit event -> skipped
        rawEvent('1001', '2026-11-10T09:00:00.000Z', 'S2'), // real punch -> kept
      ],
      hasMore: false,
    });
    const svc = new ManualSyncService(db, logger);
    const res = await svc.fetch(1, '2026-11-01', '2026-11-30', 'tester');
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0]!.vendorUserId).toBe('1001');
  });

  it('keeps paging past a page that has raw logs but no punch events (Suprema)', async () => {
    h.findById.mockResolvedValue({ ...DEVICE, vendor: 'SUPREMA', device_code: 'sup-gsdk-01' });
    h.findMapping.mockResolvedValue({ external_employee_id: 'EMP-1001', metadata: {} });
    h.fetchLogs
      // Page 1: 50 raw logs but no punch events -> adapter returns events:[] hasMore:true
      .mockResolvedValueOnce({ events: [], hasMore: true, nextCursor: { lastLogIndex: 50 } })
      // Page 2: a real punch
      .mockResolvedValueOnce({
        events: [rawEvent('1001', '2026-11-10T08:00:00.000Z', 'S9')],
        hasMore: false,
      });
    const svc = new ManualSyncService(db, logger);
    const res = await svc.fetch(1, '2026-11-01', '2026-11-30', 'tester');
    expect(res.vendor).toBe('SUPREMA');
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0]!.vendorUserId).toBe('1001');
    expect(h.fetchLogs).toHaveBeenCalledTimes(2);
  });

  it('marks the job FAILED and throws when the device fetch errors', async () => {
    h.fetchLogs.mockRejectedValue(new Error('ECONNREFUSED'));
    const svc = new ManualSyncService(db, logger);
    await expect(svc.fetch(1, '2026-11-01', '2026-11-30', 'tester')).rejects.toThrow(
      /ECONNREFUSED/,
    );
    expect(h.updateJobProgress).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ status: 'FAILED' }),
    );
  });
});

describe('ManualSyncService.commit', () => {
  const row = {
    vendorUserId: '1001',
    punchTimeUtc: '2026-11-10T08:00:00.000Z',
    punchType: 'IN',
    verificationType: 'FACE',
    deviceRecordId: 'S1',
  };

  beforeEach(() => {
    h.findJobById.mockResolvedValue({ id: 42, device_id: 1 });
    h.findMapping.mockResolvedValue({ external_employee_id: 'EMP-1001', metadata: {} });
  });

  it('imports a selected candidate as a MANUAL row with the sync_job_id', async () => {
    h.insertIdempotent.mockResolvedValue({ inserted: true, duplicate: false, id: 7 });
    const svc = new ManualSyncService(db, logger);
    const res = await svc.commit(42, [row], 'tester');

    expect(res.summary.imported).toBe(1);
    expect(res.summary.duplicates).toBe(0);
    const insertArg = h.insertIdempotent.mock.calls[0]![0];
    expect(insertArg).toMatchObject({ syncMode: 'MANUAL', syncJobId: 42, source: 'PULL' });
    expect(h.outboxCreate).toHaveBeenCalledTimes(1);
    expect(h.updateJobProgress).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ status: 'COMPLETED', recordsInserted: 1 }),
    );
  });

  it('is idempotent — a fingerprint already stored returns duplicate, no outbox', async () => {
    h.insertIdempotent.mockResolvedValue({ inserted: false, duplicate: true });
    const svc = new ManualSyncService(db, logger);
    const res = await svc.commit(42, [row], 'tester');
    expect(res.summary.imported).toBe(0);
    expect(res.summary.duplicates).toBe(1);
    expect(h.outboxCreate).not.toHaveBeenCalled();
  });

  it('skips a device record already present in attendance_logs (cross-path guard)', async () => {
    h.dbQuery.mockImplementation(async (sql: string) =>
      /^\s*SELECT COUNT/i.test(sql) ? [{ c: 1 }] : [],
    );
    const svc = new ManualSyncService(db, logger);
    const res = await svc.commit(42, [row], 'tester');
    expect(res.summary.duplicates).toBe(1);
    expect(h.insertIdempotent).not.toHaveBeenCalled();
  });

  it('throws when the sync job does not exist', async () => {
    h.findJobById.mockResolvedValue(null);
    const svc = new ManualSyncService(db, logger);
    await expect(svc.commit(999, [row], 'tester')).rejects.toThrow(/not found/);
  });
});
