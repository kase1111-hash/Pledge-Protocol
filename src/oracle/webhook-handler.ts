import { EventEmitter } from "events";
import crypto from "crypto";
import { WebhookPayload } from "./types";
import { OracleRouter } from "./router";
import { ResolutionEngine } from "./resolution-engine";

/**
 * Webhook configuration for an oracle
 */
interface WebhookConfig {
  oracleId: string;
  secret: string;
  signatureHeader: string;
  signatureAlgorithm: "sha256" | "sha1" | "sha512";
  eventMapping: Record<string, string>;  // External event -> internal event
}

/**
 * Webhook Handler
 * Receives and processes webhooks from external oracle sources
 */
export class WebhookHandler extends EventEmitter {
  private configs: Map<string, WebhookConfig> = new Map();
  private processedWebhooks: Set<string> = new Set();  // Idempotency
  private maxProcessedSize = 10000;

  constructor(
    private oracleRouter: OracleRouter,
    private resolutionEngine: ResolutionEngine
  ) {
    super();
  }

  /**
   * Register a webhook configuration
   */
  registerWebhook(config: WebhookConfig): void {
    this.configs.set(config.oracleId, config);
  }

  /**
   * Process incoming webhook
   */
  async handleWebhook(
    oracleId: string,
    body: any,
    headers: Record<string, string>
  ): Promise<{ success: boolean; message: string }> {
    const config = this.configs.get(oracleId);

    if (!config) {
      return { success: false, message: `Unknown oracle: ${oracleId}` };
    }

    // Verify signature
    const signature = headers[config.signatureHeader.toLowerCase()];
    if (!this.verifySignature(body, signature, config)) {
      this.emit("webhook:invalid_signature", oracleId);
      return { success: false, message: "Invalid signature" };
    }

    // Check idempotency
    const webhookId = this.generateWebhookId(oracleId, body);
    if (this.processedWebhooks.has(webhookId)) {
      return { success: true, message: "Already processed" };
    }

    // Parse payload
    const payload = this.parsePayload(body, config);

    // Mark as processed
    this.markProcessed(webhookId);

    // Emit event
    this.emit("webhook:received", payload);

    // Process based on event type
    await this.processWebhookEvent(payload);

    return { success: true, message: "Processed" };
  }

  /**
   * Verify webhook signature
   */
  private verifySignature(
    body: any,
    signature: string | undefined,
    config: WebhookConfig
  ): boolean {
    if (!signature) return false;

    const bodyString = typeof body === "string" ? body : JSON.stringify(body);

    const expectedSignature = crypto
      .createHmac(config.signatureAlgorithm, config.secret)
      .update(bodyString)
      .digest("hex");

    // Handle different signature formats
    const normalizedSignature = signature.replace(/^(sha256=|sha1=|sha512=)/, "");

    return crypto.timingSafeEqual(
      Buffer.from(normalizedSignature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Parse webhook payload into standard format
   */
  private parsePayload(body: any, config: WebhookConfig): WebhookPayload {
    const eventType = config.eventMapping[body.event] || body.event || "unknown";

    return {
      oracleId: config.oracleId,
      eventType,
      data: body.data || body,
      timestamp: body.timestamp || Date.now(),
    };
  }

  /**
   * Process webhook event
   */
  private async processWebhookEvent(payload: WebhookPayload): Promise<void> {
    switch (payload.eventType) {
      case "race_completed":
        await this.handleRaceCompleted(payload);
        break;

      case "pr_merged":
        await this.handlePRMerged(payload);
        break;

      case "milestone_completed":
        await this.handleMilestoneCompleted(payload);
        break;

      case "data_available":
        await this.handleDataAvailable(payload);
        break;

      default:
        this.emit("webhook:unknown_event", payload);
    }
  }

  /**
   * Handle race completed event
   */
  private async handleRaceCompleted(payload: WebhookPayload): Promise<void> {
    const { eventId, bibNumber, campaignId } = payload.data;

    if (campaignId) {
      // Trigger resolution for the campaign
      await this.resolutionEngine.triggerResolution(campaignId, "webhook");
      this.emit("webhook:resolution_triggered", campaignId);
    }
  }

  /**
   * Handle PR merged event
   */
  private async handlePRMerged(payload: WebhookPayload): Promise<void> {
    const { campaignId, prNumber, repo } = payload.data;

    if (campaignId) {
      await this.resolutionEngine.triggerResolution(campaignId, "webhook");
      this.emit("webhook:resolution_triggered", campaignId);
    }
  }

  /**
   * Handle generic milestone completed event
   */
  private async handleMilestoneCompleted(payload: WebhookPayload): Promise<void> {
    const { campaignId, milestoneId } = payload.data;

    // Update oracle data
    await this.oracleRouter.query({
      oracleId: payload.oracleId,
      campaignId,
      milestoneId,
      params: payload.data,
    });

    // Check if all milestones are complete
    // This could trigger full resolution
    this.emit("webhook:milestone_updated", campaignId, milestoneId);
  }

  /**
   * Handle data available event (generic)
   */
  private async handleDataAvailable(payload: WebhookPayload): Promise<void> {
    const { campaignId } = payload.data;

    if (campaignId) {
      // Refresh oracle data and potentially trigger resolution
      await this.resolutionEngine.triggerResolution(campaignId, "webhook");
    }
  }

  /**
   * Generate unique webhook ID for idempotency
   */
  private generateWebhookId(oracleId: string, body: any): string {
    const bodyHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex")
      .slice(0, 16);

    return `${oracleId}:${bodyHash}`;
  }

  /**
   * Mark webhook as processed
   */
  private markProcessed(webhookId: string): void {
    this.processedWebhooks.add(webhookId);

    // Trim if too large
    if (this.processedWebhooks.size > this.maxProcessedSize) {
      const toDelete = Array.from(this.processedWebhooks).slice(
        0,
        this.maxProcessedSize / 2
      );
      toDelete.forEach((id) => this.processedWebhooks.delete(id));
    }
  }

  /**
   * Get webhook stats
   */
  getStats(): { registeredWebhooks: number; processedCount: number } {
    return {
      registeredWebhooks: this.configs.size,
      processedCount: this.processedWebhooks.size,
    };
  }
}

/**
 * Create webhook endpoint configuration
 */
export function createWebhookEndpoint(
  oracleId: string,
  handler: WebhookHandler
) {
  return async (req: any, res: any) => {
    try {
      const result = await handler.handleWebhook(
        oracleId,
        req.body,
        req.headers
      );

      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: (error as Error).message,
      });
    }
  };
}
