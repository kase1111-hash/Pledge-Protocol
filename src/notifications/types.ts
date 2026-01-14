/**
 * Notification System Types
 * Phase 6: Governance - Notifications and webhooks
 */

/**
 * Notification event types
 */
export type NotificationEventType =
  // Campaign events
  | "campaign_created"
  | "campaign_activated"
  | "campaign_deadline_approaching"
  | "campaign_deadline_reached"
  | "campaign_resolved"
  | "campaign_cancelled"
  // Pledge events
  | "pledge_created"
  | "pledge_escrowed"
  | "pledge_released"
  | "pledge_refunded"
  | "pledge_cancelled"
  // Milestone events
  | "milestone_verified"
  | "milestone_failed"
  | "milestone_pending"
  // Oracle events
  | "oracle_data_received"
  | "oracle_timeout"
  | "oracle_disagreement"
  // Dispute events
  | "dispute_created"
  | "dispute_evidence_added"
  | "dispute_voting_opened"
  | "dispute_vote_cast"
  | "dispute_voting_closed"
  | "dispute_escalated"
  | "dispute_resolved"
  | "dispute_appealed"
  // Commemorative events
  | "commemorative_generated"
  | "commemorative_minted"
  // System events
  | "system_maintenance"
  | "system_upgrade";

/**
 * Notification channels
 */
export type NotificationChannel = "webhook" | "email" | "in_app" | "sms" | "discord" | "telegram";

/**
 * Notification priority
 */
export type NotificationPriority = "low" | "normal" | "high" | "urgent";

/**
 * Notification status
 */
export type NotificationStatus = "pending" | "sent" | "delivered" | "failed" | "read";

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  secret?: string; // For HMAC signature
  events: NotificationEventType[];
  active: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;

  // Filtering
  campaignIds?: string[]; // Only notify for specific campaigns
  addresses?: string[]; // Only notify for specific addresses

  // Delivery settings
  retryCount: number;
  retryDelay: number; // ms
  timeout: number; // ms

  // Statistics
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  lastDeliveryAt?: number;
  lastDeliveryStatus?: "success" | "failed";
}

/**
 * Webhook delivery log
 */
export interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  eventType: NotificationEventType;
  payload: any;
  requestHeaders: Record<string, string>;
  responseStatus?: number;
  responseBody?: string;
  error?: string;
  attempt: number;
  deliveredAt: number;
  durationMs: number;
  success: boolean;
}

/**
 * Notification record
 */
export interface Notification {
  id: string;
  eventType: NotificationEventType;
  channel: NotificationChannel;
  recipient: string; // Address or email or webhook URL
  subject?: string;
  message: string;
  data: Record<string, any>;
  priority: NotificationPriority;
  status: NotificationStatus;
  createdAt: number;
  sentAt?: number;
  deliveredAt?: number;
  readAt?: number;
  error?: string;
  retryCount: number;
}

/**
 * User notification preferences
 */
export interface NotificationPreferences {
  address: string;
  email?: string;
  phone?: string;
  discordWebhook?: string;
  telegramChatId?: string;

  // Channel preferences per event type
  preferences: {
    [K in NotificationEventType]?: {
      enabled: boolean;
      channels: NotificationChannel[];
      priority?: NotificationPriority;
    };
  };

  // Global settings
  quietHoursStart?: number; // Hour (0-23)
  quietHoursEnd?: number; // Hour (0-23)
  timezone?: string;
  digestMode?: "instant" | "hourly" | "daily" | "weekly";

  updatedAt: number;
}

/**
 * Event payload structure
 */
export interface NotificationEvent {
  id: string;
  type: NotificationEventType;
  timestamp: number;
  source: string; // Service that generated the event

  // Context
  campaignId?: string;
  pledgeId?: string;
  disputeId?: string;
  milestoneId?: string;
  oracleId?: string;

  // Actor
  actorAddress?: string;
  actorType?: "backer" | "creator" | "beneficiary" | "oracle" | "system";

  // Payload
  data: Record<string, any>;
  summary: string; // Human-readable summary

  // Priority
  priority: NotificationPriority;
}

/**
 * Create webhook request
 */
export interface CreateWebhookRequest {
  name: string;
  url: string;
  secret?: string;
  events: NotificationEventType[];
  campaignIds?: string[];
  addresses?: string[];
  retryCount?: number;
  retryDelay?: number;
  timeout?: number;
}

/**
 * Update webhook request
 */
export interface UpdateWebhookRequest {
  name?: string;
  url?: string;
  secret?: string;
  events?: NotificationEventType[];
  active?: boolean;
  campaignIds?: string[];
  addresses?: string[];
  retryCount?: number;
  retryDelay?: number;
  timeout?: number;
}

/**
 * Notification filter options
 */
export interface NotificationFilterOptions {
  recipient?: string;
  eventType?: NotificationEventType | NotificationEventType[];
  channel?: NotificationChannel;
  status?: NotificationStatus | NotificationStatus[];
  priority?: NotificationPriority;
  fromDate?: number;
  toDate?: number;
  campaignId?: string;
}
