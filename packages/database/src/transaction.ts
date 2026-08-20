import { type PoolConnection } from 'mysql2/promise';
import { DatabaseClient } from './pool.js';

export async function runInTransaction<T>(
  dbClient: DatabaseClient,
  operation: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const pool = dbClient.getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Ignore rollback errors if connection was lost
    }
    throw error;
  } finally {
    connection.release();
  }
}
