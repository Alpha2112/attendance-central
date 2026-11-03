import { VerificationType, PunchType } from '@attendance/contracts';

export enum AnvizAuthMode {
  FINGERPRINT = 0x01,
  CARD = 0x02,
  FACE = 0x03,
  PIN = 0x04,
  FP_AND_CARD = 0x11,
  FACE_AND_CARD = 0x31,
  UNKNOWN = 0xff,
}

export enum AnvizCommand {
  GET_RECORD_COUNT = 0x3c,
  GET_RECORDS = 0x40,
  GET_DEVICE_INFO = 0x30,
  SET_DEVICE_TIME = 0x38,
}

export interface AnvizPunchRecord {
  deviceCode: string;
  deviceSn: string;
  userCode: string; // Employee ID / Badge No
  recordTime: string; // ISO 8601 timestamp
  authMode: AnvizAuthMode;
  punchType?: PunchType;
  verifyType?: VerificationType;
  rawPayload?: Record<string, unknown>;
}

export interface AnvizDeviceConfig {
  host: string;
  port: number; // Default 5010 for TCP or 80/443 for Push
  deviceId?: number;
  deviceSn?: string;
  communicationPassword?: number;
  timeoutMs?: number;
  useHttps?: boolean;
}
