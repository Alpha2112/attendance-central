import fs from 'node:fs';
import path from 'node:path';
import { DatabaseClient } from './pool.js';
import { type AppLogger } from '@attendance/logging';
import { type RowDataPacket } from 'mysql2/promise';

export interface MigrationRecord extends RowDataPacket {
  id: number;
  name: string;
  executed_at: Date;
}

export class DatabaseMigrator {
  private readonly client: DatabaseClient;
  private readonly logger?: AppLogger;
  private readonly migrationsDir: string;

  constructor(client: DatabaseClient, logger?: AppLogger, migrationsDir?: string) {
    this.client = client;
    this.logger = logger;

    if (migrationsDir) {
      this.migrationsDir = migrationsDir;
    } else {
      // Look in local src/migrations or dist/migrations or packages/database/src/migrations
      const candidates = [
        path.resolve(process.cwd(), 'packages/database/src/migrations'),
        path.resolve(process.cwd(), 'src/migrations'),
        path.resolve(process.cwd(), 'migrations'),
        path.resolve(__dirname, 'migrations'),
        path.resolve(__dirname, '../src/migrations'),
      ];
      this.migrationsDir = candidates.find((dir) => fs.existsSync(dir)) || candidates[0]!;
    }
  }

  public async initMigrationTable(): Promise<void> {
    const pool = this.client.getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async getExecutedMigrations(): Promise<string[]> {
    await this.initMigrationTable();
    const rows = await this.client.query<MigrationRecord[]>(
      'SELECT name FROM _schema_migrations ORDER BY id ASC',
    );
    return rows.map((r) => r.name);
  }

  public async runMigrations(): Promise<{ executed: string[]; total: number }> {
    await this.initMigrationTable();
    const executedBefore = await this.getExecutedMigrations();

    if (!fs.existsSync(this.migrationsDir)) {
      this.logger?.warn({ dir: this.migrationsDir }, 'Migrations directory not found');
      return { executed: [], total: 0 };
    }

    const files = fs
      .readdirSync(this.migrationsDir)
      .filter((f) => f.endsWith('.sql') && !f.includes('seed'))
      .sort();

    const pending = files.filter((f) => !executedBefore.includes(f));
    const executed: string[] = [];

    const pool = this.client.getPool();
    const connection = await pool.getConnection();

    try {
      for (const file of pending) {
        const filePath = path.join(this.migrationsDir, file);
        const sqlContent = fs.readFileSync(filePath, 'utf-8');

        this.logger?.info({ file }, `Running migration: ${file}`);

        // Split by statement and execute sequentially
        const statements = this.splitSqlStatements(sqlContent);
        for (const statement of statements) {
          if (statement.trim().length > 0) {
            await connection.query(statement);
          }
        }

        await connection.query('INSERT INTO _schema_migrations (name) VALUES (?)', [file]);
        executed.push(file);
        this.logger?.info({ file }, `Completed migration: ${file}`);
      }
    } finally {
      connection.release();
    }

    return { executed, total: files.length };
  }

  public async seed(): Promise<void> {
    const seedFile = path.join(this.migrationsDir, '002_seed_data.sql');
    if (!fs.existsSync(seedFile)) {
      this.logger?.warn('Seed file 002_seed_data.sql not found');
      return;
    }

    const sqlContent = fs.readFileSync(seedFile, 'utf-8');
    const statements = this.splitSqlStatements(sqlContent);

    const pool = this.client.getPool();
    const connection = await pool.getConnection();

    try {
      for (const statement of statements) {
        if (statement.trim().length > 0) {
          await connection.query(statement);
        }
      }
      this.logger?.info('Database seeded successfully');
    } finally {
      connection.release();
    }
  }

  private splitSqlStatements(sql: string): string[] {
    // Remove comments
    const noComments = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    // Split on semicolons that are outside parentheses or standard statement ends
    return noComments
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
}
