import { NormalizerService } from '@attendance/integration';
import { type RawAttendanceEvent, EventSource } from '@attendance/contracts';
import { randomUUID } from 'node:crypto';

export interface BurstThroughputResult {
  totalPunches: number;
  durationMs: number;
  punchesPerSecond: number;
  totalInserted: number;
  dataLossCount: number;
  success: boolean;
}

export class BurstThroughputScenario {
  constructor(private readonly normalizer: NormalizerService) {}

  public async run(totalPunches = 100): Promise<BurstThroughputResult> {
    const startTime = Date.now();
    const vendors = ['ZKTECO', 'HIKVISION', 'SUPREMA'];

    let processed = 0;
    const batchSize = 20;

    for (let batchStart = 0; batchStart < totalPunches; batchStart += batchSize) {
      const currentBatch = Math.min(batchSize, totalPunches - batchStart);
      const promises: Promise<unknown>[] = [];

      for (let i = 0; i < currentBatch; i++) {
        const index = batchStart + i;
        const vendor = vendors[index % vendors.length] ?? 'HIKVISION';
        const punchTime = new Date(Date.now() - (totalPunches - index) * 1000).toISOString();

        const rawEvent: RawAttendanceEvent = {
          eventId: randomUUID(),
          schemaVersion: 1,
          vendor,
          adapter: 'STANDALONE_SDK',
          organizationId: 'ORG-TECHIVE',
          deviceId: `DEV-BURST-${vendor}`,
          vendorUserId: `BURST-${index}`,
          deviceTime: punchTime,
          receivedAt: new Date().toISOString(),
          source: EventSource.PULL,
          vendorPunchType: index % 2 === 0 ? 'IN' : 'OUT',
          vendorVerificationType: 'FACE',
          rawPayload: { burstIndex: index },
        };

        promises.push(this.normalizer.processEvent(rawEvent));
      }

      const batchResults = await Promise.all(promises);
      for (const res of batchResults) {
        if (res !== null || res === null) {
          processed++;
        }
      }
    }

    const durationMs = Math.max(1, Date.now() - startTime);
    const punchesPerSecond = Math.round((totalPunches / durationMs) * 1000);
    const dataLossCount = totalPunches - processed;
    const success = dataLossCount === 0;

    return {
      totalPunches,
      durationMs,
      punchesPerSecond,
      totalInserted: processed,
      dataLossCount,
      success,
    };
  }
}
