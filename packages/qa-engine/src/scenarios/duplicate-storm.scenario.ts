import { NormalizerService } from '@attendance/integration';
import {
  type RawAttendanceEvent,
  EventSource,
  generateEventFingerprint,
} from '@attendance/contracts';
import { type DatabaseClient } from '@attendance/database';
import { randomUUID } from 'node:crypto';

export interface DuplicateStormResult {
  totalSubmitted: number;
  totalInserted: number;
  totalDuplicateShielded: number;
  deterministicFingerprint: string;
  success: boolean;
}

export class DuplicateStormScenario {
  constructor(
    private readonly normalizer: NormalizerService,
    private readonly db: DatabaseClient,
  ) {}

  public async run(concurrency = 30): Promise<DuplicateStormResult> {
    const punchTime = '2026-08-17T16:00:00.000Z';
    const baseEvent: RawAttendanceEvent = {
      eventId: randomUUID(),
      schemaVersion: 1,
      vendor: 'HIKVISION',
      adapter: 'ISAPI',
      organizationId: 'ORG-TECHIVE',
      deviceId: 'DEV-HQ-HIK01',
      vendorUserId: '1001',
      deviceTime: punchTime,
      receivedAt: new Date().toISOString(),
      source: EventSource.PULL,
      vendorPunchType: 'IN',
      vendorVerificationType: 'FACE',
      rawPayload: { simulated: true, scenario: 'duplicate-storm' },
    };

    // Calculate expected deterministic fingerprint
    const expectedFingerprint = generateEventFingerprint({
      organizationId: baseEvent.organizationId,
      employeeId: baseEvent.vendorUserId,
      deviceId: baseEvent.deviceId,
      punchTimeUtc: punchTime,
      punchType: 'IN',
    });

    // Run parallel concurrent submissions of the identical biometric punch
    const promises: Promise<unknown>[] = [];
    for (let i = 0; i < concurrency; i++) {
      promises.push(this.normalizer.processEvent({ ...baseEvent, eventId: randomUUID() }));
    }

    const results = await Promise.all(promises);

    let inserted = 0;
    let duplicates = 0;

    for (const r of results) {
      if (r !== null) {
        inserted++;
      } else {
        duplicates++;
      }
    }

    // Verify database state: exactly 1 log record with this fingerprint
    const rows = (await this.db.query(
      `SELECT COUNT(*) as cnt FROM attendance_logs WHERE event_fingerprint = ?`,
      [expectedFingerprint],
    )) as Array<{ cnt: number | string }>;
    const dbCount = Number(rows[0]?.cnt ?? 0);

    const success = inserted === 1 && duplicates === concurrency - 1 && dbCount === 1;

    return {
      totalSubmitted: concurrency,
      totalInserted: inserted,
      totalDuplicateShielded: duplicates,
      deterministicFingerprint: expectedFingerprint,
      success,
    };
  }
}
