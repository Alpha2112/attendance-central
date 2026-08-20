import { type DatabaseClient } from '@attendance/database';
import { type AppLogger } from '@attendance/logging';
import { OutboxDispatcher } from '../outbox/outbox.dispatcher.js';

export interface ReplayResult {
  replayedCount: number;
  eventIds: string[];
}

export class ReplayService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly outboxDispatcher?: OutboxDispatcher,
    private readonly logger?: AppLogger,
  ) {}

  /**
   * Replays a specific outbox event by its unique event ID.
   */
  public async replayEvent(eventId: string, actorId = 'ADMIN'): Promise<boolean> {
    this.logger?.info({ eventId, actorId }, 'Initiating outbox event replay');

    await this.db.query(
      `UPDATE outbox_events 
       SET status = 'PENDING', available_at = NOW(6), attempt_count = 0, last_error = NULL 
       WHERE event_id = ?`,
      [eventId],
    );

    // Record audit trail
    await this.db.query(
      `INSERT INTO audit_logs (
        organization_id, actor_type, actor_id, action, resource_type, resource_id, correlation_id
      ) VALUES (?, 'USER', ?, 'REPLAY_OUTBOX_EVENT', 'OUTBOX', ?, ?)`,
      ['ORG-TECHIVE', actorId, eventId, `replay:${eventId}`],
    );

    if (this.outboxDispatcher) {
      await this.outboxDispatcher.processBatch(10);
    }

    return true;
  }

  /**
   * Replays all outbox events within a time range.
   */
  public async replayRange(
    startTime: string,
    endTime: string,
    actorId = 'ADMIN',
  ): Promise<ReplayResult> {
    this.logger?.info({ startTime, endTime, actorId }, 'Initiating time range outbox replay');

    const rows = (await this.db.query(
      `SELECT event_id FROM outbox_events 
       WHERE created_at BETWEEN ? AND ?`,
      [startTime, endTime],
    )) as Array<{ event_id: string }>;

    const eventList = Array.isArray(rows) ? rows : [];
    const eventIds = eventList.map((r) => r.event_id);

    if (eventIds.length > 0) {
      await this.db.query(
        `UPDATE outbox_events 
         SET status = 'PENDING', available_at = NOW(6), attempt_count = 0, last_error = NULL 
         WHERE created_at BETWEEN ? AND ?`,
        [startTime, endTime],
      );

      // Record audit log
      await this.db.query(
        `INSERT INTO audit_logs (
          organization_id, actor_type, actor_id, action, resource_type, resource_id, before_state, correlation_id
        ) VALUES (?, 'USER', ?, 'REPLAY_OUTBOX_RANGE', 'OUTBOX', 'BATCH', ?, ?)`,
        [
          'ORG-TECHIVE',
          actorId,
          JSON.stringify({ startTime, endTime, count: eventIds.length }),
          `replay:range:${Date.now()}`,
        ],
      );

      if (this.outboxDispatcher) {
        await this.outboxDispatcher.processBatch(50);
      }
    }

    return {
      replayedCount: eventIds.length,
      eventIds,
    };
  }
}
