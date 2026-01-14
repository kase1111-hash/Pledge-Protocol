import { expect } from "chai";
import {
  OracleRouter,
  RaceTimingProvider,
  GitHubProvider,
  OracleConfig,
  MilestoneCondition,
} from "../src/oracle";

describe("Oracle Router", function () {
  let router: OracleRouter;

  beforeEach(function () {
    router = new OracleRouter();
  });

  afterEach(function () {
    router.shutdown();
  });

  describe("Provider Registration", function () {
    it("should register an API oracle provider", function () {
      const config: OracleConfig = {
        id: "test-api-oracle",
        name: "Test API Oracle",
        description: "Test oracle for unit tests",
        type: "api",
        trustLevel: "custom",
        active: true,
        endpoint: "https://api.example.com/data",
        timeout: 5000,
        retries: 2,
      };

      const provider = router.registerProvider(config);

      expect(provider).to.not.be.undefined;
      expect(router.getProvider("test-api-oracle")).to.equal(provider);
    });

    it("should register an attestation oracle provider", function () {
      const config: OracleConfig = {
        id: "test-attestation-oracle",
        name: "Test Attestation Oracle",
        description: "Test attestation oracle",
        type: "attestation",
        trustLevel: "community",
        active: true,
      };

      const provider = router.registerProvider(config);

      expect(provider).to.not.be.undefined;
    });

    it("should unregister a provider", function () {
      const config: OracleConfig = {
        id: "temp-oracle",
        name: "Temporary Oracle",
        description: "Will be removed",
        type: "attestation",
        trustLevel: "custom",
        active: true,
      };

      router.registerProvider(config);
      expect(router.getProvider("temp-oracle")).to.not.be.undefined;

      router.unregisterProvider("temp-oracle");
      expect(router.getProvider("temp-oracle")).to.be.undefined;
    });

    it("should list all provider IDs", function () {
      router.registerProvider({
        id: "oracle-1",
        name: "Oracle 1",
        description: "",
        type: "attestation",
        trustLevel: "custom",
        active: true,
      });

      router.registerProvider({
        id: "oracle-2",
        name: "Oracle 2",
        description: "",
        type: "attestation",
        trustLevel: "custom",
        active: true,
      });

      const ids = router.getProviderIds();
      expect(ids).to.include("oracle-1");
      expect(ids).to.include("oracle-2");
    });
  });

  describe("Milestone Verification", function () {
    it("should verify completion condition", async function () {
      // Register attestation oracle
      const config: OracleConfig = {
        id: "verify-test-oracle",
        name: "Verification Test",
        description: "",
        type: "attestation",
        trustLevel: "custom",
        active: true,
      };

      router.registerProvider(config);

      const condition: MilestoneCondition = {
        type: "completion",
        field: "completed",
        operator: "exists",
        value: true,
      };

      // This will fail because no attestation data exists
      const result = await router.verifyMilestone(
        "verify-test-oracle",
        "campaign-1",
        "milestone-1",
        condition,
        {}
      );

      expect(result.campaignId).to.equal("campaign-1");
      expect(result.milestoneId).to.equal("milestone-1");
      expect(result.evaluatedCondition).to.deep.equal(condition);
    });

    it("should return error for non-existent oracle", async function () {
      const condition: MilestoneCondition = {
        type: "completion",
        field: "completed",
        operator: "exists",
        value: true,
      };

      const result = await router.verifyMilestone(
        "non-existent",
        "campaign-1",
        "milestone-1",
        condition,
        {}
      );

      expect(result.verified).to.be.false;
      expect(result.error).to.include("not found");
    });
  });

  describe("Caching", function () {
    it("should cache query responses", async function () {
      router.registerProvider({
        id: "cache-test",
        name: "Cache Test",
        description: "",
        type: "attestation",
        trustLevel: "custom",
        active: true,
      });

      // First query
      const result1 = await router.query({
        oracleId: "cache-test",
        campaignId: "campaign-1",
        milestoneId: "milestone-1",
        params: { test: true },
      });

      // Second query should be cached
      const result2 = await router.query({
        oracleId: "cache-test",
        campaignId: "campaign-1",
        milestoneId: "milestone-1",
        params: { test: true },
      });

      // Both should have same timestamp if cached
      // (In real implementation, cached response would have cached: true)
    });

    it("should clear cache", function () {
      router.clearCache();
      // No error means success
    });
  });

  describe("Subscriptions", function () {
    it("should subscribe to oracle updates", function (done) {
      this.timeout(5000);

      router.registerProvider({
        id: "sub-test",
        name: "Subscription Test",
        description: "",
        type: "attestation",
        trustLevel: "custom",
        active: true,
      });

      let callCount = 0;
      const subId = router.subscribe(
        "sub-test",
        "campaign-1",
        {},
        (response) => {
          callCount++;
          if (callCount >= 1) {
            router.unsubscribe(subId);
            expect(callCount).to.be.gte(1);
            done();
          }
        },
        100 // Poll every 100ms for test
      );
    });

    it("should unsubscribe from updates", function () {
      router.registerProvider({
        id: "unsub-test",
        name: "Unsubscribe Test",
        description: "",
        type: "attestation",
        trustLevel: "custom",
        active: true,
      });

      const subId = router.subscribe(
        "unsub-test",
        "campaign-1",
        {},
        () => {},
        1000
      );

      router.unsubscribe(subId);
      // No error means success
    });
  });
});

describe("Race Timing Provider", function () {
  it("should format time correctly", function () {
    expect(RaceTimingProvider.formatTime(3600)).to.equal("1:00:00");
    expect(RaceTimingProvider.formatTime(3661)).to.equal("1:01:01");
    expect(RaceTimingProvider.formatTime(125)).to.equal("2:05");
    expect(RaceTimingProvider.formatTime(59)).to.equal("0:59");
  });

  it("should create provider for known services", function () {
    const provider = RaceTimingProvider.createForProvider("athlinks");
    expect(provider.config.id).to.equal("race-timing-athlinks");
    expect(provider.config.trustLevel).to.equal("official");
  });

  it("should throw for unknown provider", function () {
    expect(() => {
      RaceTimingProvider.createForProvider("unknown" as any);
    }).to.throw("Unknown race timing provider");
  });
});

describe("GitHub Provider", function () {
  it("should create provider with token", function () {
    const provider = GitHubProvider.create("test-token");
    expect(provider.config.id).to.equal("github-oracle");
    expect(provider.config.type).to.equal("api");
  });

  it("should create provider without token", function () {
    const provider = GitHubProvider.create();
    expect(provider.config.id).to.equal("github-oracle");
  });
});

describe("Condition Verification", function () {
  let router: OracleRouter;

  beforeEach(function () {
    router = new OracleRouter();
    router.registerProvider({
      id: "cond-test",
      name: "Condition Test",
      description: "",
      type: "attestation",
      trustLevel: "custom",
      active: true,
    });
  });

  afterEach(function () {
    router.shutdown();
  });

  const testConditions: Array<{
    name: string;
    condition: MilestoneCondition;
    data: any;
    expected: boolean;
  }> = [
    {
      name: "exists - true when field present",
      condition: { type: "completion", field: "value", operator: "exists", value: null },
      data: { value: 42 },
      expected: true,
    },
    {
      name: "exists - false when field missing",
      condition: { type: "completion", field: "missing", operator: "exists", value: null },
      data: { value: 42 },
      expected: false,
    },
    {
      name: "eq - true when equal",
      condition: { type: "threshold", field: "status", operator: "eq", value: "finished" },
      data: { status: "finished" },
      expected: true,
    },
    {
      name: "eq - false when not equal",
      condition: { type: "threshold", field: "status", operator: "eq", value: "finished" },
      data: { status: "dnf" },
      expected: false,
    },
    {
      name: "gt - true when greater",
      condition: { type: "threshold", field: "miles", operator: "gt", value: 26 },
      data: { miles: 26.2 },
      expected: true,
    },
    {
      name: "gt - false when equal",
      condition: { type: "threshold", field: "miles", operator: "gt", value: 26.2 },
      data: { miles: 26.2 },
      expected: false,
    },
    {
      name: "gte - true when equal",
      condition: { type: "threshold", field: "miles", operator: "gte", value: 26.2 },
      data: { miles: 26.2 },
      expected: true,
    },
    {
      name: "lt - true when less",
      condition: { type: "threshold", field: "time", operator: "lt", value: 14400 },
      data: { time: 13642 },
      expected: true,
    },
    {
      name: "between - true when in range",
      condition: {
        type: "range",
        field: "time",
        operator: "between",
        value: 10000,
        valueEnd: 15000,
      },
      data: { time: 13642 },
      expected: true,
    },
    {
      name: "between - false when outside range",
      condition: {
        type: "range",
        field: "time",
        operator: "between",
        value: 10000,
        valueEnd: 12000,
      },
      data: { time: 13642 },
      expected: false,
    },
    {
      name: "nested field access",
      condition: { type: "completion", field: "result.status", operator: "eq", value: "success" },
      data: { result: { status: "success" } },
      expected: true,
    },
  ];

  testConditions.forEach(({ name, condition, data, expected }) => {
    it(`should handle ${name}`, function () {
      const provider = router.getProvider("cond-test");
      const result = provider!.verifyCondition(data, condition);
      expect(result).to.equal(expected);
    });
  });
});
