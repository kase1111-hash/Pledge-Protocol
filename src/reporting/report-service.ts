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
import { formatEther, parseEther } from "ethers";
import {
  Campaign,
  Pledge,
  campaignsById,
  campaignsCreatedBy,
  campaignsPayingTo,
  getStore,
  pledgesByBacker,
  pledgesForCampaign,
} from "../database";
import { disputeService } from "../governance";
import { commemorativeService } from "../tokens";
import { toCsv, toPdf, toXlsx } from "./file-formats";

// ============================================================================
// AMOUNTS & TIME
// ============================================================================

/** Pledges are escrowed in the chain's native token */
const CURRENCY = "ETH";
const ZERO = BigInt(0);

/** Wei string (or null) as a bigint */
function wei(amount: string | null): bigint {
  return amount ? BigInt(amount) : ZERO;
}

/** Wei as a decimal ETH string */
function eth(amount: bigint): string {
  return formatEther(amount);
}

/** A decimal ETH string (as reports and filters use) as wei */
function parseAmount(amount: string): bigint {
  try {
    return parseEther(amount);
  } catch {
    return ZERO;
  }
}

/** Store timestamps are unix seconds; reports use milliseconds */
function ms(seconds: number): number {
  return seconds * 1000;
}

function inRange(time: number, start: number, end: number): boolean {
  return time >= start && time <= end;
}

function dayOf(time: number): string {
  return new Date(time).toISOString().split("T")[0];
}

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
      let data: unknown;

      switch (request.type) {
        case "financial_summary":
          data = await this.generateFinancialSummary(request);
          break;
        case "campaign_performance":
          data = await this.generateCampaignReport(request);
          break;
        case "backer_activity":
          data = await this.generateBackerReport(request);
          break;
        case "tax_summary":
          data = await this.generateTaxReport(request);
          break;
        case "transaction_history":
          data = await this.generateTransactionReport(request);
          break;
        case "payout_report":
          data = await this.generatePayoutReport(request);
          break;
        case "dispute_summary":
          data = await this.generateDisputeReport(request);
          break;
        case "audit_trail":
          data = await this.generateAuditReport(request);
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
      request.fileUrl = `/v1/reports/${request.id}/download`;
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
    const title = type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

    switch (format) {
      case "json":
        return Buffer.from(JSON.stringify(data, null, 2));

      case "csv":
        return toCsv(data);

      case "xlsx":
        return toXlsx(title, data);

      case "pdf":
        return toPdf(`Pledge Protocol: ${title}`, data);

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
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
  //
  // Figures come from the escrow records: amounts are native-token (ETH)
  // values converted from wei, timestamps are milliseconds. The protocol
  // charges no fees, so fee figures are zero.
  // ==========================================================================

  /**
   * Summary for a campaign creator: funds released to (and refunded from)
   * their campaigns in the period, and the pledges they received
   */
  async getFinancialSummary(
    address: string,
    period: ReportPeriod,
    _options?: ReportOptions
  ): Promise<FinancialSummary> {
    const { startDate, endDate } = this.getPeriodDates({ type: period });
    const campaigns = await campaignsCreatedBy(address);

    let released = ZERO;
    let refunded = ZERO;
    const trends = new Map<string, { revenue: bigint; pledges: number }>();
    let pledgeCount = 0;
    const campaignsWithActivity = new Set<string>();

    for (const campaign of campaigns) {
      for (const pledge of await pledgesForCampaign(campaign.id)) {
        const created = ms(pledge.createdAt);
        if (inRange(created, startDate, endDate)) {
          const day = dayOf(created);
          const entry = trends.get(day) ?? { revenue: ZERO, pledges: 0 };
          entry.revenue += BigInt(pledge.escrowedAmount);
          entry.pledges++;
          trends.set(day, entry);
          pledgeCount++;
          campaignsWithActivity.add(campaign.id);
        }

        if (pledge.resolvedAt !== null && inRange(ms(pledge.resolvedAt), startDate, endDate)) {
          released += wei(pledge.finalAmount);
          refunded += wei(pledge.refundedAmount);
          campaignsWithActivity.add(campaign.id);
        }
      }
    }

    return {
      period: { start: startDate, end: endDate },
      currency: CURRENCY,
      overview: {
        totalRevenue: eth(released),
        totalPayouts: eth(released),
        platformFees: eth(ZERO),
        refunds: eth(refunded),
        netIncome: eth(released),
      },
      // Campaigns carry no category in this protocol
      byCategory: campaignsWithActivity.size > 0
        ? [{ category: "all", revenue: eth(released), campaigns: campaignsWithActivity.size, pledges: pledgeCount }]
        : [],
      // No price feed: amounts are reported in the native token only
      byCurrency: released > ZERO ? [{ currency: CURRENCY, amount: eth(released), usdEquivalent: "" }] : [],
      trends: Array.from(trends, ([date, t]) => ({ date, revenue: eth(t.revenue), pledges: t.pledges }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /**
   * Every escrow movement involving an address, newest first: pledges it made
   * and their releases/refunds, and payouts to campaigns it is the
   * beneficiary of
   */
  async getTransactionHistory(
    address: string,
    filters?: ReportFilters
  ): Promise<TransactionRecord[]> {
    const pledges = await pledgesByBacker(address);
    const funded = await campaignsPayingTo(address);
    const campaigns = await campaignsById([...pledges.map((p) => p.campaignId), ...funded.map((c) => c.id)]);
    const transactions: TransactionRecord[] = [];

    for (const pledge of pledges) {
      const campaign = campaigns.get(pledge.campaignId);
      const base = {
        currency: CURRENCY,
        campaignId: pledge.campaignId,
        campaignName: campaign?.name,
        pledgeId: pledge.id,
        status: "completed" as const,
      };

      transactions.push({
        ...base,
        id: `${pledge.id}:pledge`,
        type: "pledge",
        date: ms(pledge.createdAt),
        amount: eth(BigInt(pledge.escrowedAmount)),
        fromAddress: pledge.backer,
        description: "Pledge escrowed",
      });

      if (pledge.resolvedAt !== null && wei(pledge.finalAmount) > ZERO) {
        transactions.push({
          ...base,
          id: `${pledge.id}:release`,
          type: "release",
          date: ms(pledge.resolvedAt),
          amount: eth(wei(pledge.finalAmount)),
          fromAddress: pledge.backer,
          toAddress: campaign?.beneficiary,
          description: "Released to the beneficiary",
        });
      }

      if (pledge.resolvedAt !== null && wei(pledge.refundedAmount) > ZERO) {
        transactions.push({
          ...base,
          id: `${pledge.id}:refund`,
          type: "refund",
          date: ms(pledge.resolvedAt),
          amount: eth(wei(pledge.refundedAmount)),
          toAddress: pledge.backer,
          description: pledge.status === "cancelled" ? "Refunded on cancellation" : "Refunded on resolution",
        });
      }
    }

    for (const campaign of funded) {
      if (campaign.resolvedAt !== null && BigInt(campaign.totalReleased) > ZERO) {
        transactions.push({
          id: `${campaign.id}:payout`,
          type: "payout",
          date: ms(campaign.resolvedAt),
          amount: eth(BigInt(campaign.totalReleased)),
          currency: CURRENCY,
          campaignId: campaign.id,
          campaignName: campaign.name,
          toAddress: campaign.beneficiary,
          status: "completed",
          description: "Campaign payout",
        });
      }
    }

    const min = filters?.minAmount !== undefined ? parseAmount(filters.minAmount) : undefined;
    const max = filters?.maxAmount !== undefined ? parseAmount(filters.maxAmount) : undefined;

    return transactions
      .filter((t) => !filters?.campaignIds?.length || (t.campaignId && filters.campaignIds.includes(t.campaignId)))
      .filter((t) => min === undefined || parseAmount(t.amount) >= min)
      .filter((t) => max === undefined || parseAmount(t.amount) <= max)
      .sort((a, b) => b.date - a.date);
  }

  /**
   * Payouts to campaigns the address is the beneficiary of, resolved in the
   * period
   */
  async getPayoutReport(address: string, period: ReportPeriod): Promise<PayoutReport> {
    const { startDate, endDate } = this.getPeriodDates({ type: period });
    const campaigns = await campaignsPayingTo(address);

    const payouts: PayoutReport["payouts"] = [];
    let gross = ZERO;
    let pending = ZERO;

    for (const campaign of campaigns) {
      if (campaign.resolvedAt !== null && inRange(ms(campaign.resolvedAt), startDate, endDate)) {
        const amount = BigInt(campaign.totalReleased);
        if (amount === ZERO) continue;
        gross += amount;
        payouts.push({
          id: `${campaign.id}:payout`,
          date: ms(campaign.resolvedAt),
          campaignId: campaign.id,
          campaignName: campaign.name,
          amount: eth(amount),
          fee: eth(ZERO),
          netAmount: eth(amount),
          status: "completed",
        });
      } else if (campaign.status === "active" || campaign.status === "pledging_closed") {
        // Still in escrow: paid out if the milestones are met
        pending += BigInt(campaign.totalEscrowed);
      }
    }

    return {
      period: { start: startDate, end: endDate },
      recipient: address,
      totalPayouts: eth(gross),
      currency: CURRENCY,
      payouts: payouts.sort((a, b) => b.date - a.date),
      summary: {
        grossAmount: eth(gross),
        totalFees: eth(ZERO),
        netAmount: eth(gross),
        pendingAmount: eth(pending),
      },
    };
  }

  // ==========================================================================
  // TAX REPORTS
  // These summarize recorded payouts; they are not tax advice.
  // ==========================================================================

  async getTaxSummary(address: string, taxYear: number, country: string): Promise<TaxSummary> {
    const yearStart = Date.UTC(taxYear, 0, 1);
    const yearEnd = Date.UTC(taxYear + 1, 0, 1) - 1;
    const campaigns = await campaignsPayingTo(address);

    const income: TaxSummary["income"]["campaigns"] = [];
    let total = ZERO;
    for (const campaign of campaigns) {
      if (campaign.resolvedAt === null || !inRange(ms(campaign.resolvedAt), yearStart, yearEnd)) continue;
      const amount = BigInt(campaign.totalReleased);
      if (amount === ZERO) continue;
      total += amount;
      income.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        amount: eth(amount),
        date: ms(campaign.resolvedAt),
      });
    }

    return {
      taxYear,
      taxpayerAddress: address,
      taxpayerType: income.length > 0 ? "creator" : "backer",
      country,
      currency: CURRENCY,
      income: { total: eth(total), campaigns: income.sort((a, b) => a.date - b.date) },
      expenses: {
        total: eth(ZERO),
        platformFees: eth(ZERO),
        processingFees: eth(ZERO),
        other: eth(ZERO),
      },
      netIncome: eth(total),
      forms: [],
    };
  }

  /**
   * The figures a tax form would carry. Producing the filed document itself
   * is not supported, so the form stays a draft without a file.
   */
  async generateTaxForm(
    address: string,
    formType: TaxForm["type"],
    year: number
  ): Promise<TaxForm> {
    const summary = await this.getTaxSummary(address, year, "US");

    return {
      type: formType,
      year,
      status: "draft",
      generatedAt: Date.now(),
      data: {
        taxpayerAddress: address,
        currency: summary.currency,
        totalIncome: summary.income.total,
        payments: summary.income.campaigns,
      },
    };
  }

  // ==========================================================================
  // CAMPAIGN REPORTS
  // ==========================================================================

  async getCampaignPerformance(
    campaignId: string,
    period?: ReportPeriod
  ): Promise<CampaignPerformance> {
    const { startDate, endDate } = this.getPeriodDates({ type: period || "month" });
    const campaign = (await campaignsById([campaignId])).get(campaignId);
    const pledges = campaign ? (await pledgesForCampaign(campaignId)).filter((p) => p.status !== "cancelled") : [];

    const total = pledges.reduce((sum, p) => sum + BigInt(p.escrowedAmount), ZERO);
    const backers = new Map<string, { amount: bigint; count: number }>();
    const byType = new Map<string, { count: number; amount: bigint }>();
    const typeNames = new Map(campaign?.pledgeTypes.map((t) => [t.id, t.calculationType]) ?? []);
    const days = new Map<string, { amount: bigint; backers: Set<string> }>();

    for (const pledge of pledges) {
      const amount = BigInt(pledge.escrowedAmount);
      const backer = pledge.backer.toLowerCase();
      const b = backers.get(backer) ?? { amount: ZERO, count: 0 };
      b.amount += amount;
      b.count++;
      backers.set(backer, b);

      const type = typeNames.get(pledge.pledgeTypeId) ?? pledge.pledgeTypeId;
      const t = byType.get(type) ?? { count: 0, amount: ZERO };
      t.count++;
      t.amount += amount;
      byType.set(type, t);

      const created = ms(pledge.createdAt);
      if (inRange(created, startDate, endDate)) {
        const day = days.get(dayOf(created)) ?? { amount: ZERO, backers: new Set<string>() };
        day.amount += amount;
        day.backers.add(backer);
        days.set(dayOf(created), day);
      }
    }

    let cumulative = ZERO;
    const timeline = Array.from(days)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => {
        cumulative += d.amount;
        return {
          date,
          pledgedAmount: eth(d.amount),
          cumulativeAmount: eth(cumulative),
          backerCount: d.backers.size,
        };
      });

    return {
      campaignId,
      campaignName: campaign?.name ?? "",
      period: { start: startDate, end: endDate },
      metrics: {
        totalPledged: eth(total),
        // Campaigns have no funding goal, and page views are not tracked
        goalAmount: eth(ZERO),
        percentFunded: 0,
        backerCount: backers.size,
        averagePledge: eth(pledges.length > 0 ? total / BigInt(pledges.length) : ZERO),
        conversionRate: 0,
        milestonesCompleted: campaign?.milestones.filter((m) => m.status === "verified").length ?? 0,
        milestonesTotal: campaign?.milestones.length ?? 0,
      },
      timeline,
      pledgeBreakdown: Array.from(byType, ([type, t]) => ({ type, count: t.count, totalAmount: eth(t.amount) })),
      topBackers: Array.from(backers, ([address, b]) => ({ address, amount: b.amount, pledgeCount: b.count }))
        .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
        .slice(0, 10)
        .map((b) => ({ address: b.address, amount: eth(b.amount), pledgeCount: b.pledgeCount })),
      // Referral sources are not tracked
      referralSources: [],
    };
  }

  // ==========================================================================
  // BACKER REPORTS
  // ==========================================================================

  async getBackerActivity(address: string, period?: ReportPeriod): Promise<BackerActivity> {
    const { startDate, endDate } = this.getPeriodDates({ type: period || "year" });
    const all = await pledgesByBacker(address);
    const campaigns = await campaignsById(all.map((p) => p.campaignId));
    const inPeriod = all.filter((p) => inRange(ms(p.createdAt), startDate, endDate));
    const now = Math.floor(Date.now() / 1000);

    const sum = (pledges: typeof all, pick: (p: (typeof all)[number]) => bigint) =>
      pledges.reduce((total, p) => total + pick(p), ZERO);
    const active = all.filter((p) => p.status === "active");
    // Active pledges whose pledge window has closed are awaiting resolution
    const pending = active.filter((p) => (campaigns.get(p.campaignId)?.pledgeWindowEnd ?? Infinity) < now);

    const commemoratives = commemorativeService.getByBackerAddress(address);

    return {
      backerAddress: address,
      period: { start: startDate, end: endDate },
      summary: {
        totalPledged: eth(sum(inPeriod.filter((p) => p.status !== "cancelled"), (p) => BigInt(p.escrowedAmount))),
        totalReleased: eth(sum(inPeriod, (p) => wei(p.finalAmount))),
        totalRefunded: eth(sum(inPeriod, (p) => wei(p.refundedAmount))),
        activeCommitments: eth(sum(active, (p) => BigInt(p.escrowedAmount))),
        campaignsSupported: new Set(inPeriod.map((p) => p.campaignId)).size,
        commemorativesReceived: commemoratives.length,
      },
      pledges: inPeriod
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((p) => ({
          pledgeId: p.id,
          campaignId: p.campaignId,
          campaignName: campaigns.get(p.campaignId)?.name ?? "",
          amount: eth(BigInt(p.escrowedAmount)),
          status: p.status,
          createdAt: ms(p.createdAt),
          ...(p.resolvedAt !== null ? { resolvedAt: ms(p.resolvedAt) } : {}),
        })),
      commemoratives: commemoratives.map((c) => ({
        id: c.id,
        campaignName: String((c.metadata as { name?: unknown }).name ?? campaigns.get(c.campaignId)?.name ?? ""),
        mintedAt: c.mintedAt ?? c.createdAt,
        imageUrl: c.imageUri,
      })),
      portfolio: {
        active: eth(sum(active, (p) => BigInt(p.escrowedAmount)) - sum(pending, (p) => BigInt(p.escrowedAmount))),
        pending: eth(sum(pending, (p) => BigInt(p.escrowedAmount))),
        released: eth(sum(all, (p) => wei(p.finalAmount))),
        refunded: eth(sum(all, (p) => wei(p.refundedAmount))),
      },
    };
  }

  // ==========================================================================
  // AUDIT REPORTS
  // ==========================================================================

  /**
   * History of a campaign, pledge, dispute or user, reconstructed from the
   * timestamps on its records
   */
  async getAuditTrail(
    entityType: string,
    entityId: string,
    _filters?: ReportFilters
  ): Promise<AuditTrail> {
    const events: AuditEvent[] = [];

    const pledgeEvents = (pledge: Pledge) => {
      events.push({
        id: `${pledge.id}:created`,
        timestamp: ms(pledge.createdAt),
        action: "pledge_created",
        actor: pledge.backer,
        actorType: "user",
        details: { pledgeId: pledge.id, campaignId: pledge.campaignId, amount: eth(BigInt(pledge.escrowedAmount)) },
      });
      if (pledge.resolvedAt !== null) {
        events.push({
          id: `${pledge.id}:${pledge.status}`,
          timestamp: ms(pledge.resolvedAt),
          action: `pledge_${pledge.status}`,
          actor: pledge.status === "cancelled" ? pledge.backer : "system",
          actorType: pledge.status === "cancelled" ? "user" : "system",
          details: {
            pledgeId: pledge.id,
            released: eth(wei(pledge.finalAmount)),
            refunded: eth(wei(pledge.refundedAmount)),
          },
        });
      }
    };

    const campaignEvents = async (campaign: Campaign) => {
      events.push({
        id: `${campaign.id}:created`,
        timestamp: ms(campaign.createdAt),
        action: "campaign_created",
        actor: campaign.creator,
        actorType: "user",
        details: { campaignId: campaign.id, name: campaign.name },
      });
      for (const milestone of campaign.milestones) {
        if (milestone.verifiedAt !== null) {
          events.push({
            id: `${campaign.id}:${milestone.id}:verified`,
            timestamp: ms(milestone.verifiedAt),
            action: "milestone_verified",
            actor: milestone.oracleId,
            actorType: "oracle",
            details: { campaignId: campaign.id, milestoneId: milestone.id, milestone: milestone.name },
          });
        }
      }
      for (const pledge of await pledgesForCampaign(campaign.id)) pledgeEvents(pledge);
      if (campaign.resolvedAt !== null) {
        events.push({
          id: `${campaign.id}:resolved`,
          timestamp: ms(campaign.resolvedAt),
          action: "campaign_resolved",
          actor: "system",
          actorType: "system",
          details: {
            campaignId: campaign.id,
            released: eth(BigInt(campaign.totalReleased)),
            refunded: eth(BigInt(campaign.totalRefunded)),
          },
        });
      }
    };

    switch (entityType) {
      case "campaign": {
        const campaign = (await campaignsById([entityId])).get(entityId);
        if (campaign) await campaignEvents(campaign);
        break;
      }
      case "pledge": {
        const pledge = await getStore().getPledge(entityId);
        if (pledge) pledgeEvents(pledge);
        break;
      }
      case "dispute":
        for (const event of disputeService.getTimeline(entityId)) {
          events.push({
            id: event.id,
            timestamp: event.timestamp,
            action: event.type,
            actor: event.actor,
            actorType: /^0x[0-9a-f]{40}$/i.test(event.actor) ? "user" : "system",
            details: { description: event.description, ...(event.data ?? {}) },
          });
        }
        break;
      case "user":
        for (const campaign of await campaignsCreatedBy(entityId)) await campaignEvents(campaign);
        for (const pledge of await pledgesByBacker(entityId)) pledgeEvents(pledge);
        break;
    }

    // A user's own pledges on their own campaigns would appear twice
    const unique = Array.from(new Map(events.map((e) => [e.id, e])).values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );

    return {
      entityType: entityType as AuditTrail["entityType"],
      entityId,
      period: {
        start: unique[0]?.timestamp ?? Date.now(),
        end: unique[unique.length - 1]?.timestamp ?? Date.now(),
      },
      events: unique,
    };
  }

  // ==========================================================================
  // DISPUTE REPORTS
  // ==========================================================================

  async getDisputeSummary(filters?: ReportFilters): Promise<DisputeSummary> {
    let disputes = disputeService.listDisputes();
    if (filters?.campaignIds?.length) {
      disputes = disputes.filter((d) => filters.campaignIds!.includes(d.campaignId));
    }
    if (filters?.categories?.length) {
      disputes = disputes.filter((d) => filters.categories!.includes(d.category));
    }

    const campaigns = await campaignsById(disputes.map((d) => d.campaignId));
    const isResolved = (d: (typeof disputes)[number]) => d.resolvedAt !== undefined;
    const duration = (d: (typeof disputes)[number]) => (d.resolvedAt ?? 0) - d.raisedAt;
    const average = (values: number[]) =>
      values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

    const categories = new Map<string, (typeof disputes)>();
    const outcomes = new Map<string, number>();
    for (const dispute of disputes) {
      categories.set(dispute.category, [...(categories.get(dispute.category) ?? []), dispute]);
      if (dispute.decision) {
        outcomes.set(dispute.decision.outcome, (outcomes.get(dispute.decision.outcome) ?? 0) + 1);
      }
    }
    const decided = Array.from(outcomes.values()).reduce((a, b) => a + b, 0);
    const DAY = 24 * 60 * 60 * 1000;

    return {
      period: {
        start: disputes.length > 0 ? Math.min(...disputes.map((d) => d.raisedAt)) : Date.now(),
        end: Date.now(),
      },
      overview: {
        total: disputes.length,
        resolved: disputes.filter(isResolved).length,
        pending: disputes.filter((d) => !isResolved(d) && d.status !== "escalated" && d.status !== "closed").length,
        escalated: disputes.filter((d) => d.status === "escalated").length,
        averageResolutionTime: average(disputes.filter(isResolved).map(duration)),
      },
      byCategory: Array.from(categories, ([category, list]) => ({
        category,
        count: list.length,
        resolvedCount: list.filter(isResolved).length,
        // Days
        averageTime: Math.round((average(list.filter(isResolved).map(duration)) / DAY) * 10) / 10,
      })),
      byOutcome: Array.from(outcomes, ([outcome, count]) => ({
        outcome,
        count,
        percentage: Math.round((count / decided) * 100),
      })),
      disputes: disputes.map((d) => ({
        id: d.id,
        campaignId: d.campaignId,
        campaignName: campaigns.get(d.campaignId)?.name ?? "",
        category: d.category,
        status: d.status,
        createdAt: d.raisedAt,
        ...(d.resolvedAt !== undefined ? { resolvedAt: d.resolvedAt } : {}),
        ...(d.decision ? { outcome: d.decision.outcome } : {}),
      })),
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
      let data: Record<string, unknown>[];

      switch (request.dataType) {
        case "campaigns":
          data = await this.exportCampaigns(request.requestedBy);
          break;
        case "pledges":
          data = await this.exportPledges(request.requestedBy);
          break;
        case "transactions":
          data = (await this.getTransactionHistory(request.requestedBy, request.filters)) as unknown as Record<
            string,
            unknown
          >[];
          break;
        default:
          data = [];
      }

      if (request.fields?.length) {
        data = data.map((row) => Object.fromEntries(request.fields!.map((f) => [f, row[f]])));
      }

      request.totalRecords = data.length;
      request.processedRecords = data.length;

      const buffer = await this.formatReport(data, request.format, "transaction_history");
      this.reportFiles.set(request.id, buffer);

      request.status = "ready";
      request.fileUrl = `/v1/reports/exports/${request.id}/download`;
      request.completedAt = Date.now();
    } catch (error) {
      request.status = "failed";
    }
  }

  /** The requester's own campaigns */
  private async exportCampaigns(address: string): Promise<Record<string, unknown>[]> {
    const campaigns = await campaignsCreatedBy(address);
    return campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      beneficiary: c.beneficiary,
      totalEscrowed: eth(BigInt(c.totalEscrowed)),
      totalReleased: eth(BigInt(c.totalReleased)),
      totalRefunded: eth(BigInt(c.totalRefunded)),
      pledgeCount: c.pledgeCount,
      createdAt: new Date(ms(c.createdAt)).toISOString(),
    }));
  }

  /** Pledges the requester made, and pledges to the requester's campaigns */
  private async exportPledges(address: string): Promise<Record<string, unknown>[]> {
    const own = await pledgesByBacker(address);
    const received = (await Promise.all((await campaignsCreatedBy(address)).map((c) => pledgesForCampaign(c.id)))).flat();
    const pledges = Array.from(new Map([...own, ...received].map((p) => [p.id, p])).values());
    return pledges.map((p) => ({
      id: p.id,
      campaignId: p.campaignId,
      backer: p.backer,
      amount: eth(BigInt(p.escrowedAmount)),
      released: eth(wei(p.finalAmount)),
      refunded: eth(wei(p.refundedAmount)),
      status: p.status,
      createdAt: new Date(ms(p.createdAt)).toISOString(),
    }));
  }

  async downloadExport(exportId: string): Promise<Buffer | null> {
    const request = this.exports.get(exportId);
    if (!request || request.status !== "ready") {
      return null;
    }
    if (request.expiresAt && Date.now() > request.expiresAt) {
      request.status = "expired";
      return null;
    }
    return this.reportFiles.get(exportId) || null;
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

  getScheduledReport(reportId: string): ScheduledReport | null {
    return this.scheduledReports.get(reportId) || null;
  }

  listScheduledReports(address: string): ScheduledReport[] {
    const owner = address.toLowerCase();
    return Array.from(this.scheduledReports.values()).filter(
      (r) => r.createdBy.toLowerCase() === owner
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

  /**
   * Run every enabled scheduled report whose next run time has passed.
   * The server calls this periodically; returns the reports started.
   */
  async runDueScheduledReports(now: number = Date.now()): Promise<ReportRequest[]> {
    const due = Array.from(this.scheduledReports.values()).filter(
      (r) => r.enabled && r.nextRunAt !== undefined && r.nextRunAt <= now
    );
    const started: ReportRequest[] = [];
    for (const scheduled of due) {
      started.push(await this.runScheduledReport(scheduled.id));
    }
    return started;
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

  private generateFinancialSummary(request: ReportRequest): Promise<FinancialSummary> {
    return this.getFinancialSummary(request.requestedBy, request.period.type, request.options);
  }

  private generateCampaignReport(request: ReportRequest): Promise<CampaignPerformance> {
    const campaignId = request.filters?.campaignIds?.[0];
    if (!campaignId) {
      throw new Error("Campaign performance reports need filters.campaignIds");
    }
    return this.getCampaignPerformance(campaignId, request.period.type);
  }

  private generateBackerReport(request: ReportRequest): Promise<BackerActivity> {
    return this.getBackerActivity(request.requestedBy, request.period.type);
  }

  private generateTaxReport(request: ReportRequest): Promise<TaxSummary> {
    const year = new Date(request.period.endDate).getUTCFullYear();
    return this.getTaxSummary(request.requestedBy, year, "US");
  }

  private generateTransactionReport(request: ReportRequest): Promise<TransactionRecord[]> {
    return this.getTransactionHistory(request.requestedBy, request.filters);
  }

  private generatePayoutReport(request: ReportRequest): Promise<PayoutReport> {
    return this.getPayoutReport(request.requestedBy, request.period.type);
  }

  private generateDisputeReport(request: ReportRequest): Promise<DisputeSummary> {
    return this.getDisputeSummary(request.filters);
  }

  private generateAuditReport(request: ReportRequest): Promise<AuditTrail> {
    // The requester's own history
    return this.getAuditTrail("user", request.requestedBy, request.filters);
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
