/**
 * Database Service
 *
 * Owns the process-wide DomainStore. Call initializeDatabase() once at
 * startup; routes then use getStore().
 *
 *   DATABASE_TYPE=postgresql  DATABASE_URL=postgres://user:pass@host:5432/db
 *   DATABASE_TYPE=memory      (development/tests; data is lost on restart)
 *
 * If PostgreSQL is configured but unreachable, initialization fails rather
 * than silently falling back to memory, which would lose data.
 */

import { DomainStore } from "./types";
import { MemoryStore } from "./memory-store";
import { createPostgresStore } from "./postgres-store";

export interface DatabaseConfig {
  type: "memory" | "postgresql";
  connectionString?: string;
  pool?: {
    max?: number;
  };
}

let store: DomainStore | null = null;
/** True once initializeDatabase() or setStore() chose the store explicitly */
let explicit = false;

/**
 * Open the configured store. Replaces the implicit in-memory store that
 * getStore() creates when used before initialization.
 */
export async function initializeDatabase(config: DatabaseConfig): Promise<DomainStore> {
  if (store && explicit) {
    return store;
  }

  if (config.type === "postgresql") {
    if (!config.connectionString) {
      throw new Error("DATABASE_URL is required for PostgreSQL storage");
    }
    store = await createPostgresStore({
      connectionString: config.connectionString,
      max: config.pool?.max ?? 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  } else if (!store) {
    store = new MemoryStore();
  }

  explicit = true;
  return store;
}

/**
 * The active store. Falls back to a fresh in-memory store when nothing was
 * initialized, which is what unit tests that mount routers directly rely on.
 */
export function getStore(): DomainStore {
  if (!store) {
    store = new MemoryStore();
  }
  return store;
}

/**
 * Replace the active store (tests)
 */
export function setStore(next: DomainStore): void {
  store = next;
  explicit = true;
}

export async function checkDatabaseHealth(): Promise<{ connected: boolean; type: string }> {
  const active = getStore();
  return { connected: await active.isConnected(), type: active.kind };
}

export async function closeDatabase(): Promise<void> {
  if (store) {
    const closing = store;
    store = null;
    explicit = false;
    await closing.close();
  }
}
