import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DatabaseClient } from '@attendance/database';
import { KafkaProducer } from '@attendance/kafka';
import { OutboxDispatcher } from '@attendance/integration';
import { AppLogger } from '@attendance/logging';
import { LOGGER_TOKEN } from '../logging/logging.module.js';

/**
 * Runs the transactional-outbox webhook dispatcher co-located with the API, so a
 * new punch written to `outbox_events` is delivered to each company's registered
 * endpoint in real time (ADR-009). The dispatch loop is decoupled from ingestion:
 * a slow or failing endpoint never blocks punch persistence.
 */
@Injectable()
export class WebhookDispatcherRunner implements OnModuleInit, OnModuleDestroy {
  private dispatcher: OutboxDispatcher | null = null;

  constructor(
    @Inject(DatabaseClient) private readonly db: DatabaseClient,
    @Inject(KafkaProducer) private readonly kafkaProducer: KafkaProducer,
    @Inject(LOGGER_TOKEN) private readonly logger: AppLogger,
  ) {}

  public onModuleInit(): void {
    this.dispatcher = new OutboxDispatcher(this.db, this.kafkaProducer, this.logger);
    // Poll every 2s; one tick claims a bounded batch of PENDING outbox events.
    this.dispatcher.start(2000);
    this.logger.info('Outbound webhook dispatcher started (transactional outbox poll loop)');
  }

  public onModuleDestroy(): void {
    this.dispatcher?.stop();
    this.dispatcher = null;
  }
}
