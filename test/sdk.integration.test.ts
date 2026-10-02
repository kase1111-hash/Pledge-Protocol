/**
 * SDK end-to-end tests: the SDK talks over HTTP to the real app, so any drift
 * between the client's paths/payloads and the server shows up here.
 */

import { describe, it, beforeAll, afterAll, expect, vi } from "vitest";
import { AddressInfo } from "net";
import { Server } from "http";
import request from "supertest";
import { HDNodeWallet, Wallet } from "ethers";
import app from "../src/api/app";
import { initializeOracles } from "../src/api/routes/oracles";
import { MemoryStore, closeDatabase, setStore } from "../src/database";
import { Address, PledgeProtocolClient, createClient } from "../src/sdk";

const HOUR = 3600;

function now(): number {
  return Math.floor(Date.now() / 1000);
}

describe("SDK against the API", () => {
  let server: Server;
  let apiUrl: string;
  const wallets = {
    admin: Wallet.createRandom(),
    creator: Wallet.createRandom(),
    backer: Wallet.createRandom(),
    attestor: Wallet.createRandom(),
  };
  const clients = {} as Record<keyof typeof wallets, PledgeProtocolClient>;
  const sessions = {} as Record<keyof typeof wallets, string>;
  let oracleId: string;

  async function signedIn(wallet: HDNodeWallet): Promise<[PledgeProtocolClient, string]> {
    const client = createClient({ apiUrl, retries: 1 });
    const result = await client.signIn(wallet.address as Address, (m) => wallet.signMessage(m));
    expect(result.success).toBe(true);
    return [client, result.data!.sessionId];
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    process.env.ADMIN_ADDRESSES = wallets.admin.address;
    setStore(new MemoryStore());
    await initializeOracles();

    server = app.listen(0);
    apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    for (const name of Object.keys(wallets) as (keyof typeof wallets)[]) {
      [clients[name], sessions[name]] = await signedIn(wallets[name]);
    }

    const oracle = await request(app)
      .post("/v1/oracles")
      .set("Authorization", `Bearer ${sessions.admin}`)
      .send({ name: "Attestor", description: "", type: "attestation", attestor: wallets.attestor.address });
    oracleId = oracle.body.id;
  });

  afterAll(async () => {
    server?.close();
    await closeDatabase();
    delete process.env.ADMIN_ADDRESSES;
    vi.useRealTimers();
  });

  it("runs a campaign from creation to resolution", async () => {
    const start = now();
    const created = await clients.creator.campaigns.create({
      name: "Marathon",
      description: "Charity marathon",
      beneficiary: wallets.creator.address as Address,
      beneficiaryName: "Charity",
      pledgeWindowStart: start - 10,
      pledgeWindowEnd: start + HOUR,
      resolutionDeadline: start + 24 * HOUR,
      milestones: [{
        name: "Finish",
        description: "Runner finishes",
        oracleId,
        condition: { type: "completion", field: "completed", operator: "eq", value: true },
        releasePercentage: 100,
      }],
      pledgeTypes: [{ name: "Flat", description: "Flat", calculationType: "flat", minimum: "100" }],
      minimumPledge: "100",
    });
    expect(created.success).toBe(true);
    const campaignId = created.data!.id;

    expect((await clients.creator.campaigns.activate(campaignId)).data?.status).toBe("active");

    // Errors carry the server's message, code and status
    const tooSmall = await clients.backer.pledges.create({ campaignId, pledgeTypeId: "pt_0", amount: "5" });
    expect(tooSmall).toMatchObject({ success: false, status: 422, code: "VALIDATION_ERROR" });
    expect(tooSmall.error).toContain("minimum");

    const pledge = await clients.backer.pledges.create({ campaignId, pledgeTypeId: "pt_0", amount: "500" });
    expect(pledge.data).toMatchObject({ status: "active", escrowedAmount: "500" });
    const extra = await clients.backer.pledges.create({ campaignId, pledgeTypeId: "pt_0", amount: "100" });
    expect((await clients.backer.pledges.cancel(extra.data!.id)).data?.status).toBe("cancelled");

    const listed = await clients.backer.pledges.list({ campaignId, limit: 1 });
    expect(listed.data).toMatchObject({ total: 2, page: 1, limit: 1, totalPages: 2 });
    expect(listed.data!.data).toHaveLength(1);
    expect((await clients.backer.pledges.mine({ status: "active" })).data!.data.map((p) => p.id)).toEqual([pledge.data!.id]);
    expect((await clients.creator.pledges.getByBacker(wallets.backer.address as Address)).data!.total).toBe(2);
    expect((await clients.creator.pledges.getForCampaign(campaignId)).data!.total).toBe(2);

    vi.setSystemTime(Date.now() + 2 * HOUR * 1000);

    const early = await clients.creator.campaigns.resolve(campaignId);
    expect(early).toMatchObject({ success: false, status: 409, code: "MILESTONES_PENDING" });

    const attested = await clients.attestor.oracles.submitAttestation({
      campaignId,
      milestoneId: "milestone_0",
      completed: true,
    });
    expect(attested.data?.milestoneStatus).toBe("verified");

    const query = await clients.backer.oracles.query(oracleId, { campaignId, milestoneId: "milestone_0" });
    expect(query.data).toMatchObject({ success: true, data: { completed: true } });

    const resolved = await clients.creator.campaigns.resolve(campaignId);
    expect(resolved.data).toMatchObject({
      status: "resolved",
      resolution: { totalReleased: "500", totalRefunded: "0", pledgesResolved: 1 },
    });

    expect((await clients.creator.campaigns.getStats(campaignId)).data).toMatchObject({
      totalReleased: "500",
      totalRefunded: "100",
      milestonesCompleted: 1,
    });
    expect((await clients.backer.pledges.get(pledge.data!.id)).data).toMatchObject({
      status: "resolved",
      finalAmount: "500",
    });

    const commemorative = await clients.backer.commemoratives.getByPledge(pledge.data!.id);
    expect(commemorative.data?.pledgeId).toBe(pledge.data!.id);

    const listedCampaigns = await clients.backer.campaigns.list({ status: "resolved" });
    expect(listedCampaigns.data!.data.map((c) => c.id)).toContain(campaignId);
  });

  it("lists oracles without their config", async () => {
    const oracles = await clients.backer.oracles.list();
    expect(oracles.data!.map((o) => o.id)).toContain(oracleId);
    expect((await clients.backer.oracles.get(oracleId)).data?.attestor?.toLowerCase()).toBe(
      wallets.attestor.address.toLowerCase()
    );
  });

  it("votes on disputes with the voting power assigned by the arbitrator", async () => {
    const dispute = await clients.backer.disputes.create({
      campaignId: "campaign_123",
      category: "other",
      title: "Wrong result",
      description: "The oracle reported the wrong finishing time.",
    });
    expect(dispute.success).toBe(true);
    const disputeId = dispute.data!.id;

    const opened = await request(app)
      .post(`/v1/disputes/${disputeId}/voting/open`)
      .set("Authorization", `Bearer ${sessions.admin}`)
      .send({ eligibleVoters: [wallets.backer.address], votingPowers: { [wallets.backer.address]: "500" } });
    expect(opened.status).toBe(200);

    const vote = await clients.backer.disputes.vote(disputeId, { vote: "release", reason: "Finished" });
    expect(vote.success).toBe(true);
    expect(vote.data).toMatchObject({ vote: "release", votingPower: "500" });

    expect((await clients.backer.disputes.get(disputeId)).data?.id).toBe(disputeId);
  });

  it("reaches the social and health endpoints", async () => {
    expect((await clients.backer.users.getProfile(wallets.backer.address as Address)).success).toBe(true);
    expect((await clients.backer.health()).data?.status).toBe("ok");
  });

  it("reports network failures without throwing", async () => {
    const offline = createClient({ apiUrl: "http://127.0.0.1:1", retries: 1 });
    const result = await offline.campaigns.get("x");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
