/**
 * Store contract tests: the same behaviour is required of the in-memory store
 * and the PostgreSQL store (enabled by TEST_DATABASE_URL; see helpers/stores).
 */

import { describe, it, beforeEach, afterAll, expect } from "vitest";
import { Campaign, DomainStore, Pledge } from "../src/database";
import { TEST_DATABASE_URL, openPostgres, resetPostgres, storeBackends } from "./helpers/stores";

const SCHEMA = "store_test";

function makeCampaign(id: string, overrides: Partial<Campaign> = {}): Campaign {
  return {
    id,
    chainId: null,
    name: `Campaign ${id}`,
    description: "Test campaign",
    creator: "0xAbCdEf0000000000000000000000000000000001",
    beneficiary: "0x0000000000000000000000000000000000000002",
    beneficiaryName: "Charity",
    subject: null,
    pledgeWindowStart: 1,
    pledgeWindowEnd: 2,
    eventDate: null,
    resolutionDeadline: 3,
    milestones: [],
    pledgeTypes: [],
    minimumPledge: "1",
    maximumPledge: null,
    status: "active",
    totalEscrowed: "0",
    totalReleased: "0",
    totalRefunded: "0",
    pledgeCount: 0,
    visibility: "public",
    metadataUri: "",
    createdAt: 100,
    updatedAt: 100,
    resolvedAt: null,
    ...overrides,
  };
}

function makePledge(id: string, campaignId: string, overrides: Partial<Pledge> = {}): Pledge {
  return {
    id,
    chainId: null,
    campaignId,
    pledgeTypeId: "pt_0",
    backer: "0xBaCkEr0000000000000000000000000000000001",
    backerName: null,
    escrowedAmount: "100",
    finalAmount: null,
    refundedAmount: null,
    status: "active",
    createdAt: 100,
    resolvedAt: null,
    tokenId: null,
    commemorativeId: null,
    ...overrides,
  };
}

for (const backend of storeBackends(SCHEMA)) {
  describe.skipIf(!backend.enabled)(`${backend.name} store`, () => {
    let store: DomainStore;

    beforeEach(async () => {
      await store?.close();
      store = await backend.open();
    });

    afterAll(async () => {
      await store?.close();
    });

    it("returns copies, so unsaved changes are not persisted", async () => {
      await store.saveCampaign(makeCampaign("c1"));

      const loaded = await store.getCampaign("c1");
      loaded!.status = "cancelled";

      expect((await store.getCampaign("c1"))!.status).toBe("active");
    });

    it("round-trips campaigns including nested data", async () => {
      const campaign = makeCampaign("c1", {
        milestones: [
          {
            id: "milestone_0",
            name: "Finish",
            description: "Finish the race",
            oracleId: "oracle_1",
            oracleParams: { raceId: "boston-2026" },
            condition: { type: "completion", field: "completed", operator: "eq", value: true },
            releasePercentage: 100,
            status: "pending",
            verifiedAt: null,
            oracleData: null,
          },
        ],
        totalEscrowed: "123456789012345678901234567890",
      });
      await store.saveCampaign(campaign);

      expect(await store.getCampaign("c1")).toEqual(campaign);
      expect(await store.getCampaign("missing")).toBeNull();
    });

    it("filters and pages campaigns newest first", async () => {
      await store.saveCampaign(makeCampaign("a", { createdAt: 1 }));
      await store.saveCampaign(makeCampaign("b", { createdAt: 2, status: "draft" }));
      await store.saveCampaign(makeCampaign("c", { createdAt: 3, visibility: "private" }));
      await store.saveCampaign(
        makeCampaign("d", { createdAt: 4, creator: "0x0000000000000000000000000000000000000009" })
      );

      const all = await store.listCampaigns();
      expect(all.items.map((c) => c.id)).toEqual(["d", "c", "b", "a"]);
      expect(all.total).toBe(4);

      const page = await store.listCampaigns({ limit: 2, offset: 1 });
      expect(page.items.map((c) => c.id)).toEqual(["c", "b"]);
      expect(page.total).toBe(4);

      expect((await store.listCampaigns({ status: "draft" })).items.map((c) => c.id)).toEqual(["b"]);
      expect((await store.listCampaigns({ visibility: "public" })).total).toBe(3);

      // Creator matching ignores address case
      const byCreator = await store.listCampaigns({
        creator: "0xabcdef0000000000000000000000000000000001",
      });
      expect(byCreator.items.map((c) => c.id)).toEqual(["c", "b", "a"]);
    });

    it("filters pledges by campaign, backer and status", async () => {
      await store.saveCampaign(makeCampaign("c1"));
      await store.saveCampaign(makeCampaign("c2"));
      await store.savePledge(makePledge("p1", "c1", { createdAt: 1 }));
      await store.savePledge(makePledge("p2", "c1", { createdAt: 2, status: "cancelled" }));
      await store.savePledge(
        makePledge("p3", "c2", { createdAt: 3, backer: "0x0000000000000000000000000000000000000007" })
      );

      expect((await store.listPledges({ campaignId: "c1" })).items.map((p) => p.id)).toEqual(["p2", "p1"]);
      expect((await store.listPledges({ campaignId: "c1", status: "active" })).total).toBe(1);
      expect(
        (await store.listPledges({ backer: "0xbacker0000000000000000000000000000000001" })).items.map((p) => p.id)
      ).toEqual(["p2", "p1"]);

      const updated = (await store.getPledge("p1"))!;
      updated.status = "resolved";
      await store.savePledge(updated);
      expect((await store.listPledges({ status: "resolved" })).items.map((p) => p.id)).toEqual(["p1"]);
    });

    it("accepts only one attestation per milestone", async () => {
      const attestation = {
        id: "att_1",
        oracleId: "oracle_1",
        campaignId: "c1",
        milestoneId: "milestone_0",
        completed: true,
        value: null,
        evidenceUri: null,
        notes: null,
        attestor: "0x0000000000000000000000000000000000000003",
        signature: "",
        submittedAt: 100,
      };

      expect(await store.insertAttestation(attestation)).toBe(true);
      expect(await store.insertAttestation({ ...attestation, id: "att_2", completed: false })).toBe(false);
      expect((await store.getAttestation("c1", "milestone_0"))!.id).toBe("att_1");
    });

    it("stores oracles", async () => {
      const oracle = {
        id: "oracle_1",
        name: "Attestor",
        description: "",
        type: "attestation" as const,
        attestor: "0x0000000000000000000000000000000000000003",
        endpoint: null,
        trustLevel: "community" as const,
        active: true,
        config: null,
        createdAt: 1,
      };
      await store.saveOracle(oracle);
      await store.saveOracle({ ...oracle, id: "oracle_0" });

      expect(await store.getOracle("oracle_1")).toEqual(oracle);
      expect((await store.listOracles()).map((o) => o.id)).toEqual(["oracle_0", "oracle_1"]);
    });

    it("rolls back every write in a failed transaction", async () => {
      await store.saveCampaign(makeCampaign("c1"));

      await expect(
        store.transaction(async (tx) => {
          const campaign = (await tx.getCampaign("c1", { forUpdate: true }))!;
          campaign.totalEscrowed = "500";
          await tx.saveCampaign(campaign);
          await tx.savePledge(makePledge("p1", "c1"));
          throw new Error("abort");
        })
      ).rejects.toThrow("abort");

      expect((await store.getCampaign("c1"))!.totalEscrowed).toBe("0");
      expect(await store.getPledge("p1")).toBeNull();
    });

    it("serializes concurrent read-modify-write transactions on a campaign", async () => {
      await store.saveCampaign(makeCampaign("c1"));

      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          store.transaction(async (tx) => {
            const campaign = (await tx.getCampaign("c1", { forUpdate: true }))!;
            // Yield so that without locking the transactions would interleave
            await new Promise((resolve) => setTimeout(resolve, 5));
            campaign.totalEscrowed = (BigInt(campaign.totalEscrowed) + BigInt(10)).toString();
            campaign.pledgeCount += 1;
            await tx.saveCampaign(campaign);
            await tx.savePledge(makePledge(`p${i}`, "c1"));
          })
        )
      );

      const campaign = (await store.getCampaign("c1"))!;
      expect(campaign.totalEscrowed).toBe("100");
      expect(campaign.pledgeCount).toBe(10);
      expect((await store.listPledges({ campaignId: "c1" })).total).toBe(10);
    });
  });
}

describe.skipIf(!TEST_DATABASE_URL)("PostgresStore persistence", () => {
  it("keeps data across a restart and re-running migrations", async () => {
    await resetPostgres(SCHEMA);

    const first = await openPostgres(SCHEMA);
    await first.saveCampaign(makeCampaign("c1"));
    await first.savePledge(makePledge("p1", "c1"));
    await first.close();

    // A second process start: migrations are already applied and must be skipped
    const second = await openPostgres(SCHEMA);
    try {
      expect((await second.getCampaign("c1"))!.name).toBe("Campaign c1");
      expect((await second.getPledge("p1"))!.escrowedAmount).toBe("100");
    } finally {
      await second.close();
    }
  });
});
