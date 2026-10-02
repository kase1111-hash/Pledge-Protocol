/**
 * Phase 10: Reporting API Routes
 *
 * Financial reports, tax documents, exports and scheduled reports. Reports
 * describe a user's finances, so every route requires a session and returns
 * only the caller's own data (admins may see anyone's).
 */

import { Router, Request, Response, NextFunction } from "express";
import { reportService } from "../../reporting";
import {
  asyncHandler,
  authMiddleware,
  hasRole,
  isSelfOrAdmin,
  requireRole,
  requireSelfOrAdmin,
  sameAddress,
} from "../../security/middleware";
import { getStore } from "../../database";

const router = Router();

router.use(authMiddleware());

/**
 * A record the caller owns (or any, for admins). Others get a 404 so IDs
 * cannot be probed. Sends the response and returns null otherwise.
 */
function owned<T>(req: Request, res: Response, record: T | null, owner: (r: T) => string, label: string): T | null {
  if (!record || !isSelfOrAdmin(req, owner(record))) {
    res.status(404).json({ error: `${label} not found` });
    return null;
  }
  return record;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

/**
 * POST /reports/generate
 * Generate a report
 */
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const { type, format, period, filters, options } = req.body;

    const report = await reportService.generateReport({
      type,
      format: format || "pdf",
      requestedBy: req.auth!.address,
      period: {
        type: period?.type || "month",
        startDate: period?.startDate,
        endDate: period?.endDate,
      },
      filters,
      options,
    });

    res.status(202).json(report);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to generate report",
    });
  }
});

// ============================================================================
// FINANCIAL REPORTS
// ============================================================================

/**
 * GET /reports/financial/:address
 * Get financial summary
 */
router.get("/financial/:address", requireSelfOrAdmin(), asyncHandler(async (req: Request, res: Response) => {
  const { period = "month", currency, timezone } = req.query;

  const summary = await reportService.getFinancialSummary(
    req.params.address,
    period as any,
    {
      currency: currency as string,
      timezone: timezone as string,
    }
  );

  res.json(summary);
}));

/**
 * GET /reports/transactions/:address
 * Get transaction history
 */
router.get("/transactions/:address", requireSelfOrAdmin(), asyncHandler(async (req: Request, res: Response) => {
  const { campaignIds, minAmount, maxAmount } = req.query;

  const transactions = await reportService.getTransactionHistory(req.params.address, {
    campaignIds: campaignIds ? String(campaignIds).split(",") : undefined,
    minAmount: minAmount as string,
    maxAmount: maxAmount as string,
  });

  res.json({ transactions });
}));

/**
 * GET /reports/payouts/:address
 * Get payout report
 */
router.get("/payouts/:address", requireSelfOrAdmin(), asyncHandler(async (req: Request, res: Response) => {
  const { period = "month" } = req.query;

  const payouts = await reportService.getPayoutReport(req.params.address, period as any);
  res.json(payouts);
}));

// ============================================================================
// TAX REPORTS
// ============================================================================

/**
 * GET /reports/tax/:address/:year
 * Get tax summary
 */
router.get("/tax/:address/:year", requireSelfOrAdmin(), asyncHandler(async (req: Request, res: Response) => {
  const { country = "US" } = req.query;

  const summary = await reportService.getTaxSummary(
    req.params.address,
    parseInt(req.params.year),
    country as string
  );

  res.json(summary);
}));

/**
 * POST /reports/tax/:address/form
 * Generate tax form
 */
router.post("/tax/:address/form", requireSelfOrAdmin(), async (req: Request, res: Response) => {
  try {
    const { formType, year } = req.body;

    const form = await reportService.generateTaxForm(
      req.params.address,
      formType,
      year
    );

    res.status(201).json(form);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to generate tax form",
    });
  }
});

// ============================================================================
// CAMPAIGN REPORTS
// ============================================================================

/**
 * Only the campaign's creator (or an admin) sees its performance report
 */
const requireCampaignCreator = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const campaign = await getStore().getCampaign(req.params.campaignId);
  if (!campaign || (!sameAddress(campaign.creator, req.auth!.address) && !hasRole(req, "admin"))) {
    return res.status(404).json({ error: "Campaign not found" });
  }
  next();
});

/**
 * GET /reports/campaigns/:campaignId/performance
 * Get campaign performance report
 */
router.get("/campaigns/:campaignId/performance", requireCampaignCreator, asyncHandler(async (req: Request, res: Response) => {
  const { period } = req.query;

  const performance = await reportService.getCampaignPerformance(
    req.params.campaignId,
    period as any
  );

  res.json(performance);
}));

// ============================================================================
// BACKER REPORTS
// ============================================================================

/**
 * GET /reports/backers/:address/activity
 * Get backer activity report
 */
router.get("/backers/:address/activity", requireSelfOrAdmin(), asyncHandler(async (req: Request, res: Response) => {
  const { period } = req.query;

  const activity = await reportService.getBackerActivity(req.params.address, period as any);
  res.json(activity);
}));

// ============================================================================
// AUDIT & PLATFORM (admin)
// ============================================================================

/**
 * GET /reports/audit/:entityType/:entityId
 * Get audit trail
 */
router.get("/audit/:entityType/:entityId", requireRole("admin"), asyncHandler(async (req: Request, res: Response) => {
  const audit = await reportService.getAuditTrail(
    req.params.entityType,
    req.params.entityId
  );

  res.json(audit);
}));

/**
 * GET /reports/disputes
 * Get dispute summary
 */
router.get("/disputes", requireRole("admin", "arbitrator"), asyncHandler(async (req: Request, res: Response) => {
  const summary = await reportService.getDisputeSummary();
  res.json(summary);
}));

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * POST /reports/exports
 * Request data export
 */
router.post("/exports", async (req: Request, res: Response) => {
  try {
    const { dataType, format, filters, fields } = req.body;

    const exportRequest = await reportService.requestExport({
      dataType,
      format: format || "csv",
      requestedBy: req.auth!.address,
      filters,
      fields,
    });

    res.status(202).json(exportRequest);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to request export",
    });
  }
});

/**
 * GET /reports/exports/:exportId
 * Get export status
 */
router.get("/exports/:exportId", (req: Request, res: Response) => {
  const exportStatus = owned(
    req,
    res,
    reportService.getExportStatus(req.params.exportId),
    (e) => e.requestedBy,
    "Export"
  );

  if (exportStatus) {
    res.json(exportStatus);
  }
});

/**
 * GET /reports/exports/:exportId/download
 * Download an export file
 */
router.get("/exports/:exportId/download", asyncHandler(async (req: Request, res: Response) => {
  const exportRequest = owned(
    req,
    res,
    reportService.getExportStatus(req.params.exportId),
    (e) => e.requestedBy,
    "Export"
  );
  if (!exportRequest) return;

  const buffer = await reportService.downloadExport(req.params.exportId);
  if (!buffer) {
    return res.status(404).json({ error: "Export not available" });
  }

  res.setHeader("Content-Type", getContentType(exportRequest.format));
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="export_${req.params.exportId}.${exportRequest.format}"`
  );
  res.send(buffer);
}));

// ============================================================================
// SCHEDULED REPORTS
// ============================================================================

/**
 * POST /reports/scheduled
 * Create scheduled report
 */
router.post("/scheduled", (req: Request, res: Response) => {
  try {
    const scheduled = reportService.createScheduledReport({
      ...req.body,
      createdBy: req.auth!.address,
    });
    res.status(201).json(scheduled);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to create scheduled report",
    });
  }
});

/**
 * GET /reports/scheduled
 * List your scheduled reports (admins may pass ?address=)
 */
router.get("/scheduled", (req: Request, res: Response) => {
  const requested = req.query.address as string | undefined;
  const address = requested && hasRole(req, "admin") ? requested : req.auth!.address;
  const reports = reportService.listScheduledReports(address);
  res.json({ reports });
});

function ownedSchedule(req: Request, res: Response) {
  return owned(
    req,
    res,
    reportService.getScheduledReport(req.params.reportId),
    (r) => r.createdBy,
    "Scheduled report"
  );
}

/**
 * PUT /reports/scheduled/:reportId
 * Update scheduled report
 */
router.put("/scheduled/:reportId", (req: Request, res: Response) => {
  if (!ownedSchedule(req, res)) return;

  try {
    // Ownership and identity are not editable
    const updates = { ...req.body };
    delete updates.createdBy;
    delete updates.id;
    const updated = reportService.updateScheduledReport(req.params.reportId, updates);
    res.json(updated);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to update scheduled report",
    });
  }
});

/**
 * DELETE /reports/scheduled/:reportId
 * Delete scheduled report
 */
router.delete("/scheduled/:reportId", (req: Request, res: Response) => {
  if (!ownedSchedule(req, res)) return;

  reportService.deleteScheduledReport(req.params.reportId);
  res.json({ success: true });
});

/**
 * POST /reports/scheduled/:reportId/run
 * Run scheduled report now
 */
router.post("/scheduled/:reportId/run", async (req: Request, res: Response) => {
  if (!ownedSchedule(req, res)) return;

  try {
    const report = await reportService.runScheduledReport(req.params.reportId);
    res.json(report);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to run scheduled report",
    });
  }
});

// ============================================================================
// INDIVIDUAL REPORTS
// Registered last: "/:reportId" would otherwise capture paths such as
// "/scheduled" and "/disputes".
// ============================================================================

function ownedReport(req: Request, res: Response) {
  return owned(
    req,
    res,
    reportService.getReportStatus(req.params.reportId),
    (r) => r.requestedBy,
    "Report"
  );
}

/**
 * GET /reports/:reportId
 * Get report status
 */
router.get("/:reportId", (req: Request, res: Response) => {
  const report = ownedReport(req, res);
  if (report) {
    res.json(report);
  }
});

/**
 * GET /reports/:reportId/download
 * Download report file
 */
router.get("/:reportId/download", async (req: Request, res: Response) => {
  const report = ownedReport(req, res);
  if (!report) return;

  try {
    const buffer = await reportService.downloadReport(req.params.reportId);

    if (!buffer) {
      return res.status(404).json({ error: "Report not available" });
    }

    const contentType = getContentType(report.format || "json");
    const filename = `report_${req.params.reportId}.${report.format || "json"}`;

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to download report",
    });
  }
});

/**
 * DELETE /reports/:reportId
 * Cancel a pending report
 */
router.delete("/:reportId", (req: Request, res: Response) => {
  if (!ownedReport(req, res)) return;

  const success = reportService.cancelReport(req.params.reportId);

  if (success) {
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "Cannot cancel report" });
  }
});

// ============================================================================
// HELPERS
// ============================================================================

function getContentType(format: string): string {
  switch (format) {
    case "pdf":
      return "application/pdf";
    case "csv":
      return "text/csv";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "json":
    default:
      return "application/json";
  }
}

export default router;
