/**
 * Webhook API Routes
 * Phase 6: Governance - Webhook management endpoints
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { notificationService } from "../../notifications";
import { NotificationEventType } from "../../notifications/types";

const router = Router();

/**
 * All valid event types
 */
const validEventTypes: NotificationEventType[] = [
  "campaign_created",
  "campaign_activated",
  "campaign_deadline_approaching",
  "campaign_deadline_reached",
  "campaign_resolved",
  "campaign_cancelled",
  "pledge_created",
  "pledge_escrowed",
  "pledge_released",
  "pledge_refunded",
  "pledge_cancelled",
  "milestone_verified",
  "milestone_failed",
  "milestone_pending",
  "oracle_data_received",
  "oracle_timeout",
  "oracle_disagreement",
  "dispute_created",
  "dispute_evidence_added",
  "dispute_voting_opened",
  "dispute_vote_cast",
  "dispute_voting_closed",
  "dispute_escalated",
  "dispute_resolved",
  "dispute_appealed",
  "commemorative_generated",
  "commemorative_minted",
  "system_maintenance",
  "system_upgrade",
];

/**
 * Create webhook schema
 */
const CreateWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  secret: z.string().min(16).max(64).optional(),
  events: z.array(z.string()).min(1),
  campaignIds: z.array(z.string()).optional(),
  addresses: z.array(z.string()).optional(),
  retryCount: z.number().min(0).max(5).optional(),
  retryDelay: z.number().min(1000).max(60000).optional(),
  timeout: z.number().min(5000).max(60000).optional(),
});

/**
 * Update webhook schema
 */
const UpdateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  secret: z.string().min(16).max(64).optional(),
  events: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  campaignIds: z.array(z.string()).optional(),
  addresses: z.array(z.string()).optional(),
  retryCount: z.number().min(0).max(5).optional(),
  retryDelay: z.number().min(1000).max(60000).optional(),
  timeout: z.number().min(5000).max(60000).optional(),
});

/**
 * POST /webhooks
 * Create a new webhook
 */
router.post("/", (req: Request, res: Response) => {
  try {
    const parsed = CreateWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid request body",
        details: parsed.error.errors,
      });
      return;
    }

    // Validate event types
    const invalidEvents = parsed.data.events.filter(
      (e) => !validEventTypes.includes(e as NotificationEventType)
    );
    if (invalidEvents.length > 0) {
      res.status(400).json({
        success: false,
        error: `Invalid event types: ${invalidEvents.join(", ")}`,
        validEventTypes,
      });
      return;
    }

    const createdBy = req.headers["x-wallet-address"] as string || "system";

    const webhook = notificationService.createWebhook(
      {
        ...parsed.data,
        events: parsed.data.events as NotificationEventType[],
      },
      createdBy
    );

    res.status(201).json({
      success: true,
      data: webhook,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /webhooks
 * List webhooks
 */
router.get("/", (req: Request, res: Response) => {
  try {
    const createdBy = req.query.createdBy as string | undefined;
    const webhooks = notificationService.listWebhooks(createdBy);

    res.json({
      success: true,
      data: webhooks,
      count: webhooks.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /webhooks/events
 * List available event types
 */
router.get("/events", (_req: Request, res: Response) => {
  const eventsByCategory = {
    campaign: validEventTypes.filter((e) => e.startsWith("campaign_")),
    pledge: validEventTypes.filter((e) => e.startsWith("pledge_")),
    milestone: validEventTypes.filter((e) => e.startsWith("milestone_")),
    oracle: validEventTypes.filter((e) => e.startsWith("oracle_")),
    dispute: validEventTypes.filter((e) => e.startsWith("dispute_")),
    commemorative: validEventTypes.filter((e) => e.startsWith("commemorative_")),
    system: validEventTypes.filter((e) => e.startsWith("system_")),
  };

  res.json({
    success: true,
    data: {
      all: validEventTypes,
      byCategory: eventsByCategory,
    },
  });
});

/**
 * GET /webhooks/:webhookId
 * Get a specific webhook
 */
router.get("/:webhookId", (req: Request, res: Response) => {
  try {
    const { webhookId } = req.params;
    const webhook = notificationService.getWebhook(webhookId);

    if (!webhook) {
      res.status(404).json({
        success: false,
        error: `Webhook "${webhookId}" not found`,
      });
      return;
    }

    res.json({
      success: true,
      data: webhook,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * PUT /webhooks/:webhookId
 * Update a webhook
 */
router.put("/:webhookId", (req: Request, res: Response) => {
  try {
    const { webhookId } = req.params;
    const parsed = UpdateWebhookSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid request body",
        details: parsed.error.errors,
      });
      return;
    }

    // Validate event types if provided
    if (parsed.data.events) {
      const invalidEvents = parsed.data.events.filter(
        (e) => !validEventTypes.includes(e as NotificationEventType)
      );
      if (invalidEvents.length > 0) {
        res.status(400).json({
          success: false,
          error: `Invalid event types: ${invalidEvents.join(", ")}`,
        });
        return;
      }
    }

    const webhook = notificationService.updateWebhook(webhookId, {
      ...parsed.data,
      events: parsed.data.events as NotificationEventType[] | undefined,
    });

    res.json({
      success: true,
      data: webhook,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * DELETE /webhooks/:webhookId
 * Delete a webhook
 */
router.delete("/:webhookId", (req: Request, res: Response) => {
  try {
    const { webhookId } = req.params;
    const deleted = notificationService.deleteWebhook(webhookId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: `Webhook "${webhookId}" not found`,
      });
      return;
    }

    res.json({
      success: true,
      message: "Webhook deleted",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /webhooks/:webhookId/test
 * Test a webhook
 */
router.post("/:webhookId/test", async (req: Request, res: Response) => {
  try {
    const { webhookId } = req.params;
    const log = await notificationService.testWebhook(webhookId);

    res.json({
      success: true,
      data: log,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /webhooks/:webhookId/logs
 * Get delivery logs for a webhook
 */
router.get("/:webhookId/logs", (req: Request, res: Response) => {
  try {
    const { webhookId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;

    const webhook = notificationService.getWebhook(webhookId);
    if (!webhook) {
      res.status(404).json({
        success: false,
        error: `Webhook "${webhookId}" not found`,
      });
      return;
    }

    const logs = notificationService.getDeliveryLogs(webhookId, limit);

    res.json({
      success: true,
      data: logs,
      count: logs.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
