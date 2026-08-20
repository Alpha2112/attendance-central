import {
  DeviceVendor,
  PunchType,
  VerificationType,
  EventSource,
  DeviceStatus,
} from '@attendance/contracts';

export enum FailureMode {
  NONE = 'NONE',
  TIMEOUT = 'TIMEOUT',
  AUTH_FAILURE = 'AUTH_FAILURE',
  MALFORMED_PAYLOAD = 'MALFORMED_PAYLOAD',
  NETWORK_DROP = 'NETWORK_DROP',
  CLOCK_DRIFT = 'CLOCK_DRIFT',
}

export interface SimulatorConfig {
  organizationId: string;
  branchId?: string;
  deviceId: string;
  deviceSerialNumber?: string;
  vendor: DeviceVendor | string;
  adapter: string;
  defaultLatencyMs?: number;
  failureMode?: FailureMode;
  clockDriftSeconds?: number;
}

export interface GeneratePunchOptions {
  vendorUserId?: string;
  deviceTime?: Date | string;
  receivedAt?: Date | string;
  punchType?: PunchType | string;
  verificationType?: VerificationType | string;
  source?: EventSource;
  eventId?: string;
  rawPayload?: unknown;
  metadata?: Record<string, unknown>;
}

export interface OfflineBacklogResult {
  deviceStatusTransitions: Array<{ status: DeviceStatus; timestamp: string }>;
  punches: Array<import('@attendance/contracts').RawAttendanceEvent>;
  clockDriftSecondsApplied: number;
}

export interface MockDeviceState {
  connected: boolean;
  authenticated: boolean;
  status: DeviceStatus;
  lastHeartbeat: Date | null;
  logsInBuffer: number;
}
