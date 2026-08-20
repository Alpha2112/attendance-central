import { createLogger } from '@attendance/logging';
import { loadAppConfig } from '@attendance/config';
import { DatabaseClient } from '@attendance/database';
import { RedisClient } from '@attendance/redis';
import { KafkaClient, KafkaProducer } from '@attendance/kafka';
import { type RawAttendanceEvent, DeviceVendor, EventSource } from '@attendance/contracts';
import { NormalizerService } from './normalizer/normalizer.service.js';
import { OutboxDispatcher } from './outbox/outbox.dispatcher.js';
import { WebhookDispatcher } from './webhook/webhook.dispatcher.js';
import { ReplayService } from './replay/replay.service.js';
import { randomUUID } from 'node:crypto';

async function main() {
  const mode = process.argv[2] || 'process-outbox';
  const config = loadAppConfig();
  const logger = createLogger({ serviceName: 'integration-cli', level: 'info' });

  const db = new DatabaseClient({ config, logger });
  const redisClient = new RedisClient({ config, logger });
  const kafkaClient = new KafkaClient({ config, logger });
  const kafkaProducer = new KafkaProducer(kafkaClient, logger);

  await redisClient.connect();
  await kafkaProducer.connect();

  const normalizer = new NormalizerService(db, kafkaProducer, logger);
  const outboxDispatcher = new OutboxDispatcher(db, kafkaProducer, logger);
  const webhookDispatcher = new WebhookDispatcher(db, logger);
  const replayService = new ReplayService(db, outboxDispatcher, logger);

  logger.info({ mode }, 'Initializing Integration Platform CLI');

  if (mode === 'normalize-sample') {
    logger.info('Normalizing sample raw attendance event...');
    const sampleRaw: RawAttendanceEvent = {
      eventId: randomUUID(),
      schemaVersion: 1,
      organizationId: 'ORG-TECHIVE',
      branchId: 'BR-HQ-01',
      deviceId: 'DEV-HQ-ZK01',
      deviceSerialNumber: 'ZK-MB2000-112233',
      vendor: DeviceVendor.ZKTECO,
      adapter: 'zkteco-standalone',
      vendorUserId: 'EMP-1001',
      deviceTime: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      vendorPunchType: '0', // Check-in
      vendorVerificationType: '15', // Face
      source: EventSource.PULL,
      rawPayload: { pin: 'EMP-1001', time: new Date().toISOString(), status: '0', verified: '15' },
    };

    const normalized = await normalizer.processEvent(sampleRaw);
    logger.info({ normalized }, 'Event normalized successfully and inserted into outbox');
    process.exit(0);
  } else if (mode === 'process-outbox') {
    logger.info('Executing single outbox dispatch batch...');
    const result = await outboxDispatcher.processBatch(25);
    logger.info({ result }, 'Outbox batch processing completed');
    process.exit(0);
  } else if (mode === 'test-webhook') {
    logger.info('Testing HMAC SHA-256 signed webhook delivery...');
    const mockIntegration = {
      id: 1,
      organizationId: 'ORG-TECHIVE',
      name: 'HRMS Webhook Test',
      targetType: 'HRMS_WEBHOOK',
      endpointUrl: 'http://127.0.0.1:4000/api/v1/health', // Health endpoint as ping receiver
      authType: 'HMAC_SHA256',
      secretReference: 'env:HRMS_WEBHOOK_SECRET',
      retryLimit: 3,
      timeoutMs: 5000,
    };

    const result = await webhookDispatcher.dispatch(mockIntegration, randomUUID(), {
      test: true,
      timestamp: new Date().toISOString(),
    });
    logger.info({ result }, 'Webhook dispatch test result');
    process.exit(result.success ? 0 : 1);
  } else if (mode === 'replay') {
    const eventId = process.argv[3];
    if (!eventId) {
      logger.error('Usage: pnpm run integration:replay <eventId>');
      process.exit(1);
    }
    await replayService.replayEvent(eventId);
    logger.info({ eventId }, 'Event replay successfully submitted');
    process.exit(0);
  } else {
    logger.error(`Unknown mode: ${mode}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Integration CLI fatal error:', err);
  process.exit(1);
});
