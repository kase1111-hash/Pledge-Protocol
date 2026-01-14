/**
 * Notification Service
 * Phase 6: Governance - Manages notifications and webhook delivery
 */

import crypto from "crypto";
import {
  NotificationEventType,
  NotificationChannel,
  NotificationPriority,
  NotificationStatus,
  WebhookConfig,
  WebhookDeliveryLog,
  Notification,
  NotificationPreferences,
  NotificationEvent,
  CreateWebhookRequest,
  UpdateWebhookRequest,
  NotificationFilterOptions,
} from "./types";

/**
 * Notification Service - Handles event dispatch and webhook delivery
 */
export class NotificationService {
  private webhooks: Map<string, WebhookConfig> = new Map();
  private notifications: Map<string, Notification> = new Map();
  private deliveryLogs: Map<string, WebhookDeliveryLog[]> = new Map();
  private preferences: Map<string, NotificationPreferences> = new Map();
  private eventQueue: NotificationEvent[] = [];

  // =========================================================================
  // Webhook Management
  // =========================================================================

  /**
   * Create a new webhook
   */
  createWebhook(request: CreateWebhookRequest, createdBy: string): WebhookConfig {
    const id = this.generateId("webhook");
    const now = Date.now();

    const webhook: WebhookConfig = {
      id,
      name: request.name,
      url: request.url,
      secret: request.secret,
      events: request.events,
      active: true,
      createdBy,
      createdAt: now,
      updatedAt: now,
      campaignIds: request.campaignIds,
      addresses: request.addresses,
      retryCount: request.retryCount ?? 3,
      retryDelay: request.retryDelay ?? 5000,
      timeout: request.timeout ?? 30000,
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
    };

    this.webhooks.set(id, webhook);
    this.deliveryLogs.set(id, []);

    return webhook;
  }

  /**
   * Get webhook by ID
   */
  getWebhook(id: string): WebhookConfig | undefined {
    return this.webhooks.get(id);
  }

  /**
   * List webhooks
   */
  listWebhooks(createdBy?: string): WebhookConfig[] {
    let webhooks = Array.from(this.webhooks.values());

    if (createdBy) {
      webhooks = webhooks.filter((w) => w.createdBy === createdBy);
    }

    return webhooks.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Update a webhook
   */
  updateWebhook(id: string, updates: UpdateWebhookRequest): WebhookConfig {
    const webhook = this.webhooks.get(id);
    if (!webhook) {
      throw new Error(`Webhook ${id} not found`);
    }

    const updated: WebhookConfig = {
      ...webhook,
      ...updates,
      updatedAt: Date.now(),
    };

    this.webhooks.set(id, updated);
    return updated;
  }

  /**
   * Delete a webhook
   */
  deleteWebhook(id: string): boolean {
    this.deliveryLogs.delete(id);
    return this.webhooks.delete(id);
  }

  /**
   * Get delivery logs for a webhook
   */
  getDeliveryLogs(webhookId: string, limit = 100): WebhookDeliveryLog[] {
    const logs = this.deliveryLogs.get(webhookId) || [];
    return logs.slice(-limit);
  }

  /**
   * Test a webhook with sample payload
   */
  async testWebhook(webhookId: string): Promise<WebhookDeliveryLog> {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      throw new Error(`Webhook ${webhookId} not found`);
    }

    const testEvent: NotificationEvent = {
      id: this.generateId("event"),
      type: "system_maintenance",
      timestamp: Date.now(),
      source: "notification-service",
      data: { test: true, message: "This is a test webhook delivery" },
      summary: "Test webhook notification",
      priority: "low",
    };

    return this.deliverToWebhook(webhook, testEvent);
  }

  // =========================================================================
  // Event Processing
  // =========================================================================

  /**
   * Emit a notification event
   */
  async emit(event: Omit<NotificationEvent, "id" | "timestamp">): Promise<void> {
    const fullEvent: NotificationEvent = {
      ...event,
      id: this.generateId("event"),
      timestamp: Date.now(),
    };

    this.eventQueue.push(fullEvent);

    // Process webhooks for this event
    await this.processWebhooks(fullEvent);

    // Create in-app notifications for relevant users
    await this.createInAppNotifications(fullEvent);
  }

  /**
   * Process webhooks for an event
   */
  private async processWebhooks(event: NotificationEvent): Promise<void> {
    const eligibleWebhooks = this.getEligibleWebhooks(event);

    const deliveryPromises = eligibleWebhooks.map((webhook) =>
      this.deliverToWebhook(webhook, event)
    );

    await Promise.allSettled(deliveryPromises);
  }

  /**
   * Get webhooks eligible to receive an event
   */
  private getEligibleWebhooks(event: NotificationEvent): WebhookConfig[] {
    return Array.from(this.webhooks.values()).filter((webhook) => {
      // Must be active
      if (!webhook.active) return false;

      // Must be subscribed to event type
      if (!webhook.events.includes(event.type)) return false;

      // Filter by campaign if specified
      if (webhook.campaignIds && webhook.campaignIds.length > 0) {
        if (!event.campaignId || !webhook.campaignIds.includes(event.campaignId)) {
          return false;
        }
      }

      // Filter by address if specified
      if (webhook.addresses && webhook.addresses.length > 0) {
        if (!event.actorAddress || !webhook.addresses.includes(event.actorAddress)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Deliver event to a webhook
   */
  private async deliverToWebhook(
    webhook: WebhookConfig,
    event: NotificationEvent
  ): Promise<WebhookDeliveryLog> {
    const startTime = Date.now();
    const logId = this.generateId("delivery");

    const payload = {
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      data: event.data,
      summary: event.summary,
      context: {
        campaignId: event.campaignId,
        pledgeId: event.pledgeId,
        disputeId: event.disputeId,
      },
    };

    const payloadString = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-ID": webhook.id,
      "X-Event-Type": event.type,
      "X-Event-ID": event.id,
      "X-Timestamp": String(event.timestamp),
    };

    // Add signature if secret is configured
    if (webhook.secret) {
      const signature = crypto
        .createHmac("sha256", webhook.secret)
        .update(payloadString)
        .digest("hex");
      headers["X-Signature"] = `sha256=${signature}`;
    }

    let log: WebhookDeliveryLog;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= webhook.retryCount + 1; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), webhook.timeout);

        const response = await fetch(webhook.url, {
          method: "POST",
          headers,
          body: payloadString,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const responseBody = await response.text().catch(() => "");
        const success = response.ok;

        log = {
          id: logId,
          webhookId: webhook.id,
          eventType: event.type,
          payload,
          requestHeaders: headers,
          responseStatus: response.status,
          responseBody: responseBody.slice(0, 1000), // Limit response size
          attempt,
          deliveredAt: Date.now(),
          durationMs: Date.now() - startTime,
          success,
        };

        this.recordDeliveryLog(webhook.id, log);

        // Update webhook stats
        webhook.totalDeliveries++;
        if (success) {
          webhook.successfulDeliveries++;
        } else {
          webhook.failedDeliveries++;
        }
        webhook.lastDeliveryAt = Date.now();
        webhook.lastDeliveryStatus = success ? "success" : "failed";
        webhook.updatedAt = Date.now();
        this.webhooks.set(webhook.id, webhook);

        if (success) {
          return log;
        }

        lastError = `HTTP ${response.status}: ${responseBody.slice(0, 100)}`;
      } catch (error) {
        lastError = (error as Error).message;
      }

      // Wait before retry (if not last attempt)
      if (attempt <= webhook.retryCount) {
        await this.sleep(webhook.retryDelay * attempt);
      }
    }

    // All retries failed
    log = {
      id: logId,
      webhookId: webhook.id,
      eventType: event.type,
      payload,
      requestHeaders: headers,
      error: lastError,
      attempt: webhook.retryCount + 1,
      deliveredAt: Date.now(),
      durationMs: Date.now() - startTime,
      success: false,
    };

    this.recordDeliveryLog(webhook.id, log);

    webhook.totalDeliveries++;
    webhook.failedDeliveries++;
    webhook.lastDeliveryAt = Date.now();
    webhook.lastDeliveryStatus = "failed";
    webhook.updatedAt = Date.now();
    this.webhooks.set(webhook.id, webhook);

    return log;
  }

  /**
   * Record delivery log
   */
  private recordDeliveryLog(webhookId: string, log: WebhookDeliveryLog): void {
    const logs = this.deliveryLogs.get(webhookId) || [];
    logs.push(log);

    // Keep only last 1000 logs per webhook
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }

    this.deliveryLogs.set(webhookId, logs);
  }

  // =========================================================================
  // In-App Notifications
  // =========================================================================

  /**
   * Create in-app notifications for an event
   */
  private async createInAppNotifications(event: NotificationEvent): Promise<void> {
    // Find users who should receive this notification
    const recipients = this.getNotificationRecipients(event);

    for (const recipient of recipients) {
      const prefs = this.preferences.get(recipient);
      const eventPrefs = prefs?.preferences[event.type];

      // Skip if user disabled this notification type
      if (prefs && eventPrefs && !eventPrefs.enabled) {
        continue;
      }

      // Check if in-app is enabled for this event type
      if (prefs && eventPrefs && !eventPrefs.channels.includes("in_app")) {
        continue;
      }

      const notification: Notification = {
        id: this.generateId("notification"),
        eventType: event.type,
        channel: "in_app",
        recipient,
        message: event.summary,
        data: event.data,
        priority: eventPrefs?.priority || event.priority,
        status: "pending",
        createdAt: Date.now(),
        retryCount: 0,
      };

      this.notifications.set(notification.id, notification);

      // Mark as delivered immediately for in-app
      notification.status = "delivered";
      notification.deliveredAt = Date.now();
      this.notifications.set(notification.id, notification);
    }
  }

  /**
   * Get recipients for a notification event
   */
  private getNotificationRecipients(event: NotificationEvent): string[] {
    const recipients: string[] = [];

    // Add actor if relevant
    if (event.actorAddress && event.actorType !== "system") {
      recipients.push(event.actorAddress);
    }

    // Add addresses from preferences that match event criteria
    for (const [address, prefs] of this.preferences.entries()) {
      const eventPrefs = prefs.preferences[event.type];
      if (eventPrefs?.enabled && !recipients.includes(address)) {
        recipients.push(address);
      }
    }

    return recipients;
  }

  /**
   * Get notifications for a recipient
   */
  getNotifications(filters: NotificationFilterOptions = {}): Notification[] {
    let notifications = Array.from(this.notifications.values());

    if (filters.recipient) {
      notifications = notifications.filter((n) => n.recipient === filters.recipient);
    }

    if (filters.eventType) {
      const types = Array.isArray(filters.eventType) ? filters.eventType : [filters.eventType];
      notifications = notifications.filter((n) => types.includes(n.eventType));
    }

    if (filters.channel) {
      notifications = notifications.filter((n) => n.channel === filters.channel);
    }

    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      notifications = notifications.filter((n) => statuses.includes(n.status));
    }

    if (filters.priority) {
      notifications = notifications.filter((n) => n.priority === filters.priority);
    }

    if (filters.fromDate) {
      notifications = notifications.filter((n) => n.createdAt >= filters.fromDate!);
    }

    if (filters.toDate) {
      notifications = notifications.filter((n) => n.createdAt <= filters.toDate!);
    }

    return notifications.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Mark notification as read
   */
  markAsRead(notificationId: string): boolean {
    const notification = this.notifications.get(notificationId);
    if (!notification) return false;

    notification.status = "read";
    notification.readAt = Date.now();
    this.notifications.set(notificationId, notification);
    return true;
  }

  /**
   * Mark all notifications as read for a recipient
   */
  markAllAsRead(recipient: string): number {
    let count = 0;

    for (const notification of this.notifications.values()) {
      if (notification.recipient === recipient && notification.status !== "read") {
        notification.status = "read";
        notification.readAt = Date.now();
        this.notifications.set(notification.id, notification);
        count++;
      }
    }

    return count;
  }

  /**
   * Get unread count for a recipient
   */
  getUnreadCount(recipient: string): number {
    let count = 0;

    for (const notification of this.notifications.values()) {
      if (notification.recipient === recipient && notification.status !== "read") {
        count++;
      }
    }

    return count;
  }

  // =========================================================================
  // Preferences Management
  // =========================================================================

  /**
   * Get notification preferences for an address
   */
  getPreferences(address: string): NotificationPreferences | undefined {
    return this.preferences.get(address);
  }

  /**
   * Set notification preferences
   */
  setPreferences(address: string, prefs: Partial<NotificationPreferences>): NotificationPreferences {
    const existing = this.preferences.get(address);

    const updated: NotificationPreferences = {
      address,
      email: prefs.email ?? existing?.email,
      phone: prefs.phone ?? existing?.phone,
      discordWebhook: prefs.discordWebhook ?? existing?.discordWebhook,
      telegramChatId: prefs.telegramChatId ?? existing?.telegramChatId,
      preferences: { ...existing?.preferences, ...prefs.preferences },
      quietHoursStart: prefs.quietHoursStart ?? existing?.quietHoursStart,
      quietHoursEnd: prefs.quietHoursEnd ?? existing?.quietHoursEnd,
      timezone: prefs.timezone ?? existing?.timezone,
      digestMode: prefs.digestMode ?? existing?.digestMode ?? "instant",
      updatedAt: Date.now(),
    };

    this.preferences.set(address, updated);
    return updated;
  }

  // =========================================================================
  // Statistics
  // =========================================================================

  /**
   * Get notification statistics
   */
  getStatistics(): {
    totalNotifications: number;
    byStatus: Record<NotificationStatus, number>;
    byChannel: Record<NotificationChannel, number>;
    byEventType: Record<string, number>;
    webhookCount: number;
    totalDeliveries: number;
    deliverySuccessRate: number;
  } {
    const notifications = Array.from(this.notifications.values());
    const webhooks = Array.from(this.webhooks.values());

    const byStatus: Record<NotificationStatus, number> = {
      pending: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      read: 0,
    };

    const byChannel: Record<NotificationChannel, number> = {
      webhook: 0,
      email: 0,
      in_app: 0,
      sms: 0,
      discord: 0,
      telegram: 0,
    };

    const byEventType: Record<string, number> = {};

    for (const notification of notifications) {
      byStatus[notification.status]++;
      byChannel[notification.channel]++;
      byEventType[notification.eventType] = (byEventType[notification.eventType] || 0) + 1;
    }

    let totalDeliveries = 0;
    let successfulDeliveries = 0;

    for (const webhook of webhooks) {
      totalDeliveries += webhook.totalDeliveries;
      successfulDeliveries += webhook.successfulDeliveries;
    }

    return {
      totalNotifications: notifications.length,
      byStatus,
      byChannel,
      byEventType,
      webhookCount: webhooks.length,
      totalDeliveries,
      deliverySuccessRate:
        totalDeliveries > 0 ? (successfulDeliveries / totalDeliveries) * 100 : 0,
    };
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
