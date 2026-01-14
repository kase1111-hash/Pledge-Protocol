/**
 * Phase 10: Reporting Types
 *
 * Financial reports, tax documents, and data exports.
 */

// ============================================================================
// REPORT TYPES
// ============================================================================

export type ReportType =
  | "financial_summary"
  | "campaign_performance"
  | "backer_activity"
  | "tax_summary"
  | "transaction_history"
  | "payout_report"
  | "dispute_summary"
  | "audit_trail"
  | "platform_analytics";

export type ReportFormat = "pdf" | "csv" | "xlsx" | "json";

export type ReportStatus =
  | "pending"
  | "generating"
  | "ready"
  | "expired"
  | "failed";

export type ReportPeriod =
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "custom";

// ============================================================================
// REPORT REQUEST
// ============================================================================

export interface ReportRequest {
  id: string;
  type: ReportType;
  format: ReportFormat;
  requestedBy: string;
  period: {
    type: ReportPeriod;
    startDate: number;
    endDate: number;
  };
  filters?: ReportFilters;
  options?: ReportOptions;
  status: ReportStatus;
  progress?: number; // 0-100
  fileUrl?: string;
  fileSize?: number;
  errorMessage?: string;
  createdAt: number;
  completedAt?: number;
  expiresAt?: number;
}

export interface ReportFilters {
  campaignIds?: string[];
  pledgeIds?: string[];
  backerAddresses?: string[];
  creatorAddresses?: string[];
  categories?: string[];
  statuses?: string[];
  minAmount?: string;
  maxAmount?: string;
}

export interface ReportOptions {
  includeDetails?: boolean;
  groupBy?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  currency?: string;
  timezone?: string;
  locale?: string;
}

// ============================================================================
// FINANCIAL REPORTS
// ============================================================================

export interface FinancialSummary {
  period: { start: number; end: number };
  currency: string;
  overview: {
    totalRevenue: string;
    totalPayouts: string;
    platformFees: string;
    refunds: string;
    netIncome: string;
  };
  byCategory: {
    category: string;
    revenue: string;
    campaigns: number;
    pledges: number;
  }[];
  byCurrency: {
    currency: string;
    amount: string;
    usdEquivalent: string;
  }[];
  trends: {
    date: string;
    revenue: string;
    pledges: number;
  }[];
}

export interface TransactionRecord {
  id: string;
  type: "pledge" | "release" | "refund" | "fee" | "payout";
  date: number;
  amount: string;
  currency: string;
  campaignId?: string;
  campaignName?: string;
  pledgeId?: string;
  fromAddress?: string;
  toAddress?: string;
  txHash?: string;
  status: "pending" | "completed" | "failed";
  description: string;
}

export interface PayoutReport {
  period: { start: number; end: number };
  recipient: string;
  totalPayouts: string;
  currency: string;
  payouts: {
    id: string;
    date: number;
    campaignId: string;
    campaignName: string;
    amount: string;
    fee: string;
    netAmount: string;
    status: "pending" | "processing" | "completed" | "failed";
    txHash?: string;
  }[];
  summary: {
    grossAmount: string;
    totalFees: string;
    netAmount: string;
    pendingAmount: string;
  };
}

// ============================================================================
// TAX REPORTS
// ============================================================================

export interface TaxSummary {
  taxYear: number;
  taxpayerAddress: string;
  taxpayerType: "creator" | "backer";
  country: string;
  currency: string;
  income: {
    total: string;
    campaigns: {
      campaignId: string;
      campaignName: string;
      amount: string;
      date: number;
    }[];
  };
  expenses: {
    total: string;
    platformFees: string;
    processingFees: string;
    other: string;
  };
  netIncome: string;
  taxLiability?: string;
  forms: TaxForm[];
}

export interface TaxForm {
  type: "1099-MISC" | "1099-K" | "W-9" | "W-8BEN" | "custom";
  year: number;
  status: "draft" | "ready" | "filed";
  fileUrl?: string;
  generatedAt: number;
  data: Record<string, unknown>;
}

// ============================================================================
// CAMPAIGN REPORTS
// ============================================================================

export interface CampaignPerformance {
  campaignId: string;
  campaignName: string;
  period: { start: number; end: number };
  metrics: {
    totalPledged: string;
    goalAmount: string;
    percentFunded: number;
    backerCount: number;
    averagePledge: string;
    conversionRate: number;
    milestonesCompleted: number;
    milestonesTotal: number;
  };
  timeline: {
    date: string;
    pledgedAmount: string;
    cumulativeAmount: string;
    backerCount: number;
  }[];
  pledgeBreakdown: {
    type: string;
    count: number;
    totalAmount: string;
  }[];
  topBackers: {
    address: string;
    displayName?: string;
    amount: string;
    pledgeCount: number;
  }[];
  referralSources: {
    source: string;
    backers: number;
    amount: string;
  }[];
}

// ============================================================================
// BACKER REPORTS
// ============================================================================

export interface BackerActivity {
  backerAddress: string;
  displayName?: string;
  period: { start: number; end: number };
  summary: {
    totalPledged: string;
    totalReleased: string;
    totalRefunded: string;
    activeCommitments: string;
    campaignsSupported: number;
    commemorativesReceived: number;
  };
  pledges: {
    pledgeId: string;
    campaignId: string;
    campaignName: string;
    amount: string;
    status: string;
    createdAt: number;
    resolvedAt?: number;
  }[];
  commemoratives: {
    id: string;
    campaignName: string;
    mintedAt: number;
    imageUrl?: string;
  }[];
  portfolio: {
    active: string;
    pending: string;
    released: string;
    refunded: string;
  };
}

// ============================================================================
// AUDIT REPORTS
// ============================================================================

export interface AuditTrail {
  entityType: "campaign" | "pledge" | "dispute" | "user" | "system";
  entityId: string;
  period: { start: number; end: number };
  events: AuditEvent[];
}

export interface AuditEvent {
  id: string;
  timestamp: number;
  action: string;
  actor: string;
  actorType: "user" | "system" | "oracle" | "admin";
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  previousValue?: unknown;
  newValue?: unknown;
}

// ============================================================================
// DISPUTE REPORTS
// ============================================================================

export interface DisputeSummary {
  period: { start: number; end: number };
  overview: {
    total: number;
    resolved: number;
    pending: number;
    escalated: number;
    averageResolutionTime: number;
  };
  byCategory: {
    category: string;
    count: number;
    resolvedCount: number;
    averageTime: number;
  }[];
  byOutcome: {
    outcome: string;
    count: number;
    percentage: number;
  }[];
  disputes: {
    id: string;
    campaignId: string;
    campaignName: string;
    category: string;
    status: string;
    createdAt: number;
    resolvedAt?: number;
    outcome?: string;
  }[];
}

// ============================================================================
// EXPORT TYPES
// ============================================================================

export interface ExportRequest {
  id: string;
  type: "data" | "report";
  format: ReportFormat;
  requestedBy: string;
  dataType:
    | "campaigns"
    | "pledges"
    | "transactions"
    | "users"
    | "disputes"
    | "commemoratives";
  filters?: ReportFilters;
  fields?: string[]; // Specific fields to include
  status: ReportStatus;
  totalRecords?: number;
  processedRecords?: number;
  fileUrl?: string;
  createdAt: number;
  completedAt?: number;
  expiresAt?: number;
}

export interface ExportColumn {
  field: string;
  header: string;
  type: "string" | "number" | "date" | "boolean" | "currency";
  format?: string;
}

// ============================================================================
// SCHEDULED REPORTS
// ============================================================================

export interface ScheduledReport {
  id: string;
  name: string;
  type: ReportType;
  format: ReportFormat;
  frequency: "daily" | "weekly" | "monthly" | "quarterly";
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
  time: string; // "09:00"
  timezone: string;
  recipients: {
    address: string;
    email?: string;
    deliveryMethod: "email" | "webhook" | "both";
  }[];
  filters?: ReportFilters;
  options?: ReportOptions;
  enabled: boolean;
  lastRunAt?: number;
  nextRunAt?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// REPORT SERVICE INTERFACE
// ============================================================================

export interface ReportServiceInterface {
  // Generate reports
  generateReport(params: GenerateReportParams): Promise<ReportRequest>;
  getReportStatus(reportId: string): ReportRequest | null;
  downloadReport(reportId: string): Promise<Buffer | null>;
  cancelReport(reportId: string): boolean;

  // Financial reports
  getFinancialSummary(address: string, period: ReportPeriod, options?: ReportOptions): FinancialSummary;
  getTransactionHistory(address: string, filters?: ReportFilters): TransactionRecord[];
  getPayoutReport(address: string, period: ReportPeriod): PayoutReport;

  // Tax reports
  getTaxSummary(address: string, taxYear: number, country: string): TaxSummary;
  generateTaxForm(address: string, formType: TaxForm["type"], year: number): Promise<TaxForm>;

  // Campaign reports
  getCampaignPerformance(campaignId: string, period?: ReportPeriod): CampaignPerformance;

  // Backer reports
  getBackerActivity(address: string, period?: ReportPeriod): BackerActivity;

  // Audit
  getAuditTrail(entityType: string, entityId: string, filters?: ReportFilters): AuditTrail;

  // Disputes
  getDisputeSummary(filters?: ReportFilters): DisputeSummary;

  // Exports
  requestExport(params: ExportRequestParams): Promise<ExportRequest>;
  getExportStatus(exportId: string): ExportRequest | null;

  // Scheduled reports
  createScheduledReport(params: CreateScheduledReportParams): ScheduledReport;
  updateScheduledReport(reportId: string, updates: Partial<ScheduledReport>): ScheduledReport;
  deleteScheduledReport(reportId: string): boolean;
  listScheduledReports(address: string): ScheduledReport[];
  runScheduledReport(reportId: string): Promise<ReportRequest>;
}

export interface GenerateReportParams {
  type: ReportType;
  format: ReportFormat;
  requestedBy: string;
  period: {
    type: ReportPeriod;
    startDate?: number;
    endDate?: number;
  };
  filters?: ReportFilters;
  options?: ReportOptions;
}

export interface ExportRequestParams {
  dataType: ExportRequest["dataType"];
  format: ReportFormat;
  requestedBy: string;
  filters?: ReportFilters;
  fields?: string[];
}

export interface CreateScheduledReportParams {
  name: string;
  type: ReportType;
  format: ReportFormat;
  frequency: ScheduledReport["frequency"];
  dayOfWeek?: number;
  dayOfMonth?: number;
  time: string;
  timezone: string;
  recipients: ScheduledReport["recipients"];
  filters?: ReportFilters;
  options?: ReportOptions;
  createdBy: string;
}
