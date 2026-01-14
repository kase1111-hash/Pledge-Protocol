/**
 * Phase 10: Integration Hub Types
 *
 * Third-party integrations (Slack, Discord, Zapier, etc.)
 */

// ============================================================================
// INTEGRATION TYPES
// ============================================================================

export type IntegrationType =
  | "slack"
  | "discord"
  | "zapier"
  | "telegram"
  | "email"
  | "webhook"
  | "calendar";

export type IntegrationStatus =
  | "pending"
  | "connected"
  | "disconnected"
  | "error"
  | "expired";

export type IntegrationEventType =
  | "campaign_created"
  | "campaign_launched"
  | "campaign_funded"
  | "campaign_resolved"
  | "pledge_created"
  | "pledge_released"
  | "milestone_verified"
  | "dispute_created"
  | "dispute_resolved"
  | "new_follower"
  | "new_comment";

// ============================================================================
// INTEGRATION CONFIG
// ============================================================================

export interface Integration {
  id: string;
  type: IntegrationType;
  ownerAddress: string;
  name: string;
  status: IntegrationStatus;
  config: IntegrationConfig;
  events: IntegrationEventType[];
  filters?: IntegrationFilters;
  metadata: {
    createdAt: number;
    updatedAt: number;
    lastUsedAt?: number;
    errorCount: number;
    lastError?: string;
  };
}

export type IntegrationConfig =
  | SlackConfig
  | DiscordConfig
  | ZapierConfig
  | TelegramConfig
  | CalendarConfig
  | WebhookConfig;

export interface SlackConfig {
  type: "slack";
  workspaceId: string;
  workspaceName: string;
  channelId: string;
  channelName: string;
  botToken: string;
  accessToken?: string;
  teamId?: string;
  installedBy?: string;
}

export interface DiscordConfig {
  type: "discord";
  guildId: string;
  guildName: string;
  channelId: string;
  channelName: string;
  webhookUrl: string;
  botToken?: string;
}

export interface ZapierConfig {
  type: "zapier";
  webhookUrl: string;
  zapId?: string;
  zapName?: string;
}

export interface TelegramConfig {
  type: "telegram";
  chatId: string;
  chatName?: string;
  botToken: string;
}

export interface CalendarConfig {
  type: "calendar";
  provider: "google" | "outlook" | "apple";
  calendarId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface WebhookConfig {
  type: "webhook";
  url: string;
  secret?: string;
  headers?: Record<string, string>;
}

export interface IntegrationFilters {
  campaignIds?: string[];
  categories?: string[];
  minAmount?: string;
  creatorAddresses?: string[];
}

// ============================================================================
// INTEGRATION MESSAGES
// ============================================================================

export interface IntegrationMessage {
  id: string;
  integrationId: string;
  eventType: IntegrationEventType;
  payload: IntegrationPayload;
  status: "pending" | "sent" | "failed";
  attempts: number;
  sentAt?: number;
  errorMessage?: string;
  createdAt: number;
}

export interface IntegrationPayload {
  eventType: IntegrationEventType;
  timestamp: number;
  data: Record<string, unknown>;
  formatted?: {
    title: string;
    description: string;
    color?: string;
    fields?: { name: string; value: string; inline?: boolean }[];
    url?: string;
    imageUrl?: string;
  };
}

// ============================================================================
// SLACK SPECIFIC
// ============================================================================

export interface SlackMessage {
  channel: string;
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
  thread_ts?: string;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
}

export interface SlackBlock {
  type: "section" | "divider" | "header" | "context" | "actions" | "image";
  text?: {
    type: "plain_text" | "mrkdwn";
    text: string;
    emoji?: boolean;
  };
  fields?: {
    type: "plain_text" | "mrkdwn";
    text: string;
  }[];
  accessory?: unknown;
  elements?: unknown[];
  image_url?: string;
  alt_text?: string;
}

export interface SlackAttachment {
  color?: string;
  fallback?: string;
  title?: string;
  title_link?: string;
  text?: string;
  fields?: {
    title: string;
    value: string;
    short?: boolean;
  }[];
  footer?: string;
  footer_icon?: string;
  ts?: number;
}

// ============================================================================
// DISCORD SPECIFIC
// ============================================================================

export interface DiscordWebhookPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  tts?: boolean;
  embeds?: DiscordEmbed[];
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: {
    text: string;
    icon_url?: string;
  };
  image?: {
    url: string;
  };
  thumbnail?: {
    url: string;
  };
  author?: {
    name: string;
    url?: string;
    icon_url?: string;
  };
  fields?: {
    name: string;
    value: string;
    inline?: boolean;
  }[];
}

// ============================================================================
// ZAPIER SPECIFIC
// ============================================================================

export interface ZapierPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

// ============================================================================
// CALENDAR SPECIFIC
// ============================================================================

export interface CalendarEvent {
  id?: string;
  title: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  location?: string;
  reminders?: {
    useDefault: boolean;
    overrides?: { method: "email" | "popup"; minutes: number }[];
  };
}

// ============================================================================
// OAUTH
// ============================================================================

export interface OAuthState {
  type: IntegrationType;
  ownerAddress: string;
  returnUrl: string;
  nonce: string;
  expiresAt: number;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType: string;
  scope?: string;
}

// ============================================================================
// INTEGRATION SERVICE INTERFACE
// ============================================================================

export interface IntegrationServiceInterface {
  // Integration management
  createIntegration(params: CreateIntegrationParams): Integration;
  getIntegration(id: string): Integration | null;
  listIntegrations(ownerAddress: string): Integration[];
  updateIntegration(id: string, updates: UpdateIntegrationParams): Integration;
  deleteIntegration(id: string): boolean;
  testIntegration(id: string): Promise<{ success: boolean; error?: string }>;

  // OAuth
  getOAuthUrl(type: IntegrationType, params: OAuthParams): string;
  handleOAuthCallback(
    type: IntegrationType,
    code: string,
    state: string
  ): Promise<Integration>;

  // Message sending
  sendMessage(integrationId: string, payload: IntegrationPayload): Promise<IntegrationMessage>;
  broadcastEvent(
    ownerAddress: string,
    eventType: IntegrationEventType,
    data: Record<string, unknown>
  ): Promise<IntegrationMessage[]>;

  // Platform-specific
  sendSlackMessage(integration: Integration, message: SlackMessage): Promise<boolean>;
  sendDiscordMessage(integration: Integration, payload: DiscordWebhookPayload): Promise<boolean>;
  sendZapierWebhook(integration: Integration, payload: ZapierPayload): Promise<boolean>;
  createCalendarEvent(integration: Integration, event: CalendarEvent): Promise<CalendarEvent>;

  // Utilities
  formatPayload(eventType: IntegrationEventType, data: Record<string, unknown>): IntegrationPayload;
}

export interface CreateIntegrationParams {
  type: IntegrationType;
  ownerAddress: string;
  name: string;
  config: IntegrationConfig;
  events: IntegrationEventType[];
  filters?: IntegrationFilters;
}

export interface UpdateIntegrationParams {
  name?: string;
  events?: IntegrationEventType[];
  filters?: IntegrationFilters;
  status?: IntegrationStatus;
}

export interface OAuthParams {
  ownerAddress: string;
  returnUrl: string;
  scopes?: string[];
}
