/**
 * API Route Tests
 *
 * These exercise the real Express routers and their Zod validation via
 * supertest, as opposed to api.integration.test.ts which drives a hand-written
 * mock of the API contract.
 */

import { describe, it, beforeAll, expect } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import { HDNodeWallet, Wallet } from "ethers";

const TEST_ADDRESS = "0x1234567890123456789012345678901234567890";

let app: Express;

beforeAll(async () => {
  const [authRoutes, paymentRoutes, campaignRoutes, pledgeRoutes] = await Promise.all([
    import("../src/api/routes/auth"),
    import("../src/api/routes/payments"),
    import("../src/api/routes/campaigns"),
    import("../src/api/routes/pledges"),
  ]);

  app = express();
  app.use(express.json());
  app.use("/v1/auth", authRoutes.default);
  app.use("/v1/payments", paymentRoutes.default);
  app.use("/v1/campaigns", campaignRoutes.default);
  app.use("/v1/pledges", pledgeRoutes.default);
});

describe("POST /v1/auth/challenge", () => {
  it("returns a challenge for a valid address", async () => {
    const response = await request(app)
      .post("/v1/auth/challenge")
      .send({ address: TEST_ADDRESS });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty("message");
    expect(response.body.data).toHaveProperty("nonce");
    expect(response.body.data).toHaveProperty("expiresAt");
  });

  it("rejects a malformed address", async () => {
    const response = await request(app)
      .post("/v1/auth/challenge")
      .send({ address: "invalid-address" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("rejects a missing address", async () => {
    const response = await request(app).post("/v1/auth/challenge").send({});

    expect(response.status).toBe(400);
  });
});

describe("POST /v1/payments/checkout", () => {
  it("rejects a malformed backer address", async () => {
    const response = await request(app).post("/v1/payments/checkout").send({
      campaignId: "campaign_123",
      backerAddress: "not-an-address",
      amount: 10000,
      returnUrl: "https://example.com/return",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
  });

  it("rejects a non-integer amount", async () => {
    const response = await request(app).post("/v1/payments/checkout").send({
      campaignId: "campaign_123",
      backerAddress: TEST_ADDRESS,
      // Amounts are minor units (cents); fractional values are not valid.
      amount: 100.5,
      returnUrl: "https://example.com/return",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns a structured error for an empty body", async () => {
    const response = await request(app).post("/v1/payments/checkout").send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toHaveProperty("code");
    expect(response.body.error).toHaveProperty("message");
  });
});

/**
 * Sign in through the real challenge/verify flow and return a session token
 */
async function login(wallet: HDNodeWallet): Promise<string> {
  const challenge = await request(app)
    .post("/v1/auth/challenge")
    .send({ address: wallet.address });
  const message = challenge.body.data.message;
  const signature = await wallet.signMessage(message);
  const verified = await request(app)
    .post("/v1/auth/verify")
    .send({ address: wallet.address, message, signature });
  expect(verified.status).toBe(200);
  return verified.body.data.sessionId;
}

describe("Campaign and pledge lifecycle", () => {
  const creator = Wallet.createRandom();
  const backer = Wallet.createRandom();
  const stranger = Wallet.createRandom();
  let creatorSession: string;
  let backerSession: string;
  let strangerSession: string;

  beforeAll(async () => {
    [creatorSession, backerSession, strangerSession] = await Promise.all([
      login(creator),
      login(backer),
      login(stranger),
    ]);
  });

  async function createCampaign(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const response = await request(app)
      .post("/v1/campaigns")
      .set("Authorization", `Bearer ${creatorSession}`)
      .send({
        name: "Marathon",
        description: "Charity marathon",
        beneficiary: creator.address,
        beneficiaryName: "Charity",
        pledgeWindowStart: now - 10,
        pledgeWindowEnd: now + 3600,
        resolutionDeadline: now + 7200,
        milestones: [
          {
            name: "Finish",
            description: "Finish the race",
            oracleId: "race",
            condition: { type: "completion", field: "finished", operator: "eq", value: true },
            releasePercentage: 100,
          },
        ],
        pledgeTypes: [
          {
            name: "Flat",
            description: "Flat pledge",
            calculationType: "flat",
            minimum: "100",
            maximum: "1000",
          },
        ],
        minimumPledge: "100",
        maximumPledge: "1000",
      });
    expect(response.status).toBe(201);
    return response.body.id;
  }

  function pledge(campaignId: string, amount: string, session = backerSession) {
    return request(app)
      .post("/v1/pledges")
      .set("Authorization", `Bearer ${session}`)
      .send({ campaignId, pledgeTypeId: "pt_0", calculationParams: { amount } });
  }

  function activate(campaignId: string, session = creatorSession) {
    return request(app)
      .post(`/v1/campaigns/${campaignId}/activate`)
      .set("Authorization", `Bearer ${session}`);
  }

  it("rejects non-numeric pledge bounds on campaign creation", async () => {
    const response = await request(app)
      .post("/v1/campaigns")
      .set("Authorization", `Bearer ${creatorSession}`)
      .send({ minimumPledge: "lots" });

    expect(response.status).toBe(400);
  });

  it("only lets the creator activate and resolve a campaign", async () => {
    const id = await createCampaign();

    expect((await activate(id, strangerSession)).status).toBe(403);
    expect((await activate(id)).status).toBe(200);

    const strangerResolve = await request(app)
      .post(`/v1/campaigns/${id}/resolve`)
      .set("Authorization", `Bearer ${strangerSession}`);
    expect(strangerResolve.status).toBe(403);

    const creatorResolve = await request(app)
      .post(`/v1/campaigns/${id}/resolve`)
      .set("Authorization", `Bearer ${creatorSession}`);
    expect(creatorResolve.status).toBe(200);
  });

  it("rejects pledges to unknown or inactive campaigns", async () => {
    expect((await pledge("campaign_missing", "500")).status).toBe(404);

    const id = await createCampaign();
    expect((await pledge(id, "500")).status).toBe(409);
  });

  it("validates pledge type and amount bounds", async () => {
    const id = await createCampaign();
    await activate(id);

    const badType = await request(app)
      .post("/v1/pledges")
      .set("Authorization", `Bearer ${backerSession}`)
      .send({ campaignId: id, pledgeTypeId: "pt_9", calculationParams: { amount: "500" } });
    expect(badType.status).toBe(422);

    expect((await pledge(id, "abc")).status).toBe(400);
    expect((await pledge(id, "0")).status).toBe(400);
    expect((await pledge(id, "99")).status).toBe(422);
    expect((await pledge(id, "1001")).status).toBe(422);
  });

  it("tracks escrow totals across pledges and cancellations", async () => {
    const id = await createCampaign();
    await activate(id);

    const kept = await pledge(id, "500");
    expect(kept.status).toBe(201);
    expect(kept.body.escrowedAmount).toBe("500");

    const cancelled = await pledge(id, "200");
    expect(cancelled.status).toBe(201);

    const strangerCancel = await request(app)
      .delete(`/v1/pledges/${kept.body.id}`)
      .set("Authorization", `Bearer ${strangerSession}`);
    expect(strangerCancel.status).toBe(403);

    const backerCancel = await request(app)
      .delete(`/v1/pledges/${cancelled.body.id}`)
      .set("Authorization", `Bearer ${backerSession}`);
    expect(backerCancel.status).toBe(200);

    const stats = await request(app).get(`/v1/campaigns/${id}/stats`);
    expect(stats.body).toMatchObject({
      totalEscrowed: "500",
      totalRefunded: "200",
      pledgeCount: 1,
    });
  });
});
