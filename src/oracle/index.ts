/**
 * Oracle System Exports
 * Phase 2: API Oracle Framework
 * Phase 5: Extended Oracles and Aggregation
 */

// Types
export * from "./types";

// Base classes
export { IOracleProvider, BaseOracleProvider } from "./base-provider";

// Core Providers (Phase 2)
export { ApiOracleProvider } from "./providers/api-provider";
export { RaceTimingProvider } from "./providers/race-timing-provider";
export { GitHubProvider } from "./providers/github-provider";

// Extended Providers (Phase 5)
export { StravaProvider, StravaActivityResult } from "./providers/strava-provider";
export {
  AcademicProvider,
  AcademicVerificationResult,
  DegreeVerification,
} from "./providers/academic-provider";
export {
  StreamingProvider,
  StreamingPlatform,
  ReleaseResult,
  ContentResult,
  ChannelMilestoneResult,
} from "./providers/streaming-provider";
export {
  AggregatorProvider,
  AggregationMethod,
  AggregatedResult,
  SourceResult,
  SourceWeight,
  DisputeInfo,
} from "./providers/aggregator-provider";

// Core services
export { OracleRouter, oracleRouter } from "./router";
export { ResolutionEngine, IResolutionDataProvider } from "./resolution-engine";
export { WebhookHandler, createWebhookEndpoint } from "./webhook-handler";
