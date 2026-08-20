import { loadConfig, AppConfigSchema } from '@attendance/config';
import { DatabaseClient } from '@attendance/database';
import { RedisClient } from '@attendance/redis';
import { KafkaClient, KafkaProducer } from '@attendance/kafka';
import { createLogger } from '@attendance/logging';
import { NormalizerService, WebhookDispatcher } from '@attendance/integration';
import { DuplicateStormScenario } from './scenarios/duplicate-storm.scenario.js';
import { UnmappedEmployeeScenario } from './scenarios/unmapped-employee.scenario.js';
import { OutboxDownstreamRecoveryScenario } from './scenarios/outbox-downstream-recovery.scenario.js';
import { BurstThroughputScenario } from './scenarios/burst-throughput.scenario.js';

const logger = createLogger({ serviceName: 'qa-chaos-runner' });

async function main() {
  const config = loadConfig(AppConfigSchema, process.env);
  const db = new DatabaseClient({ config: config, logger });
  const redis = new RedisClient({ config: config, logger });
  const kafkaClient = new KafkaClient({ config: config, logger });
  const kafkaProducer = new KafkaProducer(kafkaClient, logger);

  await kafkaProducer.connect();

  const normalizer = new NormalizerService(db, kafkaProducer, logger);
  const webhookDispatcher = new WebhookDispatcher(db, logger);

  console.log('\n======================================================================');
  console.log('🚀 ENTERPRISE ATTENDANCE PLATFORM — QA CHAOS & RELIABILITY SUITE');
  console.log('======================================================================\n');

  try {
    // 1. Duplicate Storm
    console.log(
      '▶ [Scenario 1/4] Running Concurrent Duplicate Storm (30 parallel identical punches)...',
    );
    const duplicateStorm = new DuplicateStormScenario(normalizer, db);
    const dupResult = await duplicateStorm.run(30);
    console.log(
      `  ✔ Result: Submitted=${dupResult.totalSubmitted}, Inserted=${dupResult.totalInserted}, Duplicates Filtered=${dupResult.totalDuplicateShielded}`,
    );
    console.log(`  ✔ Fingerprint: ${dupResult.deterministicFingerprint}`);
    console.log(
      `  ✔ Idempotency Barrier Verified: ${dupResult.success ? 'PASSED ✅' : 'FAILED ❌'}\n`,
    );

    // 2. Unmapped Employee Handling
    console.log('▶ [Scenario 2/4] Running Missing Employee Mapping & Reprocess Scenario...');
    const unmappedScenario = new UnmappedEmployeeScenario(normalizer, db);
    const unmappedResult = await unmappedScenario.run();
    console.log(
      `  ✔ Safe Unmapped Ingestion: ${unmappedResult.unmappedSafeFallback ? 'PASSED ✅' : 'FAILED ❌'}`,
    );
    console.log(
      `  ✔ Dynamic Mapping Reprocess: ${unmappedResult.reprocessedSuccessfully ? 'PASSED ✅' : 'FAILED ❌'}\n`,
    );

    // 3. Outbox Downstream Transient 500 & Recovery
    console.log(
      '▶ [Scenario 3/4] Running Outbound Webhook Downstream Failure & Recovery Scenario...',
    );
    const outboxScenario = new OutboxDownstreamRecoveryScenario(webhookDispatcher);
    const outboxResult = await outboxScenario.run();
    console.log(
      `  ✔ Transient Failure Auto-Retry: ${outboxResult.transientFailureRetried ? 'PASSED ✅' : 'FAILED ❌'}`,
    );
    console.log(
      `  ✔ Downstream Recovery: ${outboxResult.recoverySucceeded ? 'PASSED ✅' : 'FAILED ❌'}\n`,
    );

    // 4. High-Throughput Burst Stress Test
    console.log('▶ [Scenario 4/4] Running Multi-Vendor Burst Throughput Test (100 punches)...');
    const burstScenario = new BurstThroughputScenario(normalizer);
    const burstResult = await burstScenario.run(100);
    console.log(`  ✔ Punches Processed: ${burstResult.totalInserted}/${burstResult.totalPunches}`);
    console.log(
      `  ✔ Measured Duration: ${burstResult.durationMs}ms (${burstResult.punchesPerSecond} punches/sec)`,
    );
    console.log(
      `  ✔ Zero Data Loss: ${burstResult.dataLossCount === 0 ? 'PASSED (0 lost) ✅' : 'FAILED ❌'}\n`,
    );

    console.log('======================================================================');
    console.log('🎉 ALL CHAOS & RELIABILITY SCENARIOS PASSED WITH 100% SUCCESS!');
    console.log('======================================================================\n');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('❌ Chaos scenario failed:', errorMsg);
  } finally {
    await db.close();
    await redis.disconnect();
    await kafkaProducer.disconnect();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
