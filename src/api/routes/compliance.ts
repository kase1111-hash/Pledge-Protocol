/**
 * Phase 9: Compliance API Routes
 *
 * GDPR, CCPA, and data privacy endpoints.
 */

import { Router, Request, Response } from "express";
import { GdprService, createGdprService } from "../../compliance";

const router = Router();

// Initialize GDPR service
const gdprService = createGdprService();

// ============================================================================
// DATA EXPORT (GDPR Art. 15, 20)
// ============================================================================

/**
 * Request data export
 * POST /v1/compliance/export
 */
router.post("/export", async (req: Request, res: Response) => {
  try {
    const { userAddress, format, categories } = req.body;

    if (!userAddress) {
      return res.status(400).json({ error: "userAddress is required" });
    }

    const request = await gdprService.requestExport(userAddress, {
      format: format || "json",
      categories,
      ipAddress: req.ip,
    });

    res.status(202).json({
      requestId: request.id,
      status: request.status,
      message: "Export request submitted. You will be notified when ready.",
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Export request failed",
    });
  }
});

/**
 * Get export request status
 * GET /v1/compliance/export/:requestId
 */
router.get("/export/:requestId", async (req: Request, res: Response) => {
  try {
    const request = gdprService.getExportRequest(req.params.requestId);

    if (!request) {
      return res.status(404).json({ error: "Export request not found" });
    }

    res.json(request);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get export status",
    });
  }
});

/**
 * Get user's export history
 * GET /v1/compliance/export/user/:address
 */
router.get("/export/user/:address", async (req: Request, res: Response) => {
  try {
    const exports = gdprService.getExportsByUser(req.params.address);
    res.json(exports);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get export history",
    });
  }
});

// ============================================================================
// DATA DELETION (GDPR Art. 17)
// ============================================================================

/**
 * Request data deletion
 * POST /v1/compliance/delete
 */
router.post("/delete", async (req: Request, res: Response) => {
  try {
    const { userAddress, type, categories, reason } = req.body;

    if (!userAddress) {
      return res.status(400).json({ error: "userAddress is required" });
    }

    const request = await gdprService.requestDeletion(userAddress, {
      type: type || "anonymize",
      categories,
      reason,
      ipAddress: req.ip,
    });

    res.status(202).json({
      requestId: request.id,
      status: request.status,
      confirmationToken: request.confirmationToken,
      scheduledFor: request.scheduledFor,
      message:
        "Deletion request submitted. Please confirm within 7 days using the confirmation token.",
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Deletion request failed",
    });
  }
});

/**
 * Confirm data deletion
 * POST /v1/compliance/delete/:requestId/confirm
 */
router.post("/delete/:requestId/confirm", async (req: Request, res: Response) => {
  try {
    const { confirmationToken } = req.body;

    if (!confirmationToken) {
      return res.status(400).json({ error: "confirmationToken is required" });
    }

    const request = await gdprService.confirmDeletion(
      req.params.requestId,
      confirmationToken
    );

    res.json({
      requestId: request.id,
      status: request.status,
      message: "Deletion confirmed. Processing will begin shortly.",
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Confirmation failed",
    });
  }
});

/**
 * Cancel deletion request
 * POST /v1/compliance/delete/:requestId/cancel
 */
router.post("/delete/:requestId/cancel", async (req: Request, res: Response) => {
  try {
    const request = await gdprService.cancelDeletion(req.params.requestId);
    res.json({
      requestId: request.id,
      status: request.status,
      message: "Deletion request cancelled.",
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Cancellation failed",
    });
  }
});

/**
 * Get deletion request status
 * GET /v1/compliance/delete/:requestId
 */
router.get("/delete/:requestId", async (req: Request, res: Response) => {
  try {
    const request = gdprService.getDeletionRequest(req.params.requestId);

    if (!request) {
      return res.status(404).json({ error: "Deletion request not found" });
    }

    res.json(request);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get deletion status",
    });
  }
});

// ============================================================================
// CONSENT MANAGEMENT
// ============================================================================

/**
 * Get user consent preferences
 * GET /v1/compliance/consent/:address
 */
router.get("/consent/:address", async (req: Request, res: Response) => {
  try {
    const preferences = gdprService.getConsentPreferences(req.params.address);
    res.json(preferences);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get consent",
    });
  }
});

/**
 * Update consent preferences
 * PUT /v1/compliance/consent/:address
 */
router.put("/consent/:address", async (req: Request, res: Response) => {
  try {
    const { consents } = req.body;

    if (!consents || typeof consents !== "object") {
      return res.status(400).json({ error: "consents object is required" });
    }

    const preferences = await gdprService.updateConsent({
      userAddress: req.params.address,
      consents,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json(preferences);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to update consent",
    });
  }
});

/**
 * Get consent history
 * GET /v1/compliance/consent/:address/history
 */
router.get("/consent/:address/history", async (req: Request, res: Response) => {
  try {
    const history = gdprService.getConsentHistory(req.params.address);
    res.json(history);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get consent history",
    });
  }
});

// ============================================================================
// GDPR RIGHTS
// ============================================================================

/**
 * Submit GDPR rights request
 * POST /v1/compliance/gdpr
 */
router.post("/gdpr", async (req: Request, res: Response) => {
  try {
    const { userAddress, right } = req.body;

    if (!userAddress || !right) {
      return res.status(400).json({
        error: "userAddress and right are required",
      });
    }

    const validRights = [
      "access",
      "rectification",
      "erasure",
      "restriction",
      "portability",
      "objection",
    ];
    if (!validRights.includes(right)) {
      return res.status(400).json({
        error: `Invalid right. Must be one of: ${validRights.join(", ")}`,
      });
    }

    const request = await gdprService.submitGdprRequest(userAddress, right);

    res.status(202).json({
      requestId: request.id,
      right: request.right,
      status: request.status,
      message: `GDPR ${right} request submitted.`,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "GDPR request failed",
    });
  }
});

/**
 * Get GDPR request status
 * GET /v1/compliance/gdpr/:requestId
 */
router.get("/gdpr/:requestId", async (req: Request, res: Response) => {
  try {
    const request = gdprService.getGdprRequest(req.params.requestId);

    if (!request) {
      return res.status(404).json({ error: "GDPR request not found" });
    }

    res.json(request);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get GDPR request",
    });
  }
});

// ============================================================================
// CCPA RIGHTS
// ============================================================================

/**
 * Submit CCPA rights request
 * POST /v1/compliance/ccpa
 */
router.post("/ccpa", async (req: Request, res: Response) => {
  try {
    const { userAddress, right, verificationMethod } = req.body;

    if (!userAddress || !right || !verificationMethod) {
      return res.status(400).json({
        error: "userAddress, right, and verificationMethod are required",
      });
    }

    const validRights = ["know", "delete", "opt_out", "non_discrimination"];
    if (!validRights.includes(right)) {
      return res.status(400).json({
        error: `Invalid right. Must be one of: ${validRights.join(", ")}`,
      });
    }

    const request = await gdprService.submitCcpaRequest(
      userAddress,
      right,
      verificationMethod
    );

    res.status(202).json({
      requestId: request.id,
      right: request.right,
      status: request.status,
      message: `CCPA ${right} request submitted.`,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "CCPA request failed",
    });
  }
});

// ============================================================================
// RETENTION POLICIES
// ============================================================================

/**
 * Get data retention policies
 * GET /v1/compliance/retention
 */
router.get("/retention", async (req: Request, res: Response) => {
  try {
    const categories = [
      "profile",
      "campaigns",
      "pledges",
      "transactions",
      "social",
      "audit_log",
      "communications",
    ];

    const policies = categories.map((category) => {
      const policy = gdprService.getRetentionPolicy(category as any);
      return policy || { category, retentionDays: 730, autoDelete: false };
    });

    res.json(policies);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get retention policies",
    });
  }
});

// ============================================================================
// COMPLIANCE REPORTS
// ============================================================================

/**
 * Generate compliance report
 * POST /v1/compliance/reports
 */
router.post("/reports", async (req: Request, res: Response) => {
  try {
    const { type, periodStart, periodEnd } = req.body;

    if (!type || !periodStart || !periodEnd) {
      return res.status(400).json({
        error: "type, periodStart, and periodEnd are required",
      });
    }

    const report = gdprService.generateComplianceReport(
      type,
      periodStart,
      periodEnd
    );

    res.json(report);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to generate report",
    });
  }
});

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get compliance statistics
 * GET /v1/compliance/stats
 */
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const stats = gdprService.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get stats",
    });
  }
});

export default router;
