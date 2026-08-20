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
import { HikvisionDeviceAdapter } from './index.js';

function cleanEnv(val?: string, fallback = ''): string {
  if (!val) return fallback;
  return val.split('#')[0]!.trim();
}

async function main() {
  const mode = process.argv[2] || 'test-conn';
  const config = loadAppConfig();
  const logger = createLogger({ serviceName: 'hikvision-cli', level: 'info' });

  // Physical device parameters from environment (sanitized) or CLI arguments
  const host = cleanEnv(process.env['HIKVISION_HOST'], '127.0.0.1');
  const port = parseInt(cleanEnv(process.env['HIKVISION_PORT'], '80'), 10);
  const username = cleanEnv(process.env['HIKVISION_USERNAME'], 'admin');
  const password = cleanEnv(process.env['HIKVISION_PASSWORD'], 'Admin12345');
  const useHttps = cleanEnv(process.env['HIKVISION_USE_HTTPS'], 'false') === 'true';

  logger.info(
    { host, port, username, useHttps, mode },
    'Initializing Hikvision ISAPI Device Runner',
  );

  const device: DeviceModel = {
    id: 'DEV-HQ-HIK01',
    organizationId: 'ORG-TECHIVE',
    branchId: 'BR-HQ-01',
    deviceCode: 'DEV-HQ-HIK01',
    serialNumber: 'HIK-SN-12345678',
    name: 'Hikvision Facial Terminal',
    vendor: 'HIKVISION',
    protocol: 'ISAPI',
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

  const adapter = new HikvisionDeviceAdapter(logger, {
    useHttps,
    mockFallback: host === '127.0.0.1' || host === 'localhost' || host === 'mock-hikvision',
  });

  if (mode === 'test-conn') {
    logger.info(`Probing Hikvision device at ${host}:${port} with ISAPI Digest authentication...`);
    const result = await adapter.testConnection(device);
    logger.info({ result }, 'Hikvision connection test completed');
    process.exit(result.success ? 0 : 1);
  } else if (mode === 'device-info') {
    logger.info(`Querying Hikvision hardware information from ${host}:${port}...`);
    const info = await adapter.getDeviceInfo(device);
    logger.info({ info }, 'Hikvision system device information');
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
      'Logs fetched from device',
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
  } else {
    logger.error(`Unknown mode: ${mode}. Available modes: test-conn, sync-once, device-info`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Hikvision CLI fatal error:', err);
  process.exit(1);
});
