/**
 * Prisma Client Singleton
 * 
 * Ensures a single Prisma Client instance across the application.
 * In development, prevents multiple instances during hot reload.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Create or reuse Prisma Client instance
export const db = global.prisma || new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// In development, store instance globally to prevent multiple clients
if (process.env.NODE_ENV !== 'production') {
  global.prisma = db;
}

// Graceful shutdown handler
export async function disconnectDb(): Promise<void> {
  try {
    await db.$disconnect();
    logger.info('Database disconnected successfully');
  } catch (error) {
    logger.error('Error disconnecting from database', error);
    throw error;
  }
}

// Health check helper
export async function checkDbConnection(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database connection health check failed', error);
    return false;
  }
}

// Query helper for raw SQL with proper error handling
export async function executeRawQuery<T = unknown>(
  query: string,
  ...params: unknown[]
): Promise<T> {
  try {
    const result = await db.$queryRawUnsafe<T>(query, ...params);
    return result;
  } catch (error) {
    logger.error('Raw query execution failed', error, { query });
    throw error;
  }
}

// Transaction helper
export async function runTransaction<T>(
  callback: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'>) => Promise<T>
): Promise<T> {
  try {
    return await db.$transaction(callback);
  } catch (error) {
    logger.error('Transaction failed', error);
    throw error;
  }
}

// Export Prisma types for use across the application
export type { 
  PrismaClient,
  Prisma,
} from '@prisma/client';

