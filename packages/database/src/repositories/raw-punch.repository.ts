import { DatabaseClient } from '../pool.js';
import { type RawPunchLogEntity, type CreateRawPunchLogDto } from '../entities/raw-punch.entity.js';
import { type ResultSetHeader, type PoolConnection } from 'mysql2/promise';

export class RawPunchLogRepository {
  constructor(private readonly client: DatabaseClient) {}

  public async insert(dto: CreateRawPunchLogDto, connection?: PoolConnection): Promise<number> {
    const sql = `
      INSERT INTO raw_punch_logs (
        event_date, tenant_id, organization_id, device_id, vendor,
        vendor_event_id, vendor_user_id, device_time, received_at,
        vendor_verification_code, vendor_punch_code, raw_payload,
        payload_hash, normalization_status, normalization_error_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      dto.eventDate,
      dto.tenantId || null,
      dto.organizationId,
      dto.deviceId,
      dto.vendor,
      dto.vendorEventId || null,
      dto.vendorUserId,
      dto.deviceTime,
      dto.receivedAt,
      dto.vendorVerificationCode || null,
      dto.vendorPunchCode || null,
      JSON.stringify(dto.rawPayload),
      dto.payloadHash,
      dto.normalizationStatus || 'PENDING',
      dto.normalizationErrorCode || null,
    ];

    if (connection) {
      const [result] = await connection.query(sql, params);
      return (result as ResultSetHeader).insertId;
    }

    const result = await this.client.query<ResultSetHeader>(sql, params);
    return result.insertId;
  }

  public async findById(id: number, eventDate: string): Promise<RawPunchLogEntity | null> {
    const rows = await this.client.query<RawPunchLogEntity[]>(
      'SELECT * FROM raw_punch_logs WHERE id = ? AND event_date = ? LIMIT 1',
      [id, eventDate],
    );
    return rows[0] || null;
  }

  public async updateNormalizationStatus(
    id: number,
    eventDate: string,
    status: string,
    errorCode?: string,
    connection?: PoolConnection,
  ): Promise<void> {
    const sql = `
      UPDATE raw_punch_logs
      SET normalization_status = ?, normalization_error_code = ?
      WHERE id = ? AND event_date = ?
    `;
    const params = [status, errorCode || null, id, eventDate];

    if (connection) {
      await connection.query(sql, params);
    } else {
      await this.client.query(sql, params);
    }
  }
}
