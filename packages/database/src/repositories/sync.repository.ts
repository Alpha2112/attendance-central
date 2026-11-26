import { DatabaseClient } from '../pool.js';
import {
  type SyncJobEntity,
  type SyncCheckpointEntity,
  type CreateSyncJobDto,
} from '../entities/sync.entity.js';
import { type ResultSetHeader } from 'mysql2/promise';

export class SyncRepository {
  constructor(private readonly client: DatabaseClient) {}

  public async findJobById(id: number): Promise<SyncJobEntity | null> {
    const rows = await this.client.query<SyncJobEntity[]>(
      'SELECT * FROM sync_jobs WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] || null;
  }

  /** Lists sync jobs for the history view, newest first, with optional filters. */
  public async listJobs(filters?: {
    deviceId?: number;
    status?: string;
    jobType?: string;
    limit?: number;
  }): Promise<SyncJobEntity[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters?.deviceId) {
      conditions.push('device_id = ?');
      params.push(filters.deviceId);
    }
    if (filters?.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    if (filters?.jobType) {
      conditions.push('job_type = ?');
      params.push(filters.jobType);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 500);
    params.push(limit);
    return this.client.query<SyncJobEntity[]>(
      `SELECT * FROM sync_jobs ${where} ORDER BY requested_at DESC, id DESC LIMIT ?`,
      params,
    );
  }

  public async createJob(dto: CreateSyncJobDto): Promise<number> {
    const result = await this.client.query<ResultSetHeader>(
      `INSERT INTO sync_jobs (organization_id, device_id, job_type, date_from, date_to, requested_by, requested_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'QUEUED')`,
      [
        dto.organizationId,
        dto.deviceId,
        dto.jobType,
        dto.dateFrom ?? null,
        dto.dateTo ?? null,
        dto.requestedBy,
        dto.requestedAt || new Date(),
      ],
    );
    return result.insertId;
  }

  public async updateJobProgress(
    id: number,
    progress: {
      status?: string;
      startedAt?: Date;
      completedAt?: Date;
      recordsReceived?: number;
      recordsInserted?: number;
      duplicates?: number;
      errors?: number;
      errorCode?: string;
      errorMessage?: string;
    },
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (progress.status) {
      sets.push('status = ?');
      params.push(progress.status);
    }
    if (progress.startedAt) {
      sets.push('started_at = ?');
      params.push(progress.startedAt);
    }
    if (progress.completedAt) {
      sets.push('completed_at = ?');
      params.push(progress.completedAt);
    }
    if (progress.recordsReceived !== undefined) {
      sets.push('records_received = ?');
      params.push(progress.recordsReceived);
    }
    if (progress.recordsInserted !== undefined) {
      sets.push('records_inserted = ?');
      params.push(progress.recordsInserted);
    }
    if (progress.duplicates !== undefined) {
      sets.push('duplicates = ?');
      params.push(progress.duplicates);
    }
    if (progress.errors !== undefined) {
      sets.push('errors = ?');
      params.push(progress.errors);
    }
    if (progress.errorCode) {
      sets.push('error_code = ?');
      params.push(progress.errorCode);
    }
    if (progress.errorMessage) {
      sets.push('error_message = ?');
      params.push(progress.errorMessage);
    }

    if (sets.length === 0) return;

    params.push(id);
    await this.client.query(`UPDATE sync_jobs SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  public async getCheckpoint(
    deviceId: number,
    streamType: string,
  ): Promise<SyncCheckpointEntity | null> {
    const rows = await this.client.query<SyncCheckpointEntity[]>(
      'SELECT * FROM sync_checkpoints WHERE device_id = ? AND stream_type = ? LIMIT 1',
      [deviceId, streamType],
    );
    return rows[0] || null;
  }

  public async saveCheckpoint(
    deviceId: number,
    streamType: string,
    lastVendorEventId?: string,
    lastEventTime?: Date,
    cursor?: Record<string, unknown>,
  ): Promise<void> {
    await this.client.query(
      `INSERT INTO sync_checkpoints (device_id, stream_type, last_vendor_event_id, last_event_time, \`cursor\`)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         last_vendor_event_id = VALUES(last_vendor_event_id),
         last_event_time = VALUES(last_event_time),
         \`cursor\` = VALUES(\`cursor\`),
         updated_at = CURRENT_TIMESTAMP(6)`,
      [
        deviceId,
        streamType,
        lastVendorEventId || null,
        lastEventTime || null,
        cursor ? JSON.stringify(cursor) : null,
      ],
    );
  }
}
