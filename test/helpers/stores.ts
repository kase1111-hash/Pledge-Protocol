/**
 * Store backends shared by the test suites. The PostgreSQL backend is enabled
 * when TEST_DATABASE_URL points at a database the tests may create schemas in:
 *
 *   TEST_DATABASE_URL=postgres://pledge:pledge@localhost:5432/pledge_test
 *
 * Each suite passes its own schema name, because test files run in parallel
 * and must not reset each other's tables.
 */

import { Pool } from "pg";
import { DomainStore, MemoryStore, createPostgresStore } from "../../src/database";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * Recreate the schema empty
 */
export async function resetPostgres(schema: string): Promise<void> {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await pool.end();
  }
}

/**
 * A PostgreSQL store whose tables live in the given schema
 */
export function openPostgres(schema: string) {
  return createPostgresStore({
    connectionString: TEST_DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
}

export function storeBackends(
  schema: string
): { name: string; enabled: boolean; open: () => Promise<DomainStore> }[] {
  return [
    { name: "memory", enabled: true, open: async () => new MemoryStore() },
    {
      name: "postgresql",
      enabled: !!TEST_DATABASE_URL,
      open: async () => {
        await resetPostgres(schema);
        return openPostgres(schema);
      },
    },
  ];
}
