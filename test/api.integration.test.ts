/**
 * API integration tests: real HTTP requests against the full Express app
 * (middleware, auth, routes, resolution engine, store). Runs once per store
 * backend; see helpers/stores for enabling PostgreSQL.
 *
 * The clock is faked (Date only) so tests can move past pledge windows and
 * resolution deadlines.
 */

import { describe, it, beforeAll, beforeEach, afterAll, expect, vi } from "vitest";
import request from "supertest";
import { createHmac } from "crypto";
import { HDNodeWallet, Wallet } from "ethers";
import app from "../src/api/app";
import { initializeOracles } from "../src/api/routes/oracles";
import { closeDatabase, setStore } from "../src/database";
import { storeBackends } from "./helpers/stores";
import { gdprService } from "../src/api/routes/compliance";
import { getStore } from "../src/database";
import { flushEvents } from "../src/events";
import { notificationService } from "../src/notifications";
import http from "http";
import { AddressInfo } from "net";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const HOUR = 3600;

function now(): number {
  return Math.floor(Date.now() / 1000);
}

/** Move the faked clock forward */
function advance(seconds: number): void {
  vi.setSystemTime(Date.now() + seconds * 1000);
}

/**
 * Sign in through the real challenge/verify flow and return a session token
 */
async function login(wallet: HDNodeWallet): Promise<string> {
  const challenge = await request(app).post("/v1/auth/challenge").send({ address: wallet.address });
  expect(challenge.status).toBe(200);
  const message = challenge.body.data.message;
  const signature = await wallet.signMessage(message);
  const verified = await request(app)
    .post("/v1/auth/verify")
    .send({ address: wallet.address, message, signature });
  expect(verified.status).toBe(200);
  return verified.body.data.sessionId;
}

function as(session: string | null) {
  const auth = (r: request.Test) => (session ? r.set("Authorization", `Bearer ${session}`) : r);
  return {
    get: (path: string) => auth(request(app).get(path)),
    post: (path: string, body: object = {}) => auth(request(app).post(path).send(body)),
    put: (path: string, body: object = {}) => auth(request(app).put(path).send(body)),
    delete: (path: string) => auth(request(app).delete(path)),
  };
}

// One clock for the whole file, so it only ever moves forward (rate-limit
// windows and sessions from an earlier suite must not appear to be in the future)
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterAll(() => {
  vi.useRealTimers();
});

for (const backend of storeBackends("api_integration_test")) {
  describe.skipIf(!backend.enabled)(`API integration (${backend.name} store)`, () => {
    const admin = Wallet.createRandom();
    const creator = Wallet.createRandom();
    const backer = Wallet.createRandom();
    const backer2 = Wallet.createRandom();
    const attestor = Wallet.createRandom();
    const stranger = Wallet.createRandom();
    let sessions: Record<"admin" | "creator" | "backer" | "backer2" | "attestor" | "stranger", string>;
    let attestationOracleId: string;

    beforeAll(async () => {
      process.env.ADMIN_ADDRESSES = admin.address;

      setStore(await backend.open());
      await initializeOracles();

      await signInAll();

      const oracle = await as(sessions.admin).post("/v1/oracles", {
        name: "Race director",
        description: "Attests that the runner finished",
        type: "attestation",
        attestor: attestor.address,
      });
      expect(oracle.status).toBe(201);
      attestationOracleId = oracle.body.id;
    });

    beforeEach(() => {
      // Start each test in a fresh rate-limit window
      advance(61);
    });

    afterAll(async () => {
      await closeDatabase();
      delete process.env.ADMIN_ADDRESSES;
    });

    async function signInAll(): Promise<void> {
      const [a, c, b, b2, at, s] = await Promise.all(
        [admin, creator, backer, backer2, attestor, stranger].map(login)
      );
      sessions = { admin: a, creator: c, backer: b, backer2: b2, attestor: at, stranger: s };
    }

    interface CampaignOptions {
      milestones?: { releasePercentage: number }[];
      pledgeType?: Record<string, unknown>;
    }

    /**
     * Create and activate a campaign whose pledge window closes in an hour
     * and whose resolution deadline is a day out
     */
    async function activeCampaign(options: CampaignOptions = {}): Promise<string> {
      const start = now();
      const created = await as(sessions.creator).post("/v1/campaigns", {
        name: "Marathon",
        description: "Charity marathon",
        beneficiary: creator.address,
        beneficiaryName: "Charity",
        pledgeWindowStart: start - 10,
        pledgeWindowEnd: start + HOUR,
        resolutionDeadline: start + 24 * HOUR,
        milestones: (options.milestones ?? [{ releasePercentage: 100 }]).map((m, i) => ({
          name: `Milestone ${i}`,
          description: "Runner finishes",
          oracleId: attestationOracleId,
          condition: { type: "completion", field: "completed", operator: "eq", value: true },
          releasePercentage: m.releasePercentage,
        })),
        pledgeTypes: [
          {
            name: "Pledge",
            description: "Pledge",
            calculationType: "flat",
            minimum: "100",
            maximum: "1000",
            ...options.pledgeType,
          },
        ],
        minimumPledge: "100",
        maximumPledge: "1000",
      });
      expect(created.status).toBe(201);

      const activated = await as(sessions.creator).post(`/v1/campaigns/${created.body.id}/activate`);
      expect(activated.status).toBe(200);
      return created.body.id;
    }

    async function pledge(campaignId: string, amount: string, session = sessions.backer) {
      const response = await as(session).post("/v1/pledges", { campaignId, pledgeTypeId: "pt_0", amount });
      expect(response.status).toBe(201);
      return response.body.id as string;
    }

    function attest(campaignId: string, milestoneId: string, completed: boolean, value?: number) {
      return as(sessions.attestor).post("/v1/oracles/attestations", {
        campaignId,
        milestoneId,
        completed,
        value,
      });
    }

    function resolve(campaignId: string, session = sessions.creator) {
      return as(session).post(`/v1/campaigns/${campaignId}/resolve`);
    }

    describe("authentication", () => {
      it("issues a challenge for a valid address", async () => {
        const response = await request(app).post("/v1/auth/challenge").send({ address: backer.address });

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveProperty("message");
        expect(response.body.data).toHaveProperty("nonce");
      });

      it("rejects malformed and missing addresses", async () => {
        expect((await request(app).post("/v1/auth/challenge").send({ address: "invalid" })).status).toBe(400);
        expect((await request(app).post("/v1/auth/challenge").send({})).status).toBe(400);
      });

      it("rejects a signature from a different wallet", async () => {
        const challenge = await request(app).post("/v1/auth/challenge").send({ address: backer.address });
        const signature = await stranger.signMessage(challenge.body.data.message);
        const verified = await request(app)
          .post("/v1/auth/verify")
          .send({ address: backer.address, message: challenge.body.data.message, signature });

        expect(verified.status).toBe(401);
      });

      it.each([
        ["POST", "/v1/campaigns"],
        ["POST", "/v1/campaigns/x/activate"],
        ["POST", "/v1/campaigns/x/cancel"],
        ["POST", "/v1/campaigns/x/resolve"],
        ["POST", "/v1/campaigns/x/milestones/m/verify"],
        ["POST", "/v1/pledges"],
        ["DELETE", "/v1/pledges/x"],
        ["POST", "/v1/oracles"],
        ["POST", "/v1/oracles/attestations"],
        ["POST", "/v1/oracles/x/query"],
        ["POST", "/v1/oracles/x/verify"],
        ["POST", "/v1/resolution/trigger"],
        ["POST", "/v1/resolution/schedule"],
        ["POST", "/v1/resolution/verify/x"],
        ["POST", "/v1/commemoratives/generate"],
        ["POST", "/v1/commemoratives/x/mint"],
        ["POST", "/v1/payments/checkout"],
        ["POST", "/v1/payments/x/confirm"],
        ["POST", "/v1/payments/x/settle"],
        ["POST", "/v1/payments/refunds"],
        ["POST", "/v1/payments/kyc"],
        ["DELETE", "/v1/payments/methods/x"],
        ["POST", "/v1/webhooks"],
        ["GET", "/v1/webhooks"],
        ["PUT", "/v1/i18n/bundles/en/common"],
        ["PUT", `/v1/i18n/preferences/${ "0x" + "1".repeat(40)}`],
        ["GET", "/v1/backers/me/pledges"],
      ])("requires a session for %s %s", async (method, path) => {
        const response = await request(app)[method.toLowerCase() as "get" | "post" | "put" | "delete"](path)
          // A spoofed wallet header must not count as authentication
          .set("x-wallet-address", admin.address)
          .send({});

        expect(response.status).toBe(401);
      });

      it.each([
        ["POST", "/v1/oracles"],
        ["POST", "/v1/payments/x/settle"],
        ["POST", "/v1/payments/refunds"],
        ["GET", "/v1/payments/analytics"],
        ["POST", "/v1/commemoratives/generate"],
        ["POST", "/v1/commemoratives/x/mint"],
        ["PUT", "/v1/i18n/bundles/en/common"],
        ["POST", "/v1/disputes/x/voting/open"],
        ["POST", "/v1/disputes/x/resolve"],
        ["POST", "/v1/disputes/process-timeouts"],
      ])("reserves %s %s for privileged roles", async (method, path) => {
        const response = await as(sessions.backer)[method.toLowerCase() as "get" | "post" | "put"](path);

        expect(response.status).toBe(403);
      });

      it("bootstraps admins from ADMIN_ADDRESSES", async () => {
        const session = await as(sessions.admin).get("/v1/auth/session");

        expect(session.body.data.roles).toContain("admin");
        expect(session.body.data.roles).toContain("backer");
      });
    });

    describe("campaign lifecycle with an attestation oracle", () => {
      it("escrows pledges, waits for the milestone, then releases on resolution", async () => {
        const campaignId = await activeCampaign();

        // Pledge validation
        const invalid = [
          [{ campaignId: "campaign_missing", pledgeTypeId: "pt_0", amount: "500" }, 404],
          [{ campaignId, pledgeTypeId: "pt_9", amount: "500" }, 422],
          [{ campaignId, pledgeTypeId: "pt_0", amount: "abc" }, 400],
          [{ campaignId, pledgeTypeId: "pt_0", amount: "0" }, 400],
          [{ campaignId, pledgeTypeId: "pt_0", amount: "99" }, 422],
          [{ campaignId, pledgeTypeId: "pt_0", amount: "1001" }, 422],
        ] as const;
        for (const [body, status] of invalid) {
          expect((await as(sessions.backer).post("/v1/pledges", body)).status).toBe(status);
        }

        const kept = await pledge(campaignId, "500");
        const kept2 = await pledge(campaignId, "300", sessions.backer2);
        const cancelled = await pledge(campaignId, "200");

        // Only the backer may cancel, and only while pledging is open
        expect((await as(sessions.stranger).delete(`/v1/pledges/${kept}`)).status).toBe(403);
        expect((await as(sessions.backer).delete(`/v1/pledges/${cancelled}`)).status).toBe(200);
        expect((await as(sessions.backer).delete(`/v1/pledges/${cancelled}`)).status).toBe(409);

        const stats = await request(app).get(`/v1/campaigns/${campaignId}/stats`);
        expect(stats.body).toMatchObject({ totalEscrowed: "800", totalRefunded: "200", pledgeCount: 2 });

        // Resolution must wait for the pledge window to close...
        let resolved = await resolve(campaignId);
        expect(resolved.status).toBe(409);
        expect(resolved.body.error.code).toBe("PLEDGE_WINDOW_OPEN");

        advance(2 * HOUR);
        expect((await as(sessions.backer).post("/v1/pledges", {
          campaignId, pledgeTypeId: "pt_0", amount: "500",
        })).status).toBe(409);
        expect((await as(sessions.backer).delete(`/v1/pledges/${kept}`)).status).toBe(409);

        // ...and for the milestone to be decided
        resolved = await resolve(campaignId);
        expect(resolved.status).toBe(409);
        expect(resolved.body.error.code).toBe("MILESTONES_PENDING");

        // Only the oracle's attestor may decide the milestone, once
        expect((await as(sessions.stranger).post("/v1/oracles/attestations", {
          campaignId, milestoneId: "milestone_0", completed: true,
        })).status).toBe(403);

        const attestation = await attest(campaignId, "milestone_0", true);
        expect(attestation.status).toBe(201);
        expect(attestation.body.milestoneStatus).toBe("verified");
        expect((await attest(campaignId, "milestone_0", false)).status).toBe(409);

        // Only the creator (or an admin) may resolve
        expect((await resolve(campaignId, sessions.stranger)).status).toBe(403);

        resolved = await resolve(campaignId);
        expect(resolved.status).toBe(200);
        expect(resolved.body.status).toBe("resolved");
        expect(resolved.body.resolution).toMatchObject({
          totalReleased: "800",
          totalRefunded: "0",
          pledgesResolved: 2,
          milestonesVerified: 1,
        });

        const campaign = await request(app).get(`/v1/campaigns/${campaignId}`);
        expect(campaign.body).toMatchObject({
          status: "resolved",
          totalEscrowed: "0",
          totalReleased: "800",
          totalRefunded: "200",
        });
        expect(campaign.body.milestones[0].status).toBe("verified");

        const resolvedPledge = await request(app).get(`/v1/pledges/${kept}`);
        expect(resolvedPledge.body).toMatchObject({ status: "resolved", finalAmount: "500", refundedAmount: "0" });
        expect(resolvedPledge.body.commemorativeId).toMatch(/.+/);

        // Resolving twice is refused
        resolved = await resolve(campaignId);
        expect(resolved.status).toBe(409);
        expect(resolved.body.error.code).toBe("INVALID_STATUS");

        // Pledge queries see the persisted pledges
        const byBacker = await request(app).get(`/v1/backers/${backer.address}/pledges`);
        expect(byBacker.body.pledges.map((p: { id: string }) => p.id).sort()).toEqual(
          [kept, cancelled].sort()
        );
        const mine = await as(sessions.backer2).get("/v1/backers/me/pledges");
        expect(mine.body.pledges.map((p: { id: string }) => p.id)).toContain(kept2);
        const forCampaign = await request(app).get(`/v1/campaigns/${campaignId}/pledges`);
        expect(forCampaign.body.total).toBe(3);
        const filtered = await request(app).get(`/v1/pledges?campaignId=${campaignId}&status=cancelled`);
        expect(filtered.body.pledges.map((p: { id: string }) => p.id)).toEqual([cancelled]);
      });

      it("only lets the creator activate a campaign", async () => {
        const start = now();
        const created = await as(sessions.creator).post("/v1/campaigns", {
          name: "Draft",
          description: "Draft campaign",
          beneficiary: creator.address,
          beneficiaryName: "Charity",
          pledgeWindowStart: start,
          pledgeWindowEnd: start + HOUR,
          resolutionDeadline: start + 2 * HOUR,
          milestones: [{
            name: "M", description: "M", oracleId: attestationOracleId,
            condition: { type: "completion", field: "completed", operator: "eq", value: true },
            releasePercentage: 100,
          }],
          pledgeTypes: [{ name: "P", description: "P", calculationType: "flat", minimum: "1" }],
          minimumPledge: "1",
        });
        const id = created.body.id;

        expect((await as(sessions.backer).post("/v1/pledges", { campaignId: id, pledgeTypeId: "pt_0", amount: "5" })).status).toBe(409);
        expect((await as(sessions.stranger).post(`/v1/campaigns/${id}/activate`)).status).toBe(403);
        expect((await as(sessions.creator).post(`/v1/campaigns/${id}/activate`)).status).toBe(200);
      });

      it("rejects campaigns whose milestones use an unknown oracle", async () => {
        const start = now();
        const response = await as(sessions.creator).post("/v1/campaigns", {
          name: "Bad oracle",
          description: "Campaign",
          beneficiary: creator.address,
          beneficiaryName: "Charity",
          pledgeWindowStart: start,
          pledgeWindowEnd: start + HOUR,
          resolutionDeadline: start + 2 * HOUR,
          milestones: [{
            name: "M", description: "M", oracleId: "oracle_nope",
            condition: { type: "completion", field: "completed", operator: "eq", value: true },
            releasePercentage: 100,
          }],
          pledgeTypes: [{ name: "P", description: "P", calculationType: "flat", minimum: "1" }],
          minimumPledge: "1",
        });

        expect(response.status).toBe(422);
      });

      it("refunds every pledge when the milestone fails", async () => {
        const campaignId = await activeCampaign();
        const pledgeId = await pledge(campaignId, "400");

        advance(2 * HOUR);
        expect((await attest(campaignId, "milestone_0", false)).body.milestoneStatus).toBe("failed");

        const resolved = await resolve(campaignId);
        expect(resolved.status).toBe(200);
        expect(resolved.body.resolution).toMatchObject({ totalReleased: "0", totalRefunded: "400" });
        expect((await request(app).get(`/v1/pledges/${pledgeId}`)).body).toMatchObject({
          status: "resolved",
          finalAmount: "0",
          refundedAmount: "400",
        });
      });

      it("treats milestones still undecided at the deadline as expired and refunds", async () => {
        const campaignId = await activeCampaign();
        await pledge(campaignId, "250");

        advance(25 * HOUR);
        // Sessions last 24 hours, so sign in again after the jump
        await signInAll();

        const resolved = await resolve(campaignId);
        expect(resolved.status).toBe(200);
        expect(resolved.body.resolution).toMatchObject({ totalReleased: "0", totalRefunded: "250" });
        expect(resolved.body.milestones).toEqual([{ id: "milestone_0", status: "expired" }]);
      });

      it("releases flat pledges in proportion to the verified milestones", async () => {
        const campaignId = await activeCampaign({
          milestones: [{ releasePercentage: 60 }, { releasePercentage: 40 }],
        });
        await pledge(campaignId, "1000");

        advance(2 * HOUR);
        await attest(campaignId, "milestone_0", true);
        await attest(campaignId, "milestone_1", false);

        const resolved = await resolve(campaignId);
        expect(resolved.body.resolution).toMatchObject({ totalReleased: "600", totalRefunded: "400" });
      });

      it("releases per-unit pledges from the attested value, capped at the escrow", async () => {
        const campaignId = await activeCampaign({
          pledgeType: {
            calculationType: "per_unit",
            perUnitAmount: "10",
            unitField: "value",
          },
        });
        const small = await pledge(campaignId, "200");
        const large = await pledge(campaignId, "1000", sessions.backer2);

        advance(2 * HOUR);
        await attest(campaignId, "milestone_0", true, 26.2);

        const resolved = await resolve(campaignId);
        expect(resolved.status).toBe(200);
        // 26 units x 10 = 260: the 200 pledge releases fully, the 1000 pledge releases 260
        expect((await request(app).get(`/v1/pledges/${small}`)).body.finalAmount).toBe("200");
        expect((await request(app).get(`/v1/pledges/${large}`)).body).toMatchObject({
          finalAmount: "260",
          refundedAmount: "740",
        });
      });

      it("lets the creator cancel a campaign, refunding active pledges", async () => {
        const campaignId = await activeCampaign();
        const pledgeId = await pledge(campaignId, "700");

        expect((await as(sessions.stranger).post(`/v1/campaigns/${campaignId}/cancel`)).status).toBe(403);
        const cancelled = await as(sessions.creator).post(`/v1/campaigns/${campaignId}/cancel`);
        expect(cancelled.status).toBe(200);
        expect(cancelled.body).toMatchObject({ status: "cancelled", pledgesRefunded: 1, totalRefunded: "700" });

        expect((await request(app).get(`/v1/pledges/${pledgeId}`)).body).toMatchObject({
          status: "refunded",
          refundedAmount: "700",
        });
        expect((await resolve(campaignId)).status).toBe(409);
      });

      it("routes resolution triggers through the same engine and permissions", async () => {
        const campaignId = await activeCampaign();
        await pledge(campaignId, "100");

        expect((await as(sessions.stranger).post("/v1/resolution/trigger", { campaignId })).status).toBe(403);

        advance(2 * HOUR);
        await attest(campaignId, "milestone_0", true);

        const triggered = await as(sessions.creator).post("/v1/resolution/trigger", { campaignId });
        expect(triggered.status).toBe(202);

        let job = triggered.body;
        for (let i = 0; i < 50 && job.status !== "completed" && job.status !== "failed"; i++) {
          await new Promise((r) => setTimeout(r, 10));
          job = (await request(app).get(`/v1/resolution/jobs/${triggered.body.jobId}`)).body;
        }
        expect(job.status).toBe("completed");
        expect((await request(app).get(`/v1/campaigns/${campaignId}`)).body.status).toBe("resolved");
      });
    });

    describe("ownership", () => {
      it("keeps webhook subscriptions private to their creator", async () => {
        const created = await as(sessions.backer).post("/v1/webhooks", {
          name: "My hook",
          url: "https://example.com/hook",
          events: ["pledge_created"],
        });
        expect(created.status).toBe(201);
        expect(created.body.data.createdBy.toLowerCase()).toBe(backer.address.toLowerCase());
        const id = created.body.data.id;

        expect((await as(sessions.stranger).get(`/v1/webhooks/${id}`)).status).toBe(404);
        expect((await as(sessions.stranger).delete(`/v1/webhooks/${id}`)).status).toBe(404);
        const strangerList = await as(sessions.stranger).get("/v1/webhooks");
        expect(strangerList.body.data.map((w: { id: string }) => w.id)).not.toContain(id);

        expect((await as(sessions.backer).get(`/v1/webhooks/${id}`)).status).toBe(200);
        expect((await as(sessions.admin).get(`/v1/webhooks/${id}`)).status).toBe(200);
        expect((await as(sessions.backer).delete(`/v1/webhooks/${id}`)).status).toBe(200);
      });

      it("only allows checkouts for the signed-in backer", async () => {
        const response = await as(sessions.backer).post("/v1/payments/checkout", {
          campaignId: "campaign_123",
          backerAddress: stranger.address,
          amount: 10000,
          returnUrl: "https://example.com/return",
        });

        expect(response.status).toBe(403);
      });

      it("validates checkout requests", async () => {
        const invalid = [
          { campaignId: "c", backerAddress: "not-an-address", amount: 10000, returnUrl: "https://example.com" },
          // Amounts are minor units (cents); fractional values are not valid
          { campaignId: "c", backerAddress: backer.address, amount: 100.5, returnUrl: "https://example.com" },
          {},
        ];
        for (const body of invalid) {
          const response = await as(sessions.backer).post("/v1/payments/checkout", body);
          expect(response.status).toBe(400);
          expect(response.body.error.code).toBe("INVALID_REQUEST");
        }
      });

      it("records disputes as raised by the signed-in account", async () => {
        const response = await as(sessions.backer).post("/v1/disputes", {
          campaignId: "campaign_123",
          category: "other",
          title: "Wrong result",
          description: "The oracle reported the wrong finishing time.",
          raisedBy: stranger.address,
        });

        expect(response.status).toBe(201);
        expect(response.body.data.raisedBy.toLowerCase()).toBe(backer.address.toLowerCase());
      });

      it("updates the signed-in user's social profile", async () => {
        // The profile carries bigint stats, which used to make this endpoint fail
        const response = await as(sessions.backer).put("/v1/social/users/me", { displayName: "Runner" });

        expect(response.status).toBe(200);
        expect(response.body.data.displayName).toBe("Runner");
      });

      it("only updates locale preferences for the signed-in account", async () => {
        const path = (a: string) => `/v1/i18n/preferences/${a}`;
        expect((await as(sessions.backer).put(path(stranger.address), { locale: "fr" })).status).toBe(403);
        expect((await as(sessions.backer).put(path(backer.address), { locale: "fr" })).status).toBe(200);
      });
    });

    describe("private data", () => {
      it("keeps GDPR requests to their subject", async () => {
        // Requesting deletion of someone else's data is refused
        expect((await as(sessions.stranger).post("/v1/compliance/delete", { userAddress: backer.address })).status).toBe(403);

        const requested = await as(sessions.backer).post("/v1/compliance/delete", {});
        expect(requested.status).toBe(202);
        const id = requested.body.requestId;
        expect(requested.body.confirmationToken).toBeTruthy();

        expect((await request(app).get(`/v1/compliance/delete/${id}`)).status).toBe(401);
        expect((await as(sessions.stranger).get(`/v1/compliance/delete/${id}`)).status).toBe(404);
        expect((await as(sessions.stranger).post(`/v1/compliance/delete/${id}/cancel`)).status).toBe(404);

        // The owner can read it, but not the token that confirms it
        const own = await as(sessions.backer).get(`/v1/compliance/delete/${id}`);
        expect(own.status).toBe(200);
        expect(own.body).not.toHaveProperty("confirmationToken");

        expect((await as(sessions.stranger).get(`/v1/compliance/consent/${backer.address}`)).status).toBe(403);
        expect((await as(sessions.backer).get(`/v1/compliance/consent/${backer.address}`)).status).toBe(200);
        expect((await as(sessions.backer).get("/v1/compliance/stats")).status).toBe(403);
      });

      it("exports a user's real data and erases it after the grace period", async () => {
        const subject = Wallet.createRandom();
        const subjectSession = await login(subject);
        const user = as(subjectSession);

        const campaignId = await activeCampaign();
        const pledged = await user.post("/v1/pledges", {
          campaignId, pledgeTypeId: "pt_0", amount: "500", backerName: "Alice",
        });
        expect(pledged.status).toBe(201);
        expect((await user.put(`/v1/i18n/preferences/${subject.address}`, { locale: "de" })).status).toBe(200);
        expect((await user.put("/v1/social/users/me", { displayName: "Alice" })).status).toBe(200);

        // Export: the user's actual pledge and preferences, downloadable
        const requested = await user.post("/v1/compliance/export", { format: "json" });
        let status = requested.body.status;
        for (let i = 0; i < 50 && status !== "completed"; i++) {
          await new Promise((r) => setTimeout(r, 10));
          status = (await user.get(`/v1/compliance/export/${requested.body.requestId}`)).body.status;
        }
        expect(status).toBe("completed");

        const download = await user.get(`/v1/compliance/export/${requested.body.requestId}/download`);
        expect(download.status).toBe(200);
        const exported = JSON.parse(download.text);
        expect(exported.data.pledges.map((p: { id: string }) => p.id)).toContain(pledged.body.id);
        expect(exported.data.preferences.locale.locale).toBe("de");
        expect(exported.data.profile.profile.displayName).toBe("Alice");
        expect((await as(sessions.stranger).get(`/v1/compliance/export/${requested.body.requestId}/download`)).status).toBe(404);

        // Erasure waits out the grace period, then removes personal data and
        // keeps the escrow record
        const deletion = await user.post("/v1/compliance/delete", {
          type: "anonymize",
          categories: ["profile", "social", "preferences", "pledges"],
        });
        const confirmed = await user.post(`/v1/compliance/delete/${deletion.body.requestId}/confirm`, {
          confirmationToken: deletion.body.confirmationToken,
        });
        expect(confirmed.status).toBe(200);
        expect(gdprService.getDeletionRequest(deletion.body.requestId)!.status).toBe("pending");

        await gdprService.processDueDeletions(Date.now() + 8 * 24 * 3600 * 1000);
        const done = gdprService.getDeletionRequest(deletion.body.requestId)!;
        expect(done.status).toBe("completed");
        expect(done.deletedRecords).toBeGreaterThanOrEqual(2); // profile + locale preferences
        expect(done.anonymizedRecords).toBe(1); // the pledge's display name
        expect(done.retainedRecords).toBe(1); // the pledge itself

        const pledge = await getStore().getPledge(pledged.body.id);
        expect(pledge).toMatchObject({ backerName: null, escrowedAmount: "500" });
        expect((await user.get(`/v1/i18n/preferences/${subject.address}`)).body.locale).not.toBe("de");
      });

      it("limits organizations to their members and permissions", async () => {
        const created = await as(sessions.creator).post("/v1/enterprise/orgs", {
          name: `Org ${Date.now()}`,
          type: "nonprofit",
          contactEmail: "org@example.com",
          ownerAddress: stranger.address, // ignored: the creator owns it
        });
        expect(created.status).toBe(201);
        const orgId = created.body.id;
        const path = (suffix = "") => `/v1/enterprise/orgs/${orgId}${suffix}`;

        // Outsiders cannot see or change anything
        expect((await as(sessions.stranger).get(path())).status).toBe(404);
        expect((await as(sessions.stranger).get(path("/sso"))).status).toBe(404);
        expect((await as(sessions.stranger).post(path("/members"), { userAddress: stranger.address, role: "admin" })).status).toBe(404);
        expect((await as(sessions.stranger).put(path(), { name: "Hijacked" })).status).toBe(404);

        // The owner adds a viewer, who can read but not manage
        expect((await as(sessions.creator).post(path("/members"), { userAddress: backer.address, role: "viewer" })).status).toBe(201);
        expect((await as(sessions.backer).get(path())).status).toBe(200);
        expect((await as(sessions.backer).post(path("/api-keys"), { name: "k", permissions: [] })).status).toBe(403);
        expect((await as(sessions.backer).get(path("/audit"))).status).toBe(403);

        // Ownership cannot be handed out, and protected fields cannot be overwritten
        expect((await as(sessions.creator).post(path("/members"), { userAddress: stranger.address, role: "owner" })).status).toBe(400);
        const updated = await as(sessions.creator).put(path(), { name: "Renamed", id: "org_other", status: "suspended" });
        expect(updated.body).toMatchObject({ id: orgId, name: "Renamed" });
        expect(updated.body.status).not.toBe("suspended");
      });

      it("keeps financial reports private and reaches the scheduled list", async () => {
        expect((await as(sessions.stranger).get(`/v1/reports/financial/${backer.address}`)).status).toBe(403);
        expect((await as(sessions.backer).get(`/v1/reports/financial/${backer.address}`)).status).toBe(200);

        const report = await as(sessions.backer).post("/v1/reports/generate", { type: "financial_summary", format: "json" });
        expect(report.status).toBe(202);
        expect((await as(sessions.stranger).get(`/v1/reports/${report.body.id}`)).status).toBe(404);
        expect((await as(sessions.backer).get(`/v1/reports/${report.body.id}`)).status).toBe(200);

        // Previously shadowed by GET /:reportId
        const scheduled = await as(sessions.backer).get("/v1/reports/scheduled");
        expect(scheduled.status).toBe(200);
        expect(scheduled.body).toHaveProperty("reports");
        expect((await as(sessions.backer).get("/v1/reports/disputes")).status).toBe(403);
      });

      it("keeps integrations to their owner", async () => {
        const created = await as(sessions.backer).post("/v1/integrations", {
          type: "zapier",
          name: "Zap",
          ownerAddress: stranger.address, // ignored
          config: { type: "zapier", webhookUrl: "https://hooks.zapier.com/hooks/catch/1/abc" },
          events: ["pledge_created"],
        });
        expect(created.status).toBe(201);
        expect(created.body.ownerAddress.toLowerCase()).toBe(backer.address.toLowerCase());

        expect((await as(sessions.stranger).get(`/v1/integrations/${created.body.id}`)).status).toBe(404);
        expect((await as(sessions.stranger).delete(`/v1/integrations/${created.body.id}`)).status).toBe(404);
        const strangerList = await as(sessions.stranger).get(`/v1/integrations?address=${backer.address}`);
        expect(strangerList.body.integrations).toEqual([]);

        // Previously shadowed by GET /:integrationId
        expect((await as(sessions.backer).get("/v1/integrations/stats")).status).toBe(200);
        expect((await request(app).get("/v1/integrations/available")).status).toBe(200);

        expect((await as(sessions.backer).post("/v1/integrations", {
          type: "zapier",
          name: "Internal",
          config: { type: "zapier", webhookUrl: "http://169.254.169.254/latest" },
          events: ["pledge_created"],
        })).status).toBe(400);
        expect((await as(sessions.backer).get("/v1/integrations/oauth/slack/url?returnUrl=https://evil.example")).status).toBe(400);
      });

      it("reserves verification decisions, alerts and broadcasts for staff", async () => {
        expect((await as(sessions.backer).post("/v1/risk/verify/v1/complete", { approved: true })).status).toBe(403);
        expect((await as(sessions.backer).post("/v1/risk/badges", { userAddress: backer.address, badge: "verified" })).status).toBe(403);
        expect((await as(sessions.backer).get("/v1/risk/alerts")).status).toBe(403);
        expect((await as(sessions.stranger).get(`/v1/risk/verify/${backer.address}`)).status).toBe(403);

        expect((await as(sessions.backer).post("/v1/notifications/broadcast", { title: "Win a prize" })).status).toBe(403);
        expect((await as(sessions.stranger).get(`/v1/notifications/in-app/${backer.address}`)).status).toBe(403);
        expect((await as(sessions.backer).get(`/v1/notifications/in-app/${backer.address}`)).status).toBe(200);

        expect((await as(sessions.stranger).get(`/v1/analytics/backers/${backer.address}/portfolio`)).status).toBe(403);
        expect((await as(sessions.stranger).get(`/v1/i18n/preferences/${backer.address}`)).status).toBe(403);
      });
    });

    describe("platform events", () => {
      let server: http.Server;
      let hookUrl: string;
      let deliveries: { path: string; headers: http.IncomingHttpHeaders; body: any }[];

      beforeAll(async () => {
        process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS = "true";
        deliveries = [];
        server = http.createServer((req, res) => {
          const chunks: Buffer[] = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => {
            deliveries.push({ path: req.url!, headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString()) });
            res.end("ok");
          });
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        hookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      });

      afterAll(async () => {
        delete process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS;
        await new Promise((resolve) => server.close(resolve));
      });

      it("reach webhooks, integrations and in-app notifications", async () => {
        const subscribe = async (session: string, path: string) => {
          const created = await as(session).post("/v1/webhooks", {
            name: path,
            url: `${hookUrl}${path}`,
            events: ["pledge_created", "milestone_verified", "campaign_resolved"],
          });
          expect(created.status).toBe(201);
          return created.body.data.id as string;
        };
        const hooks = [await subscribe(sessions.creator, "/creator"), await subscribe(sessions.stranger, "/stranger")];
        const slack = await as(sessions.creator).post("/v1/integrations", {
          type: "zapier",
          name: "Zap",
          config: { type: "zapier", webhookUrl: `${hookUrl}/zapier` },
          events: ["pledge_created"],
        });
        expect(slack.status).toBe(201);

        try {
          const campaignId = await activeCampaign();
          await pledge(campaignId, "500");
          await flushEvents();

          const pledged = deliveries.filter((d) => d.body.type === "pledge_created" || d.body.event === "pledge_created");
          expect(pledged.map((d) => d.path).sort()).toEqual(["/creator", "/stranger", "/zapier"]);
          expect(pledged.find((d) => d.path === "/creator")!.body).toMatchObject({
            data: { campaignId, amount: "500", backerAddress: backer.address.toLowerCase() },
          });

          // The creator hears about the pledge in-app, as does the backer
          for (const address of [creator.address, backer.address]) {
            const inbox = notificationService.getNotifications({ recipient: address, eventType: "pledge_created" });
            expect(inbox.map((n) => n.data.campaignId)).toContain(campaignId);
          }

          // Resolution reaches subscribers, and backers hear what happened to their pledge
          advance(HOUR + 1);
          const milestoneId = (await as(null).get(`/v1/campaigns/${campaignId}`)).body.milestones[0].id;
          expect((await attest(campaignId, milestoneId, true)).status).toBe(201);
          expect((await resolve(campaignId)).status).toBe(200);
          await flushEvents();

          expect(deliveries.filter((d) => d.body.type === "campaign_resolved").map((d) => d.path).sort()).toEqual([
            "/creator",
            "/stranger",
          ]);
          const released = notificationService.getNotifications({ recipient: backer.address, eventType: "pledge_released" });
          expect(released.map((n) => n.data.campaignId)).toContain(campaignId);
        } finally {
          for (const [i, id] of hooks.entries()) {
            await as(i === 0 ? sessions.creator : sessions.stranger).delete(`/v1/webhooks/${id}`);
          }
          await as(sessions.creator).delete(`/v1/integrations/${slack.body.id}`);
        }
      });

      it("keep events about private campaigns to the creator's subscriptions", async () => {
        const created = await as(sessions.stranger).post("/v1/webhooks", {
          name: "Firehose",
          url: `${hookUrl}/firehose`,
          events: ["campaign_created"],
        });
        try {
          deliveries = [];
          const start = now();
          const response = await as(sessions.creator).post("/v1/campaigns", {
            name: "Private",
            description: "Members only",
            beneficiary: creator.address,
            beneficiaryName: "Club",
            pledgeWindowStart: start,
            pledgeWindowEnd: start + HOUR,
            resolutionDeadline: start + 24 * HOUR,
            visibility: "private",
            milestones: [{
              name: "Finish", description: "Finish", oracleId: attestationOracleId,
              condition: { type: "completion", field: "completed", operator: "eq", value: true },
              releasePercentage: 100,
            }],
            pledgeTypes: [{ name: "Pledge", description: "Pledge", calculationType: "flat", minimum: "100" }],
            minimumPledge: "100",
          });
          expect(response.status).toBe(201);
          await flushEvents();
          expect(deliveries).toEqual([]);
        } finally {
          await as(sessions.stranger).delete(`/v1/webhooks/${created.body.data.id}`);
        }
      });
    });

    describe("analytics and discovery", () => {
      it("reflect stored campaigns and pledges", async () => {
        const campaignId = await activeCampaign();
        await pledge(campaignId, "500");
        await pledge(campaignId, "300", sessions.backer2);

        const search = await as(null).get("/v1/analytics/search?q=marathon&limit=100");
        expect(search.status).toBe(200);
        expect(search.body.data.campaigns.find((c: { id: string }) => c.id === campaignId)).toMatchObject({
          totalPledged: "800",
          backerCount: 2,
          status: "active",
        });

        const trending = await as(null).get("/v1/analytics/platform/trending?limit=100");
        const entry = trending.body.data.trending.find((t: { campaign: { id: string } }) => t.campaign.id === campaignId);
        expect(entry.changePercent).toBe(100); // everything was pledged in the last day

        expect((await as(sessions.stranger).get(`/v1/analytics/creators/${creator.address}/dashboard`)).status).toBe(403);
        const dashboard = await as(sessions.creator).get(`/v1/analytics/creators/${creator.address}/dashboard`);
        expect(dashboard.status).toBe(200);
        expect(dashboard.body.data.recentCampaigns.map((c: { id: string }) => c.id)).toContain(campaignId);

        const portfolio = await as(sessions.backer2).get(`/v1/analytics/backers/${backer2.address}/portfolio`);
        expect(portfolio.status).toBe(200);
        expect(portfolio.body.data.recentPledges[0]).toMatchObject({ campaignId, amount: "300", status: "active" });
        expect(BigInt(portfolio.body.data.summary.pendingResolution)).toBeGreaterThanOrEqual(300n);
      });

      it("limits advanced campaign changes to the creator", async () => {
        const campaignId = await activeCampaign();
        await pledge(campaignId, "400");
        const goal = { name: "Bonus", description: "", type: "amount", threshold: "300", reward: { type: "bonus", description: "" } };

        expect((await as(sessions.stranger).post(`/v1/campaigns/advanced/${campaignId}/stretch-goals`, goal)).status).toBe(403);
        expect((await as(sessions.creator).post(`/v1/campaigns/advanced/${campaignId}/stretch-goals`, goal)).status).toBe(201);

        const progress = await as(null).get(`/v1/campaigns/advanced/${campaignId}/stretch-goals/progress`);
        expect(progress.body).toMatchObject({ currentAmount: "400", currentBackers: 1 });
        expect(progress.body.goals[0].status).toBe("achieved");

        const action = { type: "close", scheduledFor: Date.now() + 1000 };
        expect((await as(sessions.stranger).post(`/v1/campaigns/advanced/${campaignId}/schedule/action`, action)).status).toBe(403);
        expect((await as(sessions.stranger).post("/v1/campaigns/advanced/schedule/process")).status).toBe(403);
        expect((await as(sessions.creator).post(`/v1/campaigns/advanced/${campaignId}/schedule/action`, action)).status).toBe(201);

        advance(2);
        const processed = await as(sessions.admin).post("/v1/campaigns/advanced/schedule/process");
        expect(processed.status).toBe(200);
        expect((await as(null).get(`/v1/campaigns/${campaignId}`)).body.status).toBe("pledging_closed");
      });
    });

    describe("oracles", () => {
      it("refuses API oracles pointing at internal addresses", async () => {
        for (const endpoint of ["http://169.254.169.254/latest/meta-data/", "http://localhost:5432/", "http://10.0.0.5/api"]) {
          const response = await as(sessions.admin).post("/v1/oracles", {
            name: "Internal",
            description: "",
            type: "api",
            endpoint,
          });
          expect(response.status).toBe(400);
        }
      });

      it("never exposes oracle config, which can hold credentials", async () => {
        const created = await as(sessions.admin).post("/v1/oracles", {
          name: "Timing API",
          description: "Timing",
          type: "api",
          endpoint: "https://timing.example.com",
          config: { headers: { Authorization: "Bearer secret-token" } },
        });
        expect(created.status).toBe(201);
        expect(created.body).not.toHaveProperty("config");

        const fetched = await request(app).get(`/v1/oracles/${created.body.id}`);
        expect(JSON.stringify(fetched.body)).not.toContain("secret-token");
        const listed = await request(app).get("/v1/oracles");
        expect(JSON.stringify(listed.body)).not.toContain("secret-token");
      });

      it("verifies oracle webhook signatures over the exact request bytes", async () => {
        const secret = "webhook-secret-value";
        const created = await as(sessions.admin).post("/v1/oracles", {
          name: "Webhook oracle",
          description: "Sends callbacks",
          type: "api",
          endpoint: "https://webhooks.example.com",
          config: { webhookSecret: secret },
        });

        // Pretty-printed, as many providers send it; re-serializing would change the bytes
        const body = JSON.stringify({ event: "ping", data: { note: "hello" } }, null, 2);
        const signature = createHmac("sha256", secret).update(body).digest("hex");
        const send = (sig: string) =>
          request(app)
            .post(`/v1/oracles/${created.body.id}/webhook`)
            .set("Content-Type", "application/json")
            .set("x-signature", sig)
            .send(body);

        expect((await send(signature)).status).toBe(200);
        expect((await send("0".repeat(64))).status).toBe(400);
        expect((await send("short")).status).toBe(400);
      });
    });

    it("lists only public campaigns, with validated paging", async () => {
      const response = await request(app).get("/v1/campaigns?limit=2&offset=0");
      expect(response.status).toBe(200);
      expect(response.body.campaigns.length).toBeLessThanOrEqual(2);
      expect(response.body.campaigns.every((c: { visibility: string }) => c.visibility === "public")).toBe(true);
      expect(response.body.campaigns.every((c: { creator: string }) => ADDRESS_PATTERN.test(c.creator))).toBe(true);

      expect((await request(app).get("/v1/campaigns?limit=0")).status).toBe(400);
      expect((await request(app).get("/v1/campaigns?status=bogus")).status).toBe(400);
    });
  });
}
