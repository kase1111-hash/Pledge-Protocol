/**
 * Phase 9: Risk Assessment API Routes
 *
 * Fraud detection, verification, and trust scoring endpoints.
 */

import { Router, Request, Response } from "express";
import { FraudDetector, createFraudDetector } from "../../risk";

const router = Router();

// Initialize fraud detector
const fraudDetector = createFraudDetector();

// ============================================================================
// VERIFICATION
// ============================================================================

/**
 * Request verification
 * POST /v1/risk/verify
 */
router.post("/verify", async (req: Request, res: Response) => {
  try {
    const { userAddress, type, level } = req.body;

    if (!userAddress || !type) {
      return res.status(400).json({
        error: "userAddress and type are required",
      });
    }

    const validTypes = [
      "email",
      "phone",
      "identity",
      "address",
      "social",
      "business",
    ];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
      });
    }

    const record = await fraudDetector.requestVerification(
      userAddress,
      type,
      level || "basic"
    );

    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Verification request failed",
    });
  }
});

/**
 * Complete verification
 * POST /v1/risk/verify/:verificationId/complete
 */
router.post("/verify/:verificationId/complete", async (req: Request, res: Response) => {
  try {
    const { success, verifiedData, rejectionReason, provider, expiresInDays } =
      req.body;

    if (success === undefined) {
      return res.status(400).json({ error: "success is required" });
    }

    const record = await fraudDetector.completeVerification(
      req.params.verificationId,
      success,
      {
        verifiedData,
        rejectionReason,
        provider,
        expiresInDays,
      }
    );

    res.json(record);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Verification completion failed",
    });
  }
});

/**
 * Get verification summary
 * GET /v1/risk/verify/:address
 */
router.get("/verify/:address", async (req: Request, res: Response) => {
  try {
    const summary = fraudDetector.getVerificationSummary(req.params.address);
    res.json(summary);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get verification",
    });
  }
});

// ============================================================================
// BADGES
// ============================================================================

/**
 * Get user badges
 * GET /v1/risk/badges/:address
 */
router.get("/badges/:address", async (req: Request, res: Response) => {
  try {
    const badges = fraudDetector.getUserBadges(req.params.address);
    res.json(badges);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get badges",
    });
  }
});

/**
 * Award badge
 * POST /v1/risk/badges
 */
router.post("/badges", async (req: Request, res: Response) => {
  try {
    const { userAddress, type } = req.body;

    if (!userAddress || !type) {
      return res.status(400).json({
        error: "userAddress and type are required",
      });
    }

    const badge = await fraudDetector.awardBadge(userAddress, type);
    res.status(201).json(badge);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to award badge",
    });
  }
});

// ============================================================================
// TRUST SCORES
// ============================================================================

/**
 * Calculate trust score
 * POST /v1/risk/score/:address
 */
router.post("/score/:address", async (req: Request, res: Response) => {
  try {
    const stats = req.body;

    const score = await fraudDetector.calculateTrustScore(
      req.params.address,
      stats
    );

    res.json(score);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to calculate score",
    });
  }
});

/**
 * Get trust score
 * GET /v1/risk/score/:address
 */
router.get("/score/:address", async (req: Request, res: Response) => {
  try {
    const score = fraudDetector.getTrustScore(req.params.address);

    if (!score) {
      return res.status(404).json({ error: "Trust score not found" });
    }

    res.json(score);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get trust score",
    });
  }
});

// ============================================================================
// RISK ASSESSMENT
// ============================================================================

/**
 * Assess risk
 * POST /v1/risk/assess
 */
router.post("/assess", async (req: Request, res: Response) => {
  try {
    const { entityType, entityId, data } = req.body;

    if (!entityType || !entityId || !data) {
      return res.status(400).json({
        error: "entityType, entityId, and data are required",
      });
    }

    const validTypes = ["campaign", "pledge", "user", "transaction"];
    if (!validTypes.includes(entityType)) {
      return res.status(400).json({
        error: `Invalid entityType. Must be one of: ${validTypes.join(", ")}`,
      });
    }

    const assessment = await fraudDetector.assessRisk(entityType, entityId, data);

    res.json(assessment);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Risk assessment failed",
    });
  }
});

/**
 * Get risk assessment
 * GET /v1/risk/assess/:assessmentId
 */
router.get("/assess/:assessmentId", async (req: Request, res: Response) => {
  try {
    const assessment = fraudDetector.getAssessment(req.params.assessmentId);

    if (!assessment) {
      return res.status(404).json({ error: "Assessment not found" });
    }

    res.json(assessment);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get assessment",
    });
  }
});

// ============================================================================
// ALERTS
// ============================================================================

/**
 * Get open alerts
 * GET /v1/risk/alerts
 */
router.get("/alerts", async (req: Request, res: Response) => {
  try {
    const alerts = fraudDetector.getOpenAlerts();
    res.json(alerts);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get alerts",
    });
  }
});

/**
 * Acknowledge alert
 * POST /v1/risk/alerts/:alertId/acknowledge
 */
router.post("/alerts/:alertId/acknowledge", async (req: Request, res: Response) => {
  try {
    const { acknowledgedBy } = req.body;

    if (!acknowledgedBy) {
      return res.status(400).json({ error: "acknowledgedBy is required" });
    }

    const alert = fraudDetector.acknowledgeAlert(
      req.params.alertId,
      acknowledgedBy
    );

    res.json(alert);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to acknowledge alert",
    });
  }
});

/**
 * Resolve alert
 * POST /v1/risk/alerts/:alertId/resolve
 */
router.post("/alerts/:alertId/resolve", async (req: Request, res: Response) => {
  try {
    const { resolvedBy, resolution, actionTaken } = req.body;

    if (!resolvedBy || !resolution || !actionTaken) {
      return res.status(400).json({
        error: "resolvedBy, resolution, and actionTaken are required",
      });
    }

    const alert = fraudDetector.resolveAlert(
      req.params.alertId,
      resolvedBy,
      resolution,
      actionTaken
    );

    res.json(alert);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to resolve alert",
    });
  }
});

// ============================================================================
// BLOCKLIST
// ============================================================================

/**
 * Add to blocklist
 * POST /v1/risk/blocklist
 */
router.post("/blocklist", async (req: Request, res: Response) => {
  try {
    const { type, value, reason, severity, addedBy } = req.body;

    if (!type || !value || !reason || !severity) {
      return res.status(400).json({
        error: "type, value, reason, and severity are required",
      });
    }

    const validTypes = ["address", "email", "ip", "domain", "content"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
      });
    }

    const entry = fraudDetector.addToBlocklist(
      type,
      value,
      reason,
      severity,
      addedBy
    );

    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to add to blocklist",
    });
  }
});

/**
 * Check if blocked
 * GET /v1/risk/blocklist/check
 */
router.get("/blocklist/check", async (req: Request, res: Response) => {
  try {
    const { type, value } = req.query;

    if (!type || !value) {
      return res.status(400).json({
        error: "type and value query parameters are required",
      });
    }

    const entry = fraudDetector.isBlocked(type as any, value as string);

    res.json({
      blocked: !!entry,
      entry: entry || undefined,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to check blocklist",
    });
  }
});

/**
 * Remove from blocklist
 * DELETE /v1/risk/blocklist
 */
router.delete("/blocklist", async (req: Request, res: Response) => {
  try {
    const { type, value } = req.body;

    if (!type || !value) {
      return res.status(400).json({
        error: "type and value are required",
      });
    }

    fraudDetector.removeFromBlocklist(type, value);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to remove from blocklist",
    });
  }
});

// ============================================================================
// REPORTS
// ============================================================================

/**
 * Generate risk report
 * POST /v1/risk/reports
 */
router.post("/reports", async (req: Request, res: Response) => {
  try {
    const { periodStart, periodEnd } = req.body;

    if (!periodStart || !periodEnd) {
      return res.status(400).json({
        error: "periodStart and periodEnd are required",
      });
    }

    const report = fraudDetector.generateReport(periodStart, periodEnd);
    res.json(report);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to generate report",
    });
  }
});

export default router;
