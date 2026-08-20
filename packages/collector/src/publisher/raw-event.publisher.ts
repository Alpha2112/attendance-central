import { type KafkaProducer } from '@attendance/kafka';
import {
  type RawAttendanceEvent,
  RawAttendanceEventSchema,
  KAFKA_TOPICS,
  buildKafkaDeviceKey,
} from '@attendance/contracts';
import { type AppLogger } from '@attendance/logging';

export interface PublishResult {
  eventId: string;
  topic: string;
  partitionKey: string;
  publishedAt: string;
}

/**
 * Publishes validated raw biometric attendance events to Kafka.
 */
export class RawEventPublisher {
  constructor(
    private readonly kafkaProducer: KafkaProducer,
    private readonly logger?: AppLogger,
  ) {}

  /**
   * Validates and publishes a single RawAttendanceEvent to attendance.raw.v1.
   */
  public async publishRawEvent(event: RawAttendanceEvent): Promise<PublishResult> {
    // 1. Validate payload against canonical Zod schema
    const parseResult = RawAttendanceEventSchema.safeParse(event);
    if (!parseResult.success) {
      this.logger?.error(
        { errors: parseResult.error.issues, eventId: event.eventId },
        'Rejecting malformed RawAttendanceEvent before Kafka publication',
      );
      throw new Error(`Invalid RawAttendanceEvent: ${parseResult.error.message}`);
    }

    // 2. Build deterministic per-device partition key: (organizationId, deviceId, tenantId)
    const partitionKey = buildKafkaDeviceKey(
      event.organizationId,
      event.deviceId,
      event.tenantId ?? undefined,
    );

    const topic = KAFKA_TOPICS.ATTENDANCE_RAW;

    // 3. Publish to Kafka
    await this.kafkaProducer.publish({
      topic,
      key: partitionKey,
      value: event,
    });

    this.logger?.debug(
      {
        eventId: event.eventId,
        deviceId: event.deviceId,
        vendor: event.vendor,
        vendorUserId: event.vendorUserId,
        deviceTime: event.deviceTime,
        partitionKey,
      },
      'Published raw attendance event to Kafka topic attendance.raw.v1',
    );

    return {
      eventId: event.eventId,
      topic,
      partitionKey,
      publishedAt: new Date().toISOString(),
    };
  }

  /**
   * Publishes a batch of raw attendance events.
   */
  public async publishRawBatch(events: RawAttendanceEvent[]): Promise<PublishResult[]> {
    const results: PublishResult[] = [];
    for (const event of events) {
      const res = await this.publishRawEvent(event);
      results.push(res);
    }
    return results;
  }
}
