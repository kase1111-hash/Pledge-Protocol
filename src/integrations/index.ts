/**
 * Phase 10: Integration Hub Module
 *
 * Third-party integrations (Slack, Discord, Zapier, etc.)
 */

// Types
export * from "./types";

// Service
export {
  IntegrationService,
  createIntegrationService,
  integrationService,
  integrationSignature,
  ProviderEndpoints,
} from "./integration-service";
