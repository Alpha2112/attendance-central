import {
  type RawAttendanceEvent,
  type DeviceModel,
  DeviceVendor,
  EventSource,
} from '@attendance/contracts';
import { type ZKAdmsLogRecord } from '../types/zkteco.types.js';
import { type AppLogger } from '@attendance/logging';
import { randomUUID } from 'node:crypto';

export interface AdmsPushParseResult {
  events: RawAttendanceEvent[];
  validCount: number;
  skippedCount: number;
  responseBody: string;
}

/**
 * Handles and parses incoming HTTP push data from ZKTeco devices configured in ADMS / ICLOCK mode.
 */
export class ZKTecoAdmsPushHandler {
  constructor(private readonly logger?: AppLogger) {}

  /**
   * Parses raw text body from POST /iclock/cdata?table=ATTLOG.
   */
  public parseAttLogBody(device: DeviceModel, bodyText: string): AdmsPushParseResult {
    const lines = bodyText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const events: RawAttendanceEvent[] = [];
    let skippedCount = 0;

    for (const line of lines) {
      try {
        const record = this.parseLine(line);
        if (!record || !record.pin || !record.time) {
          skippedCount++;
          continue;
        }

        // Parse time to ISO UTC
        const dateObj = new Date(record.time);
        const deviceTime = isNaN(dateObj.getTime())
          ? new Date().toISOString()
          : dateObj.toISOString();

        const rawEvent: RawAttendanceEvent = {
          eventId: randomUUID(),
          schemaVersion: 1,
          tenantId: device.tenantId ?? undefined,
          organizationId: device.organizationId,
          branchId: device.branchId ?? undefined,
          deviceId: device.id,
          deviceSerialNumber: device.serialNumber ?? `DEV-${device.id}`,
          vendor: DeviceVendor.ZKTECO,
          adapter: 'zkteco-adms',
          vendorUserId: record.pin,
          deviceTime,
          receivedAt: new Date().toISOString(),
          vendorPunchType: record.status || '0',
          vendorVerificationType: record.verify || '1',
          source: EventSource.PUSH,
          rawPayload: {
            line,
            pin: record.pin,
            time: record.time,
            status: record.status,
            verify: record.verify,
            workcode: record.workcode,
          },
        };

        events.push(rawEvent);
      } catch (err: unknown) {
        skippedCount++;
        this.logger?.warn(
          { line, error: err instanceof Error ? err.message : String(err) },
          'Failed to parse ZKTeco ADMS log row',
        );
      }
    }

    return {
      events,
      validCount: events.length,
      skippedCount,
      responseBody: `OK: ${events.length}`,
    };
  }

  /**
   * Parses a single ADMS log row. Supports key-value, tab-separated, and space-separated formats.
   */
  private parseLine(line: string): ZKAdmsLogRecord | null {
    // 1. Key-value format (e.g. PIN=457\tCHECKTIME=... or PIN=457 CHECKTIME=...)
    if (line.includes('=')) {
      const tokens = line.split(/[\t\s]+/);
      const kv: Record<string, string> = {};
      for (const token of tokens) {
        const eqIdx = token.indexOf('=');
        if (eqIdx !== -1) {
          const k = token.substring(0, eqIdx).trim().toUpperCase();
          const v = token.substring(eqIdx + 1).trim();
          kv[k] = v;
        }
      }
      if (kv['PIN'] || kv['USERID']) {
        return {
          pin: kv['PIN'] || kv['USERID'] || '',
          time: kv['CHECKTIME'] || kv['TIME'] || '',
          status: kv['CHECKTYPE'] || kv['STATUS'] || '0',
          verify: kv['VERIFYCODE'] || kv['VERIFY'] || '1',
          workcode: kv['WORKCODE'],
        };
      }
    }

    // 2. Tab separated format: PIN \t TIME \t STATUS \t VERIFY
    if (line.includes('\t')) {
      const parts = line.split('\t');
      return {
        pin: parts[0]?.trim() || '',
        time: parts[1]?.trim() || '',
        status: parts[2]?.trim() || '0',
        verify: parts[3]?.trim() || '1',
        workcode: parts[4]?.trim(),
      };
    }

    // 3. Fallback space-separated format: 457 2026-08-16 08:30:00 0 1
    const match = line.match(/^(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(\d+)\s+(\d+)/);
    if (match) {
      return {
        pin: match[1] || '',
        time: match[2] || '',
        status: match[3] || '0',
        verify: match[4] || '1',
      };
    }

    return null;
  }
}
