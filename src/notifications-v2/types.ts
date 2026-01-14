/**
 * Phase 10: Advanced Notification System Types
 *
 * Email, push, and in-app notifications with templates and preferences.
 */

// ============================================================================
// NOTIFICATION CHANNELS
// ============================================================================

export type NotificationChannel = "email" | "push" | "in_app" | "sms";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export type NotificationStatus =
  | "pending"
  | "queued"
  | "sending"
  | "delivered"
  | "failed"
  | "bounced"
  | "read";

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export type NotificationType =
  // Campaign events
  | "campaign_created"
  | "campaign_launched"
  | "campaign_funded"
  | "campaign_milestone_approaching"
  | "campaign_milestone_verified"
  | "campaign_resolved"
  | "campaign_cancelled"
  // Pledge events
  | "pledge_created"
  | "pledge_confirmed"
  | "pledge_released"
  | "pledge_refunded"
  // Social events
  | "new_follower"
  | "new_comment"
  | "comment_reply"
  | "mention"
  // Dispute events
  | "dispute_created"
  | "dispute_evidence_added"
  | "dispute_voting_opened"
  | "dispute_resolved"
  // Account events
  | "welcome"
  | "verification_complete"
  | "security_alert"
  | "password_reset"
  // Payment events
  | "payment_received"
  | "payment_failed"
  | "subscription_renewed"
  | "subscription_cancelled"
  // System events
  | "system_maintenance"
  | "feature_announcement"
  | "weekly_digest"
  | "monthly_report";

// ============================================================================
// NOTIFICATION TEMPLATE
// ============================================================================

export interface NotificationTemplate {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  locale: string;
  subject?: string; // For email
  title: string;
  body: string;
  bodyHtml?: string; // For email
  actionUrl?: string;
  actionLabel?: string;
  variables: string[]; // e.g., ["campaignName", "amount", "backerName"]
  metadata: {
    createdAt: number;
    updatedAt: number;
    version: number;
  };
}

export interface RenderedNotification {
  subject?: string;
  title: string;
  body: string;
  bodyHtml?: string;
  actionUrl?: string;
  actionLabel?: string;
}

// ============================================================================
// NOTIFICATION
// ============================================================================

export interface Notification {
  id: string;
  recipientAddress: string;
  recipientEmail?: string;
  recipientPhone?: string;
  recipientDeviceTokens?: string[];
  type: NotificationType;
  channel: NotificationChannel;
  priority: NotificationPriority;
  status: NotificationStatus;
  templateId: string;
  locale: string;
  variables: Record<string, string | number | boolean>;
  rendered: RenderedNotification;
  metadata: {
    campaignId?: string;
    pledgeId?: string;
    disputeId?: string;
    commentId?: string;
  };
  delivery: {
    attempts: number;
    lastAttemptAt?: number;
    deliveredAt?: number;
    readAt?: number;
    errorMessage?: string;
    externalId?: string; // e.g., SendGrid message ID
  };
  createdAt: number;
  scheduledFor?: number;
  expiresAt?: number;
}

// ============================================================================
// NOTIFICATION PREFERENCES
// ============================================================================

export interface NotificationPreferences {
  address: string;
  email?: string;
  phone?: string;
  deviceTokens: DeviceToken[];
  channels: {
    email: boolean;
    push: boolean;
    in_app: boolean;
    sms: boolean;
  };
  types: {
    [K in NotificationType]?: {
      enabled: boolean;
      channels: NotificationChannel[];
    };
  };
  digest: {
    enabled: boolean;
    frequency: "daily" | "weekly" | "monthly";
    dayOfWeek?: number; // 0-6 for weekly
    dayOfMonth?: number; // 1-31 for monthly
    timeOfDay: string; // "09:00"
  };
  quietHours: {
    enabled: boolean;
    start: string; // "22:00"
    end: string; // "08:00"
    timezone: string;
  };
  locale: string;
  updatedAt: number;
}

export interface DeviceToken {
  token: string;
  platform: "ios" | "android" | "web";
  deviceId: string;
  deviceName?: string;
  registeredAt: number;
  lastUsedAt: number;
}

// ============================================================================
// EMAIL SPECIFIC
// ============================================================================

export interface EmailConfig {
  provider: "sendgrid" | "ses" | "mailgun" | "smtp";
  apiKey?: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  smtpConfig?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
}

export interface EmailMessage {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  tags?: string[];
  metadata?: Record<string, string>;
}

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType: string;
  disposition?: "attachment" | "inline";
  contentId?: string;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ============================================================================
// PUSH SPECIFIC
// ============================================================================

export interface PushConfig {
  provider: "firebase" | "apns" | "onesignal";
  firebaseConfig?: {
    projectId: string;
    privateKey: string;
    clientEmail: string;
  };
  apnsConfig?: {
    keyId: string;
    teamId: string;
    privateKey: string;
    production: boolean;
  };
  oneSignalConfig?: {
    appId: string;
    apiKey: string;
  };
}

export interface PushMessage {
  tokens: string[];
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
  badge?: number;
  sound?: string;
  clickAction?: string;
  collapseKey?: string;
  ttl?: number;
}

export interface PushDeliveryResult {
  success: boolean;
  successCount: number;
  failureCount: number;
  failedTokens: string[];
  error?: string;
}

// ============================================================================
// IN-APP SPECIFIC
// ============================================================================

export interface InAppNotification {
  id: string;
  recipientAddress: string;
  type: NotificationType;
  title: string;
  body: string;
  imageUrl?: string;
  actionUrl?: string;
  actionLabel?: string;
  metadata: Record<string, unknown>;
  read: boolean;
  readAt?: number;
  archived: boolean;
  archivedAt?: number;
  createdAt: number;
  expiresAt?: number;
}

export interface InAppNotificationQuery {
  address: string;
  types?: NotificationType[];
  read?: boolean;
  archived?: boolean;
  limit?: number;
  offset?: number;
  since?: number;
}

// ============================================================================
// SMS SPECIFIC
// ============================================================================

export interface SmsConfig {
  provider: "twilio" | "nexmo" | "plivo";
  accountSid?: string;
  authToken?: string;
  fromNumber: string;
}

export interface SmsMessage {
  to: string;
  body: string;
  mediaUrl?: string;
}

export interface SmsDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ============================================================================
// DIGEST
// ============================================================================

export interface DigestContent {
  address: string;
  period: {
    start: number;
    end: number;
  };
  summary: {
    campaignsCreated: number;
    pledgesReceived: number;
    amountRaised: string;
    milestonesVerified: number;
    newFollowers: number;
    commentsReceived: number;
  };
  highlights: DigestHighlight[];
  upcomingDeadlines: DigestDeadline[];
}

export interface DigestHighlight {
  type: "campaign_funded" | "milestone_verified" | "top_backer" | "trending";
  title: string;
  description: string;
  url?: string;
  imageUrl?: string;
}

export interface DigestDeadline {
  campaignId: string;
  campaignName: string;
  deadline: number;
  type: "milestone" | "campaign_end" | "dispute_vote";
}

// ============================================================================
// NOTIFICATION SERVICE INTERFACE
// ============================================================================

export interface NotificationServiceInterface {
  // Send notifications
  send(notification: CreateNotificationRequest): Promise<Notification>;
  sendBulk(notifications: CreateNotificationRequest[]): Promise<Notification[]>;
  sendToTopic(topic: string, notification: CreateNotificationRequest): Promise<number>;

  // Templates
  getTemplate(type: NotificationType, channel: NotificationChannel, locale: string): NotificationTemplate | null;
  renderTemplate(template: NotificationTemplate, variables: Record<string, unknown>): RenderedNotification;

  // Preferences
  getPreferences(address: string): NotificationPreferences;
  updatePreferences(address: string, updates: Partial<NotificationPreferences>): NotificationPreferences;
  registerDevice(address: string, device: Omit<DeviceToken, "registeredAt" | "lastUsedAt">): DeviceToken;
  unregisterDevice(address: string, deviceId: string): boolean;

  // In-app
  getInAppNotifications(query: InAppNotificationQuery): InAppNotification[];
  markAsRead(address: string, notificationIds: string[]): number;
  markAllAsRead(address: string): number;
  archiveNotifications(address: string, notificationIds: string[]): number;

  // Digest
  generateDigest(address: string, period: "daily" | "weekly" | "monthly"): DigestContent;
  sendDigest(address: string, content: DigestContent): Promise<boolean>;

  // Analytics
  getDeliveryStats(filters?: NotificationStatsQuery): NotificationStats;
}

export interface CreateNotificationRequest {
  recipientAddress: string;
  type: NotificationType;
  channels?: NotificationChannel[];
  priority?: NotificationPriority;
  variables: Record<string, string | number | boolean>;
  metadata?: {
    campaignId?: string;
    pledgeId?: string;
    disputeId?: string;
    commentId?: string;
  };
  scheduledFor?: number;
  expiresAt?: number;
}

export interface NotificationStatsQuery {
  startDate?: number;
  endDate?: number;
  channel?: NotificationChannel;
  type?: NotificationType;
}

export interface NotificationStats {
  period: {
    start: number;
    end: number;
  };
  total: number;
  byStatus: Record<NotificationStatus, number>;
  byChannel: Record<NotificationChannel, number>;
  byType: Record<string, number>;
  deliveryRate: number;
  readRate: number;
  averageDeliveryTime: number;
}
