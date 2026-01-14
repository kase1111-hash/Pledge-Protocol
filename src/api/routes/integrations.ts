/**
 * Phase 10: Integrations API Routes
 *
 * Slack, Discord, Zapier, and other third-party integrations.
 */

import { Router, Request, Response } from "express";
import { integrationService } from "../../integrations";

const router = Router();

// ============================================================================
// INTEGRATION MANAGEMENT
// ============================================================================

/**
 * POST /integrations
 * Create a new integration
 */
router.post("/", (req: Request, res: Response) => {
  try {
    const integration = integrationService.createIntegration(req.body);
    res.status(201).json(integration);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to create integration",
    });
  }
});

/**
 * GET /integrations
 * List integrations for a user
 */
router.get("/", (req: Request, res: Response) => {
  const { address } = req.query;
  const integrations = integrationService.listIntegrations(address as string || "");
  res.json({ integrations });
});

/**
 * GET /integrations/:integrationId
 * Get integration details
 */
router.get("/:integrationId", (req: Request, res: Response) => {
  const integration = integrationService.getIntegration(req.params.integrationId);

  if (!integration) {
    return res.status(404).json({ error: "Integration not found" });
  }

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
router.put("/:integrationId", (req: Request, res: Response) => {
  try {
    const updated = integrationService.updateIntegration(
      req.params.integrationId,
      req.body
    );
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
router.delete("/:integrationId", (req: Request, res: Response) => {
  const success = integrationService.deleteIntegration(req.params.integrationId);

  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Integration not found" });
  }
});

/**
 * POST /integrations/:integrationId/test
 * Test integration
 */
router.post("/:integrationId/test", async (req: Request, res: Response) => {
  const result = await integrationService.testIntegration(req.params.integrationId);
  res.json(result);
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
    const { address, returnUrl, scopes } = req.query;

    const url = integrationService.getOAuthUrl(req.params.type as any, {
      ownerAddress: address as string,
      returnUrl: returnUrl as string || "/",
      scopes: scopes ? String(scopes).split(",") : undefined,
    });

    res.json({ url });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to generate OAuth URL",
    });
  }
});

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

    res.redirect(`${stateData.returnUrl}?integrationId=${integration.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth failed";
    res.redirect(`/integrations?error=${encodeURIComponent(message)}`);
  }
});

// ============================================================================
// MESSAGING
// ============================================================================

/**
 * POST /integrations/:integrationId/send
 * Send a message via integration
 */
router.post("/:integrationId/send", async (req: Request, res: Response) => {
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

/**
 * POST /integrations/broadcast
 * Broadcast event to all integrations
 */
router.post("/broadcast", async (req: Request, res: Response) => {
  try {
    const { address, eventType, data } = req.body;

    const messages = await integrationService.broadcastEvent(
      address,
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
// AVAILABLE INTEGRATIONS
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

// ============================================================================
// EVENT TYPES
// ============================================================================

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
// STATS
// ============================================================================

/**
 * GET /integrations/stats
 * Get integration statistics
 */
router.get("/stats", (req: Request, res: Response) => {
  const { address } = req.query;
  const stats = integrationService.getIntegrationStats(address as string || "");
  res.json(stats);
});

export default router;
