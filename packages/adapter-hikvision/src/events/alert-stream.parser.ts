import { type RawAttendanceEvent, type DeviceModel, EventSource } from '@attendance/contracts';
import { type HikvisionAcsEventRecord } from '../types/isapi.types.js';
import { mapHikvisionEventToRawAttendance } from './event-mapper.js';
import { type AppLogger } from '@attendance/logging';

export class HikvisionAlertStreamParser {
  constructor(private readonly logger?: AppLogger) {}

  /**
   * Parses JSON push payload received from Hikvision HTTP host notification.
   */
  public parsePushPayload(device: DeviceModel, payload: unknown): RawAttendanceEvent[] {
    const events: RawAttendanceEvent[] = [];

    try {
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload;

      // Check for AcsEvent structure
      const record = (data?.AcsEvent ??
        data?.AccessControllerEvent ??
        data) as HikvisionAcsEventRecord;

      if (record && (record.major !== undefined || record.minor !== undefined)) {
        const rawEvent = mapHikvisionEventToRawAttendance(device, record, EventSource.PUSH);
        events.push(rawEvent);
      }
    } catch (err: unknown) {
      this.logger?.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'Failed to parse Hikvision push notification payload',
      );
    }

    return events;
  }
}
