/**
 * Phase 10: Integration Service
 *
 * Connects Pledge Protocol to Slack, Discord, Zapier, and more.
 */

import {
  IntegrationType,
  IntegrationStatus,
  IntegrationEventType,
  Integration,
  IntegrationConfig,
  SlackConfig,
  DiscordConfig,
  ZapierConfig,
  TelegramConfig,
  CalendarConfig,
  WebhookConfig,
  IntegrationFilters,
  IntegrationMessage,
  IntegrationPayload,
  SlackMessage,
  SlackBlock,
  DiscordWebhookPayload,
  DiscordEmbed,
  ZapierPayload,
  CalendarEvent,
  OAuthState,
  OAuthTokens,
  CreateIntegrationParams,
  UpdateIntegrationParams,
  OAuthParams,
} from "./types";

// ============================================================================
// COLOR MAPPING
// ============================================================================

const EVENT_COLORS: Record<IntegrationEventType, { hex: string; decimal: number }> = {
  campaign_created: { hex: "#4F46E5", decimal: 5194469 }, // Indigo
  campaign_launched: { hex: "#10B981", decimal: 1096577 }, // Green
  campaign_funded: { hex: "#F59E0B", decimal: 16097803 }, // Amber
  campaign_resolved: { hex: "#8B5CF6", decimal: 9133302 }, // Purple
  pledge_created: { hex: "#3B82F6", decimal: 3899126 }, // Blue
  pledge_released: { hex: "#10B981", decimal: 1096577 }, // Green
  milestone_verified: { hex: "#22C55E", decimal: 2278750 }, // Green
  dispute_created: { hex: "#EF4444", decimal: 15684676 }, // Red
  dispute_resolved: { hex: "#6366F1", decimal: 6514417 }, // Indigo
  new_follower: { hex: "#EC4899", decimal: 15485081 }, // Pink
  new_comment: { hex: "#14B8A6", decimal: 1358006 }, // Teal
};

// ============================================================================
// INTEGRATION SERVICE
// ============================================================================

export class IntegrationService {
  private integrations: Map<string, Integration> = new Map();
  private messages: Map<string, IntegrationMessage> = new Map();
  private oauthStates: Map<string, OAuthState> = new Map();
  private baseUrl: string;

  constructor(config: { baseUrl: string }) {
    this.baseUrl = config.baseUrl;
  }

  // ==========================================================================
  // INTEGRATION MANAGEMENT
  // ==========================================================================

  createIntegration(params: CreateIntegrationParams): Integration {
    const integration: Integration = {
      id: `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: params.type,
      ownerAddress: params.ownerAddress,
      name: params.name,
      status: "connected",
      config: params.config,
      events: params.events,
      filters: params.filters,
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        errorCount: 0,
      },
    };

    this.integrations.set(integration.id, integration);
    return integration;
  }

  getIntegration(id: string): Integration | null {
    return this.integrations.get(id) || null;
  }

  listIntegrations(ownerAddress: string): Integration[] {
    return Array.from(this.integrations.values()).filter(
      (i) => i.ownerAddress === ownerAddress
    );
  }

  updateIntegration(id: string, updates: UpdateIntegrationParams): Integration {
    const integration = this.integrations.get(id);
    if (!integration) {
      throw new Error("Integration not found");
    }

    const updated: Integration = {
      ...integration,
      name: updates.name ?? integration.name,
      events: updates.events ?? integration.events,
      filters: updates.filters ?? integration.filters,
      status: updates.status ?? integration.status,
      metadata: {
        ...integration.metadata,
        updatedAt: Date.now(),
      },
    };

    this.integrations.set(id, updated);
    return updated;
  }

  deleteIntegration(id: string): boolean {
    return this.integrations.delete(id);
  }

  async testIntegration(id: string): Promise<{ success: boolean; error?: string }> {
    const integration = this.integrations.get(id);
    if (!integration) {
      return { success: false, error: "Integration not found" };
    }

    try {
      const testPayload = this.formatPayload("campaign_created", {
        campaignId: "test_campaign",
        campaignName: "Test Campaign",
        creatorAddress: integration.ownerAddress,
        timestamp: Date.now(),
        isTest: true,
      });

      await this.sendMessage(id, testPayload);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ==========================================================================
  // OAUTH
  // ==========================================================================

  getOAuthUrl(type: IntegrationType, params: OAuthParams): string {
    const state: OAuthState = {
      type,
      ownerAddress: params.ownerAddress,
      returnUrl: params.returnUrl,
      nonce: Math.random().toString(36).substr(2, 16),
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    };

    const stateToken = Buffer.from(JSON.stringify(state)).toString("base64url");
    this.oauthStates.set(stateToken, state);

    const redirectUri = `${this.baseUrl}/api/v1/integrations/oauth/callback`;

    switch (type) {
      case "slack":
        return this.getSlackOAuthUrl(stateToken, redirectUri, params.scopes);
      case "discord":
        return this.getDiscordOAuthUrl(stateToken, redirectUri, params.scopes);
      case "calendar":
        return this.getGoogleCalendarOAuthUrl(stateToken, redirectUri, params.scopes);
      default:
        throw new Error(`OAuth not supported for ${type}`);
    }
  }

  private getSlackOAuthUrl(state: string, redirectUri: string, scopes?: string[]): string {
    const clientId = process.env.SLACK_CLIENT_ID || "";
    const defaultScopes = ["channels:read", "chat:write", "incoming-webhook"];
    const scopeString = (scopes || defaultScopes).join(",");

    return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopeString}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  }

  private getDiscordOAuthUrl(state: string, redirectUri: string, scopes?: string[]): string {
    const clientId = process.env.DISCORD_CLIENT_ID || "";
    const defaultScopes = ["webhook.incoming", "guilds"];
    const scopeString = (scopes || defaultScopes).join(" ");

    return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&scope=${encodeURIComponent(scopeString)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;
  }

  private getGoogleCalendarOAuthUrl(state: string, redirectUri: string, scopes?: string[]): string {
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const defaultScopes = ["https://www.googleapis.com/auth/calendar.events"];
    const scopeString = (scopes || defaultScopes).join(" ");

    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopeString)}&state=${state}&access_type=offline`;
  }

  async handleOAuthCallback(
    type: IntegrationType,
    code: string,
    state: string
  ): Promise<Integration> {
    const oauthState = this.oauthStates.get(state);
    if (!oauthState || oauthState.expiresAt < Date.now()) {
      throw new Error("Invalid or expired OAuth state");
    }

    this.oauthStates.delete(state);

    // Exchange code for tokens (simulated)
    const tokens = await this.exchangeCodeForTokens(type, code);

    // Create integration based on type
    let config: IntegrationConfig;

    switch (type) {
      case "slack":
        config = {
          type: "slack",
          workspaceId: "W12345",
          workspaceName: "My Workspace",
          channelId: "C12345",
          channelName: "general",
          botToken: tokens.accessToken,
        };
        break;

      case "discord":
        config = {
          type: "discord",
          guildId: "G12345",
          guildName: "My Server",
          channelId: "C12345",
          channelName: "general",
          webhookUrl: `https://discord.com/api/webhooks/${tokens.accessToken}`,
        };
        break;

      case "calendar":
        config = {
          type: "calendar",
          provider: "google",
          calendarId: "primary",
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || "",
          expiresAt: tokens.expiresAt || Date.now() + 3600000,
        };
        break;

      default:
        throw new Error(`OAuth not supported for ${type}`);
    }

    return this.createIntegration({
      type,
      ownerAddress: oauthState.ownerAddress,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} Integration`,
      config,
      events: [
        "campaign_created",
        "pledge_created",
        "milestone_verified",
        "campaign_resolved",
      ],
    });
  }

  private async exchangeCodeForTokens(
    _type: IntegrationType,
    _code: string
  ): Promise<OAuthTokens> {
    // In production, this would call the OAuth provider's token endpoint
    return {
      accessToken: `tok_${Math.random().toString(36).substr(2, 32)}`,
      refreshToken: `ref_${Math.random().toString(36).substr(2, 32)}`,
      expiresAt: Date.now() + 3600000,
      tokenType: "Bearer",
    };
  }

  // ==========================================================================
  // MESSAGE SENDING
  // ==========================================================================

  async sendMessage(
    integrationId: string,
    payload: IntegrationPayload
  ): Promise<IntegrationMessage> {
    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error("Integration not found");
    }

    if (integration.status !== "connected") {
      throw new Error(`Integration is ${integration.status}`);
    }

    // Check if event is enabled
    if (!integration.events.includes(payload.eventType)) {
      throw new Error("Event type not enabled for this integration");
    }

    // Check filters
    if (!this.matchesFilters(integration.filters, payload.data)) {
      throw new Error("Payload does not match filters");
    }

    const message: IntegrationMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      integrationId,
      eventType: payload.eventType,
      payload,
      status: "pending",
      attempts: 0,
      createdAt: Date.now(),
    };

    try {
      message.attempts++;

      switch (integration.type) {
        case "slack":
          await this.sendSlackMessage(
            integration,
            this.formatSlackMessage(payload)
          );
          break;

        case "discord":
          await this.sendDiscordMessage(
            integration,
            this.formatDiscordPayload(payload)
          );
          break;

        case "zapier":
          await this.sendZapierWebhook(
            integration,
            this.formatZapierPayload(payload)
          );
          break;

        case "telegram":
          await this.sendTelegramMessage(integration, payload);
          break;

        case "webhook":
          await this.sendWebhook(integration, payload);
          break;
      }

      message.status = "sent";
      message.sentAt = Date.now();
      integration.metadata.lastUsedAt = Date.now();
    } catch (error) {
      message.status = "failed";
      message.errorMessage = error instanceof Error ? error.message : "Unknown error";
      integration.metadata.errorCount++;
      integration.metadata.lastError = message.errorMessage;
    }

    this.messages.set(message.id, message);
    this.integrations.set(integrationId, integration);

    return message;
  }

  async broadcastEvent(
    ownerAddress: string,
    eventType: IntegrationEventType,
    data: Record<string, unknown>
  ): Promise<IntegrationMessage[]> {
    const integrations = this.listIntegrations(ownerAddress).filter(
      (i) => i.status === "connected" && i.events.includes(eventType)
    );

    const payload = this.formatPayload(eventType, data);
    const messages: IntegrationMessage[] = [];

    for (const integration of integrations) {
      try {
        const message = await this.sendMessage(integration.id, payload);
        messages.push(message);
      } catch {
        // Continue with other integrations
      }
    }

    return messages;
  }

  private matchesFilters(
    filters: IntegrationFilters | undefined,
    data: Record<string, unknown>
  ): boolean {
    if (!filters) return true;

    if (filters.campaignIds?.length) {
      if (!filters.campaignIds.includes(data.campaignId as string)) {
        return false;
      }
    }

    if (filters.categories?.length) {
      if (!filters.categories.includes(data.category as string)) {
        return false;
      }
    }

    if (filters.minAmount) {
      const amount = parseFloat(data.amount as string) || 0;
      if (amount < parseFloat(filters.minAmount)) {
        return false;
      }
    }

    if (filters.creatorAddresses?.length) {
      if (!filters.creatorAddresses.includes(data.creatorAddress as string)) {
        return false;
      }
    }

    return true;
  }

  // ==========================================================================
  // PLATFORM-SPECIFIC SENDING
  // ==========================================================================

  async sendSlackMessage(
    integration: Integration,
    message: SlackMessage
  ): Promise<boolean> {
    const config = integration.config as SlackConfig;

    // In production, use Slack Web API
    console.log(`[Slack] Sending to ${config.channelName}:`, message.text);

    // Simulate API call
    // const response = await fetch("https://slack.com/api/chat.postMessage", {
    //   method: "POST",
    //   headers: {
    //     "Authorization": `Bearer ${config.botToken}`,
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({ ...message, channel: config.channelId }),
    // });

    return true;
  }

  async sendDiscordMessage(
    integration: Integration,
    payload: DiscordWebhookPayload
  ): Promise<boolean> {
    const config = integration.config as DiscordConfig;

    // In production, POST to Discord webhook
    console.log(`[Discord] Sending to ${config.channelName}:`, payload.content);

    // const response = await fetch(config.webhookUrl, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify(payload),
    // });

    return true;
  }

  async sendZapierWebhook(
    integration: Integration,
    payload: ZapierPayload
  ): Promise<boolean> {
    const config = integration.config as ZapierConfig;

    // In production, POST to Zapier webhook
    console.log(`[Zapier] Sending webhook:`, payload.event);

    // const response = await fetch(config.webhookUrl, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify(payload),
    // });

    return true;
  }

  async sendTelegramMessage(
    integration: Integration,
    payload: IntegrationPayload
  ): Promise<boolean> {
    const config = integration.config as TelegramConfig;

    // In production, use Telegram Bot API
    console.log(`[Telegram] Sending to ${config.chatId}:`, payload.formatted?.title);

    // const response = await fetch(
    //   `https://api.telegram.org/bot${config.botToken}/sendMessage`,
    //   {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({
    //       chat_id: config.chatId,
    //       text: payload.formatted?.description,
    //       parse_mode: "HTML",
    //     }),
    //   }
    // );

    return true;
  }

  async sendWebhook(
    integration: Integration,
    payload: IntegrationPayload
  ): Promise<boolean> {
    const config = integration.config as WebhookConfig;

    // In production, POST to custom webhook
    console.log(`[Webhook] Sending to ${config.url}:`, payload.eventType);

    // const headers: Record<string, string> = {
    //   "Content-Type": "application/json",
    //   ...config.headers,
    // };
    //
    // if (config.secret) {
    //   headers["X-Webhook-Secret"] = config.secret;
    // }
    //
    // const response = await fetch(config.url, {
    //   method: "POST",
    //   headers,
    //   body: JSON.stringify(payload),
    // });

    return true;
  }

  async createCalendarEvent(
    integration: Integration,
    event: CalendarEvent
  ): Promise<CalendarEvent> {
    const config = integration.config as CalendarConfig;

    // In production, use Google Calendar API
    console.log(`[Calendar] Creating event:`, event.title);

    // const response = await fetch(
    //   `https://www.googleapis.com/calendar/v3/calendars/${config.calendarId}/events`,
    //   {
    //     method: "POST",
    //     headers: {
    //       Authorization: `Bearer ${config.accessToken}`,
    //       "Content-Type": "application/json",
    //     },
    //     body: JSON.stringify(event),
    //   }
    // );

    return {
      ...event,
      id: `evt_${Date.now()}`,
    };
  }

  // ==========================================================================
  // PAYLOAD FORMATTING
  // ==========================================================================

  formatPayload(
    eventType: IntegrationEventType,
    data: Record<string, unknown>
  ): IntegrationPayload {
    const color = EVENT_COLORS[eventType];

    const formatted = this.getFormattedContent(eventType, data, color.hex);

    return {
      eventType,
      timestamp: Date.now(),
      data,
      formatted,
    };
  }

  private getFormattedContent(
    eventType: IntegrationEventType,
    data: Record<string, unknown>,
    color: string
  ): IntegrationPayload["formatted"] {
    switch (eventType) {
      case "campaign_created":
        return {
          title: "New Campaign Created",
          description: `**${data.campaignName}** has been created by ${this.formatAddress(data.creatorAddress as string)}`,
          color,
          fields: [
            { name: "Goal", value: this.formatCurrency(data.goalAmount as string), inline: true },
            { name: "Deadline", value: this.formatDate(data.deadline as number), inline: true },
          ],
          url: data.campaignUrl as string,
        };

      case "pledge_created":
        return {
          title: "New Pledge Received",
          description: `${this.formatAddress(data.backerAddress as string)} pledged to **${data.campaignName}**`,
          color,
          fields: [
            { name: "Amount", value: this.formatCurrency(data.amount as string), inline: true },
            { name: "Type", value: data.pledgeType as string, inline: true },
          ],
          url: data.pledgeUrl as string,
        };

      case "milestone_verified":
        return {
          title: "Milestone Verified",
          description: `**${data.milestoneName}** has been verified for **${data.campaignName}**`,
          color,
          fields: [
            { name: "Oracle", value: data.oracleType as string, inline: true },
            { name: "Result", value: data.result as string, inline: true },
          ],
          url: data.campaignUrl as string,
        };

      case "campaign_funded":
        return {
          title: "Campaign Fully Funded!",
          description: `**${data.campaignName}** has reached its funding goal!`,
          color,
          fields: [
            { name: "Total Raised", value: this.formatCurrency(data.totalRaised as string), inline: true },
            { name: "Backers", value: String(data.backerCount), inline: true },
          ],
          url: data.campaignUrl as string,
        };

      case "campaign_resolved":
        return {
          title: "Campaign Resolved",
          description: `**${data.campaignName}** has been resolved`,
          color,
          fields: [
            { name: "Released", value: this.formatCurrency(data.releasedAmount as string), inline: true },
            { name: "Refunded", value: this.formatCurrency(data.refundedAmount as string), inline: true },
          ],
          url: data.campaignUrl as string,
        };

      case "dispute_created":
        return {
          title: "Dispute Filed",
          description: `A dispute has been filed for **${data.campaignName}**`,
          color,
          fields: [
            { name: "Category", value: data.category as string, inline: true },
            { name: "Filed By", value: this.formatAddress(data.filedBy as string), inline: true },
          ],
          url: data.disputeUrl as string,
        };

      case "new_follower":
        return {
          title: "New Follower",
          description: `${this.formatAddress(data.followerAddress as string)} started following you`,
          color,
          url: data.profileUrl as string,
        };

      case "new_comment":
        return {
          title: "New Comment",
          description: `${this.formatAddress(data.commenterAddress as string)} commented on **${data.campaignName}**`,
          color,
          fields: [
            { name: "Comment", value: (data.commentPreview as string).substring(0, 100), inline: false },
          ],
          url: data.commentUrl as string,
        };

      default:
        return {
          title: eventType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          description: JSON.stringify(data),
          color,
        };
    }
  }

  private formatSlackMessage(payload: IntegrationPayload): SlackMessage {
    const formatted = payload.formatted!;
    const color = EVENT_COLORS[payload.eventType];

    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: formatted.title,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: formatted.description.replace(/\*\*/g, "*"),
        },
      },
    ];

    if (formatted.fields?.length) {
      blocks.push({
        type: "section",
        fields: formatted.fields.map((f) => ({
          type: "mrkdwn" as const,
          text: `*${f.name}*\n${f.value}`,
        })),
      });
    }

    if (formatted.url) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `<${formatted.url}|View Details>`,
        },
      });
    }

    return {
      channel: "", // Will be set from config
      text: formatted.description,
      blocks,
      attachments: [
        {
          color: color.hex,
          footer: "Pledge Protocol",
          ts: Math.floor(payload.timestamp / 1000),
        },
      ],
    };
  }

  private formatDiscordPayload(payload: IntegrationPayload): DiscordWebhookPayload {
    const formatted = payload.formatted!;
    const color = EVENT_COLORS[payload.eventType];

    const embed: DiscordEmbed = {
      title: formatted.title,
      description: formatted.description,
      color: color.decimal,
      timestamp: new Date(payload.timestamp).toISOString(),
      footer: {
        text: "Pledge Protocol",
      },
    };

    if (formatted.fields?.length) {
      embed.fields = formatted.fields.map((f) => ({
        name: f.name,
        value: f.value,
        inline: f.inline,
      }));
    }

    if (formatted.url) {
      embed.url = formatted.url;
    }

    if (formatted.imageUrl) {
      embed.thumbnail = { url: formatted.imageUrl };
    }

    return {
      username: "Pledge Protocol",
      embeds: [embed],
    };
  }

  private formatZapierPayload(payload: IntegrationPayload): ZapierPayload {
    return {
      event: payload.eventType,
      timestamp: new Date(payload.timestamp).toISOString(),
      data: {
        ...payload.data,
        formatted: payload.formatted,
      },
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private formatAddress(address: string): string {
    if (!address) return "Unknown";
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }

  private formatCurrency(amount: string | undefined): string {
    if (!amount) return "$0.00";
    const num = parseFloat(amount);
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private formatDate(timestamp: number | undefined): string {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  getIntegrationStats(ownerAddress: string): {
    total: number;
    byType: Record<IntegrationType, number>;
    byStatus: Record<IntegrationStatus, number>;
    messagesSent: number;
    messagesLast24h: number;
  } {
    const integrations = this.listIntegrations(ownerAddress);

    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const integration of integrations) {
      byType[integration.type] = (byType[integration.type] || 0) + 1;
      byStatus[integration.status] = (byStatus[integration.status] || 0) + 1;
    }

    const integrationIds = new Set(integrations.map((i) => i.id));
    const messages = Array.from(this.messages.values()).filter(
      (m) => integrationIds.has(m.integrationId)
    );

    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    const messagesLast24h = messages.filter((m) => m.createdAt >= yesterday).length;

    return {
      total: integrations.length,
      byType: byType as Record<IntegrationType, number>,
      byStatus: byStatus as Record<IntegrationStatus, number>,
      messagesSent: messages.filter((m) => m.status === "sent").length,
      messagesLast24h,
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createIntegrationService(config: { baseUrl: string }): IntegrationService {
  return new IntegrationService(config);
}

// Default instance
export const integrationService = new IntegrationService({
  baseUrl: process.env.BASE_URL || "https://app.pledgeprotocol.io",
});
