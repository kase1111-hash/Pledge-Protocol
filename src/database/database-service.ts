/**
 * Database Service
 * Main entry point for database operations
 *
 * Provides a unified interface that can be backed by either:
 * - In-memory storage (development/testing)
 * - PostgreSQL (production)
 *
 * Usage:
 *   import { db } from '../database';
 *
 *   // Create a campaign
 *   const campaign = await db.campaigns.create({ ... });
 *
 *   // Find by ID
 *   const found = await db.campaigns.findById(id);
 *
 *   // List with filters
 *   const active = await db.campaigns.findAll({ status: 'active' });
 */

import { IDatabaseService } from "./types";
import { MemoryDatabaseService, memoryDatabase } from "./memory-store";

/**
 * Database configuration
 */
export interface DatabaseConfig {
  type: "memory" | "postgresql";
  connectionString?: string;
  pool?: {
    min?: number;
    max?: number;
  };
}

/**
 * Get database configuration from environment
 */
function getConfigFromEnv(): DatabaseConfig {
  const dbType = process.env.DATABASE_TYPE || "memory";

  if (dbType === "postgresql") {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.warn(
        "DATABASE_URL not set, falling back to in-memory storage. " +
          "WARNING: Data will be lost on restart!"
      );
      return { type: "memory" };
    }

    return {
      type: "postgresql",
      connectionString,
      pool: {
        min: parseInt(process.env.DATABASE_POOL_MIN || "2", 10),
        max: parseInt(process.env.DATABASE_POOL_MAX || "10", 10),
      },
    };
  }

  if (process.env.NODE_ENV === "production" && dbType === "memory") {
    console.warn(
      "WARNING: Using in-memory storage in production! " +
        "Set DATABASE_TYPE=postgresql and DATABASE_URL for persistent storage."
    );
  }

  return { type: "memory" };
}

/**
 * Create database service instance based on configuration
 */
function createDatabaseService(config: DatabaseConfig): IDatabaseService {
  if (config.type === "memory") {
    console.log("Using in-memory database storage");
    return memoryDatabase;
  }

  // PostgreSQL implementation would go here
  // For now, fall back to memory if PostgreSQL is requested but not implemented
  console.warn(
    "PostgreSQL support not yet implemented, falling back to in-memory storage"
  );
  return memoryDatabase;
}

// Create singleton instance
const config = getConfigFromEnv();
export const db: IDatabaseService = createDatabaseService(config);

// Re-export types for convenience
export type { IDatabaseService } from "./types";
export { MemoryDatabaseService } from "./memory-store";

/**
 * Health check function
 */
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  type: string;
  error?: string;
}> {
  try {
    const connected = await db.isConnected();
    return {
      connected,
      type: config.type,
    };
  } catch (error) {
    return {
      connected: false,
      type: config.type,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
