import { DeviceVendor, DeviceStatus } from '../enums.js';
import { RawAttendanceEvent } from '../events/raw-attendance.event.js';
import { DeviceModel } from '../models/device.model.js';

/**
 * Biometric terminal capability declarations.
 */
export enum DeviceCapability {
  PULL_LOGS = 'PULL_LOGS',
  PUSH_LOGS = 'PUSH_LOGS',
  REALTIME_EVENTS = 'REALTIME_EVENTS',
  USER_MAPPING = 'USER_MAPPING',
  CLOCK_READ = 'CLOCK_READ',
  CLOCK_WRITE = 'CLOCK_WRITE',
  DEVICE_STATUS = 'DEVICE_STATUS',
  FACE = 'FACE',
  FINGERPRINT = 'FINGERPRINT',
  CARD = 'CARD',
  PALM = 'PALM',
  PIN = 'PIN',
}

/**
 * Result of testing connectivity to a hardware terminal.
 */
export interface ConnectionTestResult {
  success: boolean;
  latencyMs?: number;
  error?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  details?: Record<string, unknown>;
}

/**
 * Incremental synchronization checkpoint cursor.
 */
export interface SyncCursor {
  cursor?: string;
  lastLogTimestamp?: string;
  lastLogIndex?: number;
  custom?: Record<string, unknown>;
}

/**
 * Result of fetching historical logs from a terminal.
 */
export interface FetchLogsResult {
  events: RawAttendanceEvent[];
  nextCursor?: SyncCursor;
  hasMore: boolean;
  checkpoint?: string;
}

/**
 * Hardware Real-Time Clock (RTC) state.
 */
export interface DeviceClock {
  deviceTime: Date;
  serverTime: Date;
  driftSeconds: number;
  synchronized: boolean;
}

/**
 * Base device adapter contract required for all vendor implementations.
 */
export interface AttendanceDeviceAdapter {
  readonly vendor: DeviceVendor | string;
  readonly capabilities: readonly DeviceCapability[];

  /**
   * Probes network reachability and authenticates with device.
   */
  testConnection(device: DeviceModel, signal?: AbortSignal): Promise<ConnectionTestResult>;

  /**
   * Pulls incremental attendance logs since cursor.
   */
  fetchLogs(
    device: DeviceModel,
    cursor?: SyncCursor,
    signal?: AbortSignal,
  ): Promise<FetchLogsResult>;

  /**
   * Queries real-time hardware status.
   */
  getStatus(device: DeviceModel, signal?: AbortSignal): Promise<DeviceStatus>;

  /**
   * Optional: Retrieves device hardware and firmware metadata.
   */
  getDeviceInfo?(device: DeviceModel, signal?: AbortSignal): Promise<Record<string, unknown>>;

  /**
   * Optional: Queries device clock and evaluates drift against server time.
   */
  getClock?(device: DeviceModel, signal?: AbortSignal): Promise<DeviceClock>;

  /**
   * Optional: Synchronizes device clock to target timestamp.
   */
  setClock?(device: DeviceModel, timestamp: Date, signal?: AbortSignal): Promise<void>;
}

/**
 * Extension for devices pushing events over HTTP/TCP (e.g. ADMS, ISAPI listeners).
 */
export interface PushAttendanceAdapter {
  handlePush(request: unknown): Promise<RawAttendanceEvent[]>;
}

/**
 * Extension for devices streaming realtime events over WebSockets/SDK connections.
 */
export interface RealtimeAttendanceAdapter {
  subscribe(
    device: DeviceModel,
    handler: (event: RawAttendanceEvent) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<() => void>;
}
