import { RedisClient, RedisLockManager } from '@attendance/redis';
import { KafkaClient, KafkaProducer } from '@attendance/kafka';
import { createLogger } from '@attendance/logging';
import { loadAppConfig } from '@attendance/config';
import { type DeviceModel, DeviceStatus, DeviceVendor } from '@attendance/contracts';
import { CollectorService, StandardMockDeviceAdapter } from './index.js';
import { ZKTecoDeviceAdapter } from '@attendance/adapter-zkteco';
import { HikvisionDeviceAdapter } from '@attendance/adapter-hikvision';
import { SupremaDeviceAdapter } from '@attendance/adapter-suprema';
import { AnvizDeviceAdapter } from '@attendance/adapter-anviz';

async function main() {
  const mode = process.argv[2] || 'run';
  const config = loadAppConfig();
  const logger = createLogger({ serviceName: 'collector-cli', level: 'info' });

  const redisClient = new RedisClient({ config, logger });
  const redisLockManager = new RedisLockManager(redisClient);

  const kafkaClient = new KafkaClient({ config, logger });
  const kafkaProducer = new KafkaProducer(kafkaClient, logger);

  await redisClient.connect();
  await kafkaProducer.connect();

  const collector = new CollectorService(redisLockManager, kafkaProducer, logger, {
    pollIntervalMs: 10000,
    heartbeatIntervalMs: 15000,
  });

  // Register native ZKTeco, Hikvision, Suprema, and Anviz adapters
  const zktecoAdapter = new ZKTecoDeviceAdapter(logger, { mockFallback: true });
  const hikvisionAdapter = new HikvisionDeviceAdapter(logger, { mockFallback: true });
  const supremaAdapter = new SupremaDeviceAdapter(logger, { mockFallback: true });
  const anvizAdapter = new AnvizDeviceAdapter(logger, { mockFallback: true });
  const mockAdapter = new StandardMockDeviceAdapter({
    organizationId: 'ORG-TECHIVE',
    branchId: 'BR-HQ-01',
    deviceId: 'DEV-HQ-ZK01',
    vendor: DeviceVendor.ZKTECO,
  });

  collector.adapterRegistry.register('ZKTECO', zktecoAdapter);
  collector.adapterRegistry.register('ZKTECO:ADMS', zktecoAdapter);
  collector.adapterRegistry.register('HIKVISION', hikvisionAdapter);
  collector.adapterRegistry.register('HIKVISION:ISAPI', hikvisionAdapter);
  collector.adapterRegistry.register('SUPREMA', supremaAdapter);
  collector.adapterRegistry.register('SUPREMA:GSDK', supremaAdapter);
  // Backward-compat: existing device rows registered with the old protocol still resolve.
  collector.adapterRegistry.register('SUPREMA:BIOSTAR2', supremaAdapter);
  collector.adapterRegistry.register('ANVIZ', anvizAdapter);
  collector.adapterRegistry.register('ANVIZ:CROSSCHEX', anvizAdapter);
  collector.adapterRegistry.register('MOCK', mockAdapter);

  const sampleDevice: DeviceModel = {
    id: 'DEV-HQ-ZK01',
    organizationId: 'ORG-TECHIVE',
    branchId: 'BR-HQ-01',
    deviceCode: 'DEV-HQ-ZK01',
    serialNumber: 'ZK-SN-99881122',
    name: 'ZKTeco Main Entrance',
    vendor: 'ZKTECO',
    connectionMode: 'PULL',
    status: DeviceStatus.ONLINE,
    timezone: 'UTC',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  collector.setDevices([sampleDevice]);

  if (mode === 'test-connection') {
    logger.info('Testing connection to device DEV-HQ-ZK01...');
    const result = await collector.heartbeatMonitor.probeDevice(sampleDevice);
    logger.info({ result }, 'Device connection test result');
    await kafkaProducer.disconnect();
    await redisClient.disconnect();
    process.exit(0);
  } else if (mode === 'sync-once') {
    logger.info('Executing single log synchronization pull...');
    const result = await collector.pollingOrchestrator.syncDevice(sampleDevice);
    logger.info({ result }, 'Single device sync result');
    await kafkaProducer.disconnect();
    await redisClient.disconnect();
    process.exit(0);
  } else {
    logger.info('Starting Collector Ingestion Service (Press Ctrl+C to stop)...');
    collector.start();

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down collector...');
      await collector.stop();
      await kafkaProducer.disconnect();
      await redisClient.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down collector...');
      await collector.stop();
      await kafkaProducer.disconnect();
      await redisClient.disconnect();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error('Collector CLI fatal error:', err);
  process.exit(1);
});
