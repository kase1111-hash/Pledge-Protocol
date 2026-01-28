/**
 * Database Service Layer
 * Provides persistent storage abstraction for the Pledge Protocol
 *
 * This module provides a DatabaseService interface that can be implemented
 * with either in-memory storage (for development/testing) or a real database
 * (PostgreSQL) for production.
 *
 * Quick Start:
 *
 *   // At application startup
 *   import { initializeDatabase } from './database';
 *   await initializeDatabase();
 *
 *   // Use the database
 *   import { db } from './database';
 *   const campaign = await db.campaigns.findById('...');
 *
 * Configuration (environment variables):
 *   DATABASE_TYPE=postgresql  # or 'memory' for development
 *   DATABASE_URL=postgres://user:pass@host:5432/dbname
 *   DATABASE_POOL_MIN=2
 *   DATABASE_POOL_MAX=10
 */

export * from "./types";
export * from "./memory-store";
export * from "./postgres-store";
export * from "./database-service";
