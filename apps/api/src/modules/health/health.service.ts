import { Injectable, Inject } from '@nestjs/common';
import { DatabaseHealthIndicator, type DatabaseHealthResult } from '@attendance/database';
import { RedisHealthIndicator, type RedisHealthResult } from '@attendance/redis';
import { KafkaHealthIndicator, type KafkaHealthResult } from '@attendance/kafka';

export interface ReadinessReport {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptimeSeconds: number;
  dependencies: {
    database: DatabaseHealthResult;
    redis: RedisHealthResult;
    kafka: KafkaHealthResult;
  };
}

export interface LivenessReport {
  status: 'ok';
  timestamp: string;
  uptimeSeconds: number;
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(DatabaseHealthIndicator) private readonly dbHealth: DatabaseHealthIndicator,
    @Inject(RedisHealthIndicator) private readonly redisHealth: RedisHealthIndicator,
    @Inject(KafkaHealthIndicator) private readonly kafkaHealth: KafkaHealthIndicator,
  ) {}

  public getLiveness(): LivenessReport {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  public async getReadiness(): Promise<ReadinessReport> {
    const [dbResult, redisResult, kafkaResult] = await Promise.all([
      this.dbHealth.checkHealth(),
      this.redisHealth.checkHealth(),
      this.kafkaHealth.checkHealth(),
    ]);

    const allUp =
      dbResult.status === 'up' && redisResult.status === 'up' && kafkaResult.status === 'up';

    const someUp =
      dbResult.status === 'up' || redisResult.status === 'up' || kafkaResult.status === 'up';

    let status: 'ok' | 'degraded' | 'error' = 'ok';
    if (!allUp) {
      status = someUp ? 'degraded' : 'error';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      dependencies: {
        database: dbResult,
        redis: redisResult,
        kafka: kafkaResult,
      },
    };
  }
}
