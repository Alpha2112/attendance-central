import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthController } from '../modules/health/health.controller.js';
import { HealthService } from '../modules/health/health.service.js';
import { DatabaseHealthIndicator } from '@attendance/database';
import { RedisHealthIndicator } from '@attendance/redis';
import { KafkaHealthIndicator } from '@attendance/kafka';
import { type FastifyReply } from 'fastify';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: HealthService;
  let dbHealth: DatabaseHealthIndicator;
  let redisHealth: RedisHealthIndicator;
  let kafkaHealth: KafkaHealthIndicator;

  beforeEach(() => {
    dbHealth = {
      checkHealth: vi.fn().mockResolvedValue({ status: 'up', latencyMs: 2 }),
    } as unknown as DatabaseHealthIndicator;

    redisHealth = {
      checkHealth: vi.fn().mockResolvedValue({ status: 'up', latencyMs: 1 }),
    } as unknown as RedisHealthIndicator;

    kafkaHealth = {
      checkHealth: vi.fn().mockResolvedValue({ status: 'up', latencyMs: 5, brokers: 1 }),
    } as unknown as KafkaHealthIndicator;

    healthService = new HealthService(dbHealth, redisHealth, kafkaHealth);
    controller = new HealthController(healthService);
  });

  it('should return liveness report', () => {
    const live = controller.getLiveness();
    expect(live.status).toBe('ok');
    expect(live.timestamp).toBeDefined();
    expect(typeof live.uptimeSeconds).toBe('number');
  });

  it('should return 200 OK for readiness when all dependencies are up', async () => {
    const replyMock = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    await controller.getReadiness(replyMock);
    expect(replyMock.status).toHaveBeenCalledWith(200);
    expect(replyMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        dependencies: expect.objectContaining({
          database: { status: 'up', latencyMs: 2 },
          redis: { status: 'up', latencyMs: 1 },
          kafka: { status: 'up', latencyMs: 5, brokers: 1 },
        }),
      }),
    );
  });

  it('should return 503 SERVICE_UNAVAILABLE for readiness when a dependency is down', async () => {
    vi.spyOn(dbHealth, 'checkHealth').mockResolvedValue({
      status: 'down',
      latencyMs: 10,
      error: 'Connection refused',
    });

    const replyMock = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    await controller.getReadiness(replyMock);
    expect(replyMock.status).toHaveBeenCalledWith(503);
    expect(replyMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'degraded',
      }),
    );
  });
});
