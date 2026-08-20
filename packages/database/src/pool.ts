import mysql, {
  type Pool,
  type PoolOptions,
  type RowDataPacket,
  type ResultSetHeader,
} from 'mysql2/promise';
import { type DatabaseConfig } from '@attendance/config';
import { type AppLogger } from '@attendance/logging';

export interface DatabaseClientOptions {
  config: DatabaseConfig;
  logger?: AppLogger;
}

export class DatabaseClient {
  private pool: Pool | null = null;
  private readonly config: DatabaseConfig;
  private readonly logger?: AppLogger;

  constructor(options: DatabaseClientOptions) {
    this.config = options.config;
    this.logger = options.logger;
  }

  public getPool(): Pool {
    if (!this.pool) {
      const poolOptions: PoolOptions = {
        host: this.config.DB_HOST,
        port: this.config.DB_PORT,
        user: this.config.DB_USERNAME,
        password: this.config.DB_PASSWORD,
        database: this.config.DB_DATABASE,
        waitForConnections: true,
        connectionLimit: this.config.DB_CONNECTION_LIMIT,
        connectTimeout: this.config.DB_CONNECT_TIMEOUT_MS,
        maxIdle: 10,
        idleTimeout: 60000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
      };

      this.pool = mysql.createPool(poolOptions);
      this.logger?.info(
        {
          host: this.config.DB_HOST,
          port: this.config.DB_PORT,
          database: this.config.DB_DATABASE,
        },
        'MySQL connection pool initialized',
      );
    }
    return this.pool;
  }

  public async query<T extends RowDataPacket[] | ResultSetHeader>(
    sql: string,
    params?: unknown[],
  ): Promise<T> {
    const pool = this.getPool();
    const [result] = await pool.query(sql, params);
    return result as T;
  }

  public async ping(): Promise<boolean> {
    try {
      const pool = this.getPool();
      await pool.query('SELECT 1');
      return true;
    } catch (error) {
      this.logger?.error({ error }, 'Database ping failed');
      return false;
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.logger?.info('MySQL connection pool closed');
    }
  }
}
