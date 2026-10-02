/**
 * Process-wide oracle resolution services, backed by the persistent store
 */

import { ResolutionEngine, WebhookHandler, oracleRouter } from "../oracle";
import { StoreResolutionDataProvider } from "./resolution-provider";
import { resolutionEvents } from "../events";

export const dataProvider = new StoreResolutionDataProvider();
export const resolutionEngine = new ResolutionEngine(oracleRouter, dataProvider);
export const webhookHandler = new WebhookHandler(oracleRouter, resolutionEngine);

resolutionEngine.on("resolution:failed", (job) => {
  // Refusals (pending milestones, wrong status) are expected; log the rest
  if (!job.errorCode) {
    console.error(`Resolution failed: ${job.id}`, job.error);
  }
});

resolutionEngine.on("resolution:completed", (job) => {
  resolutionEvents(job.campaignId);
});
