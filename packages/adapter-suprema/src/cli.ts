import { createLogger } from '@attendance/logging';
import { loadAppConfig } from '@attendance/config';
import { RedisClient } from '@attendance/redis';
import { KafkaClient, KafkaProducer } from '@attendance/kafka';
import {
  type DeviceModel,
  DeviceStatus,
  KAFKA_TOPICS,
  buildKafkaDeviceKey,
} from '@attendance/contracts';
import { SupremaDeviceAdapter } from './index.js';

function cleanEnv(val?: string, fallback = ''): string {
  if (!val) return fallback;
  return val.split('#')[0]!.trim();
}

async function main() {
  const mode = process.argv[2] || 'test-conn';
  const config = loadAppConfig();
  const logger = createLogger({ serviceName: 'suprema-cli', level: 'info' });

  // Suprema / BioStar 2 parameters from environment or defaults
  const host = cleanEnv(process.env['BIOSTAR_HOST'], '127.0.0.1');
  const port = parseInt(cleanEnv(process.env['BIOSTAR_PORT'], '80'), 10);
  const username = cleanEnv(process.env['BIOSTAR_USERNAME'], 'admin');
  const password = cleanEnv(process.env['BIOSTAR_PASSWORD'], 'Admin12345');
  const useHttps = cleanEnv(process.env['BIOSTAR_USE_HTTPS'], 'false') === 'true';

  logger.info(
    { host, port, username, useHttps, mode },
    'Initializing Suprema / BioStar 2 Device Runner',
  );

  const device: DeviceModel = {
    id: 'DEV-HQ-SUP01',
    organizationId: 'ORG-TECHIVE',
    branchId: 'BR-HQ-01',
    deviceCode: 'DEV-HQ-SUP01',
    serialNumber: 'SUP-BS3-998811',
    name: 'Suprema BioStation 3 Main Entrance',
    vendor: 'SUPREMA',
    protocol: 'BIOSTAR2_API',
    connectionMode: 'HYBRID',
    status: DeviceStatus.ONLINE,
    host,
    port,
    timezone: 'UTC',
    metadata: {
      username,
      password,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const adapter = new SupremaDeviceAdapter(logger, {
    port,
    useHttps,
    mockFallback: host === '127.0.0.1' || host === 'localhost' || host === 'mock-biostar',
  });

  if (mode === 'test-conn') {
    logger.info(`Probing BioStar 2 server at ${host}:${port} with session authentication...`);
    const result = await adapter.testConnection(device);
    logger.info({ result }, 'BioStar 2 connection test completed');
    process.exit(result.success ? 0 : 1);
  } else if (mode === 'device-info') {
    logger.info(`Querying BioStar 2 device specifications from ${host}:${port}...`);
    const info = await adapter.getDeviceInfo(device);
    logger.info({ info }, 'BioStar 2 device specifications');
    process.exit(0);
  } else if (mode === 'sync-once') {
    logger.info(
      `Executing incremental log synchronization from ${host}:${port} with Kafka publication...`,
    );

    const redisClient = new RedisClient({ config, logger });
    const kafkaClient = new KafkaClient({ config, logger });
    const kafkaProducer = new KafkaProducer(kafkaClient, logger);

    await redisClient.connect();
    await kafkaProducer.connect();

    const fetchResult = await adapter.fetchLogs(device);
    logger.info(
      { eventsCount: fetchResult.events.length, nextCursor: fetchResult.nextCursor },
      'Logs fetched from BioStar 2 server',
    );

    for (const event of fetchResult.events) {
      const partitionKey = buildKafkaDeviceKey(
        event.organizationId,
        event.deviceId,
        event.tenantId ?? undefined,
      );
      const publishRecords = await kafkaProducer.publish({
        topic: KAFKA_TOPICS.ATTENDANCE_RAW,
        key: partitionKey,
        value: event,
      });

      logger.info(
        {
          eventId: event.eventId,
          vendorUserId: event.vendorUserId,
          deviceTime: event.deviceTime,
          partition: publishRecords[0]?.partition,
          offset: publishRecords[0]?.offset,
        },
        'Published raw event to Kafka topic attendance.raw.v1',
      );
    }

    logger.info(
      { publishedCount: fetchResult.events.length },
      'Published all raw events to Kafka attendance.raw.v1 successfully',
    );

    await kafkaProducer.disconnect();
    await redisClient.disconnect();
    process.exit(0);
  } else if (mode === 'listen-realtime') {
    logger.info(`Starting real-time WebSocket event listener from ${host}:${port}...`);
    await adapter.startRealtime(device, (event) => {
      logger.info(
        { eventId: event.eventId, vendorUserId: event.vendorUserId, time: event.deviceTime },
        'Real-time BioStar 2 attendance event received via WebSocket',
      );
    });
    // Keep alive
    await new Promise(() => {});
  } else {
    logger.error(
      `Unknown mode: ${mode}. Available modes: test-conn, sync-once, device-info, listen-realtime`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Suprema CLI fatal error:', err);
  process.exit(1);
});
