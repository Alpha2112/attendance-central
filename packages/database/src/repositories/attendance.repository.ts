import { DatabaseClient } from '../pool.js';
import {
  type AttendanceLogEntity,
  type CreateAttendanceLogDto,
} from '../entities/attendance.entity.js';
import { type ResultSetHeader, type PoolConnection } from 'mysql2/promise';

export interface InsertAttendanceResult {
  inserted: boolean;
  duplicate: boolean;
  id?: number;
}

export interface KeysetPaginationOptions {
  organizationId: number;
  employeeId?: string;
  deviceId?: number;
  branchId?: number;
  limit?: number;
  cursor?: {
    punchTimeUtc: string;
    id: number;
  };
}

export class AttendanceLogRepository {
  constructor(private readonly client: DatabaseClient) {}

  public async insertIdempotent(
    dto: CreateAttendanceLogDto,
    connection?: PoolConnection,
  ): Promise<InsertAttendanceResult> {
    const sql = `
      INSERT INTO attendance_logs (
        event_date, tenant_id, organization_id, branch_id, employee_id,
        device_id, vendor, raw_log_id, punch_time, punch_time_utc,
        device_timestamp, received_at, punch_type, verification_type,
        clock_offset_seconds, source, vendor_event_id, event_fingerprint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      dto.eventDate,
      dto.tenantId || null,
      dto.organizationId,
      dto.branchId || null,
      dto.employeeId,
      dto.deviceId,
      dto.vendor,
      dto.rawLogId,
      dto.punchTime,
      dto.punchTimeUtc,
      dto.deviceTimestamp || null,
      dto.receivedAt,
      dto.punchType,
      dto.verificationType,
      dto.clockOffsetSeconds || null,
      dto.source || 'PUSH',
      dto.vendorEventId || null,
      dto.eventFingerprint,
    ];

    try {
      if (connection) {
        const [result] = await connection.query(sql, params);
        return {
          inserted: true,
          duplicate: false,
          id: (result as ResultSetHeader).insertId,
        };
      }

      const result = await this.client.query<ResultSetHeader>(sql, params);
      return {
        inserted: true,
        duplicate: false,
        id: result.insertId,
      };
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'errno' in error &&
        (error as { errno: number }).errno === 1062
      ) {
        // Duplicate key error (uq_attendance_fingerprint constraint violated)
        return {
          inserted: false,
          duplicate: true,
        };
      }
      throw error;
    }
  }

  public async findById(id: number, eventDate: string): Promise<AttendanceLogEntity | null> {
    const rows = await this.client.query<AttendanceLogEntity[]>(
      'SELECT * FROM attendance_logs WHERE id = ? AND event_date = ? LIMIT 1',
      [id, eventDate],
    );
    return rows[0] || null;
  }

  public async findKeyset(options: KeysetPaginationOptions): Promise<{
    items: AttendanceLogEntity[];
    nextCursor?: { punchTimeUtc: string; id: number };
  }> {
    const limit = Math.min(options.limit || 50, 1000);
    const conditions: string[] = ['organization_id = ?'];
    const params: unknown[] = [options.organizationId];

    if (options.employeeId) {
      conditions.push('employee_id = ?');
      params.push(options.employeeId);
    }
    if (options.deviceId) {
      conditions.push('device_id = ?');
      params.push(options.deviceId);
    }
    if (options.branchId) {
      conditions.push('branch_id = ?');
      params.push(options.branchId);
    }

    if (options.cursor) {
      conditions.push('(punch_time_utc < ? OR (punch_time_utc = ? AND id < ?))');
      params.push(options.cursor.punchTimeUtc, options.cursor.punchTimeUtc, options.cursor.id);
    }

    const sql = `
      SELECT * FROM attendance_logs
      WHERE ${conditions.join(' AND ')}
      ORDER BY punch_time_utc DESC, id DESC
      LIMIT ?
    `;
    params.push(limit + 1); // fetch +1 to determine hasNext

    const rows = await this.client.query<AttendanceLogEntity[]>(sql, params);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor: { punchTimeUtc: string; id: number } | undefined = undefined;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1]!;
      nextCursor = {
        punchTimeUtc: last.punch_time_utc.toISOString(),
        id: last.id,
      };
    }

    return { items, nextCursor };
  }
}
