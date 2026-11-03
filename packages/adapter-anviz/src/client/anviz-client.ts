import { AppLogger } from '@attendance/logging';
import { AnvizDeviceConfig, AnvizPunchRecord, AnvizAuthMode } from '../types/anviz.types.js';
import { VerificationType, PunchType } from '@attendance/contracts';

export class AnvizClient {
  constructor(
    private readonly config: AnvizDeviceConfig,
    private readonly logger?: AppLogger,
  ) {}

  public async getAttendanceRecords(_limit = 100): Promise<AnvizPunchRecord[]> {
    this.logger?.info('Fetching attendance records from Anviz device');

    // Anviz protocol communication simulation / HTTP CrossChex endpoint fallback
    return [];
  }

  public parseAnvizPayload(payload: Record<string, unknown>): AnvizPunchRecord {
    const userCode = String(payload['userCode'] || payload['employeeNo'] || payload['UserCode'] || '1001');
    const recordTime = String(payload['recordTime'] || payload['time'] || payload['RecordTime'] || new Date().toISOString());
    const rawAuthMode = Number(payload['authMode'] || payload['VerifyType'] || 0x01);

    let authMode = AnvizAuthMode.FINGERPRINT;
    let verifyType = VerificationType.FINGERPRINT;

    if (rawAuthMode === 0x03 || rawAuthMode === 0x30 || String(payload['type']).toLowerCase().includes('face')) {
      authMode = AnvizAuthMode.FACE;
      verifyType = VerificationType.FACE;
    } else if (rawAuthMode === 0x02 || rawAuthMode === 0x20 || String(payload['type']).toLowerCase().includes('card')) {
      authMode = AnvizAuthMode.CARD;
      verifyType = VerificationType.CARD;
    } else if (rawAuthMode === 0x04 || rawAuthMode === 0x40 || String(payload['type']).toLowerCase().includes('pin')) {
      authMode = AnvizAuthMode.PIN;
      verifyType = VerificationType.PIN;
    }

    return {
      deviceCode: this.config.deviceSn || `DEV-ANVIZ-${this.config.host}`,
      deviceSn: this.config.deviceSn || 'ANVIZ-SN-001',
      userCode,
      recordTime,
      authMode,
      verifyType,
      punchType: PunchType.IN,
      rawPayload: payload,
    };
  }
}
