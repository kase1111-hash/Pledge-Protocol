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
import { createHmac } from "crypto";
import { formatEther } from "ethers";
import { requestUserUrl } from "../security/outbound";

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

/** Provider endpoints; overridable for testing */
export interface ProviderEndpoints {
  slack: string;
  discord: string;
  telegram: string;
  googleOAuth: string;
  googleCalendar: string;
}

const PROVIDERS: ProviderEndpoints = {
  slack: "https://slack.com/api",
  discord: "https://discord.com/api",
  telegram: "https://api.telegram.org",
  googleOAuth: "https://oauth2.googleapis.com",
  googleCalendar: "https://www.googleapis.com/calendar/v3",
};

const REQUEST_TIMEOUT_MS = 10_000;

/** Integration types that receive event messages */
const MESSAGING_TYPES: IntegrationType[] = ["slack", "discord", "zapier", "telegram", "webhook"];

const OAUTH_ENV: Partial<Record<IntegrationType, { id: string; secret: string }>> = {
  slack: { id: "SLACK_CLIENT_ID", secret: "SLACK_CLIENT_SECRET" },
  discord: { id: "DISCORD_CLIENT_ID", secret: "DISCORD_CLIENT_SECRET" },
  calendar: { id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
};

function oauthClient(type: IntegrationType): { id: string; secret: string } {
  const names = OAUTH_ENV[type];
  if (!names) {
    throw new Error(`OAuth not supported for ${type}`);
  }
  const id = process.env[names.id];
  const secret = process.env[names.secret];
  if (!id || !secret) {
    throw new Error(`${type} OAuth is not configured (set ${names.id} and ${names.secret})`);
  }
  return { id, secret };
}

function htmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Signature for custom webhook deliveries: HMAC-SHA256 over
 * "<timestamp>.<body>" with the integration's secret
 */
export function integrationSignature(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

// ============================================================================
// INTEGRATION SERVICE
// ============================================================================

export class IntegrationService {
  private integrations: Map<string, Integration> = new Map();
  private messages: Map<string, IntegrationMessage> = new Map();
  private oauthStates: Map<string, OAuthState> = new Map();
  private baseUrl: string;
  private providers: ProviderEndpoints;

  constructor(config: { baseUrl: string; providers?: Partial<ProviderEndpoints> }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.providers = { ...PROVIDERS, ...config.providers };
  }

  /** Where providers send users back after authorizing */
  private get redirectUri(): string {
    return `${this.baseUrl}/v1/integrations/oauth/callback`;
  }

  /**
   * Call a provider or user-supplied URL; throws on network errors and
   * non-2xx responses
   */
  private async call(
    url: string,
    options: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string }
  ): Promise<string> {
    const response = await requestUserUrl(url, {
      method: options.method ?? "POST",
      headers: options.headers,
      body: options.body,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}: ${response.body.slice(0, 200)}`);
    }
    return response.body;
  }

  private async postJson(url: string, payload: unknown, headers: Record<string, string> = {}): Promise<string> {
    return this.call(url, {
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
    });
  }

  private async postForm(url: string, fields: Record<string, string>): Promise<Record<string, any>> {
    const body = await this.call(url, {
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(fields).toString(),
    });
    return JSON.parse(body);
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
      (i) => i.ownerAddress.toLowerCase() === ownerAddress.toLowerCase()
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
    oauthClient(type);

    const state: OAuthState = {
      type,
      ownerAddress: params.ownerAddress,
      returnUrl: params.returnUrl,
      nonce: Math.random().toString(36).substr(2, 16),
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    };

    const stateToken = Buffer.from(JSON.stringify(state)).toString("base64url");
    this.oauthStates.set(stateToken, state);

    const redirectUri = this.redirectUri;

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
    const clientId = encodeURIComponent(oauthClient("slack").id);
    const defaultScopes = ["channels:read", "chat:write", "incoming-webhook"];
    const scopeString = (scopes || defaultScopes).join(",");

    return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${encodeURIComponent(scopeString)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  }

  private getDiscordOAuthUrl(state: string, redirectUri: string, scopes?: string[]): string {
    const clientId = encodeURIComponent(oauthClient("discord").id);
    const defaultScopes = ["webhook.incoming", "guilds"];
    const scopeString = (scopes || defaultScopes).join(" ");

    return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&scope=${encodeURIComponent(scopeString)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;
  }

  private getGoogleCalendarOAuthUrl(state: string, redirectUri: string, scopes?: string[]): string {
    const clientId = encodeURIComponent(oauthClient("calendar").id);
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

    // The stored state, not the caller, decides which provider this is
    if (oauthState.type !== type) {
      throw new Error("OAuth state does not match the integration type");
    }
    const config = await this.exchangeCode(oauthState.type, code);

    return this.createIntegration({
      type: oauthState.type,
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

  /**
   * Exchange an authorization code with the provider for the integration's
   * credentials and destination
   */
  private async exchangeCode(type: IntegrationType, code: string): Promise<IntegrationConfig> {
    if (!code) {
      throw new Error("Missing authorization code");
    }
    const client = oauthClient(type);

    switch (type) {
      case "slack": {
        const result = await this.postForm(`${this.providers.slack}/oauth.v2.access`, {
          client_id: client.id,
          client_secret: client.secret,
          code,
          redirect_uri: this.redirectUri,
        });
        if (!result.ok) throw new Error(`Slack: ${result.error ?? "authorization failed"}`);
        return {
          type: "slack",
          workspaceId: result.team?.id ?? "",
          workspaceName: result.team?.name ?? "",
          channelId: result.incoming_webhook?.channel_id ?? "",
          channelName: result.incoming_webhook?.channel ?? "",
          botToken: result.access_token,
          webhookUrl: result.incoming_webhook?.url,
          installedBy: result.authed_user?.id,
        };
      }

      case "discord": {
        const result = await this.postForm(`${this.providers.discord}/oauth2/token`, {
          client_id: client.id,
          client_secret: client.secret,
          grant_type: "authorization_code",
          code,
          redirect_uri: this.redirectUri,
        });
        if (!result.webhook?.url) throw new Error("Discord: no webhook was granted");
        return {
          type: "discord",
          guildId: result.webhook.guild_id ?? result.guild?.id ?? "",
          guildName: result.guild?.name ?? "",
          channelId: result.webhook.channel_id ?? "",
          channelName: result.webhook.name ?? "",
          webhookUrl: result.webhook.url,
        };
      }

      case "calendar": {
        const tokens = await this.googleToken({
          grant_type: "authorization_code",
          code,
          redirect_uri: this.redirectUri,
        });
        if (!tokens.refreshToken) throw new Error("Google: no refresh token was granted");
        return {
          type: "calendar",
          provider: "google",
          calendarId: "primary",
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt ?? Date.now() + 3600_000,
        };
      }

      default:
        throw new Error(`OAuth not supported for ${type}`);
    }
  }

  private async googleToken(fields: Record<string, string>): Promise<OAuthTokens> {
    const client = oauthClient("calendar");
    const result = await this.postForm(`${this.providers.googleOAuth}/token`, {
      client_id: client.id,
      client_secret: client.secret,
      ...fields,
    });
    if (!result.access_token) throw new Error(`Google: ${result.error ?? "token request failed"}`);
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: Date.now() + Number(result.expires_in ?? 3600) * 1000,
      tokenType: result.token_type ?? "Bearer",
      scope: result.scope,
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

        default:
          throw new Error(`${integration.type} integrations do not receive messages`);
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
      (i) => i.status === "connected" && MESSAGING_TYPES.includes(i.type) && i.events.includes(eventType)
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

  /**
   * Deliver a platform event to every connected integration subscribed to
   * it whose filters match. Events about non-public campaigns only reach the
   * campaign creator's integrations.
   */
  async deliverEvent(
    eventType: IntegrationEventType,
    data: Record<string, unknown>,
    audience?: string[]
  ): Promise<IntegrationMessage[]> {
    const allowed = audience?.map((a) => a.toLowerCase());
    const integrations = Array.from(this.integrations.values()).filter(
      (i) =>
        i.status === "connected" &&
        MESSAGING_TYPES.includes(i.type) &&
        i.events.includes(eventType) &&
        (!allowed || allowed.includes(i.ownerAddress.toLowerCase())) &&
        this.matchesFilters(i.filters, data)
    );

    const payload = this.formatPayload(eventType, data);
    return Promise.all(integrations.map((i) => this.sendMessage(i.id, payload)));
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

    if (filters.minAmount && /^\d+$/.test(filters.minAmount)) {
      const amount = /^\d+$/.test(String(data.amount ?? "")) ? BigInt(String(data.amount)) : 0n;
      if (amount < BigInt(filters.minAmount)) {
        return false;
      }
    }

    if (filters.creatorAddresses?.length) {
      const creator = String(data.creatorAddress ?? "").toLowerCase();
      if (!filters.creatorAddresses.some((a) => a.toLowerCase() === creator)) {
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

    // Incoming webhooks post to the channel chosen at install time
    if (config.webhookUrl) {
      const { channel: _channel, ...rest } = message;
      await this.postJson(config.webhookUrl, rest);
      return true;
    }

    const body = await this.postJson(
      `${this.providers.slack}/chat.postMessage`,
      { ...message, channel: config.channelId },
      { Authorization: `Bearer ${config.botToken}` }
    );
    const result = JSON.parse(body);
    if (!result.ok) {
      throw new Error(`Slack: ${result.error ?? "message rejected"}`);
    }
    return true;
  }

  async sendDiscordMessage(
    integration: Integration,
    payload: DiscordWebhookPayload
  ): Promise<boolean> {
    const config = integration.config as DiscordConfig;
    await this.postJson(config.webhookUrl, payload);
    return true;
  }

  async sendZapierWebhook(
    integration: Integration,
    payload: ZapierPayload
  ): Promise<boolean> {
    const config = integration.config as ZapierConfig;
    await this.postJson(config.webhookUrl, payload);
    return true;
  }

  async sendTelegramMessage(
    integration: Integration,
    payload: IntegrationPayload
  ): Promise<boolean> {
    const config = integration.config as TelegramConfig;
    const formatted = payload.formatted;
    const bold = (text: string) => htmlEscape(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    const lines = formatted
      ? [
          `<b>${htmlEscape(formatted.title)}</b>`,
          bold(formatted.description),
          ...(formatted.fields ?? []).map((f) => `${htmlEscape(f.name)}: ${htmlEscape(String(f.value ?? ""))}`),
          ...(formatted.url ? [htmlEscape(formatted.url)] : []),
        ]
      : [htmlEscape(payload.eventType)];

    const body = await this.postJson(
      `${this.providers.telegram}/bot${encodeURIComponent(config.botToken)}/sendMessage`,
      { chat_id: config.chatId, text: lines.join("\n"), parse_mode: "HTML" }
    );
    const result = JSON.parse(body);
    if (!result.ok) {
      throw new Error(`Telegram: ${result.description ?? "message rejected"}`);
    }
    return true;
  }

  /**
   * POST the payload as JSON. With a secret, the request carries
   * X-Pledge-Timestamp and X-Pledge-Signature (see integrationSignature).
   */
  async sendWebhook(
    integration: Integration,
    payload: IntegrationPayload
  ): Promise<boolean> {
    const config = integration.config as WebhookConfig;
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));

    const headers: Record<string, string> = {
      ...config.headers,
      "Content-Type": "application/json",
      "X-Pledge-Event": payload.eventType,
      "X-Pledge-Timestamp": timestamp,
    };
    if (config.secret) {
      headers["X-Pledge-Signature"] = integrationSignature(config.secret, timestamp, body);
    }

    await this.call(config.url, { headers, body });
    return true;
  }

  async createCalendarEvent(
    integration: Integration,
    event: CalendarEvent
  ): Promise<CalendarEvent> {
    const config = integration.config as CalendarConfig;
    if (config.provider !== "google") {
      throw new Error(`${config.provider} calendars are not supported`);
    }

    // Refresh the access token shortly before it expires
    if (config.expiresAt - 60_000 < Date.now()) {
      const tokens = await this.googleToken({ grant_type: "refresh_token", refresh_token: config.refreshToken });
      config.accessToken = tokens.accessToken;
      config.expiresAt = tokens.expiresAt ?? Date.now() + 3600_000;
      if (tokens.refreshToken) config.refreshToken = tokens.refreshToken;
      integration.metadata.updatedAt = Date.now();
      this.integrations.set(integration.id, integration);
    }

    const { title, ...rest } = event;
    const body = await this.postJson(
      `${this.providers.googleCalendar}/calendars/${encodeURIComponent(config.calendarId)}/events`,
      { ...rest, summary: title },
      { Authorization: `Bearer ${config.accessToken}` }
    );
    const created = JSON.parse(body);

    return {
      ...event,
      id: created.id,
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

  /** Amounts are wei strings */
  private formatCurrency(amount: string | undefined): string {
    if (!amount || !/^\d+$/.test(amount)) return "0 ETH";
    return `${formatEther(amount)} ETH`;
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

export function createIntegrationService(config: {
  baseUrl: string;
  providers?: Partial<ProviderEndpoints>;
}): IntegrationService {
  return new IntegrationService(config);
}

// Default instance
export const integrationService = new IntegrationService({
  baseUrl: /^https?:\/\//.test(process.env.BASE_URL ?? "") ? process.env.BASE_URL! : "https://app.pledgeprotocol.io",
});
