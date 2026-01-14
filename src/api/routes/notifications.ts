/**
 * Phase 10: Notifications API Routes
 *
 * Email, push, in-app notifications with preferences.
 */

import { Router, Request, Response } from "express";
import { notificationService } from "../../notifications-v2";

const router = Router();

// ============================================================================
// SEND NOTIFICATIONS
// ============================================================================

/**
 * POST /notifications/send
 * Send a notification to a user
 */
router.post("/send", async (req: Request, res: Response) => {
  try {
    const { recipientAddress, type, variables, channels, priority, metadata } = req.body;

    const notification = await notificationService.send({
      recipientAddress,
      type,
      variables: variables || {},
      channels,
      priority,
      metadata,
    });

    res.status(201).json(notification);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to send notification",
    });
  }
});

/**
 * POST /notifications/broadcast
 * Broadcast to a topic
 */
router.post("/broadcast", async (req: Request, res: Response) => {
  try {
    const { topic, type, variables } = req.body;

    const count = await notificationService.sendToTopic(topic, {
      recipientAddress: "broadcast",
      type,
      variables: variables || {},
    });

    res.json({ topic, sentCount: count });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to broadcast",
    });
  }
});

// ============================================================================
// PREFERENCES
// ============================================================================

/**
 * GET /notifications/preferences/:address
 * Get notification preferences
 */
router.get("/preferences/:address", (req: Request, res: Response) => {
  const preferences = notificationService.getPreferences(req.params.address);
  res.json(preferences);
});

/**
 * PUT /notifications/preferences/:address
 * Update notification preferences
 */
router.put("/preferences/:address", (req: Request, res: Response) => {
  try {
    const updated = notificationService.updatePreferences(
      req.params.address,
      req.body
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to update preferences",
    });
  }
});

// ============================================================================
// DEVICES
// ============================================================================

/**
 * POST /notifications/devices/:address
 * Register a device for push notifications
 */
router.post("/devices/:address", (req: Request, res: Response) => {
  try {
    const { token, platform, deviceId, deviceName } = req.body;

    const device = notificationService.registerDevice(req.params.address, {
      token,
      platform,
      deviceId,
      deviceName,
    });

    res.status(201).json(device);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to register device",
    });
  }
});

/**
 * DELETE /notifications/devices/:address/:deviceId
 * Unregister a device
 */
router.delete("/devices/:address/:deviceId", (req: Request, res: Response) => {
  const success = notificationService.unregisterDevice(
    req.params.address,
    req.params.deviceId
  );

  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Device not found" });
  }
});

// ============================================================================
// IN-APP NOTIFICATIONS
// ============================================================================

/**
 * GET /notifications/in-app/:address
 * Get in-app notifications
 */
router.get("/in-app/:address", (req: Request, res: Response) => {
  const { types, read, archived, limit, offset, since } = req.query;

  const notifications = notificationService.getInAppNotifications({
    address: req.params.address,
    types: types ? String(types).split(",") as any[] : undefined,
    read: read !== undefined ? read === "true" : undefined,
    archived: archived !== undefined ? archived === "true" : undefined,
    limit: limit ? parseInt(String(limit)) : undefined,
    offset: offset ? parseInt(String(offset)) : undefined,
    since: since ? parseInt(String(since)) : undefined,
  });

  res.json({
    notifications,
    unreadCount: notificationService.getUnreadCount(req.params.address),
  });
});

/**
 * POST /notifications/in-app/:address/read
 * Mark notifications as read
 */
router.post("/in-app/:address/read", (req: Request, res: Response) => {
  const { notificationIds } = req.body;

  const count = notificationService.markAsRead(
    req.params.address,
    notificationIds || []
  );

  res.json({ markedAsRead: count });
});

/**
 * POST /notifications/in-app/:address/read-all
 * Mark all notifications as read
 */
router.post("/in-app/:address/read-all", (req: Request, res: Response) => {
  const count = notificationService.markAllAsRead(req.params.address);
  res.json({ markedAsRead: count });
});

/**
 * POST /notifications/in-app/:address/archive
 * Archive notifications
 */
router.post("/in-app/:address/archive", (req: Request, res: Response) => {
  const { notificationIds } = req.body;

  const count = notificationService.archiveNotifications(
    req.params.address,
    notificationIds || []
  );

  res.json({ archived: count });
});

// ============================================================================
// DIGEST
// ============================================================================

/**
 * POST /notifications/digest/:address
 * Generate and send digest
 */
router.post("/digest/:address", async (req: Request, res: Response) => {
  try {
    const { period = "weekly" } = req.body;

    const content = notificationService.generateDigest(
      req.params.address,
      period
    );
    const sent = await notificationService.sendDigest(req.params.address, content);

    res.json({ digest: content, sent });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to send digest",
    });
  }
});

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * GET /notifications/stats
 * Get delivery statistics
 */
router.get("/stats", (req: Request, res: Response) => {
  const { startDate, endDate, channel, type } = req.query;

  const stats = notificationService.getDeliveryStats({
    startDate: startDate ? parseInt(String(startDate)) : undefined,
    endDate: endDate ? parseInt(String(endDate)) : undefined,
    channel: channel as any,
    type: type as any,
  });

  res.json(stats);
});

export default router;
