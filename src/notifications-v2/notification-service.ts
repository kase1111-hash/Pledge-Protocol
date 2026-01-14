/**
 * Phase 10: Notification Service
 *
 * Orchestrates email, push, in-app, and SMS notifications.
 */

import {
  NotificationChannel,
  NotificationPriority,
  NotificationStatus,
  NotificationType,
  NotificationTemplate,
  RenderedNotification,
  Notification,
  NotificationPreferences,
  DeviceToken,
  InAppNotification,
  InAppNotificationQuery,
  DigestContent,
  DigestHighlight,
  DigestDeadline,
  CreateNotificationRequest,
  NotificationStatsQuery,
  NotificationStats,
  EmailConfig,
  EmailMessage,
  EmailDeliveryResult,
  PushConfig,
  PushMessage,
  PushDeliveryResult,
  SmsConfig,
  SmsMessage,
  SmsDeliveryResult,
} from "./types";

// ============================================================================
// BUILT-IN TEMPLATES
// ============================================================================

const BUILT_IN_TEMPLATES: NotificationTemplate[] = [
  // Welcome
  {
    id: "tpl_welcome_email_en",
    type: "welcome",
    channel: "email",
    locale: "en",
    subject: "Welcome to Pledge Protocol!",
    title: "Welcome to Pledge Protocol",
    body: "Hi {{userName}}, welcome to Pledge Protocol! You're now part of a community that makes commitments real.",
    bodyHtml: `
      <h1>Welcome to Pledge Protocol!</h1>
      <p>Hi {{userName}},</p>
      <p>Welcome to Pledge Protocol! You're now part of a community that makes commitments real.</p>
      <p>Ready to get started?</p>
      <a href="{{actionUrl}}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Explore Campaigns</a>
    `,
    actionUrl: "{{baseUrl}}/campaigns",
    actionLabel: "Explore Campaigns",
    variables: ["userName", "baseUrl", "actionUrl"],
    metadata: { createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  },
  // Campaign created
  {
    id: "tpl_campaign_created_email_en",
    type: "campaign_created",
    channel: "email",
    locale: "en",
    subject: "Your campaign '{{campaignName}}' is live!",
    title: "Campaign Created",
    body: "Congratulations! Your campaign '{{campaignName}}' is now live and ready to accept pledges.",
    bodyHtml: `
      <h1>Your Campaign is Live!</h1>
      <p>Congratulations! Your campaign <strong>{{campaignName}}</strong> is now live.</p>
      <p>Share it with your supporters and start collecting pledges.</p>
      <a href="{{campaignUrl}}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Campaign</a>
    `,
    actionUrl: "{{campaignUrl}}",
    actionLabel: "View Campaign",
    variables: ["campaignName", "campaignUrl"],
    metadata: { createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  },
  // Pledge created
  {
    id: "tpl_pledge_created_email_en",
    type: "pledge_created",
    channel: "email",
    locale: "en",
    subject: "Thank you for backing '{{campaignName}}'!",
    title: "Pledge Confirmed",
    body: "Thank you for pledging {{amount}} to '{{campaignName}}'. Your funds are safely escrowed until milestones are verified.",
    bodyHtml: `
      <h1>Thank You for Your Pledge!</h1>
      <p>You've pledged <strong>{{amount}}</strong> to <strong>{{campaignName}}</strong>.</p>
      <p>Your funds are safely escrowed until milestones are verified.</p>
      <a href="{{pledgeUrl}}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Pledge</a>
    `,
    actionUrl: "{{pledgeUrl}}",
    actionLabel: "View Pledge",
    variables: ["campaignName", "amount", "pledgeUrl"],
    metadata: { createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  },
  // Milestone verified
  {
    id: "tpl_campaign_milestone_verified_email_en",
    type: "campaign_milestone_verified",
    channel: "email",
    locale: "en",
    subject: "Milestone '{{milestoneName}}' verified for '{{campaignName}}'",
    title: "Milestone Verified",
    body: "Great news! The milestone '{{milestoneName}}' has been verified for '{{campaignName}}'. Funds will be released accordingly.",
    bodyHtml: `
      <h1>Milestone Verified!</h1>
      <p>The milestone <strong>{{milestoneName}}</strong> has been verified for <strong>{{campaignName}}</strong>.</p>
      <p>Funds will be released according to the campaign terms.</p>
      <a href="{{campaignUrl}}" style="background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Details</a>
    `,
    actionUrl: "{{campaignUrl}}",
    actionLabel: "View Details",
    variables: ["campaignName", "milestoneName", "campaignUrl"],
    metadata: { createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  },
  // Push notifications
  {
    id: "tpl_pledge_created_push_en",
    type: "pledge_created",
    channel: "push",
    locale: "en",
    title: "New Pledge!",
    body: "{{backerName}} pledged {{amount}} to your campaign '{{campaignName}}'",
    actionUrl: "{{campaignUrl}}",
    variables: ["backerName", "amount", "campaignName", "campaignUrl"],
    metadata: { createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  },
  {
    id: "tpl_new_follower_push_en",
    type: "new_follower",
    channel: "push",
    locale: "en",
    title: "New Follower",
    body: "{{followerName}} started following you",
    actionUrl: "{{profileUrl}}",
    variables: ["followerName", "profileUrl"],
    metadata: { createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  },
  {
    id: "tpl_new_comment_push_en",
    type: "new_comment",
    channel: "push",
    locale: "en",
    title: "New Comment",
    body: "{{commenterName}} commented on '{{campaignName}}'",
    actionUrl: "{{commentUrl}}",
    variables: ["commenterName", "campaignName", "commentUrl"],
    metadata: { createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  },
  // In-app notifications
  {
    id: "tpl_campaign_funded_inapp_en",
    type: "campaign_funded",
    channel: "in_app",
    locale: "en",
    title: "Campaign Fully Funded!",
    body: "Congratulations! '{{campaignName}}' has reached its funding goal of {{goalAmount}}.",
    actionUrl: "{{campaignUrl}}",
    actionLabel: "Celebrate",
    variables: ["campaignName", "goalAmount", "campaignUrl"],
    metadata: { createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  },
  {
    id: "tpl_dispute_created_inapp_en",
    type: "dispute_created",
    channel: "in_app",
    locale: "en",
    title: "Dispute Filed",
    body: "A dispute has been filed for '{{campaignName}}': {{disputeTitle}}",
    actionUrl: "{{disputeUrl}}",
    actionLabel: "View Dispute",
    variables: ["campaignName", "disputeTitle", "disputeUrl"],
    metadata: { createdAt: Date.now(), updatedAt: Date.now(), version: 1 },
  },
];

// ============================================================================
// DEFAULT PREFERENCES
// ============================================================================

const DEFAULT_PREFERENCES: Omit<NotificationPreferences, "address"> = {
  deviceTokens: [],
  channels: {
    email: true,
    push: true,
    in_app: true,
    sms: false,
  },
  types: {
    campaign_created: { enabled: true, channels: ["email", "in_app"] },
    campaign_milestone_verified: { enabled: true, channels: ["email", "push", "in_app"] },
    campaign_resolved: { enabled: true, channels: ["email", "push", "in_app"] },
    pledge_created: { enabled: true, channels: ["email", "push", "in_app"] },
    pledge_released: { enabled: true, channels: ["email", "in_app"] },
    new_follower: { enabled: true, channels: ["push", "in_app"] },
    new_comment: { enabled: true, channels: ["push", "in_app"] },
    dispute_created: { enabled: true, channels: ["email", "push", "in_app"] },
    security_alert: { enabled: true, channels: ["email", "push", "sms"] },
    weekly_digest: { enabled: true, channels: ["email"] },
  },
  digest: {
    enabled: true,
    frequency: "weekly",
    dayOfWeek: 1, // Monday
    timeOfDay: "09:00",
  },
  quietHours: {
    enabled: false,
    start: "22:00",
    end: "08:00",
    timezone: "UTC",
  },
  locale: "en",
  updatedAt: Date.now(),
};

// ============================================================================
// NOTIFICATION SERVICE
// ============================================================================

export class NotificationService {
  private templates: Map<string, NotificationTemplate> = new Map();
  private preferences: Map<string, NotificationPreferences> = new Map();
  private notifications: Map<string, Notification> = new Map();
  private inAppNotifications: Map<string, InAppNotification[]> = new Map();
  private emailConfig: EmailConfig;
  private pushConfig: PushConfig;
  private smsConfig?: SmsConfig;
  private baseUrl: string;

  constructor(config: {
    emailConfig: EmailConfig;
    pushConfig: PushConfig;
    smsConfig?: SmsConfig;
    baseUrl: string;
  }) {
    this.emailConfig = config.emailConfig;
    this.pushConfig = config.pushConfig;
    this.smsConfig = config.smsConfig;
    this.baseUrl = config.baseUrl;

    // Load built-in templates
    for (const template of BUILT_IN_TEMPLATES) {
      this.templates.set(
        `${template.type}:${template.channel}:${template.locale}`,
        template
      );
    }
  }

  // ==========================================================================
  // SEND NOTIFICATIONS
  // ==========================================================================

  async send(request: CreateNotificationRequest): Promise<Notification> {
    const preferences = this.getPreferences(request.recipientAddress);
    const channels = request.channels || this.getActiveChannels(preferences, request.type);

    // Create notification records for each channel
    const notifications: Notification[] = [];

    for (const channel of channels) {
      if (!this.shouldSend(preferences, request.type, channel)) {
        continue;
      }

      const template = this.getTemplate(request.type, channel, preferences.locale);
      if (!template) {
        continue;
      }

      const rendered = this.renderTemplate(template, {
        ...request.variables,
        baseUrl: this.baseUrl,
      });

      const notification: Notification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        recipientAddress: request.recipientAddress,
        recipientEmail: preferences.email,
        recipientPhone: preferences.phone,
        recipientDeviceTokens: preferences.deviceTokens.map((d) => d.token),
        type: request.type,
        channel,
        priority: request.priority || "normal",
        status: "pending",
        templateId: template.id,
        locale: preferences.locale,
        variables: request.variables,
        rendered,
        metadata: request.metadata || {},
        delivery: {
          attempts: 0,
        },
        createdAt: Date.now(),
        scheduledFor: request.scheduledFor,
        expiresAt: request.expiresAt,
      };

      // Check quiet hours
      if (this.isQuietHours(preferences) && request.priority !== "urgent") {
        notification.scheduledFor = this.getNextNonQuietTime(preferences);
      }

      // Actually send or schedule
      if (!notification.scheduledFor || notification.scheduledFor <= Date.now()) {
        await this.deliverNotification(notification);
      } else {
        notification.status = "queued";
      }

      this.notifications.set(notification.id, notification);
      notifications.push(notification);
    }

    return notifications[0] || this.createFailedNotification(request);
  }

  async sendBulk(requests: CreateNotificationRequest[]): Promise<Notification[]> {
    const results: Notification[] = [];
    for (const request of requests) {
      const notification = await this.send(request);
      results.push(notification);
    }
    return results;
  }

  async sendToTopic(topic: string, request: CreateNotificationRequest): Promise<number> {
    // In a real implementation, this would query subscribers
    // For now, simulate topic sending
    const subscribers = this.getTopicSubscribers(topic);
    let sentCount = 0;

    for (const address of subscribers) {
      try {
        await this.send({ ...request, recipientAddress: address });
        sentCount++;
      } catch {
        // Continue with other subscribers
      }
    }

    return sentCount;
  }

  private async deliverNotification(notification: Notification): Promise<void> {
    notification.status = "sending";
    notification.delivery.attempts++;
    notification.delivery.lastAttemptAt = Date.now();

    try {
      switch (notification.channel) {
        case "email":
          await this.sendEmail(notification);
          break;
        case "push":
          await this.sendPush(notification);
          break;
        case "in_app":
          this.createInAppNotification(notification);
          break;
        case "sms":
          await this.sendSms(notification);
          break;
      }

      notification.status = "delivered";
      notification.delivery.deliveredAt = Date.now();
    } catch (error) {
      notification.status = "failed";
      notification.delivery.errorMessage =
        error instanceof Error ? error.message : "Unknown error";
    }
  }

  private async sendEmail(notification: Notification): Promise<EmailDeliveryResult> {
    if (!notification.recipientEmail) {
      throw new Error("No recipient email address");
    }

    const message: EmailMessage = {
      to: notification.recipientEmail,
      subject: notification.rendered.subject || notification.rendered.title,
      text: notification.rendered.body,
      html: notification.rendered.bodyHtml,
      tags: [notification.type],
      metadata: {
        notificationId: notification.id,
        type: notification.type,
      },
    };

    // Simulate email sending
    // In production, this would call SendGrid, SES, etc.
    console.log(`[Email] Sending to ${message.to}: ${message.subject}`);

    return {
      success: true,
      messageId: `msg_${Date.now()}`,
    };
  }

  private async sendPush(notification: Notification): Promise<PushDeliveryResult> {
    if (!notification.recipientDeviceTokens?.length) {
      throw new Error("No device tokens registered");
    }

    const message: PushMessage = {
      tokens: notification.recipientDeviceTokens,
      title: notification.rendered.title,
      body: notification.rendered.body,
      data: {
        type: notification.type,
        notificationId: notification.id,
        actionUrl: notification.rendered.actionUrl || "",
      },
      clickAction: notification.rendered.actionUrl,
    };

    // Simulate push sending
    // In production, this would call Firebase, APNS, etc.
    console.log(`[Push] Sending to ${message.tokens.length} devices: ${message.title}`);

    return {
      success: true,
      successCount: message.tokens.length,
      failureCount: 0,
      failedTokens: [],
    };
  }

  private createInAppNotification(notification: Notification): void {
    const inApp: InAppNotification = {
      id: notification.id,
      recipientAddress: notification.recipientAddress,
      type: notification.type,
      title: notification.rendered.title,
      body: notification.rendered.body,
      actionUrl: notification.rendered.actionUrl,
      actionLabel: notification.rendered.actionLabel,
      metadata: notification.metadata,
      read: false,
      archived: false,
      createdAt: Date.now(),
      expiresAt: notification.expiresAt,
    };

    const existing = this.inAppNotifications.get(notification.recipientAddress) || [];
    existing.unshift(inApp);

    // Keep only last 100 notifications
    if (existing.length > 100) {
      existing.pop();
    }

    this.inAppNotifications.set(notification.recipientAddress, existing);
  }

  private async sendSms(notification: Notification): Promise<SmsDeliveryResult> {
    if (!notification.recipientPhone) {
      throw new Error("No recipient phone number");
    }

    if (!this.smsConfig) {
      throw new Error("SMS not configured");
    }

    const message: SmsMessage = {
      to: notification.recipientPhone,
      body: notification.rendered.body,
    };

    // Simulate SMS sending
    console.log(`[SMS] Sending to ${message.to}: ${message.body}`);

    return {
      success: true,
      messageId: `sms_${Date.now()}`,
    };
  }

  private createFailedNotification(request: CreateNotificationRequest): Notification {
    return {
      id: `notif_${Date.now()}_failed`,
      recipientAddress: request.recipientAddress,
      type: request.type,
      channel: "email",
      priority: request.priority || "normal",
      status: "failed",
      templateId: "",
      locale: "en",
      variables: request.variables,
      rendered: { title: "", body: "" },
      metadata: request.metadata || {},
      delivery: {
        attempts: 0,
        errorMessage: "No valid delivery channel",
      },
      createdAt: Date.now(),
    };
  }

  // ==========================================================================
  // TEMPLATES
  // ==========================================================================

  getTemplate(
    type: NotificationType,
    channel: NotificationChannel,
    locale: string
  ): NotificationTemplate | null {
    // Try exact match first
    const key = `${type}:${channel}:${locale}`;
    let template = this.templates.get(key);

    // Fall back to English
    if (!template && locale !== "en") {
      template = this.templates.get(`${type}:${channel}:en`);
    }

    return template || null;
  }

  renderTemplate(
    template: NotificationTemplate,
    variables: Record<string, unknown>
  ): RenderedNotification {
    const render = (text: string): string => {
      return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return String(variables[key] ?? `{{${key}}}`);
      });
    };

    return {
      subject: template.subject ? render(template.subject) : undefined,
      title: render(template.title),
      body: render(template.body),
      bodyHtml: template.bodyHtml ? render(template.bodyHtml) : undefined,
      actionUrl: template.actionUrl ? render(template.actionUrl) : undefined,
      actionLabel: template.actionLabel ? render(template.actionLabel) : undefined,
    };
  }

  addTemplate(template: NotificationTemplate): void {
    const key = `${template.type}:${template.channel}:${template.locale}`;
    this.templates.set(key, template);
  }

  // ==========================================================================
  // PREFERENCES
  // ==========================================================================

  getPreferences(address: string): NotificationPreferences {
    let prefs = this.preferences.get(address);
    if (!prefs) {
      prefs = {
        address,
        ...DEFAULT_PREFERENCES,
        updatedAt: Date.now(),
      };
      this.preferences.set(address, prefs);
    }
    return prefs;
  }

  updatePreferences(
    address: string,
    updates: Partial<NotificationPreferences>
  ): NotificationPreferences {
    const current = this.getPreferences(address);
    const updated: NotificationPreferences = {
      ...current,
      ...updates,
      address, // Ensure address isn't changed
      updatedAt: Date.now(),
    };

    // Deep merge for nested objects
    if (updates.channels) {
      updated.channels = { ...current.channels, ...updates.channels };
    }
    if (updates.types) {
      updated.types = { ...current.types, ...updates.types };
    }
    if (updates.digest) {
      updated.digest = { ...current.digest, ...updates.digest };
    }
    if (updates.quietHours) {
      updated.quietHours = { ...current.quietHours, ...updates.quietHours };
    }

    this.preferences.set(address, updated);
    return updated;
  }

  registerDevice(
    address: string,
    device: Omit<DeviceToken, "registeredAt" | "lastUsedAt">
  ): DeviceToken {
    const prefs = this.getPreferences(address);

    // Check if device already exists
    const existingIndex = prefs.deviceTokens.findIndex(
      (d) => d.deviceId === device.deviceId
    );

    const newDevice: DeviceToken = {
      ...device,
      registeredAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    if (existingIndex >= 0) {
      // Update existing device
      prefs.deviceTokens[existingIndex] = newDevice;
    } else {
      // Add new device
      prefs.deviceTokens.push(newDevice);
    }

    this.preferences.set(address, { ...prefs, updatedAt: Date.now() });
    return newDevice;
  }

  unregisterDevice(address: string, deviceId: string): boolean {
    const prefs = this.getPreferences(address);
    const initialLength = prefs.deviceTokens.length;
    prefs.deviceTokens = prefs.deviceTokens.filter((d) => d.deviceId !== deviceId);

    if (prefs.deviceTokens.length !== initialLength) {
      this.preferences.set(address, { ...prefs, updatedAt: Date.now() });
      return true;
    }
    return false;
  }

  private getActiveChannels(
    preferences: NotificationPreferences,
    type: NotificationType
  ): NotificationChannel[] {
    const typePrefs = preferences.types[type];
    if (typePrefs && typePrefs.enabled) {
      return typePrefs.channels.filter((c) => preferences.channels[c]);
    }

    // Default channels based on type category
    const channels: NotificationChannel[] = [];
    if (preferences.channels.in_app) channels.push("in_app");
    if (preferences.channels.push) channels.push("push");
    if (preferences.channels.email) channels.push("email");

    return channels;
  }

  private shouldSend(
    preferences: NotificationPreferences,
    type: NotificationType,
    channel: NotificationChannel
  ): boolean {
    // Check channel is enabled globally
    if (!preferences.channels[channel]) {
      return false;
    }

    // Check type-specific settings
    const typePrefs = preferences.types[type];
    if (typePrefs) {
      return typePrefs.enabled && typePrefs.channels.includes(channel);
    }

    // Default to sending if not explicitly configured
    return true;
  }

  private isQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quietHours.enabled) {
      return false;
    }

    const now = new Date();
    const currentTime =
      now.getUTCHours() * 60 + now.getUTCMinutes();

    const [startHour, startMin] = preferences.quietHours.start.split(":").map(Number);
    const [endHour, endMin] = preferences.quietHours.end.split(":").map(Number);
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime < endTime;
    } else {
      // Overnight quiet hours (e.g., 22:00 - 08:00)
      return currentTime >= startTime || currentTime < endTime;
    }
  }

  private getNextNonQuietTime(preferences: NotificationPreferences): number {
    const [endHour, endMin] = preferences.quietHours.end.split(":").map(Number);
    const now = new Date();
    now.setUTCHours(endHour, endMin, 0, 0);

    if (now.getTime() <= Date.now()) {
      now.setDate(now.getDate() + 1);
    }

    return now.getTime();
  }

  private getTopicSubscribers(_topic: string): string[] {
    // In production, this would query a topic subscription database
    return [];
  }

  // ==========================================================================
  // IN-APP NOTIFICATIONS
  // ==========================================================================

  getInAppNotifications(query: InAppNotificationQuery): InAppNotification[] {
    let notifications = this.inAppNotifications.get(query.address) || [];

    // Apply filters
    if (query.types?.length) {
      notifications = notifications.filter((n) => query.types!.includes(n.type));
    }
    if (query.read !== undefined) {
      notifications = notifications.filter((n) => n.read === query.read);
    }
    if (query.archived !== undefined) {
      notifications = notifications.filter((n) => n.archived === query.archived);
    }
    if (query.since) {
      notifications = notifications.filter((n) => n.createdAt >= query.since!);
    }

    // Remove expired
    const now = Date.now();
    notifications = notifications.filter(
      (n) => !n.expiresAt || n.expiresAt > now
    );

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 50;
    return notifications.slice(offset, offset + limit);
  }

  markAsRead(address: string, notificationIds: string[]): number {
    const notifications = this.inAppNotifications.get(address) || [];
    let count = 0;

    for (const notification of notifications) {
      if (notificationIds.includes(notification.id) && !notification.read) {
        notification.read = true;
        notification.readAt = Date.now();
        count++;
      }
    }

    return count;
  }

  markAllAsRead(address: string): number {
    const notifications = this.inAppNotifications.get(address) || [];
    let count = 0;

    for (const notification of notifications) {
      if (!notification.read) {
        notification.read = true;
        notification.readAt = Date.now();
        count++;
      }
    }

    return count;
  }

  archiveNotifications(address: string, notificationIds: string[]): number {
    const notifications = this.inAppNotifications.get(address) || [];
    let count = 0;

    for (const notification of notifications) {
      if (notificationIds.includes(notification.id) && !notification.archived) {
        notification.archived = true;
        notification.archivedAt = Date.now();
        count++;
      }
    }

    return count;
  }

  getUnreadCount(address: string): number {
    const notifications = this.inAppNotifications.get(address) || [];
    return notifications.filter((n) => !n.read && !n.archived).length;
  }

  // ==========================================================================
  // DIGEST
  // ==========================================================================

  generateDigest(
    address: string,
    period: "daily" | "weekly" | "monthly"
  ): DigestContent {
    const now = Date.now();
    let start: number;

    switch (period) {
      case "daily":
        start = now - 24 * 60 * 60 * 1000;
        break;
      case "weekly":
        start = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case "monthly":
        start = now - 30 * 24 * 60 * 60 * 1000;
        break;
    }

    // In production, this would aggregate real data
    const highlights: DigestHighlight[] = [];
    const upcomingDeadlines: DigestDeadline[] = [];

    return {
      address,
      period: { start, end: now },
      summary: {
        campaignsCreated: 0,
        pledgesReceived: 0,
        amountRaised: "0",
        milestonesVerified: 0,
        newFollowers: 0,
        commentsReceived: 0,
      },
      highlights,
      upcomingDeadlines,
    };
  }

  async sendDigest(address: string, content: DigestContent): Promise<boolean> {
    const hasActivity =
      content.summary.pledgesReceived > 0 ||
      content.summary.milestonesVerified > 0 ||
      content.highlights.length > 0;

    if (!hasActivity) {
      return false; // Don't send empty digests
    }

    const preferences = this.getPreferences(address);
    if (!preferences.digest.enabled) {
      return false;
    }

    await this.send({
      recipientAddress: address,
      type: content.period.end - content.period.start > 7 * 24 * 60 * 60 * 1000
        ? "monthly_report"
        : "weekly_digest",
      channels: ["email"],
      priority: "low",
      variables: {
        periodStart: new Date(content.period.start).toLocaleDateString(),
        periodEnd: new Date(content.period.end).toLocaleDateString(),
        campaignsCreated: content.summary.campaignsCreated,
        pledgesReceived: content.summary.pledgesReceived,
        amountRaised: content.summary.amountRaised,
        milestonesVerified: content.summary.milestonesVerified,
        newFollowers: content.summary.newFollowers,
        highlightsCount: content.highlights.length,
        deadlinesCount: content.upcomingDeadlines.length,
      },
    });

    return true;
  }

  // ==========================================================================
  // ANALYTICS
  // ==========================================================================

  getDeliveryStats(filters?: NotificationStatsQuery): NotificationStats {
    const startDate = filters?.startDate || Date.now() - 30 * 24 * 60 * 60 * 1000;
    const endDate = filters?.endDate || Date.now();

    const relevantNotifications = Array.from(this.notifications.values()).filter(
      (n) => {
        if (n.createdAt < startDate || n.createdAt > endDate) return false;
        if (filters?.channel && n.channel !== filters.channel) return false;
        if (filters?.type && n.type !== filters.type) return false;
        return true;
      }
    );

    const byStatus: Record<NotificationStatus, number> = {
      pending: 0,
      queued: 0,
      sending: 0,
      delivered: 0,
      failed: 0,
      bounced: 0,
      read: 0,
    };

    const byChannel: Record<NotificationChannel, number> = {
      email: 0,
      push: 0,
      in_app: 0,
      sms: 0,
    };

    const byType: Record<string, number> = {};
    let totalDeliveryTime = 0;
    let deliveredCount = 0;
    let readCount = 0;

    for (const notification of relevantNotifications) {
      byStatus[notification.status]++;
      byChannel[notification.channel]++;
      byType[notification.type] = (byType[notification.type] || 0) + 1;

      if (notification.delivery.deliveredAt) {
        deliveredCount++;
        totalDeliveryTime +=
          notification.delivery.deliveredAt - notification.createdAt;
      }

      if (notification.status === "read" || notification.delivery.readAt) {
        readCount++;
      }
    }

    const total = relevantNotifications.length;

    return {
      period: { start: startDate, end: endDate },
      total,
      byStatus,
      byChannel,
      byType,
      deliveryRate: total > 0 ? deliveredCount / total : 0,
      readRate: deliveredCount > 0 ? readCount / deliveredCount : 0,
      averageDeliveryTime:
        deliveredCount > 0 ? totalDeliveryTime / deliveredCount : 0,
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createNotificationService(config: {
  emailConfig: EmailConfig;
  pushConfig: PushConfig;
  smsConfig?: SmsConfig;
  baseUrl: string;
}): NotificationService {
  return new NotificationService(config);
}

// Default instance for testing
export const notificationService = new NotificationService({
  emailConfig: {
    provider: "sendgrid",
    apiKey: process.env.SENDGRID_API_KEY,
    fromEmail: "notifications@pledgeprotocol.io",
    fromName: "Pledge Protocol",
  },
  pushConfig: {
    provider: "firebase",
    firebaseConfig: {
      projectId: process.env.FIREBASE_PROJECT_ID || "",
      privateKey: process.env.FIREBASE_PRIVATE_KEY || "",
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
    },
  },
  baseUrl: process.env.BASE_URL || "https://app.pledgeprotocol.io",
});
