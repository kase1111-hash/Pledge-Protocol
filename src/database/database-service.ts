/**
 * Database Service
 * Main entry point for database operations
 *
 * Provides a unified interface that can be backed by either:
 * - In-memory storage (development/testing)
 * - PostgreSQL (production)
 *
 * Usage:
 *   import { db, initializeDatabase } from '../database';
 *
 *   // Initialize database (call once at startup)
 *   await initializeDatabase();
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
import { createPostgresDatabase, createPostgresPool, PostgresDatabaseService } from "./postgres-store";

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

// Module-level database instance
let _db: IDatabaseService | null = null;
let _config: DatabaseConfig | null = null;
let _initialized = false;

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
 * Initialize database connection
 * Call this once at application startup
 */
export async function initializeDatabase(config?: DatabaseConfig): Promise<IDatabaseService> {
  if (_initialized && _db) {
    return _db;
  }

  _config = config || getConfigFromEnv();

  if (_config.type === "memory") {
    console.log("Using in-memory database storage");
    _db = memoryDatabase;
    _initialized = true;
    return _db;
  }

  if (_config.type === "postgresql") {
    console.log("Connecting to PostgreSQL database...");
    try {
      const pool = await createPostgresPool({
        connectionString: _config.connectionString,
        min: _config.pool?.min || 2,
        max: _config.pool?.max || 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      _db = createPostgresDatabase(pool);

      // Verify connection
      const connected = await _db.isConnected();
      if (!connected) {
        throw new Error("Failed to connect to PostgreSQL");
      }

      console.log("PostgreSQL database connected successfully");
      _initialized = true;
      return _db;
    } catch (error) {
      console.error("PostgreSQL connection failed:", error);
      console.warn("Falling back to in-memory storage");
      _db = memoryDatabase;
      _config = { type: "memory" };
      _initialized = true;
      return _db;
    }
  }

  // Fallback
  console.warn("Unknown database type, using in-memory storage");
  _db = memoryDatabase;
  _initialized = true;
  return _db;
}

/**
 * Get database instance
 * Will auto-initialize with default config if not already initialized
 */
export function getDatabase(): IDatabaseService {
  if (!_initialized || !_db) {
    // Synchronous fallback for code that doesn't await initializeDatabase
    console.warn(
      "Database accessed before initialization. Using in-memory storage. " +
        "Call initializeDatabase() at app startup for PostgreSQL support."
    );
    _db = memoryDatabase;
    _config = { type: "memory" };
    _initialized = true;
  }
  return _db;
}

/**
 * Database singleton (use getDatabase() for lazy access)
 * For backwards compatibility and simple usage
 */
export const db: IDatabaseService = new Proxy({} as IDatabaseService, {
  get(_target, prop) {
    const database = getDatabase();
    return (database as Record<string, unknown>)[prop as string];
  },
});

/**
 * Get current database configuration
 */
export function getDatabaseConfig(): DatabaseConfig {
  return _config || { type: "memory" };
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
  return _initialized;
}

/**
 * Health check function
 */
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  type: string;
  error?: string;
}> {
  try {
    const database = getDatabase();
    const connected = await database.isConnected();
    return {
      connected,
      type: getDatabaseConfig().type,
    };
  } catch (error) {
    return {
      connected: false,
      type: getDatabaseConfig().type,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Close database connection
 * Call this on application shutdown
 */
export async function closeDatabase(): Promise<void> {
  if (_db && _config?.type === "postgresql") {
    await (_db as PostgresDatabaseService).close?.();
  }
  _db = null;
  _initialized = false;
}

// Re-export types for convenience
export type { IDatabaseService } from "./types";
export { MemoryDatabaseService } from "./memory-store";
export { PostgresDatabaseService, createPostgresDatabase, createPostgresPool } from "./postgres-store";
