import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

let dbInstance: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to initialize database client');
  }

  const pool = mysql.createPool(databaseUrl);
  dbInstance = drizzle(pool);
  return dbInstance;
}
