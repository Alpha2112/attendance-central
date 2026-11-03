import { randomUUID } from 'node:crypto';
import {
  type RawAttendanceEvent,
  type DeviceModel,
  DeviceVendor,
  EventSource,
} from '@attendance/contracts';
import { type GsdkEventLog } from '../types/gsdk.types.js';
import { EventCodeCatalog, mapTnaKeyToPunchType } from './event-codes.js';

/** Adapter tag written to every raw event produced by this connector. */
export const SUPREMA_ADAPTER_TAG = 'suprema-gsdk';

function toIsoFromUnixSeconds(timestampSec: number): string {
  if (!timestampSec || timestampSec <= 0) {
    return new Date().toISOString();
  }
  return new Date(timestampSec * 1000).toISOString();
}

function cardDataToBase64(cardData: GsdkEventLog['cardData']): string | undefined {
  if (!cardData) return undefined;
  const buf = Buffer.isBuffer(cardData) ? cardData : Buffer.from(cardData);
  return buf.length > 0 ? buf.toString('base64') : undefined;
}

/**
 * Maps a single G-SDK event log into the canonical {@link RawAttendanceEvent}.
 *
 * The vendor event id is `<gatewayDeviceID>:<logID>`; the log ID is a monotonic
 * per-device counter, which makes it a stable idempotency key shared by live
 * delivery and historical backfill.
 */
export function mapGsdkEventToRawAttendance(
  device: DeviceModel,
  log: GsdkEventLog,
  catalog: EventCodeCatalog,
  source: EventSource = EventSource.PULL,
): RawAttendanceEvent {
  const userId = log.userID && log.userID.length > 0 ? log.userID : 'UNKNOWN_USER';

  return {
    eventId: randomUUID(),
    schemaVersion: 1,
    tenantId: device.tenantId ?? undefined,
    organizationId: device.organizationId,
    branchId: device.branchId ?? undefined,
    deviceId: device.id,
    deviceSerialNumber: device.serialNumber ?? `SUPREMA-${device.deviceCode}`,
    vendor: DeviceVendor.SUPREMA,
    adapter: SUPREMA_ADAPTER_TAG,
    vendorEventId: `${log.deviceID}:${log.ID}`,
    vendorUserId: userId,
    deviceTime: toIsoFromUnixSeconds(log.timestamp),
    receivedAt: new Date().toISOString(),
    vendorPunchType: mapTnaKeyToPunchType(log.TNAKey),
    vendorVerificationType: catalog.verificationType(log.eventCode, log.subCode),
    source,
    rawPayload: {
      ID: log.ID,
      timestamp: log.timestamp,
      deviceID: log.deviceID,
      userID: log.userID,
      eventCode: log.eventCode,
      subCode: log.subCode,
      eventDesc: catalog.describe(log.eventCode, log.subCode),
      TNAKey: log.TNAKey,
      hasImage: log.hasImage,
      temperature: log.temperature,
      cardData: cardDataToBase64(log.cardData),
    },
  };
}
