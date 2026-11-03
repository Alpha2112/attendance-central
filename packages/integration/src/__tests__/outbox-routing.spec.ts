import { describe, it, expect, vi } from 'vitest';
import { OutboxDispatcher } from '../outbox/outbox.dispatcher.js';
import { type DatabaseClient } from '@attendance/database';
import { createLogger } from '@attendance/logging';

const logger = createLogger({ serviceName: 'outbox-routing-test', level: 'silent' });

/** Builds a mock DatabaseClient whose query() returns the given results in order. */
function mockDbSequence(results: unknown[]): {
  db: DatabaseClient;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn();
  for (const r of results) query.mockResolvedValueOnce(r);
  query.mockResolvedValue([{ affectedRows: 1 }]); // default for trailing UPDATEs
  return { db: { query } as unknown as DatabaseClient, query };
}

const outboxRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  event_id: 'evt-1',
  event_type: 'attendance.normalized.v1',
  aggregate_type: 'ATTENDANCE',
  aggregate_id: 'SUP-GSDK-01',
  organization_id: 1,
  payload: JSON.stringify({ deviceId: 'SUP-GSDK-01', punchType: 'OUT', branchId: 5 }),
  status: 'PENDING',
  attempt_count: 0,
  ...overrides,
});

describe('OutboxDispatcher routing', () => {
  it('skips a subscriber whose punchType filter does not match the event', async () => {
    const { db, query } = mockDbSequence([
      [outboxRow()], // pending events
      [
        {
          id: 10,
          organization_id: '1',
          name: 'IN-only HRMS',
          target_type: 'HRMS_WEBHOOK',
          endpoint_url: 'http://127.0.0.1:9/never',
          auth_type: 'HMAC_SHA256',
          retry_limit: 3,
          timeout_ms: 50,
          filter_rules: JSON.stringify({ punchType: ['IN'] }), // event is OUT -> no match
        },
      ],
    ]);

    const result = await new OutboxDispatcher(db, undefined, logger).processBatch(10);

    // With no matching subscriber the event is published, and nothing is delivered.
    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE outbox_events SET status = 'PUBLISHED'"),
      [1],
    );
  });

  it('scopes the subscriber lookup to the event organization', async () => {
    const { db, query } = mockDbSequence([[outboxRow({ organization_id: 7 })], []]);

    await new OutboxDispatcher(db, undefined, logger).processBatch(10);

    // getSubscribers must constrain by organization_id and pass it as a param.
    const subscriberCall = query.mock.calls.find((c) =>
      String(c[0]).includes('FROM integrations i'),
    );
    expect(subscriberCall).toBeDefined();
    expect(String(subscriberCall![0])).toContain('i.organization_id = ?');
    expect(subscriberCall![1]).toContain(7);
  });

  it('delivers to a subscriber whose branch filter matches the event', async () => {
    const { db } = mockDbSequence([
      [outboxRow()], // branchId 5
      [
        {
          id: 11,
          organization_id: '1',
          name: 'Branch-5 HRMS',
          target_type: 'HRMS_WEBHOOK',
          endpoint_url: 'http://127.0.0.1:9/failing',
          auth_type: 'HMAC_SHA256',
          retry_limit: 3,
          timeout_ms: 50,
          filter_rules: JSON.stringify({ branchId: 5 }), // matches
        },
      ],
    ]);

    const result = await new OutboxDispatcher(db, undefined, logger).processBatch(10);

    // The endpoint is unreachable, so delivery fails and a retry is scheduled
    // (which proves the subscriber was selected and dispatched, not filtered out).
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);
  });
});
