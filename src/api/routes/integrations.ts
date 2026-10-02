/**
 * Phase 10: Integrations API Routes
 *
 * Slack, Discord, Zapier, and other third-party integrations. Integrations
 * hold their owner's tokens and webhook URLs, so everything except the public
 * catalogs and the OAuth callback requires a session and is limited to the
 * caller's own integrations (admins may manage anyone's).
 */

import { Router, Request, Response, NextFunction } from "express";
import { integrationService } from "../../integrations";
import { authMiddleware, hasRole, isSelfOrAdmin } from "../../security/middleware";
import { webhookUrlProblem } from "../../security/outbound";

const router = Router();

// ============================================================================
// PUBLIC CATALOGS
// ============================================================================

/**
 * GET /integrations/available
 * List available integration types
 */
router.get("/available", (_req: Request, res: Response) => {
  const available = [
    {
      type: "slack",
      name: "Slack",
      description: "Send notifications to Slack channels",
      oauth: true,
      features: ["channels", "direct_messages", "threads"],
    },
    {
      type: "discord",
      name: "Discord",
      description: "Send notifications to Discord servers",
      oauth: true,
      features: ["webhooks", "embeds", "mentions"],
    },
    {
      type: "zapier",
      name: "Zapier",
      description: "Connect with 5000+ apps via Zapier",
      oauth: false,
      features: ["webhooks", "triggers", "actions"],
    },
    {
      type: "telegram",
      name: "Telegram",
      description: "Send notifications to Telegram chats",
      oauth: false,
      features: ["messages", "groups", "channels"],
    },
    {
      type: "calendar",
      name: "Calendar",
      description: "Sync deadlines and milestones to your calendar",
      oauth: true,
      features: ["google", "outlook", "events", "reminders"],
    },
    {
      type: "webhook",
      name: "Custom Webhook",
      description: "Send events to any HTTP endpoint",
      oauth: false,
      features: ["http", "json", "custom_headers"],
    },
  ];

  res.json({ integrations: available });
});

/**
 * GET /integrations/events
 * List available event types
 */
router.get("/events", (_req: Request, res: Response) => {
  const events = [
    { type: "campaign_created", category: "campaign", description: "Campaign created" },
    { type: "campaign_launched", category: "campaign", description: "Campaign launched" },
    { type: "campaign_funded", category: "campaign", description: "Campaign reached goal" },
    { type: "campaign_resolved", category: "campaign", description: "Campaign resolved" },
    { type: "pledge_created", category: "pledge", description: "New pledge received" },
    { type: "pledge_released", category: "pledge", description: "Pledge funds released" },
    { type: "milestone_verified", category: "milestone", description: "Milestone verified" },
    { type: "dispute_created", category: "dispute", description: "Dispute filed" },
    { type: "dispute_resolved", category: "dispute", description: "Dispute resolved" },
    { type: "new_follower", category: "social", description: "New follower" },
    { type: "new_comment", category: "social", description: "New comment" },
  ];

  res.json({ events });
});

// ============================================================================
// OAUTH CALLBACK (reached by the provider's browser redirect, so no session)
// ============================================================================

/**
 * Only same-site paths are allowed as post-OAuth destinations
 */
function isRelativePath(url: unknown): url is string {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") && !url.includes("\\");
}

/**
 * GET /integrations/oauth/callback
 * Handle OAuth callback
 */
router.get("/oauth/callback", async (req: Request, res: Response) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(`/integrations?error=${encodeURIComponent(String(oauthError))}`);
    }

    // Extract type from state
    const stateData = JSON.parse(
      Buffer.from(String(state), "base64url").toString()
    );

    const integration = await integrationService.handleOAuthCallback(
      stateData.type,
      code as string,
      state as string
    );

    const returnUrl = isRelativePath(stateData.returnUrl) ? stateData.returnUrl : "/integrations";
    res.redirect(`${returnUrl}?integrationId=${encodeURIComponent(integration.id)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth failed";
    res.redirect(`/integrations?error=${encodeURIComponent(message)}`);
  }
});

// Everything below requires a session
router.use(authMiddleware());

/**
 * The URL fields of an integration config that the server may later call
 */
function configUrlProblem(config: unknown): string | null {
  if (!config || typeof config !== "object") return null;
  for (const key of ["webhookUrl", "url"]) {
    const value = (config as Record<string, unknown>)[key];
    if (typeof value === "string") {
      const problem = webhookUrlProblem(value);
      if (problem) return `${key}: ${problem}`;
    }
  }
  return null;
}

/** The address whose integrations to act on: the caller, or anyone for admins */
function subject(req: Request, requested: unknown): string {
  return typeof requested === "string" && requested && hasRole(req, "admin")
    ? requested
    : req.auth!.address;
}

/**
 * Integration routes are limited to the integration's owner (or an admin);
 * others get a 404 so IDs cannot be probed
 */
function requireOwnIntegration(req: Request, res: Response, next: NextFunction) {
  const integration = integrationService.getIntegration(req.params.integrationId);
  if (!integration || !isSelfOrAdmin(req, integration.ownerAddress)) {
    return res.status(404).json({ error: "Integration not found" });
  }
  next();
}

// ============================================================================
// INTEGRATION MANAGEMENT
// ============================================================================

/**
 * POST /integrations
 * Create a new integration
 */
router.post("/", (req: Request, res: Response) => {
  try {
    const problem = configUrlProblem(req.body?.config);
    if (problem) {
      return res.status(400).json({ error: `Invalid integration URL (${problem})` });
    }

    const integration = integrationService.createIntegration({
      ...req.body,
      ownerAddress: req.auth!.address,
    });
    res.status(201).json(integration);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to create integration",
    });
  }
});

/**
 * GET /integrations
 * List your integrations (admins may pass ?address=)
 */
router.get("/", (req: Request, res: Response) => {
  const integrations = integrationService.listIntegrations(subject(req, req.query.address));
  res.json({ integrations });
});

/**
 * GET /integrations/stats
 * Get integration statistics
 */
router.get("/stats", (req: Request, res: Response) => {
  const stats = integrationService.getIntegrationStats(subject(req, req.query.address));
  res.json(stats);
});

// ============================================================================
// OAUTH
// ============================================================================

/**
 * GET /integrations/oauth/:type/url
 * Get OAuth authorization URL
 */
router.get("/oauth/:type/url", (req: Request, res: Response) => {
  try {
    const { returnUrl, scopes } = req.query;

    if (returnUrl !== undefined && !isRelativePath(returnUrl)) {
      return res.status(400).json({ error: "returnUrl must be a path on this site" });
    }

    const url = integrationService.getOAuthUrl(req.params.type as any, {
      ownerAddress: req.auth!.address,
      returnUrl: (returnUrl as string) || "/",
      scopes: scopes ? String(scopes).split(",") : undefined,
    });

    res.json({ url });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to generate OAuth URL",
    });
  }
});

// ============================================================================
// MESSAGING
// ============================================================================

/**
 * POST /integrations/broadcast
 * Broadcast an event to all of your integrations
 */
router.post("/broadcast", async (req: Request, res: Response) => {
  try {
    const { eventType, data } = req.body;

    const messages = await integrationService.broadcastEvent(
      subject(req, req.body.address),
      eventType,
      data
    );

    res.json({
      sentCount: messages.filter((m) => m.status === "sent").length,
      failedCount: messages.filter((m) => m.status === "failed").length,
      messages,
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to broadcast",
    });
  }
});

// ============================================================================
// INDIVIDUAL INTEGRATIONS
// Registered last: "/:integrationId" would otherwise capture paths such as
// "/stats".
// ============================================================================

/**
 * GET /integrations/:integrationId
 * Get integration details
 */
router.get("/:integrationId", requireOwnIntegration, (req: Request, res: Response) => {
  const integration = integrationService.getIntegration(req.params.integrationId)!;

  // Remove sensitive data
  const safeIntegration = {
    ...integration,
    config: {
      type: integration.config.type,
      // Don't expose tokens
    },
  };

  res.json(safeIntegration);
});

/**
 * PUT /integrations/:integrationId
 * Update integration
 */
router.put("/:integrationId", requireOwnIntegration, (req: Request, res: Response) => {
  try {
    const problem = configUrlProblem(req.body?.config);
    if (problem) {
      return res.status(400).json({ error: `Invalid integration URL (${problem})` });
    }

    // Ownership and identity are not editable
    const updates = { ...req.body };
    delete updates.ownerAddress;
    delete updates.id;
    const updated = integrationService.updateIntegration(req.params.integrationId, updates);
    res.json(updated);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to update integration",
    });
  }
});

/**
 * DELETE /integrations/:integrationId
 * Delete integration
 */
router.delete("/:integrationId", requireOwnIntegration, (req: Request, res: Response) => {
  integrationService.deleteIntegration(req.params.integrationId);
  res.json({ success: true });
});

/**
 * POST /integrations/:integrationId/test
 * Test integration
 */
router.post("/:integrationId/test", requireOwnIntegration, async (req: Request, res: Response) => {
  const result = await integrationService.testIntegration(req.params.integrationId);
  res.json(result);
});

/**
 * POST /integrations/:integrationId/send
 * Send a message via integration
 */
router.post("/:integrationId/send", requireOwnIntegration, async (req: Request, res: Response) => {
  try {
    const { eventType, data } = req.body;

    const payload = integrationService.formatPayload(eventType, data);
    const message = await integrationService.sendMessage(
      req.params.integrationId,
      payload
    );

    res.json(message);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to send message",
    });
  }
});

export default router;
