import { DatabaseClient } from '../pool.js';
import { type OutboxEventEntity, type CreateOutboxEventDto } from '../entities/outbox.entity.js';
import { type ResultSetHeader, type PoolConnection } from 'mysql2/promise';

export class OutboxRepository {
  constructor(private readonly client: DatabaseClient) {}

  public async create(dto: CreateOutboxEventDto, connection?: PoolConnection): Promise<number> {
    const sql = dto.availableAt
      ? `INSERT INTO outbox_events (
          event_id, event_type, aggregate_type, aggregate_id,
          payload, status, available_at
        ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`
      : `INSERT INTO outbox_events (
          event_id, event_type, aggregate_type, aggregate_id,
          payload, status, available_at
        ) VALUES (?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP(6))`;

    const params: unknown[] = [
      dto.eventId,
      dto.eventType,
      dto.aggregateType,
      dto.aggregateId,
      JSON.stringify(dto.payload),
    ];

    if (dto.availableAt) {
      params.push(dto.availableAt);
    }

    if (connection) {
      const [result] = await connection.query(sql, params);
      return (result as ResultSetHeader).insertId;
    }

    const result = await this.client.query<ResultSetHeader>(sql, params);
    return result.insertId;
  }

  public async fetchPending(limit: number = 100): Promise<OutboxEventEntity[]> {
    return this.client.query<OutboxEventEntity[]>(
      `SELECT * FROM outbox_events
       WHERE status = 'PENDING' AND available_at <= (CURRENT_TIMESTAMP(6) + INTERVAL 1 SECOND)
       ORDER BY id ASC
       LIMIT ?`,
      [limit],
    );
  }

  public async findByEventId(eventId: string): Promise<OutboxEventEntity | null> {
    const rows = await this.client.query<OutboxEventEntity[]>(
      'SELECT * FROM outbox_events WHERE event_id = ? LIMIT 1',
      [eventId],
    );
    return rows[0] || null;
  }

  public async markPublished(eventId: string): Promise<void> {
    await this.client.query(
      `UPDATE outbox_events
       SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP(6)
       WHERE event_id = ?`,
      [eventId],
    );
  }

  public async markFailed(eventId: string, errorMessage: string): Promise<void> {
    await this.client.query(
      `UPDATE outbox_events
       SET attempt_count = attempt_count + 1, last_error = ?
       WHERE event_id = ?`,
      [errorMessage, eventId],
    );
  }
}
