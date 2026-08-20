import crypto from 'node:crypto';
import {
  type RawAttendanceEvent,
  EventSource,
  DeviceVendor,
  PunchType,
  VerificationType,
  DeviceStatus,
} from '@attendance/contracts';
import {
  type SimulatorConfig,
  type GeneratePunchOptions,
  type OfflineBacklogResult,
  FailureMode,
} from '../types/simulator.types.js';

export class DeviceSimulator {
  private readonly config: SimulatorConfig;

  constructor(config: SimulatorConfig) {
    this.config = {
      defaultLatencyMs: 25,
      failureMode: FailureMode.NONE,
      clockDriftSeconds: 0,
      ...config,
    };
  }

  public generatePunch(options: GeneratePunchOptions = {}): RawAttendanceEvent {
    const eventId = options.eventId || crypto.randomUUID();
    const vendorUserId = options.vendorUserId || '457';

    // Apply clock drift if configured
    const baseTime = options.deviceTime ? new Date(options.deviceTime) : new Date();
    if (this.config.clockDriftSeconds) {
      baseTime.setSeconds(baseTime.getSeconds() + this.config.clockDriftSeconds);
    }
    const deviceTime = baseTime.toISOString();
    const receivedAt = options.receivedAt
      ? new Date(options.receivedAt).toISOString()
      : new Date().toISOString();

    const punchTypeStr = options.punchType || PunchType.IN;
    const verificationTypeStr = options.verificationType || VerificationType.FINGERPRINT;

    const rawPayload =
      options.rawPayload !== undefined
        ? options.rawPayload
        : this.buildVendorRawPayload(vendorUserId, punchTypeStr, verificationTypeStr, deviceTime);

    return {
      eventId,
      schemaVersion: 1,
      organizationId: this.config.organizationId,
      branchId: this.config.branchId,
      deviceId: this.config.deviceId,
      deviceSerialNumber: this.config.deviceSerialNumber || `SN-${this.config.deviceId}`,
      vendor: this.config.vendor,
      adapter: this.config.adapter,
      vendorUserId,
      deviceTime,
      receivedAt,
      vendorPunchType: String(punchTypeStr),
      vendorVerificationType: String(verificationTypeStr),
      source: options.source || EventSource.PUSH,
      rawPayload,
      metadata: options.metadata || { simulator: true, generatedAt: new Date().toISOString() },
    };
  }

  public generateDuplicates(
    basePunch: RawAttendanceEvent,
    count: number = 10,
  ): RawAttendanceEvent[] {
    const duplicates: RawAttendanceEvent[] = [];

    for (let i = 0; i < count; i++) {
      duplicates.push({
        ...basePunch,
        // New unique event ID per delivery attempt
        eventId: crypto.randomUUID(),
        // Same logical punch metadata (same device, user, deviceTime, vendor payload)
        receivedAt: new Date(Date.now() + i * 100).toISOString(),
        metadata: {
          ...basePunch.metadata,
          duplicateIndex: i + 1,
          isSimulatedDuplicate: true,
        },
      });
    }

    return duplicates;
  }

  public generateBatch(
    count: number = 100,
    options: {
      startTime?: Date;
      intervalSeconds?: number;
      userPool?: string[];
    } = {},
  ): RawAttendanceEvent[] {
    const punches: RawAttendanceEvent[] = [];
    const startTime = options.startTime
      ? options.startTime.getTime()
      : Date.now() - count * 60 * 1000;
    const intervalMs = (options.intervalSeconds || 60) * 1000;
    const userPool = options.userPool || ['457', '458', '459', '460', '461'];

    for (let i = 0; i < count; i++) {
      const punchTime = new Date(startTime + i * intervalMs);
      const user = userPool[i % userPool.length]!;
      const isMorning = i % 2 === 0;

      punches.push(
        this.generatePunch({
          vendorUserId: user,
          deviceTime: punchTime,
          receivedAt: new Date(punchTime.getTime() + 1500),
          punchType: isMorning ? PunchType.IN : PunchType.OUT,
          verificationType: i % 3 === 0 ? VerificationType.FACE : VerificationType.FINGERPRINT,
          source: EventSource.PULL,
        }),
      );
    }

    return punches;
  }

  public simulateOfflinePeriod(
    durationHours: number = 8,
    ratePerHour: number = 20,
    clockDriftSeconds: number = 120, // 2 minutes drift during offline
  ): OfflineBacklogResult {
    const now = Date.now();
    const offlineStart = now - durationHours * 3600 * 1000;
    const totalPunches = durationHours * ratePerHour;
    const intervalMs = (durationHours * 3600 * 1000) / totalPunches;

    const deviceStatusTransitions = [
      { status: DeviceStatus.OFFLINE, timestamp: new Date(offlineStart).toISOString() },
      { status: DeviceStatus.ONLINE, timestamp: new Date(now).toISOString() },
    ];

    const punches: RawAttendanceEvent[] = [];
    const userPool = ['457', '458', '459', '460', '461', '462', '463', '464'];

    for (let i = 0; i < totalPunches; i++) {
      // Calculate timestamp with progressive clock drift
      const punchTime = new Date(
        offlineStart + i * intervalMs + (i / totalPunches) * clockDriftSeconds * 1000,
      );

      punches.push(
        this.generatePunch({
          vendorUserId: userPool[i % userPool.length]!,
          deviceTime: punchTime,
          // Received at time when device reconnected and uploaded buffer
          receivedAt: new Date(now + i * 50).toISOString(),
          source: EventSource.RECONCILIATION,
          metadata: {
            offlineBuffered: true,
            offlineDurationHours: durationHours,
          },
        }),
      );
    }

    return {
      deviceStatusTransitions,
      punches,
      clockDriftSecondsApplied: clockDriftSeconds,
    };
  }

  public simulateOutOfOrder(punches: RawAttendanceEvent[]): RawAttendanceEvent[] {
    const shuffled = [...punches];
    // Deterministic interleaving: reverse order chunks
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      const temp = shuffled[i]!;
      shuffled[i] = shuffled[i + 1]!;
      shuffled[i + 1] = temp;
    }
    return shuffled;
  }

  public simulateMalformedPayload(
    type: 'MISSING_USER_ID' | 'INVALID_DATE' | 'CORRUPT_JSON',
  ): RawAttendanceEvent | Record<string, unknown> {
    const base = this.generatePunch();

    switch (type) {
      case 'MISSING_USER_ID':
        return {
          ...base,
          vendorUserId: '',
        };
      case 'INVALID_DATE':
        return {
          ...base,
          deviceTime: 'invalid-date-string-not-iso8601',
        };
      case 'CORRUPT_JSON':
        return {
          ...base,
          rawPayload: '{"unclosed_json: true',
        };
    }
  }

  private buildVendorRawPayload(
    vendorUserId: string,
    punchType: string,
    verificationType: string,
    deviceTime: string,
  ): Record<string, unknown> {
    const v = String(this.config.vendor).toUpperCase();

    if (v.includes(DeviceVendor.ZKTECO) || v === 'ZKTECO') {
      return {
        pin: vendorUserId,
        time: deviceTime,
        status: punchType === PunchType.IN ? '0' : '1',
        verified: verificationType === VerificationType.FACE ? '15' : '1',
        workcode: '0',
      };
    }

    if (v.includes(DeviceVendor.HIKVISION) || v === 'HIKVISION') {
      return {
        AccessControllerEvent: {
          employeeNoString: vendorUserId,
          attendanceStatus: punchType === PunchType.IN ? 'checkIn' : 'checkOut',
          currentVerifyMode: verificationType === VerificationType.FACE ? 'face' : 'fp',
          time: deviceTime,
          serialNo: this.config.deviceSerialNumber || 'HIK-999',
        },
      };
    }

    return {
      userId: vendorUserId,
      eventTime: deviceTime,
      type: punchType,
      method: verificationType,
    };
  }
}
