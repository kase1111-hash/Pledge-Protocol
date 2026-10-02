/**
 * Which service state the API persists, and the hooks that keep it durable.
 *
 * Campaigns, pledges, oracles and attestations have dedicated tables (see
 * src/database). Everything else that must survive a restart is bound here to
 * a document collection (see src/database/collections.ts). Caches, provider
 * clients, timers and short-lived challenges are deliberately left out.
 */

import { Request, Response, NextFunction } from "express";
import { getStore, persistence, DomainStore } from "../database";
import { authService } from "../security/auth-service";
import { logger } from "../security/audit-logger";
import { disputeService } from "../governance";
import { commemorativeService, pledgeTokenService } from "../tokens";
import { socialService } from "../social";
import { notificationService } from "../notifications";
import { notificationService as notificationServiceV2 } from "../notifications-v2";
import { advancedCampaignService } from "../campaigns-advanced";
import { reportService } from "../reporting";
import { integrationService } from "../integrations";
import { translationService } from "../i18n";
import { templateService } from "../templates";
import { multiChainRegistry } from "../multichain/registry";
import { deploymentService } from "../multichain/deployment-service";
import { jobQueue } from "../infrastructure/job-queue";
import { resolutionEngine } from "./resolution-services";
import { gdprService } from "./routes/compliance";
import { orgService } from "./routes/enterprise";
import { fraudDetector } from "./routes/risk";
import { paymentProcessor } from "./routes/payments";

/** Private members are reached by name; bindMap/bindValue verify they exist */
type Fields = Record<string, unknown>;

function bindMaps(prefix: string, owner: object, fields: string[]): void {
  for (const field of fields) {
    persistence.bindMap(`${prefix}.${field}`, owner, field);
  }
}

let registered = false;

/**
 * Bind every persisted field. Throws if a service no longer has a field it is
 * expected to have, so a rename cannot silently stop persisting data.
 */
export function registerPersistentState(): void {
  if (registered) return;
  registered = true;

  bindMaps("auth", authService, ["sessions", "apiKeys", "userRoles", "securityEvents"]);

  bindMaps("disputes", disputeService, ["disputes", "evidence", "votes", "votingPowers", "events"]);

  bindMaps("commemoratives", commemorativeService, [
    "records",
    "recordsByPledge",
    "recordsByCampaign",
    "recordsByBacker",
  ]);
  bindMaps("pledgeTokens", pledgeTokenService, ["pledgeMetadata"]);

  bindMaps("social", socialService, ["profiles", "follows", "comments", "activities", "badges"]);

  bindMaps("notifications", notificationService, ["webhooks", "notifications", "deliveryLogs", "preferences"]);
  bindMaps("notificationsV2", notificationServiceV2, [
    "templates",
    "preferences",
    "notifications",
    "inAppNotifications",
    "digestsSentAt",
  ]);

  // Payments: checkout sessions are indexed by our own session IDs, so the
  // index is needed to find a provider's session after a restart
  const providers = (paymentProcessor as unknown as Fields).providers as Map<string, object>;
  for (const [name, provider] of providers) {
    bindMaps(`payments.${name}`, provider, ["sessionIndex"]);
  }
  const settlements = (paymentProcessor as unknown as Fields).settlementService as object;
  bindMaps("settlements", settlements, ["settlements", "batches"]);
  persistence.bindValue("settlements.pendingSettlements", settlements, "pendingSettlements");
  persistence.bindValue("payments.analytics", paymentProcessor, "analytics");

  bindMaps("enterprise", orgService, [
    "organizations",
    "members",
    "invites",
    "ssoConfigs",
    "billingInfo",
    "bulkOperations",
    "apiKeys",
    "auditLogs",
    "userOrgs",
  ]);

  bindMaps("compliance", gdprService, [
    "exportRequests",
    "deletionRequests",
    "consentRecords",
    "gdprRequests",
    "ccpaRequests",
    "exportFiles",
  ]);

  bindMaps("risk", fraudDetector, [
    "verifications",
    "trustScores",
    "badges",
    "assessments",
    "rules",
    "alerts",
    "blocklist",
  ]);

  bindMaps("advancedCampaigns", advancedCampaignService, [
    "recurringCampaigns",
    "stretchGoals",
    "scheduledActions",
    "campaignSeries",
    "milestoneSchedules",
    "milestoneReminders",
  ]);

  bindMaps("reports", reportService, ["reports", "exports", "scheduledReports", "reportFiles"]);
  bindMaps("integrations", integrationService, ["integrations", "messages", "oauthStates"]);
  bindMaps("i18n", translationService, ["bundles", "userPreferences"]);
  bindMaps("templates", templateService, ["customTemplates", "templateInstances"]);
  bindMaps("multichain", multiChainRegistry, ["contracts", "campaigns"]);
  bindMaps("deployments", deploymentService, ["pendingDeployments", "deploymentResults"]);
  bindMaps("jobs", jobQueue, ["jobs"]);
  bindMaps("resolution", resolutionEngine, ["jobs", "scheduledDeadlines"]);
}

/**
 * Load persisted state into the services and resume interrupted work.
 * Call once at startup, after the database is initialized.
 */
export async function restorePersistentState(store: DomainStore = getStore()): Promise<void> {
  registerPersistentState();
  await persistence.hydrate(store);

  const requeued = jobQueue.requeueInterrupted();
  if (requeued > 0) {
    logger.info("Requeued jobs interrupted by restart", { count: requeued });
  }
  resolutionEngine.restoreScheduledResolutions();
}

export function flushPersistentState(): Promise<void> {
  return persistence.flush(getStore());
}

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Hold the response to any request that may change state until that change
 * is stored, so a success response means the data survives a restart. If
 * storing fails, the client gets a 503 instead of the original response.
 */
export function persistBeforeResponse(req: Request, res: Response, next: NextFunction): void {
  if (READ_ONLY_METHODS.has(req.method)) {
    return next();
  }

  const send = res.json.bind(res);
  res.json = (body?: unknown) => {
    flushPersistentState()
      .then(
        () => send(body),
        (error: Error) => {
          logger.error("Failed to persist state before responding", error, {
            requestId: req.requestId,
            path: req.path,
          });
          res.status(503);
          send({
            error: {
              code: "PERSISTENCE_FAILED",
              message: "The change could not be saved; please retry",
            },
          });
        }
      )
      // Sending is now asynchronous, so the route can no longer catch a
      // failure to serialize its body; hand it to the error middleware
      .catch((error: Error) => {
        if (!res.headersSent) {
          res.json = send;
          next(error);
        }
      });
    return res;
  };

  next();
}
