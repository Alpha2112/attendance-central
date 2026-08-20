import {
  type RawAttendanceEvent,
  type DeviceModel,
  DeviceVendor,
  EventSource,
  PunchType,
} from '@attendance/contracts';
import { type BioStarEventLog, BioStarEventTypeId, BioStarTnaKey } from '../types/biostar.types.js';
import { randomUUID } from 'node:crypto';

/**
 * Maps BioStar 2 event type codes to platform VerificationType code string.
 */
export function mapBioStarEventTypeToVerifyType(code: number): string {
  switch (code) {
    case BioStarEventTypeId.VERIFY_SUCCESS_FACE:
    case BioStarEventTypeId.ACCESS_GRANTED_FACE:
      return '15'; // FACE
    case BioStarEventTypeId.VERIFY_SUCCESS_FINGERPRINT:
    case BioStarEventTypeId.ACCESS_GRANTED_FINGERPRINT:
      return '1'; // FINGERPRINT
    case BioStarEventTypeId.VERIFY_SUCCESS_CARD:
    case BioStarEventTypeId.ACCESS_GRANTED_CARD:
      return '4'; // CARD
    case BioStarEventTypeId.VERIFY_SUCCESS_PIN:
    case BioStarEventTypeId.ACCESS_GRANTED_PIN:
      return '2'; // PIN
    case BioStarEventTypeId.VERIFY_SUCCESS_QR:
    case BioStarEventTypeId.ACCESS_GRANTED_QR:
      return '30'; // QR
    case BioStarEventTypeId.VERIFY_SUCCESS_MOBILE_BLE:
      return '40'; // BLE / MOBILE
    default:
      return '0'; // UNKNOWN
  }
}

/**
 * Maps BioStar 2 T&A key to platform PunchType string.
 */
export function mapBioStarTnaKeyToPunchType(tnaKey?: number): string {
  switch (tnaKey) {
    case BioStarTnaKey.CHECK_IN:
      return PunchType.IN;
    case BioStarTnaKey.CHECK_OUT:
      return PunchType.OUT;
    case BioStarTnaKey.BREAK_OUT:
      return PunchType.BREAK_OUT;
    case BioStarTnaKey.BREAK_IN:
      return PunchType.BREAK_IN;
    default:
      return 'AUTO';
  }
}

/**
 * Maps a single BioStar 2 event log to canonical RawAttendanceEvent.
 */
export function mapBioStarEventToRawAttendance(
  device: DeviceModel,
  log: BioStarEventLog,
  source: EventSource = EventSource.PULL,
): RawAttendanceEvent {
  const userId =
    log.user_id?.user_id || log.user_name || (log.id ? String(log.id) : 'UNKNOWN_USER');

  // Convert device time to ISO UTC
  const parsedDate = new Date(log.datetime);
  const deviceTime = isNaN(parsedDate.getTime())
    ? new Date().toISOString()
    : parsedDate.toISOString();

  const eventCode = log.event_type_id?.code ?? 0;

  return {
    eventId: randomUUID(),
    schemaVersion: 1,
    tenantId: device.tenantId ?? undefined,
    organizationId: device.organizationId,
    branchId: device.branchId ?? undefined,
    deviceId: device.id,
    deviceSerialNumber: device.serialNumber ?? `SUPREMA-${device.deviceCode}`,
    vendor: DeviceVendor.SUPREMA,
    adapter: 'suprema-biostar2',
    vendorEventId: String(log.id),
    vendorUserId: userId,
    deviceTime,
    receivedAt: new Date().toISOString(),
    vendorPunchType: mapBioStarTnaKeyToPunchType(log.tna_key),
    vendorVerificationType: mapBioStarEventTypeToVerifyType(eventCode),
    source,
    rawPayload: {
      id: log.id,
      datetime: log.datetime,
      event_type_id: log.event_type_id,
      device_id: log.device_id,
      user_id: log.user_id,
      user_name: log.user_name,
      tna_key: log.tna_key,
      door_id: log.door_id,
      temperature: log.temperature,
      mask_status: log.mask_status,
      has_image: log.has_image,
    },
  };
}
