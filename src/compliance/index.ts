/**
 * Phase 9: Compliance Module
 *
 * GDPR, CCPA, and data privacy compliance.
 */

// Types
export * from "./types";

// GDPR Service
export { GdprService, createGdprService, NO_USER_DATA } from "./gdpr-service";
export type { UserDataProvider } from "./gdpr-service";
