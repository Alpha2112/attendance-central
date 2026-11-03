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

function cleanEnv(val: string | undefined, fallback = ''): string {
  if (!val) return fallback;
  return val.split('#')[0]!.trim();
}

async function main(): Promise<void> {
  const mode = process.argv[2] || 'test-conn';
  const config = loadAppConfig();
  const logger = createLogger({ serviceName: 'suprema-cli', level: 'info' });

  // Device Gateway + terminal parameters (from environment or defaults).
  const gatewayAddr = cleanEnv(process.env['SUPREMA_GATEWAY_ADDR'], '127.0.0.1:4000');
  const caCertPath = cleanEnv(process.env['SUPREMA_GATEWAY_CA_CERT']) || undefined;
  const protoDir = cleanEnv(process.env['SUPREMA_GSDK_PROTO_DIR']) || undefined;
  const deviceHost = cleanEnv(process.env['SUPREMA_DEVICE_IP'], '127.0.0.1');
  const devicePort = parseInt(cleanEnv(process.env['SUPREMA_DEVICE_PORT'], '51211'), 10);
  const useSSL = cleanEnv(process.env['SUPREMA_DEVICE_SSL'], 'false') === 'true';

  logger.info(
    { gatewayAddr, deviceHost, devicePort, useSSL, mode },
    'Initializing Suprema G-SDK Runner',
  );

  const device: DeviceModel = {
    id: 'DEV-HQ-SUP01',
    organizationId: 'ORG-TECHIVE',
    branchId: 'BR-HQ-01',
    deviceCode: 'DEV-HQ-SUP01',
    serialNumber: cleanEnv(process.env['SUPREMA_DEVICE_ID'], 'SUP-BS3-998811'),
    name: 'Suprema BioStation 3 Main Entrance',
    vendor: 'SUPREMA',
    protocol: 'GSDK',
    connectionMode: 'HYBRID',
    status: DeviceStatus.ONLINE,
    host: deviceHost,
    port: devicePort,
    timezone: 'UTC',
    metadata: { useSSL },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const adapter = new SupremaDeviceAdapter(logger, {
    gatewayAddress: gatewayAddr,
    caCertPath,
    protoDir,
    useSSL,
    mockFallback: deviceHost === '127.0.0.1' || deviceHost === 'localhost',
  });

  if (mode === 'test-conn') {
    logger.info(
      `Probing Suprema terminal ${deviceHost}:${devicePort} via gateway ${gatewayAddr}...`,
    );
    const result = await adapter.testConnection(device);
    logger.info({ result }, 'Suprema G-SDK connection test completed');
    adapter.close();
    process.exit(result.success ? 0 : 1);
  } else if (mode === 'device-info') {
    logger.info(`Querying Suprema device info from ${deviceHost} via gateway ${gatewayAddr}...`);
    const info = await adapter.getDeviceInfo(device);
    logger.info({ info }, 'Suprema G-SDK device specifications');
    adapter.close();
    process.exit(0);
  } else if (mode === 'sync-once') {
    logger.info(`Executing incremental log synchronization via gateway ${gatewayAddr}...`);

    const redisClient = new RedisClient({ config, logger });
    const kafkaClient = new KafkaClient({ config, logger });
    const kafkaProducer = new KafkaProducer(kafkaClient, logger);

    await redisClient.connect();
    await kafkaProducer.connect();

    const fetchResult = await adapter.fetchLogs(device);
    logger.info(
      { eventsCount: fetchResult.events.length, nextCursor: fetchResult.nextCursor },
      'Logs fetched from Suprema terminal via G-SDK',
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

    adapter.close();
    await kafkaProducer.disconnect();
    await redisClient.disconnect();
    process.exit(0);
  } else if (mode === 'listen-realtime') {
    logger.info(`Starting Suprema G-SDK real-time listener via gateway ${gatewayAddr}...`);
    await adapter.startRealtime(device, (event) => {
      logger.info(
        {
          eventId: event.eventId,
          vendorUserId: event.vendorUserId,
          time: event.deviceTime,
          verify: event.vendorVerificationType,
          punch: event.vendorPunchType,
        },
        'Real-time Suprema attendance event received via G-SDK',
      );
    });
    process.on('SIGINT', () => {
      adapter.close();
      process.exit(0);
    });
    await new Promise<void>(() => {
      /* keep alive until SIGINT */
    });
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
