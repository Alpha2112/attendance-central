import crypto from 'node:crypto';
import { type PunchType } from '../enums.js';

export interface AttendanceFingerprintInput {
  organizationId: string | number;
  employeeId: string;
  deviceId: string | number;
  punchTimeUtc: string | Date;
  punchType: PunchType | string;
  source?: string;
}

export interface RawPunchFingerprintInput {
  organizationId: string | number;
  deviceId: string | number;
  vendorUserId: string;
  deviceTime: string | Date;
  vendorPunchType?: string;
}

export function generateEventFingerprint(input: AttendanceFingerprintInput): string {
  const punchTimeStr =
    input.punchTimeUtc instanceof Date
      ? input.punchTimeUtc.toISOString()
      : new Date(input.punchTimeUtc).toISOString();

  // Normalize components to deterministic canonical string
  const payload = [
    String(input.organizationId).trim(),
    String(input.employeeId).trim().toUpperCase(),
    String(input.deviceId).trim(),
    punchTimeStr,
    String(input.punchType).trim().toUpperCase(),
  ].join('|');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function generateRawEventFingerprint(input: RawPunchFingerprintInput): string {
  const deviceTimeStr =
    input.deviceTime instanceof Date
      ? input.deviceTime.toISOString()
      : new Date(input.deviceTime).toISOString();

  const payload = [
    String(input.organizationId).trim(),
    String(input.deviceId).trim(),
    String(input.vendorUserId).trim(),
    deviceTimeStr,
    String(input.vendorPunchType || 'UNKNOWN')
      .trim()
      .toUpperCase(),
  ].join('|');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function computePayloadHash(payload: unknown): string {
  const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHash('sha256').update(jsonStr).digest('hex');
}
