import { NormalizerService } from '@attendance/integration';
import { type RawAttendanceEvent, EventSource } from '@attendance/contracts';
import { type DatabaseClient } from '@attendance/database';
import { randomUUID } from 'node:crypto';

export interface UnmappedScenarioResult {
  unmappedResolved: boolean;
  unmappedSafeFallback: boolean;
  reprocessedSuccessfully: boolean;
  success: boolean;
}

export class UnmappedEmployeeScenario {
  constructor(
    private readonly normalizer: NormalizerService,
    private readonly db: DatabaseClient,
  ) {}

  public async run(): Promise<UnmappedScenarioResult> {
    const unmappedUserId = '98765';
    const punchTime = '2026-08-17T16:05:00.000Z';

    const rawEvent: RawAttendanceEvent = {
      eventId: randomUUID(),
      schemaVersion: 1,
      vendor: 'ZKTECO',
      adapter: 'STANDALONE_SDK',
      organizationId: 'ORG-TECHIVE',
      deviceId: 'DEV-HQ-ZK01',
      vendorUserId: unmappedUserId,
      deviceTime: punchTime,
      receivedAt: new Date().toISOString(),
      source: EventSource.PULL,
      vendorPunchType: 'OUT',
      vendorVerificationType: 'FINGERPRINT',
      rawPayload: { unmappedTest: true },
    };

    // 1. First normalization attempt: employee is unmapped, fallback to vendorUserId
    const initialResult = await this.normalizer.processEvent(rawEvent);
    const unmappedSafeFallback =
      initialResult !== null && initialResult.employeeId === unmappedUserId;

    // 2. Add mapping in database for this employee
    await this.db.query(
      `INSERT INTO device_employee_mappings (organization_id, device_id, vendor_user_id, external_employee_id, status)
       VALUES (1, 1, ?, ?, 'ACTIVE')
       ON DUPLICATE KEY UPDATE external_employee_id = VALUES(external_employee_id)`,
      [unmappedUserId, 'EMP-NEW-98765'],
    );

    // 3. Normalize another punch from this employee
    const subsequentPunchTime = '2026-08-17T16:10:00.000Z';
    const mappedRawEvent: RawAttendanceEvent = {
      ...rawEvent,
      eventId: randomUUID(),
      deviceTime: subsequentPunchTime,
    };

    const reprocessResult = await this.normalizer.processEvent(mappedRawEvent);
    const reprocessedSuccessfully =
      reprocessResult !== null && reprocessResult.employeeId === 'EMP-NEW-98765';

    const success = unmappedSafeFallback && reprocessedSuccessfully;

    return {
      unmappedResolved: true,
      unmappedSafeFallback,
      reprocessedSuccessfully,
      success,
    };
  }
}
