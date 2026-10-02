/**
 * Reports are computed from stored campaigns and pledges
 */

import { describe, it, expect, beforeAll } from "vitest";
import { parseEther } from "ethers";
import { inflateRawSync } from "zlib";
import { MemoryStore, setStore } from "../src/database";
import { Campaign, Pledge } from "../src/database";
import { campaign as baseCampaign, milestone, pledge as basePledge } from "./helpers/fixtures";
import { ReportService } from "../src/reporting";

const CREATOR = "0x00000000000000000000000000000000000000c1";
const BENEFICIARY = "0x00000000000000000000000000000000000000b1";
const BACKER = "0x00000000000000000000000000000000000000a1";
const OTHER_BACKER = "0x00000000000000000000000000000000000000a2";

const now = Math.floor(Date.now() / 1000);
const DAY = 24 * 3600;

function campaign(overrides: Partial<Campaign>): Campaign {
  return baseCampaign({
    id: "campaign_r1",
    creator: CREATOR,
    beneficiary: BENEFICIARY,
    pledgeWindowStart: now - 10 * DAY,
    pledgeWindowEnd: now - 5 * DAY,
    resolutionDeadline: now + DAY,
    milestones: [milestone({ status: "verified", verifiedAt: now - 2 * DAY, oracleData: { completed: true } })],
    status: "resolved",
    totalReleased: parseEther("1.5").toString(),
    totalRefunded: parseEther("0.75").toString(),
    pledgeCount: 2,
    createdAt: now - 10 * DAY,
    updatedAt: now - DAY,
    resolvedAt: now - DAY,
    ...overrides,
  });
}

function pledge(overrides: Partial<Pledge>): Pledge {
  return basePledge({ campaignId: "campaign_r1", backer: BACKER, createdAt: now - 8 * DAY, ...overrides });
}

describe("ReportService on real data", () => {
  const service = new ReportService();

  beforeAll(async () => {
    const store = new MemoryStore();
    setStore(store);

    await store.saveCampaign(campaign({}));
    // An active campaign for the same beneficiary, still in escrow
    await store.saveCampaign(
      campaign({
        id: "campaign_r2",
        name: "Second",
        status: "active",
        pledgeWindowEnd: now + DAY, // still open: its pledge is active, not pending
        resolutionDeadline: now + 2 * DAY,
        resolvedAt: null,
        totalReleased: "0",
        totalRefunded: "0",
        totalEscrowed: parseEther("2").toString(),
      })
    );

    await store.savePledge(
      pledge({
        id: "pledge_1",
        escrowedAmount: parseEther("1").toString(),
        finalAmount: parseEther("1").toString(),
        refundedAmount: "0",
        status: "resolved",
        resolvedAt: now - DAY,
      })
    );
    await store.savePledge(
      pledge({
        id: "pledge_2",
        backer: OTHER_BACKER,
        escrowedAmount: parseEther("1.25").toString(),
        finalAmount: parseEther("0.5").toString(),
        refundedAmount: parseEther("0.75").toString(),
        status: "resolved",
        createdAt: now - 7 * DAY,
        resolvedAt: now - DAY,
      })
    );
    await store.savePledge(
      pledge({
        id: "pledge_3",
        escrowedAmount: parseEther("0.2").toString(),
        finalAmount: "0",
        refundedAmount: parseEther("0.2").toString(),
        status: "cancelled",
        createdAt: now - 6 * DAY,
        resolvedAt: now - 6 * DAY,
      })
    );
    await store.savePledge(
      pledge({
        id: "pledge_4",
        campaignId: "campaign_r2",
        escrowedAmount: parseEther("2").toString(),
      })
    );
  });

  it("summarizes a creator's released and refunded funds", async () => {
    const summary = await service.getFinancialSummary(CREATOR, "month");

    expect(summary.currency).toBe("ETH");
    expect(summary.overview).toMatchObject({
      totalRevenue: "1.5",
      refunds: "0.95", // 0.75 on resolution + 0.2 on cancellation
      platformFees: "0.0",
    });
    expect(summary.trends.reduce((n, t) => n + t.pledges, 0)).toBe(4);
  });

  it("lists a backer's escrow movements", async () => {
    const transactions = await service.getTransactionHistory(BACKER);
    const summary = transactions.map((t) => `${t.type}:${t.pledgeId ?? t.campaignId}:${t.amount}`).sort();

    expect(summary).toEqual([
      "pledge:pledge_1:1.0",
      "pledge:pledge_3:0.2",
      "pledge:pledge_4:2.0",
      "refund:pledge_3:0.2",
      "release:pledge_1:1.0",
    ]);

    const filtered = await service.getTransactionHistory(BACKER, { minAmount: "1.5" });
    expect(filtered.map((t) => t.pledgeId)).toEqual(["pledge_4"]);
  });

  it("reports payouts and pending escrow for a beneficiary", async () => {
    const payouts = await service.getPayoutReport(BENEFICIARY, "month");

    expect(payouts.payouts.map((p) => [p.campaignId, p.amount])).toEqual([["campaign_r1", "1.5"]]);
    expect(payouts.summary).toMatchObject({ grossAmount: "1.5", totalFees: "0.0", pendingAmount: "2.0" });
  });

  it("totals a beneficiary's income for the tax year", async () => {
    const year = new Date((now - DAY) * 1000).getUTCFullYear();
    const tax = await service.getTaxSummary(BENEFICIARY, year, "US");

    expect(tax.income.total).toBe("1.5");
    expect(tax.taxpayerType).toBe("creator");
    expect((await service.getTaxSummary(BENEFICIARY, year - 1, "US")).income.total).toBe("0.0");

    const form = await service.generateTaxForm(BENEFICIARY, "1099-MISC", year);
    expect(form.data.totalIncome).toBe("1.5");
    expect(form.status).toBe("draft");
  });

  it("measures campaign performance from its pledges", async () => {
    const performance = await service.getCampaignPerformance("campaign_r1");

    expect(performance.campaignName).toBe("Marathon");
    expect(performance.metrics).toMatchObject({
      totalPledged: "2.25", // cancelled pledge excluded
      backerCount: 2,
      milestonesCompleted: 1,
      milestonesTotal: 1,
    });
    expect(performance.topBackers[0]).toMatchObject({ address: OTHER_BACKER, amount: "1.25" });
    expect(performance.pledgeBreakdown).toEqual([{ type: "flat", count: 2, totalAmount: "2.25" }]);
  });

  it("describes a backer's activity and portfolio", async () => {
    const activity = await service.getBackerActivity(BACKER);

    expect(activity.summary).toMatchObject({
      totalPledged: "3.0",
      totalReleased: "1.0",
      totalRefunded: "0.2",
      activeCommitments: "2.0",
      campaignsSupported: 2,
    });
    expect(activity.portfolio).toMatchObject({ active: "2.0", pending: "0.0", released: "1.0", refunded: "0.2" });
  });

  it("reconstructs a campaign's audit trail in order", async () => {
    const audit = await service.getAuditTrail("campaign", "campaign_r1");
    const actions = audit.events.map((e) => e.action);

    expect(actions[0]).toBe("campaign_created");
    expect(actions).toContain("milestone_verified");
    expect(actions).toContain("pledge_cancelled");
    expect(actions[actions.length - 1]).toBe("campaign_resolved");
    expect(audit.events.map((e) => e.timestamp)).toEqual([...audit.events.map((e) => e.timestamp)].sort((a, b) => a - b));
  });

  it("exports the requester's pledges and writes real PDF and XLSX files", async () => {
    const waitFor = async (id: string) => {
      for (let i = 0; i < 50; i++) {
        const status = service.getReportStatus(id) ?? service.getExportStatus(id);
        if (status && (status.status === "ready" || status.status === "failed")) return status;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error("timed out");
    };

    const exported = await service.requestExport({ dataType: "pledges", format: "json", requestedBy: CREATOR });
    expect((await waitFor(exported.id)).status).toBe("ready");
    const rows = JSON.parse(String(await service.downloadExport(exported.id)));
    expect(rows.map((r: { id: string }) => r.id).sort()).toEqual(["pledge_1", "pledge_2", "pledge_3", "pledge_4"]);

    const pdf = await service.generateReport({
      type: "financial_summary",
      format: "pdf",
      requestedBy: CREATOR,
      period: { type: "month" },
    });
    expect((await waitFor(pdf.id)).status).toBe("ready");
    const pdfBytes = (await service.downloadReport(pdf.id))!;
    expect(pdfBytes.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(pdfBytes.toString("latin1")).toContain("overview.totalRevenue: 1.5");
    expect(pdfBytes.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);

    const xlsx = await service.generateReport({
      type: "transaction_history",
      format: "xlsx",
      requestedBy: BACKER,
      period: { type: "month" },
    });
    expect((await waitFor(xlsx.id)).status).toBe("ready");
    const zipBytes = (await service.downloadReport(xlsx.id))!;
    expect(zipBytes.subarray(0, 2).toString()).toBe("PK");

    // Find the worksheet entry and check it holds the real rows
    const name = "xl/worksheets/sheet1.xml";
    const at = zipBytes.indexOf(Buffer.from(name));
    const compressedSize = zipBytes.readUInt32LE(at - 30 + 18);
    const sheet = inflateRawSync(zipBytes.subarray(at + name.length, at + name.length + compressedSize)).toString();
    expect(sheet).toContain("pledge_4");
  });
});
