/**
 * Phase 10: Reports API Routes
 *
 * Financial reports, tax documents, and exports.
 */

import { Router, Request, Response } from "express";
import { reportService } from "../../reporting";

const router = Router();

// ============================================================================
// GENERATE REPORTS
// ============================================================================

/**
 * POST /reports/generate
 * Generate a report
 */
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const { type, format, period, filters, options } = req.body;
    const requestedBy = req.body.requestedBy || "anonymous";

    const report = await reportService.generateReport({
      type,
      format: format || "pdf",
      requestedBy,
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

/**
 * GET /reports/:reportId
 * Get report status
 */
router.get("/:reportId", (req: Request, res: Response) => {
  const report = reportService.getReportStatus(req.params.reportId);

  if (!report) {
    return res.status(404).json({ error: "Report not found" });
  }

  res.json(report);
});

/**
 * GET /reports/:reportId/download
 * Download report file
 */
router.get("/:reportId/download", async (req: Request, res: Response) => {
  try {
    const buffer = await reportService.downloadReport(req.params.reportId);

    if (!buffer) {
      return res.status(404).json({ error: "Report not available" });
    }

    const report = reportService.getReportStatus(req.params.reportId);
    const contentType = getContentType(report?.format || "json");
    const filename = `report_${req.params.reportId}.${report?.format || "json"}`;

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
  const success = reportService.cancelReport(req.params.reportId);

  if (success) {
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "Cannot cancel report" });
  }
});

// ============================================================================
// FINANCIAL REPORTS
// ============================================================================

/**
 * GET /reports/financial/:address
 * Get financial summary
 */
router.get("/financial/:address", (req: Request, res: Response) => {
  const { period = "month", currency, timezone } = req.query;

  const summary = reportService.getFinancialSummary(
    req.params.address,
    period as any,
    {
      currency: currency as string,
      timezone: timezone as string,
    }
  );

  res.json(summary);
});

/**
 * GET /reports/transactions/:address
 * Get transaction history
 */
router.get("/transactions/:address", (req: Request, res: Response) => {
  const { campaignIds, minAmount, maxAmount } = req.query;

  const transactions = reportService.getTransactionHistory(req.params.address, {
    campaignIds: campaignIds ? String(campaignIds).split(",") : undefined,
    minAmount: minAmount as string,
    maxAmount: maxAmount as string,
  });

  res.json({ transactions });
});

/**
 * GET /reports/payouts/:address
 * Get payout report
 */
router.get("/payouts/:address", (req: Request, res: Response) => {
  const { period = "month" } = req.query;

  const payouts = reportService.getPayoutReport(req.params.address, period as any);
  res.json(payouts);
});

// ============================================================================
// TAX REPORTS
// ============================================================================

/**
 * GET /reports/tax/:address/:year
 * Get tax summary
 */
router.get("/tax/:address/:year", (req: Request, res: Response) => {
  const { country = "US" } = req.query;

  const summary = reportService.getTaxSummary(
    req.params.address,
    parseInt(req.params.year),
    country as string
  );

  res.json(summary);
});

/**
 * POST /reports/tax/:address/form
 * Generate tax form
 */
router.post("/tax/:address/form", async (req: Request, res: Response) => {
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
 * GET /reports/campaigns/:campaignId/performance
 * Get campaign performance report
 */
router.get("/campaigns/:campaignId/performance", (req: Request, res: Response) => {
  const { period } = req.query;

  const performance = reportService.getCampaignPerformance(
    req.params.campaignId,
    period as any
  );

  res.json(performance);
});

// ============================================================================
// BACKER REPORTS
// ============================================================================

/**
 * GET /reports/backers/:address/activity
 * Get backer activity report
 */
router.get("/backers/:address/activity", (req: Request, res: Response) => {
  const { period } = req.query;

  const activity = reportService.getBackerActivity(req.params.address, period as any);
  res.json(activity);
});

// ============================================================================
// AUDIT
// ============================================================================

/**
 * GET /reports/audit/:entityType/:entityId
 * Get audit trail
 */
router.get("/audit/:entityType/:entityId", (req: Request, res: Response) => {
  const audit = reportService.getAuditTrail(
    req.params.entityType,
    req.params.entityId
  );

  res.json(audit);
});

// ============================================================================
// DISPUTES
// ============================================================================

/**
 * GET /reports/disputes
 * Get dispute summary
 */
router.get("/disputes", (req: Request, res: Response) => {
  const summary = reportService.getDisputeSummary();
  res.json(summary);
});

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * POST /reports/exports
 * Request data export
 */
router.post("/exports", async (req: Request, res: Response) => {
  try {
    const { dataType, format, filters, fields, requestedBy } = req.body;

    const exportRequest = await reportService.requestExport({
      dataType,
      format: format || "csv",
      requestedBy: requestedBy || "anonymous",
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
  const exportStatus = reportService.getExportStatus(req.params.exportId);

  if (!exportStatus) {
    return res.status(404).json({ error: "Export not found" });
  }

  res.json(exportStatus);
});

// ============================================================================
// SCHEDULED REPORTS
// ============================================================================

/**
 * POST /reports/scheduled
 * Create scheduled report
 */
router.post("/scheduled", (req: Request, res: Response) => {
  try {
    const scheduled = reportService.createScheduledReport(req.body);
    res.status(201).json(scheduled);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to create scheduled report",
    });
  }
});

/**
 * GET /reports/scheduled
 * List scheduled reports
 */
router.get("/scheduled", (req: Request, res: Response) => {
  const { address } = req.query;
  const reports = reportService.listScheduledReports(address as string || "");
  res.json({ reports });
});

/**
 * PUT /reports/scheduled/:reportId
 * Update scheduled report
 */
router.put("/scheduled/:reportId", (req: Request, res: Response) => {
  try {
    const updated = reportService.updateScheduledReport(
      req.params.reportId,
      req.body
    );
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
  const success = reportService.deleteScheduledReport(req.params.reportId);

  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Scheduled report not found" });
  }
});

/**
 * POST /reports/scheduled/:reportId/run
 * Run scheduled report now
 */
router.post("/scheduled/:reportId/run", async (req: Request, res: Response) => {
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
