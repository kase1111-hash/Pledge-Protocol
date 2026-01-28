/**
 * Database Service Layer
 * Provides persistent storage abstraction for the Pledge Protocol
 *
 * This module provides a DatabaseService interface that can be implemented
 * with either in-memory storage (for development/testing) or a real database
 * (PostgreSQL) for production.
 */

export * from "./types";
export * from "./memory-store";
export * from "./database-service";
