/**
 * Phase 10: Report Service
 *
 * Financial reports, tax documents, and data exports.
 */

import {
  ReportType,
  ReportFormat,
  ReportStatus,
  ReportPeriod,
  ReportRequest,
  ReportFilters,
  ReportOptions,
  FinancialSummary,
  TransactionRecord,
  PayoutReport,
  TaxSummary,
  TaxForm,
  CampaignPerformance,
  BackerActivity,
  AuditTrail,
  AuditEvent,
  DisputeSummary,
  ExportRequest,
  ScheduledReport,
  GenerateReportParams,
  ExportRequestParams,
  CreateScheduledReportParams,
} from "./types";

// ============================================================================
// REPORT SERVICE
// ============================================================================

export class ReportService {
  private reports: Map<string, ReportRequest> = new Map();
  private exports: Map<string, ExportRequest> = new Map();
  private scheduledReports: Map<string, ScheduledReport> = new Map();
  private reportFiles: Map<string, Buffer> = new Map();

  // ==========================================================================
  // GENERATE REPORTS
  // ==========================================================================

  async generateReport(params: GenerateReportParams): Promise<ReportRequest> {
    const { startDate, endDate } = this.getPeriodDates(params.period);

    const request: ReportRequest = {
      id: `rpt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: params.type,
      format: params.format,
      requestedBy: params.requestedBy,
      period: {
        type: params.period.type,
        startDate,
        endDate,
      },
      filters: params.filters,
      options: params.options,
      status: "pending",
      progress: 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };

    this.reports.set(request.id, request);

    // Generate report asynchronously
    this.processReport(request);

    return request;
  }

  private async processReport(request: ReportRequest): Promise<void> {
    request.status = "generating";
    request.progress = 10;

    try {
      // Simulate report generation
      let data: unknown;

      switch (request.type) {
        case "financial_summary":
          data = this.generateFinancialSummary(request);
          break;
        case "campaign_performance":
          data = this.generateCampaignReport(request);
          break;
        case "backer_activity":
          data = this.generateBackerReport(request);
          break;
        case "tax_summary":
          data = this.generateTaxReport(request);
          break;
        case "transaction_history":
          data = this.generateTransactionReport(request);
          break;
        case "payout_report":
          data = this.generatePayoutReport(request);
          break;
        case "dispute_summary":
          data = this.generateDisputeReport(request);
          break;
        case "audit_trail":
          data = this.generateAuditReport(request);
          break;
        default:
          throw new Error(`Unknown report type: ${request.type}`);
      }

      request.progress = 80;

      // Convert to requested format
      const buffer = await this.formatReport(data, request.format, request.type);
      this.reportFiles.set(request.id, buffer);

      request.progress = 100;
      request.status = "ready";
      request.fileSize = buffer.length;
      request.fileUrl = `/api/v1/reports/${request.id}/download`;
      request.completedAt = Date.now();
    } catch (error) {
      request.status = "failed";
      request.errorMessage = error instanceof Error ? error.message : "Unknown error";
    }
  }

  private async formatReport(
    data: unknown,
    format: ReportFormat,
    type: ReportType
  ): Promise<Buffer> {
    switch (format) {
      case "json":
        return Buffer.from(JSON.stringify(data, null, 2));

      case "csv":
        return this.convertToCsv(data, type);

      case "xlsx":
        // In production, use a library like exceljs
        return Buffer.from(JSON.stringify(data));

      case "pdf":
        // In production, use a library like pdfkit or puppeteer
        return this.generatePdf(data, type);

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private convertToCsv(data: unknown, _type: ReportType): Buffer {
    // Simple CSV conversion
    if (!Array.isArray(data)) {
      data = [data];
    }

    if ((data as unknown[]).length === 0) {
      return Buffer.from("");
    }

    const records = data as Record<string, unknown>[];
    const headers = Object.keys(records[0]);
    const rows = [
      headers.join(","),
      ...records.map((record) =>
        headers
          .map((h) => {
            const val = record[h];
            if (typeof val === "string" && (val.includes(",") || val.includes('"'))) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return String(val ?? "");
          })
          .join(",")
      ),
    ];

    return Buffer.from(rows.join("\n"));
  }

  private generatePdf(_data: unknown, type: ReportType): Buffer {
    // Simplified PDF generation (in production, use proper PDF library)
    const content = `
      PLEDGE PROTOCOL REPORT
      =====================

      Report Type: ${type}
      Generated: ${new Date().toISOString()}

      [Report content would be formatted here]
    `;

    return Buffer.from(content);
  }

  getReportStatus(reportId: string): ReportRequest | null {
    return this.reports.get(reportId) || null;
  }

  async downloadReport(reportId: string): Promise<Buffer | null> {
    const report = this.reports.get(reportId);
    if (!report || report.status !== "ready") {
      return null;
    }

    // Check expiration
    if (report.expiresAt && Date.now() > report.expiresAt) {
      report.status = "expired";
      return null;
    }

    return this.reportFiles.get(reportId) || null;
  }

  cancelReport(reportId: string): boolean {
    const report = this.reports.get(reportId);
    if (!report || report.status === "ready" || report.status === "failed") {
      return false;
    }

    report.status = "failed";
    report.errorMessage = "Cancelled by user";
    return true;
  }

  // ==========================================================================
  // FINANCIAL REPORTS
  // ==========================================================================

  getFinancialSummary(
    address: string,
    period: ReportPeriod,
    options?: ReportOptions
  ): FinancialSummary {
    const { startDate, endDate } = this.getPeriodDates({ type: period });

    // In production, this would aggregate real transaction data
    return {
      period: { start: startDate, end: endDate },
      currency: options?.currency || "USD",
      overview: {
        totalRevenue: "125000.00",
        totalPayouts: "100000.00",
        platformFees: "3750.00",
        refunds: "5000.00",
        netIncome: "116250.00",
      },
      byCategory: [
        { category: "fitness", revenue: "50000.00", campaigns: 12, pledges: 450 },
        { category: "creative", revenue: "35000.00", campaigns: 8, pledges: 280 },
        { category: "education", revenue: "25000.00", campaigns: 5, pledges: 150 },
        { category: "other", revenue: "15000.00", campaigns: 10, pledges: 100 },
      ],
      byCurrency: [
        { currency: "USD", amount: "100000.00", usdEquivalent: "100000.00" },
        { currency: "USDC", amount: "25000.00", usdEquivalent: "25000.00" },
      ],
      trends: this.generateTrends(startDate, endDate),
    };
  }

  private generateTrends(
    startDate: number,
    endDate: number
  ): FinancialSummary["trends"] {
    const trends: FinancialSummary["trends"] = [];
    const dayMs = 24 * 60 * 60 * 1000;
    let current = startDate;

    while (current <= endDate) {
      trends.push({
        date: new Date(current).toISOString().split("T")[0],
        revenue: String(Math.floor(Math.random() * 5000) + 1000),
        pledges: Math.floor(Math.random() * 50) + 10,
      });
      current += dayMs;
    }

    return trends;
  }

  getTransactionHistory(
    address: string,
    filters?: ReportFilters
  ): TransactionRecord[] {
    // In production, query database with filters
    const transactions: TransactionRecord[] = [];
    const now = Date.now();

    // Generate sample transactions
    for (let i = 0; i < 20; i++) {
      const types: TransactionRecord["type"][] = ["pledge", "release", "refund", "fee", "payout"];
      const type = types[Math.floor(Math.random() * types.length)];

      transactions.push({
        id: `tx_${i}_${Math.random().toString(36).substr(2, 6)}`,
        type,
        date: now - i * 24 * 60 * 60 * 1000,
        amount: String(Math.floor(Math.random() * 1000) + 50),
        currency: "USD",
        campaignId: `campaign_${Math.floor(Math.random() * 10)}`,
        campaignName: `Sample Campaign ${i}`,
        fromAddress: type === "pledge" ? address : "0x...",
        toAddress: type === "payout" ? address : "0x...",
        txHash: `0x${Math.random().toString(16).substr(2, 64)}`,
        status: "completed",
        description: this.getTransactionDescription(type),
      });
    }

    return transactions;
  }

  private getTransactionDescription(type: TransactionRecord["type"]): string {
    switch (type) {
      case "pledge":
        return "Pledge payment escrowed";
      case "release":
        return "Funds released to beneficiary";
      case "refund":
        return "Funds refunded to backer";
      case "fee":
        return "Platform fee";
      case "payout":
        return "Creator payout";
    }
  }

  getPayoutReport(address: string, period: ReportPeriod): PayoutReport {
    const { startDate, endDate } = this.getPeriodDates({ type: period });

    return {
      period: { start: startDate, end: endDate },
      recipient: address,
      totalPayouts: "45000.00",
      currency: "USD",
      payouts: [
        {
          id: "payout_1",
          date: startDate + 7 * 24 * 60 * 60 * 1000,
          campaignId: "campaign_1",
          campaignName: "Portland Marathon 2026",
          amount: "25000.00",
          fee: "750.00",
          netAmount: "24250.00",
          status: "completed",
          txHash: "0x1234...",
        },
        {
          id: "payout_2",
          date: startDate + 14 * 24 * 60 * 60 * 1000,
          campaignId: "campaign_2",
          campaignName: "Album Recording",
          amount: "20000.00",
          fee: "600.00",
          netAmount: "19400.00",
          status: "completed",
          txHash: "0x5678...",
        },
      ],
      summary: {
        grossAmount: "45000.00",
        totalFees: "1350.00",
        netAmount: "43650.00",
        pendingAmount: "0.00",
      },
    };
  }

  // ==========================================================================
  // TAX REPORTS
  // ==========================================================================

  getTaxSummary(address: string, taxYear: number, country: string): TaxSummary {
    return {
      taxYear,
      taxpayerAddress: address,
      taxpayerType: "creator",
      country,
      currency: country === "US" ? "USD" : "EUR",
      income: {
        total: "75000.00",
        campaigns: [
          {
            campaignId: "campaign_1",
            campaignName: "Portland Marathon 2026",
            amount: "45000.00",
            date: Date.now() - 180 * 24 * 60 * 60 * 1000,
          },
          {
            campaignId: "campaign_2",
            campaignName: "Album Recording",
            amount: "30000.00",
            date: Date.now() - 90 * 24 * 60 * 60 * 1000,
          },
        ],
      },
      expenses: {
        total: "2625.00",
        platformFees: "2250.00",
        processingFees: "375.00",
        other: "0.00",
      },
      netIncome: "72375.00",
      forms: [],
    };
  }

  async generateTaxForm(
    address: string,
    formType: TaxForm["type"],
    year: number
  ): Promise<TaxForm> {
    const form: TaxForm = {
      type: formType,
      year,
      status: "draft",
      generatedAt: Date.now(),
      data: {
        taxpayerAddress: address,
        totalIncome: "75000.00",
        // Additional form-specific data
      },
    };

    // In production, generate actual tax form PDF
    form.status = "ready";
    form.fileUrl = `/api/v1/reports/tax/${formType}/${year}/download`;

    return form;
  }

  // ==========================================================================
  // CAMPAIGN REPORTS
  // ==========================================================================

  getCampaignPerformance(
    campaignId: string,
    period?: ReportPeriod
  ): CampaignPerformance {
    const { startDate, endDate } = this.getPeriodDates({ type: period || "month" });

    return {
      campaignId,
      campaignName: "Sample Campaign",
      period: { start: startDate, end: endDate },
      metrics: {
        totalPledged: "50000.00",
        goalAmount: "40000.00",
        percentFunded: 125,
        backerCount: 150,
        averagePledge: "333.33",
        conversionRate: 8.5,
        milestonesCompleted: 3,
        milestonesTotal: 4,
      },
      timeline: this.generateTimeline(startDate, endDate),
      pledgeBreakdown: [
        { type: "flat", count: 100, totalAmount: "30000.00" },
        { type: "per_unit", count: 35, totalAmount: "15000.00" },
        { type: "tiered", count: 15, totalAmount: "5000.00" },
      ],
      topBackers: [
        { address: "0xabc...", displayName: "BigSupporter", amount: "5000.00", pledgeCount: 1 },
        { address: "0xdef...", displayName: "RegularBacker", amount: "2500.00", pledgeCount: 3 },
        { address: "0x123...", amount: "2000.00", pledgeCount: 2 },
      ],
      referralSources: [
        { source: "twitter", backers: 60, amount: "20000.00" },
        { source: "direct", backers: 45, amount: "15000.00" },
        { source: "email", backers: 30, amount: "10000.00" },
        { source: "other", backers: 15, amount: "5000.00" },
      ],
    };
  }

  private generateTimeline(
    startDate: number,
    endDate: number
  ): CampaignPerformance["timeline"] {
    const timeline: CampaignPerformance["timeline"] = [];
    const dayMs = 24 * 60 * 60 * 1000;
    let current = startDate;
    let cumulative = 0;

    while (current <= endDate) {
      const daily = Math.floor(Math.random() * 2000) + 500;
      cumulative += daily;

      timeline.push({
        date: new Date(current).toISOString().split("T")[0],
        pledgedAmount: String(daily),
        cumulativeAmount: String(cumulative),
        backerCount: Math.floor(Math.random() * 10) + 1,
      });
      current += dayMs;
    }

    return timeline;
  }

  // ==========================================================================
  // BACKER REPORTS
  // ==========================================================================

  getBackerActivity(address: string, period?: ReportPeriod): BackerActivity {
    const { startDate, endDate } = this.getPeriodDates({ type: period || "year" });

    return {
      backerAddress: address,
      period: { start: startDate, end: endDate },
      summary: {
        totalPledged: "15000.00",
        totalReleased: "12000.00",
        totalRefunded: "500.00",
        activeCommitments: "2500.00",
        campaignsSupported: 12,
        commemorativesReceived: 10,
      },
      pledges: [
        {
          pledgeId: "pledge_1",
          campaignId: "campaign_1",
          campaignName: "Portland Marathon 2026",
          amount: "1000.00",
          status: "released",
          createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000,
          resolvedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
        },
        {
          pledgeId: "pledge_2",
          campaignId: "campaign_2",
          campaignName: "Album Recording",
          amount: "500.00",
          status: "active",
          createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
        },
      ],
      commemoratives: [
        {
          id: "comm_1",
          campaignName: "Portland Marathon 2026",
          mintedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
          imageUrl: "https://...",
        },
      ],
      portfolio: {
        active: "2500.00",
        pending: "1000.00",
        released: "12000.00",
        refunded: "500.00",
      },
    };
  }

  // ==========================================================================
  // AUDIT REPORTS
  // ==========================================================================

  getAuditTrail(
    entityType: string,
    entityId: string,
    filters?: ReportFilters
  ): AuditTrail {
    const events: AuditEvent[] = [
      {
        id: "audit_1",
        timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
        action: "created",
        actor: "0xabc...",
        actorType: "user",
        details: { name: "Campaign Created" },
      },
      {
        id: "audit_2",
        timestamp: Date.now() - 20 * 24 * 60 * 60 * 1000,
        action: "pledge_received",
        actor: "0xdef...",
        actorType: "user",
        details: { amount: "1000.00" },
      },
      {
        id: "audit_3",
        timestamp: Date.now() - 10 * 24 * 60 * 60 * 1000,
        action: "milestone_verified",
        actor: "oracle_athlinks",
        actorType: "oracle",
        details: { milestone: "Race Completion" },
      },
      {
        id: "audit_4",
        timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000,
        action: "funds_released",
        actor: "system",
        actorType: "system",
        details: { amount: "25000.00" },
      },
    ];

    return {
      entityType: entityType as AuditTrail["entityType"],
      entityId,
      period: {
        start: Date.now() - 90 * 24 * 60 * 60 * 1000,
        end: Date.now(),
      },
      events,
    };
  }

  // ==========================================================================
  // DISPUTE REPORTS
  // ==========================================================================

  getDisputeSummary(filters?: ReportFilters): DisputeSummary {
    const startDate = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const endDate = Date.now();

    return {
      period: { start: startDate, end: endDate },
      overview: {
        total: 45,
        resolved: 38,
        pending: 5,
        escalated: 2,
        averageResolutionTime: 5 * 24 * 60 * 60 * 1000, // 5 days
      },
      byCategory: [
        { category: "oracle_disagreement", count: 20, resolvedCount: 18, averageTime: 4 },
        { category: "milestone_dispute", count: 15, resolvedCount: 12, averageTime: 6 },
        { category: "fraud_claim", count: 5, resolvedCount: 4, averageTime: 10 },
        { category: "technical_issue", count: 5, resolvedCount: 4, averageTime: 2 },
      ],
      byOutcome: [
        { outcome: "release", count: 25, percentage: 66 },
        { outcome: "refund", count: 10, percentage: 26 },
        { outcome: "partial", count: 3, percentage: 8 },
      ],
      disputes: [],
    };
  }

  // ==========================================================================
  // EXPORTS
  // ==========================================================================

  async requestExport(params: ExportRequestParams): Promise<ExportRequest> {
    const request: ExportRequest = {
      id: `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: "data",
      format: params.format,
      requestedBy: params.requestedBy,
      dataType: params.dataType,
      filters: params.filters,
      fields: params.fields,
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };

    this.exports.set(request.id, request);

    // Process export asynchronously
    this.processExport(request);

    return request;
  }

  private async processExport(request: ExportRequest): Promise<void> {
    request.status = "generating";

    try {
      // Generate export data based on type
      let data: unknown[] = [];
      let totalRecords = 0;

      switch (request.dataType) {
        case "campaigns":
          totalRecords = 100;
          data = this.generateCampaignExport(request.filters, request.fields);
          break;
        case "pledges":
          totalRecords = 500;
          data = this.generatePledgeExport(request.filters, request.fields);
          break;
        case "transactions":
          totalRecords = 1000;
          data = this.getTransactionHistory(request.requestedBy, request.filters);
          break;
        default:
          data = [];
      }

      request.totalRecords = totalRecords;
      request.processedRecords = data.length;

      // Convert to format
      const buffer = await this.formatReport(data, request.format, "transaction_history");
      this.reportFiles.set(request.id, buffer);

      request.status = "ready";
      request.fileUrl = `/api/v1/exports/${request.id}/download`;
      request.completedAt = Date.now();
    } catch (error) {
      request.status = "failed";
    }
  }

  private generateCampaignExport(
    _filters?: ReportFilters,
    _fields?: string[]
  ): Record<string, unknown>[] {
    // Generate sample campaign export data
    return Array.from({ length: 10 }, (_, i) => ({
      id: `campaign_${i}`,
      name: `Campaign ${i}`,
      status: "active",
      totalPledged: String(Math.floor(Math.random() * 50000)),
      backerCount: Math.floor(Math.random() * 100),
      createdAt: new Date().toISOString(),
    }));
  }

  private generatePledgeExport(
    _filters?: ReportFilters,
    _fields?: string[]
  ): Record<string, unknown>[] {
    return Array.from({ length: 20 }, (_, i) => ({
      id: `pledge_${i}`,
      campaignId: `campaign_${Math.floor(i / 2)}`,
      backer: `0x${Math.random().toString(16).substr(2, 40)}`,
      amount: String(Math.floor(Math.random() * 1000)),
      status: "active",
      createdAt: new Date().toISOString(),
    }));
  }

  getExportStatus(exportId: string): ExportRequest | null {
    return this.exports.get(exportId) || null;
  }

  // ==========================================================================
  // SCHEDULED REPORTS
  // ==========================================================================

  createScheduledReport(params: CreateScheduledReportParams): ScheduledReport {
    const scheduled: ScheduledReport = {
      id: `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...params,
      enabled: true,
      nextRunAt: this.calculateNextRun(params),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.scheduledReports.set(scheduled.id, scheduled);
    return scheduled;
  }

  updateScheduledReport(
    reportId: string,
    updates: Partial<ScheduledReport>
  ): ScheduledReport {
    const existing = this.scheduledReports.get(reportId);
    if (!existing) {
      throw new Error("Scheduled report not found");
    }

    const updated: ScheduledReport = {
      ...existing,
      ...updates,
      id: reportId, // Prevent ID change
      updatedAt: Date.now(),
    };

    if (updates.frequency || updates.dayOfWeek || updates.dayOfMonth || updates.time) {
      updated.nextRunAt = this.calculateNextRun(updated);
    }

    this.scheduledReports.set(reportId, updated);
    return updated;
  }

  deleteScheduledReport(reportId: string): boolean {
    return this.scheduledReports.delete(reportId);
  }

  listScheduledReports(address: string): ScheduledReport[] {
    return Array.from(this.scheduledReports.values()).filter(
      (r) => r.createdBy === address
    );
  }

  async runScheduledReport(reportId: string): Promise<ReportRequest> {
    const scheduled = this.scheduledReports.get(reportId);
    if (!scheduled) {
      throw new Error("Scheduled report not found");
    }

    const report = await this.generateReport({
      type: scheduled.type,
      format: scheduled.format,
      requestedBy: scheduled.createdBy,
      period: { type: this.frequencyToPeriod(scheduled.frequency) },
      filters: scheduled.filters,
      options: scheduled.options,
    });

    scheduled.lastRunAt = Date.now();
    scheduled.nextRunAt = this.calculateNextRun(scheduled);
    this.scheduledReports.set(reportId, scheduled);

    return report;
  }

  private calculateNextRun(params: {
    frequency: ScheduledReport["frequency"];
    dayOfWeek?: number;
    dayOfMonth?: number;
    time: string;
    timezone: string;
  }): number {
    const [hour, minute] = params.time.split(":").map(Number);
    const now = new Date();
    const next = new Date(now);

    next.setHours(hour, minute, 0, 0);

    switch (params.frequency) {
      case "daily":
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        break;

      case "weekly":
        next.setDate(next.getDate() + ((7 + (params.dayOfWeek || 1) - next.getDay()) % 7 || 7));
        break;

      case "monthly":
        next.setDate(params.dayOfMonth || 1);
        if (next <= now) {
          next.setMonth(next.getMonth() + 1);
        }
        break;

      case "quarterly":
        const currentQuarter = Math.floor(now.getMonth() / 3);
        next.setMonth((currentQuarter + 1) * 3);
        next.setDate(params.dayOfMonth || 1);
        break;
    }

    return next.getTime();
  }

  private frequencyToPeriod(frequency: ScheduledReport["frequency"]): ReportPeriod {
    switch (frequency) {
      case "daily":
        return "day";
      case "weekly":
        return "week";
      case "monthly":
        return "month";
      case "quarterly":
        return "quarter";
      default:
        return "month";
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private getPeriodDates(period: { type: ReportPeriod; startDate?: number; endDate?: number }): {
    startDate: number;
    endDate: number;
  } {
    if (period.startDate && period.endDate) {
      return { startDate: period.startDate, endDate: period.endDate };
    }

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    switch (period.type) {
      case "day":
        return { startDate: now - dayMs, endDate: now };
      case "week":
        return { startDate: now - 7 * dayMs, endDate: now };
      case "month":
        return { startDate: now - 30 * dayMs, endDate: now };
      case "quarter":
        return { startDate: now - 90 * dayMs, endDate: now };
      case "year":
        return { startDate: now - 365 * dayMs, endDate: now };
      default:
        return { startDate: now - 30 * dayMs, endDate: now };
    }
  }

  private generateFinancialSummary(request: ReportRequest): FinancialSummary {
    return this.getFinancialSummary(
      request.requestedBy,
      request.period.type,
      request.options
    );
  }

  private generateCampaignReport(request: ReportRequest): CampaignPerformance {
    const campaignId = request.filters?.campaignIds?.[0] || "default";
    return this.getCampaignPerformance(campaignId, request.period.type);
  }

  private generateBackerReport(request: ReportRequest): BackerActivity {
    return this.getBackerActivity(request.requestedBy, request.period.type);
  }

  private generateTaxReport(request: ReportRequest): TaxSummary {
    const year = new Date(request.period.endDate).getFullYear();
    return this.getTaxSummary(request.requestedBy, year, "US");
  }

  private generateTransactionReport(request: ReportRequest): TransactionRecord[] {
    return this.getTransactionHistory(request.requestedBy, request.filters);
  }

  private generatePayoutReport(request: ReportRequest): PayoutReport {
    return this.getPayoutReport(request.requestedBy, request.period.type);
  }

  private generateDisputeReport(request: ReportRequest): DisputeSummary {
    return this.getDisputeSummary(request.filters);
  }

  private generateAuditReport(request: ReportRequest): AuditTrail {
    return this.getAuditTrail("campaign", "default", request.filters);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createReportService(): ReportService {
  return new ReportService();
}

// Default instance
export const reportService = new ReportService();
