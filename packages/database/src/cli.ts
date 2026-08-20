import { loadDatabaseConfig } from '@attendance/config';
import { createLogger } from '@attendance/logging';
import { DatabaseClient } from './pool.js';
import { DatabaseMigrator } from './migrator.js';

async function main(): Promise<void> {
  const action = process.argv[2] || 'up';
  const config = loadDatabaseConfig();
  const logger = createLogger({ serviceName: 'database-cli', level: 'info' });
  const client = new DatabaseClient({ config, logger });
  const migrator = new DatabaseMigrator(client, logger);

  try {
    if (action === 'up') {
      logger.info('Starting schema migrations...');
      const result = await migrator.runMigrations();
      logger.info(
        { executed: result.executed, total: result.total },
        `Migration run finished. ${result.executed.length} new migrations executed.`,
      );
    } else if (action === 'seed') {
      logger.info('Seeding database with initial data...');
      await migrator.seed();
      logger.info('Database seed finished successfully.');
    } else if (action === 'status') {
      const executed = await migrator.getExecutedMigrations();
      logger.info({ executed }, `Executed migrations: ${executed.join(', ') || 'None'}`);
    } else {
      logger.error(`Unknown action: ${action}. Use 'up', 'seed', or 'status'.`);
      process.exit(1);
    }
  } catch (error) {
    logger.error({ error }, 'Database migration error');
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
