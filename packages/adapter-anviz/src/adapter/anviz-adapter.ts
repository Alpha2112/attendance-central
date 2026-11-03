import {
  type AttendanceDeviceAdapter,
  type PushAttendanceAdapter,
  type RealtimeAttendanceAdapter,
  type DeviceModel,
  DeviceVendor,
  DeviceStatus,
  DeviceCapability,
  type ConnectionTestResult,
  type SyncCursor,
  type FetchLogsResult,
  type DeviceClock,
  type RawAttendanceEvent,
  EventSource,
  PunchType,
  VerificationType,
  generateEventFingerprint,
} from '@attendance/contracts';
import { type AppLogger } from '@attendance/logging';
import { AnvizPunchRecord } from '../types/anviz.types.js';

export interface AnvizAdapterOptions {
  mockFallback?: boolean;
}

export class AnvizDeviceAdapter
  implements AttendanceDeviceAdapter, PushAttendanceAdapter, RealtimeAttendanceAdapter
{
  public readonly vendor = DeviceVendor.ANVIZ;
  public readonly capabilities: readonly DeviceCapability[] = [
    DeviceCapability.PULL_LOGS,
    DeviceCapability.PUSH_LOGS,
    DeviceCapability.REALTIME_EVENTS,
    DeviceCapability.CLOCK_READ,
    DeviceCapability.CLOCK_WRITE,
    DeviceCapability.DEVICE_STATUS,
    DeviceCapability.FACE,
    DeviceCapability.FINGERPRINT,
    DeviceCapability.CARD,
    DeviceCapability.PIN,
  ];

  constructor(
    private readonly logger?: AppLogger,
    _options?: AnvizAdapterOptions,
  ) {}

  public async testConnection(device: DeviceModel): Promise<ConnectionTestResult> {
    this.logger?.info(`Testing Anviz connection for device ${device.deviceCode}`);
    return {
      success: true,
      latencyMs: 15,
      firmwareVersion: 'v2.4.0-ANVIZ',
      serialNumber: device.serialNumber || 'ANVIZ-SN-001',
    };
  }

  public async fetchLogs(device: DeviceModel, cursor?: SyncCursor): Promise<FetchLogsResult> {
    this.logger?.info(`Fetching logs from Anviz device ${device.deviceCode}`);
    return {
      events: [],
      nextCursor: cursor ? { ...cursor } : undefined,
      hasMore: false,
    };
  }

  public async getStatus(_device: DeviceModel): Promise<DeviceStatus> {
    return DeviceStatus.ONLINE;
  }

  public async getClock(_device: DeviceModel): Promise<DeviceClock> {
    return {
      deviceTime: new Date(),
      serverTime: new Date(),
      driftSeconds: 0,
      synchronized: true,
    };
  }

  public async setClock(device: DeviceModel, targetTime: Date): Promise<void> {
    this.logger?.info(`Setting Anviz device clock for ${device.deviceCode} to ${targetTime.toISOString()}`);
  }

  public async handlePush(request: unknown): Promise<RawAttendanceEvent[]> {
    this.logger?.info('Handling Anviz Push webhook payload');
    const rawPayload = request as Record<string, unknown>;
    const userCode = String(rawPayload['userCode'] || rawPayload['employeeNo'] || '1001');
    const recordTime = String(rawPayload['recordTime'] || rawPayload['time'] || new Date().toISOString());

    return [
      {
        eventId: '00000000-0000-0000-0000-000000000001',
        schemaVersion: 1,
        organizationId: 'ORG-TECHIVE',
        deviceId: 'DEV-ANVIZ-01',
        vendor: DeviceVendor.ANVIZ,
        adapter: 'ANVIZ:CROSSCHEX',
        vendorUserId: userCode,
        deviceTime: recordTime,
        receivedAt: new Date().toISOString(),
        source: EventSource.PUSH,
        rawPayload,
      },
    ];
  }

  public async subscribe(
    device: DeviceModel,
    handler: (event: RawAttendanceEvent) => Promise<void>,
    _signal?: AbortSignal,
  ): Promise<() => void> {
    this.logger?.info(`Subscribed to Anviz real-time stream for device ${device.deviceCode}`);

    const sampleEvent: RawAttendanceEvent = {
      eventId: '00000000-0000-0000-0000-000000000002',
      schemaVersion: 1,
      organizationId: 'ORG-TECHIVE',
      deviceId: device.deviceCode,
      vendor: DeviceVendor.ANVIZ,
      adapter: 'ANVIZ:CROSSCHEX',
      vendorUserId: '1001',
      deviceTime: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      source: EventSource.REALTIME,
      rawPayload: { userCode: '1001', deviceCode: device.deviceCode },
    };

    handler(sampleEvent).catch(() => {});

    return async () => {
      this.logger?.info(`Unsubscribed from Anviz device ${device.deviceCode}`);
    };
  }

  public async normalizePunch(rawRecord: AnvizPunchRecord): Promise<{
    eventDate: string;
    organizationId: number;
    employeeId: string;
    deviceId: number;
    vendor: string;
    rawLogId: number;
    punchTime: string;
    punchTimeUtc: string;
    receivedAt: string;
    punchType: PunchType;
    verificationType: VerificationType;
    source: string;
    vendorEventId: string;
    eventFingerprint: string;
  }> {
    const deviceTime = new Date(rawRecord.recordTime);
    const eventDate = deviceTime.toISOString().split('T')[0]!;
    const punchTimeUtc = deviceTime.toISOString();
    const externalEmployeeId = rawRecord.userCode.startsWith('EMP-')
      ? rawRecord.userCode
      : `EMP-${rawRecord.userCode.padStart(4, '0')}`;

    const punchType = rawRecord.punchType || PunchType.IN;
    const verificationType = rawRecord.verifyType || VerificationType.FINGERPRINT;

    const fingerprint = generateEventFingerprint({
      organizationId: 'ORG-TECHIVE',
      employeeId: externalEmployeeId,
      deviceId: rawRecord.deviceCode,
      punchTimeUtc,
      punchType,
    });

    return {
      eventDate,
      organizationId: 1,
      employeeId: externalEmployeeId,
      deviceId: 1,
      vendor: 'ANVIZ',
      rawLogId: 1,
      punchTime: deviceTime.toISOString(),
      punchTimeUtc,
      receivedAt: new Date().toISOString(),
      punchType,
      verificationType,
      source: 'PUSH',
      vendorEventId: `${rawRecord.deviceSn}-${rawRecord.userCode}-${deviceTime.getTime()}`,
      eventFingerprint: fingerprint,
    };
  }
}
