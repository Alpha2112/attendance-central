import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadDatabaseConfig } from '@attendance/config';
import {
  DatabaseClient,
  DatabaseMigrator,
  runInTransaction,
  OrganizationRepository,
  BranchRepository,
  DeviceRepository,
  DeviceEmployeeMappingRepository,
  RawPunchLogRepository,
  AttendanceLogRepository,
  OutboxRepository,
  SyncRepository,
  AuditLogRepository,
  IntegrationRepository,
} from '../index.js';

describe('Database Repositories Integration Tests', () => {
  let client: DatabaseClient;
  let migrator: DatabaseMigrator;
  let orgRepo: OrganizationRepository;
  let branchRepo: BranchRepository;
  let deviceRepo: DeviceRepository;
  let mappingRepo: DeviceEmployeeMappingRepository;
  let rawPunchRepo: RawPunchLogRepository;
  let attendanceRepo: AttendanceLogRepository;
  let outboxRepo: OutboxRepository;
  let syncRepo: SyncRepository;
  let auditRepo: AuditLogRepository;
  let integrationRepo: IntegrationRepository;

  let testOrgId: number;
  let testBranchId: number;
  let testDeviceId: number;

  beforeAll(async () => {
    const config = loadDatabaseConfig();
    client = new DatabaseClient({ config });
    migrator = new DatabaseMigrator(client);

    await migrator.runMigrations();
    await migrator.seed();

    orgRepo = new OrganizationRepository(client);
    branchRepo = new BranchRepository(client);
    deviceRepo = new DeviceRepository(client);
    mappingRepo = new DeviceEmployeeMappingRepository(client);
    rawPunchRepo = new RawPunchLogRepository(client);
    attendanceRepo = new AttendanceLogRepository(client);
    outboxRepo = new OutboxRepository(client);
    syncRepo = new SyncRepository(client);
    auditRepo = new AuditLogRepository(client);
    integrationRepo = new IntegrationRepository(client);

    const existingOrg = await orgRepo.findByCode('ORG-TECHIVE');
    if (existingOrg) {
      testOrgId = existingOrg.id;
    } else {
      testOrgId = await orgRepo.create({
        code: 'ORG-TECHIVE',
        name: 'Techive Enterprise Solutions',
        timezone: 'Asia/Riyadh',
      });
    }

    const existingBranch = await branchRepo.findByOrgAndCode(testOrgId, 'BR-HQ-01');
    if (existingBranch) {
      testBranchId = existingBranch.id;
    } else {
      testBranchId = await branchRepo.create({
        organizationId: testOrgId,
        code: 'BR-HQ-01',
        name: 'Riyadh HQ Campus',
      });
    }

    const existingDevice = await deviceRepo.findByOrgAndCode(testOrgId, 'DEV-HQ-ZK01');
    if (existingDevice) {
      testDeviceId = existingDevice.id;
    } else {
      testDeviceId = await deviceRepo.create({
        organizationId: testOrgId,
        branchId: testBranchId,
        deviceCode: 'DEV-HQ-ZK01',
        serialNumber: 'ZK-SN-99881122',
        name: 'HQ Main Entrance Turnstile (ZKTeco)',
        vendor: 'ZKTECO',
      });
    }
  });

  afterAll(async () => {
    await client.close();
  });

  it('should find seeded organization and branches', async () => {
    const org = await orgRepo.findById(testOrgId);
    expect(org).toBeDefined();
    expect(org?.code).toBe('ORG-TECHIVE');

    const branches = await branchRepo.listByOrg(testOrgId);
    expect(branches.length).toBeGreaterThan(0);
    expect(branches[0]?.code).toBe('BR-HQ-01');
  });

  it('should find seeded device and mappings', async () => {
    const device = await deviceRepo.findById(testDeviceId);
    expect(device).toBeDefined();
    expect(device?.vendor).toBe('ZKTECO');

    const mapping = await mappingRepo.findMapping(testDeviceId, '457');
    expect(mapping).toBeDefined();
    expect(mapping?.external_employee_id).toBe('EMP-000457');
  });

  it('should insert raw punch log and retrieve it', async () => {
    const eventDate = '2026-08-15';
    const rawId = await rawPunchRepo.insert({
      eventDate,
      organizationId: testOrgId,
      deviceId: testDeviceId,
      vendor: 'ZKTECO',
      vendorUserId: '457',
      deviceTime: '2026-08-15 08:04:32.000000',
      receivedAt: '2026-08-15 05:04:33.000000',
      rawPayload: { pin: '457', verified: 1 },
      payloadHash: 'hash_test_123',
    });

    expect(rawId).toBeGreaterThan(0);

    const record = await rawPunchRepo.findById(rawId, eventDate);
    expect(record).toBeDefined();
    expect(record?.vendor_user_id).toBe('457');
    expect(record?.normalization_status).toBe('PENDING');

    await rawPunchRepo.updateNormalizationStatus(rawId, eventDate, 'NORMALIZED');
    const updated = await rawPunchRepo.findById(rawId, eventDate);
    expect(updated?.normalization_status).toBe('NORMALIZED');
  });

  it('should enforce database-level idempotency on duplicate attendance logs', async () => {
    const eventDate = '2026-08-15';
    const fingerprint = `fp_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const firstInsert = await attendanceRepo.insertIdempotent({
      eventDate,
      organizationId: testOrgId,
      branchId: testBranchId,
      employeeId: 'EMP-000457',
      deviceId: testDeviceId,
      vendor: 'ZKTECO',
      rawLogId: 1,
      punchTime: '2026-08-15 08:04:32.000000',
      punchTimeUtc: '2026-08-15 05:04:32.000000',
      receivedAt: '2026-08-15 05:04:33.000000',
      punchType: 'IN',
      verificationType: 'FINGERPRINT',
      eventFingerprint: fingerprint,
    });

    expect(firstInsert.inserted).toBe(true);
    expect(firstInsert.duplicate).toBe(false);
    expect(firstInsert.id).toBeDefined();

    // Re-insert exact same attendance fingerprint -> must be rejected at DB boundary
    const secondInsert = await attendanceRepo.insertIdempotent({
      eventDate,
      organizationId: testOrgId,
      branchId: testBranchId,
      employeeId: 'EMP-000457',
      deviceId: testDeviceId,
      vendor: 'ZKTECO',
      rawLogId: 1,
      punchTime: '2026-08-15 08:04:32.000000',
      punchTimeUtc: '2026-08-15 05:04:32.000000',
      receivedAt: '2026-08-15 05:04:33.000000',
      punchType: 'IN',
      verificationType: 'FINGERPRINT',
      eventFingerprint: fingerprint,
    });

    expect(secondInsert.inserted).toBe(false);
    expect(secondInsert.duplicate).toBe(true);
  });

  it('should support keyset pagination on attendance logs', async () => {
    const result = await attendanceRepo.findKeyset({
      organizationId: testOrgId,
      employeeId: 'EMP-000457',
      limit: 10,
    });

    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('should create and fetch transactional outbox events', async () => {
    const eventId = `outbox_evt_${Date.now()}`;
    const outboxId = await outboxRepo.create({
      eventId,
      eventType: 'attendance.normalized.v1',
      aggregateType: 'attendance',
      aggregateId: 'EMP-000457',
      payload: { employeeId: 'EMP-000457', punchType: 'IN' },
    });

    expect(outboxId).toBeGreaterThan(0);

    const found = await outboxRepo.findByEventId(eventId);
    expect(found).toBeDefined();
    expect(found?.status).toBe('PENDING');

    await outboxRepo.markPublished(eventId);
    const updated = await outboxRepo.findByEventId(eventId);
    expect(updated?.status).toBe('PUBLISHED');
  });

  it('should manage sync jobs and checkpoints', async () => {
    const jobId = await syncRepo.createJob({
      organizationId: testOrgId,
      deviceId: testDeviceId,
      jobType: 'HISTORICAL_PUNCHES',
      requestedBy: 'operator_admin',
    });

    expect(jobId).toBeGreaterThan(0);

    await syncRepo.updateJobProgress(jobId, {
      status: 'COMPLETED',
      recordsReceived: 100,
      recordsInserted: 95,
      duplicates: 5,
    });

    const job = await syncRepo.findJobById(jobId);
    expect(job?.status).toBe('COMPLETED');
    expect(job?.records_inserted).toBe(95);

    await syncRepo.saveCheckpoint(testDeviceId, 'ATTENDANCE', 'last_123', new Date(), {
      offset: 100,
    });
    const cp = await syncRepo.getCheckpoint(testDeviceId, 'ATTENDANCE');
    expect(cp?.last_vendor_event_id).toBe('last_123');
  });

  it('should record and list audit logs', async () => {
    const auditId = await auditRepo.record({
      organizationId: testOrgId,
      actorType: 'ADMIN',
      actorId: 'admin_user',
      action: 'DEVICE_CONFIG_UPDATE',
      resourceType: 'DEVICE',
      resourceId: String(testDeviceId),
      beforeState: { port: 4370 },
      afterState: { port: 4371 },
      correlationId: 'corr_test_999',
    });

    expect(auditId).toBeGreaterThan(0);

    const logs = await auditRepo.listByOrg(testOrgId, 5);
    expect(logs.some((l) => l.action === 'DEVICE_CONFIG_UPDATE')).toBe(true);
  });

  it('should find API client by client ID', async () => {
    const clientRecord = await integrationRepo.findApiClientByClientId('client_hrms_gateway');
    expect(clientRecord).toBeDefined();
    expect(clientRecord?.client_name).toBe('HRMS Ingestion Service');
  });

  it('should rollback transaction on failure', async () => {
    const uniqueFingerprint = `fail_tx_${Date.now()}`;
    await expect(
      runInTransaction(client, async (connection) => {
        await attendanceRepo.insertIdempotent(
          {
            eventDate: '2026-08-15',
            organizationId: testOrgId,
            employeeId: 'EMP-000457',
            deviceId: testDeviceId,
            vendor: 'ZKTECO',
            rawLogId: 99,
            punchTime: '2026-08-15 08:04:32.000000',
            punchTimeUtc: '2026-08-15 05:04:32.000000',
            receivedAt: '2026-08-15 05:04:33.000000',
            punchType: 'IN',
            verificationType: 'FINGERPRINT',
            eventFingerprint: uniqueFingerprint,
          },
          connection,
        );

        // Force intentional transaction failure
        throw new Error('Simulated failure during transaction');
      }),
    ).rejects.toThrow('Simulated failure during transaction');

    // Verify row was rolled back and not persisted
    const result = await client.query<
      import('../entities/attendance.entity.js').AttendanceLogEntity[]
    >('SELECT * FROM attendance_logs WHERE event_fingerprint = ?', [uniqueFingerprint]);
    expect(result.length).toBe(0);
  });
});
