/**
 * Persistent storage for the Pledge Protocol API.
 *
 *   import { initializeDatabase, getStore } from "./database";
 *   await initializeDatabase({ type: "postgresql", connectionString });
 *   const campaign = await getStore().getCampaign(id);
 *
 * See database-service.ts for configuration.
 */

export * from "./types";
export * from "./memory-store";
export * from "./postgres-store";
export * from "./database-service";
export * from "./collections";
