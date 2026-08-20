import {
  type RawAttendanceEvent,
  type DeviceModel,
  DeviceVendor,
  EventSource,
} from '@attendance/contracts';
import { type HikvisionAcsEventRecord, HikvisionMinorEvent } from '../types/isapi.types.js';
import { randomUUID } from 'node:crypto';

/**
 * Maps Hikvision minor event codes to canonical platform verification types.
 */
export function mapHikvisionMinorToVerifyType(minor: number): string {
  switch (minor) {
    case HikvisionMinorEvent.MINOR_FACE_VERIFY_PASS:
    case HikvisionMinorEvent.MINOR_FACE_AND_CARD_PASS:
    case HikvisionMinorEvent.MINOR_FACE_AND_CARD_AND_PASSWORD_PASS:
    case HikvisionMinorEvent.MINOR_FACE_AND_FINGERPRINT_PASS:
      return '15'; // FACE
    case HikvisionMinorEvent.MINOR_FINGERPRINT_PASS:
    case HikvisionMinorEvent.MINOR_FINGERPRINT_AND_PASSWORD_PASS:
      return '1'; // FINGERPRINT
    case HikvisionMinorEvent.MINOR_LEGAL_CARD_PASS:
    case HikvisionMinorEvent.MINOR_CARD_AND_PSW_PASS:
      return '4'; // CARD
    case HikvisionMinorEvent.MINOR_QR_CODE_PASS:
      return '30'; // QR
    case HikvisionMinorEvent.MINOR_DOOR_BUTTON_PRESS:
      return '2'; // PIN / BUTTON
    default:
      return '0'; // UNKNOWN
  }
}

/**
 * Converts a Hikvision AcsEvent record into a canonical RawAttendanceEvent.
 */
export function mapHikvisionEventToRawAttendance(
  device: DeviceModel,
  record: HikvisionAcsEventRecord,
  source: EventSource = EventSource.PULL,
): RawAttendanceEvent {
  const userId =
    record.employeeNoString ||
    record.cardNo ||
    (record.serialNo ? String(record.serialNo) : 'UNKNOWN_USER');

  // Convert device time to ISO UTC
  const parsedDate = new Date(record.time);
  const deviceTime = isNaN(parsedDate.getTime())
    ? new Date().toISOString()
    : parsedDate.toISOString();

  return {
    eventId: randomUUID(),
    schemaVersion: 1,
    tenantId: device.tenantId ?? undefined,
    organizationId: device.organizationId,
    branchId: device.branchId ?? undefined,
    deviceId: device.id,
    deviceSerialNumber: device.serialNumber ?? `HIK-${device.deviceCode}`,
    vendor: DeviceVendor.HIKVISION,
    adapter: 'hikvision-isapi',
    vendorEventId: record.serialNo ? String(record.serialNo) : undefined,
    vendorUserId: userId,
    deviceTime,
    receivedAt: new Date().toISOString(),
    vendorPunchType: String(record.minor), // Minor event code preserved
    vendorVerificationType: mapHikvisionMinorToVerifyType(record.minor),
    source,
    rawPayload: {
      major: record.major,
      minor: record.minor,
      time: record.time,
      cardNo: record.cardNo,
      employeeNoString: record.employeeNoString,
      name: record.name,
      doorNo: record.doorNo,
      currentVerifyMode: record.currentVerifyMode,
      mask: record.mask,
      temperature: record.temperature,
      pictureURL: record.pictureURL,
    },
  };
}
