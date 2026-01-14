/**
 * Advanced Pledges Test Suite
 * Phase 4: Per-unit, Tiered, and Conditional pledge tests
 */

import { describe, it, expect, beforeEach } from "@jest/globals";

// Mock types matching the implementation
interface Tier {
  threshold: number;
  rate: bigint;
}

interface CalculationParams {
  perUnitAmount: bigint;
  unitField: string;
  cap: bigint;
  tiers: Tier[];
  conditionField: string;
  conditionOperator: "exists" | "eq" | "gt" | "gte" | "lt" | "lte" | "between";
  conditionValue: number;
  conditionValueEnd?: number;
}

interface PledgeForResolution {
  pledgeId: string;
  campaignId: string;
  backer: string;
  pledgeType: "flat" | "per_unit" | "tiered" | "conditional";
  escrowedAmount: bigint;
  calculationParams?: CalculationParams;
}

interface VerificationResult {
  milestoneId: string;
  oracleId: string;
  verified: boolean;
  oracleData: Record<string, any>;
}

// Helper functions that mirror resolution-engine.ts logic
function calculatePerUnitPledge(
  pledge: PledgeForResolution,
  milestoneResults: VerificationResult[]
): { releaseAmount: bigint; refundAmount: bigint } {
  const params = pledge.calculationParams;
  if (!params || !params.unitField || params.perUnitAmount === BigInt(0)) {
    return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
  }

  // Find the milestone result that contains our unit field
  let unitValue = 0;
  for (const result of milestoneResults) {
    if (result.verified && result.oracleData && result.oracleData[params.unitField] !== undefined) {
      unitValue = Number(result.oracleData[params.unitField]);
      break;
    }
  }

  if (unitValue <= 0) {
    return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
  }

  // Calculate: perUnitAmount * unitValue
  let calculated = params.perUnitAmount * BigInt(Math.floor(unitValue));

  // Apply cap if set
  if (params.cap > BigInt(0) && calculated > params.cap) {
    calculated = params.cap;
  }

  // Can't release more than escrowed
  const releaseAmount = calculated > pledge.escrowedAmount ? pledge.escrowedAmount : calculated;
  const refundAmount = pledge.escrowedAmount - releaseAmount;

  return { releaseAmount, refundAmount };
}

function calculateTieredPledge(
  pledge: PledgeForResolution,
  milestoneResults: VerificationResult[]
): { releaseAmount: bigint; refundAmount: bigint } {
  const params = pledge.calculationParams;
  if (!params || !params.tiers || params.tiers.length === 0 || !params.unitField) {
    return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
  }

  // Find the unit value from milestone results
  let unitValue = 0;
  for (const result of milestoneResults) {
    if (result.verified && result.oracleData && result.oracleData[params.unitField] !== undefined) {
      unitValue = Number(result.oracleData[params.unitField]);
      break;
    }
  }

  if (unitValue <= 0) {
    return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
  }

  // Sort tiers by threshold ascending
  const sortedTiers = [...params.tiers].sort((a, b) => a.threshold - b.threshold);

  // Calculate amount using tiered rates
  let calculated = BigInt(0);
  let remainingUnits = unitValue;

  for (let i = 0; i < sortedTiers.length && remainingUnits > 0; i++) {
    const tier = sortedTiers[i];
    const tierStart = tier.threshold;
    const tierEnd = i < sortedTiers.length - 1 ? sortedTiers[i + 1].threshold : Infinity;

    if (unitValue <= tierStart) break;

    const unitsInTier = Math.min(unitValue, tierEnd) - tierStart;
    if (unitsInTier > 0) {
      calculated += BigInt(Math.floor(unitsInTier)) * tier.rate;
    }
  }

  // Apply cap if set
  if (params.cap > BigInt(0) && calculated > params.cap) {
    calculated = params.cap;
  }

  // Can't release more than escrowed
  const releaseAmount = calculated > pledge.escrowedAmount ? pledge.escrowedAmount : calculated;
  const refundAmount = pledge.escrowedAmount - releaseAmount;

  return { releaseAmount, refundAmount };
}

function evaluateCondition(
  oracleData: Record<string, any>,
  field: string,
  operator: string,
  value: number,
  valueEnd?: number
): boolean {
  const fieldValue = oracleData[field];

  switch (operator) {
    case "exists":
      return fieldValue !== undefined && fieldValue !== null;
    case "eq":
      return Number(fieldValue) === value;
    case "gt":
      return Number(fieldValue) > value;
    case "gte":
      return Number(fieldValue) >= value;
    case "lt":
      return Number(fieldValue) < value;
    case "lte":
      return Number(fieldValue) <= value;
    case "between":
      const numVal = Number(fieldValue);
      return numVal >= value && numVal <= (valueEnd ?? value);
    default:
      return false;
  }
}

function calculateConditionalPledge(
  pledge: PledgeForResolution,
  milestoneResults: VerificationResult[]
): { releaseAmount: bigint; refundAmount: bigint } {
  const params = pledge.calculationParams;
  if (!params || !params.conditionField) {
    return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
  }

  // Find the milestone result with the condition field
  let conditionResult: VerificationResult | null = null;
  for (const result of milestoneResults) {
    if (result.verified && result.oracleData && result.oracleData[params.conditionField] !== undefined) {
      conditionResult = result;
      break;
    }
  }

  if (!conditionResult) {
    return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
  }

  const conditionMet = evaluateCondition(
    conditionResult.oracleData,
    params.conditionField,
    params.conditionOperator,
    params.conditionValue,
    params.conditionValueEnd
  );

  if (conditionMet) {
    return { releaseAmount: pledge.escrowedAmount, refundAmount: BigInt(0) };
  }

  return { releaseAmount: BigInt(0), refundAmount: pledge.escrowedAmount };
}

describe("Advanced Pledges - Phase 4", () => {
  describe("Per-Unit Pledge Calculations", () => {
    it("should calculate release based on unit value", () => {
      const pledge: PledgeForResolution = {
        pledgeId: "pledge_001",
        campaignId: "campaign_001",
        backer: "0x1234567890123456789012345678901234567890",
        pledgeType: "per_unit",
        escrowedAmount: BigInt("100000000000000000000"), // 100 ETH equivalent
        calculationParams: {
          perUnitAmount: BigInt("2000000000000000000"), // 2 per unit
          unitField: "miles_completed",
          cap: BigInt(0),
          tiers: [],
          conditionField: "",
          conditionOperator: "exists",
          conditionValue: 0,
        },
      };

      const milestoneResults: VerificationResult[] = [
        {
          milestoneId: "milestone_0",
          oracleId: "race_timing",
          verified: true,
          oracleData: { miles_completed: 26.2 },
        },
      ];

      const result = calculatePerUnitPledge(pledge, milestoneResults);

      // 26 miles * 2 = 52 (floor of 26.2)
      expect(result.releaseAmount).toBe(BigInt("52000000000000000000"));
      expect(result.refundAmount).toBe(BigInt("48000000000000000000"));
    });

    it("should apply cap when calculated exceeds cap", () => {
      const pledge: PledgeForResolution = {
        pledgeId: "pledge_002",
        campaignId: "campaign_001",
        backer: "0x1234567890123456789012345678901234567890",
        pledgeType: "per_unit",
        escrowedAmount: BigInt("100000000000000000000"),
        calculationParams: {
          perUnitAmount: BigInt("5000000000000000000"), // 5 per unit
          unitField: "miles_completed",
          cap: BigInt("60000000000000000000"), // Cap at 60
          tiers: [],
          conditionField: "",
          conditionOperator: "exists",
          conditionValue: 0,
        },
      };

      const milestoneResults: VerificationResult[] = [
        {
          milestoneId: "milestone_0",
          oracleId: "race_timing",
          verified: true,
          oracleData: { miles_completed: 26 },
        },
      ];

      const result = calculatePerUnitPledge(pledge, milestoneResults);

      // 26 * 5 = 130, but capped at 60
      expect(result.releaseAmount).toBe(BigInt("60000000000000000000"));
      expect(result.refundAmount).toBe(BigInt("40000000000000000000"));
    });

    it("should not exceed escrowed amount", () => {
      const pledge: PledgeForResolution = {
        pledgeId: "pledge_003",
        campaignId: "campaign_001",
        backer: "0x1234567890123456789012345678901234567890",
        pledgeType: "per_unit",
        escrowedAmount: BigInt("50000000000000000000"), // Only 50 escrowed
        calculationParams: {
          perUnitAmount: BigInt("5000000000000000000"), // 5 per unit
          unitField: "miles_completed",
          cap: BigInt(0),
          tiers: [],
          conditionField: "",
          conditionOperator: "exists",
          conditionValue: 0,
        },
      };

      const milestoneResults: VerificationResult[] = [
        {
          milestoneId: "milestone_0",
          oracleId: "race_timing",
          verified: true,
          oracleData: { miles_completed: 26 },
        },
      ];

      const result = calculatePerUnitPledge(pledge, milestoneResults);

      // 26 * 5 = 130, but only 50 escrowed
      expect(result.releaseAmount).toBe(BigInt("50000000000000000000"));
      expect(result.refundAmount).toBe(BigInt(0));
    });

    it("should return full refund when unit value is zero", () => {
      const pledge: PledgeForResolution = {
        pledgeId: "pledge_004",
        campaignId: "campaign_001",
        backer: "0x1234567890123456789012345678901234567890",
        pledgeType: "per_unit",
        escrowedAmount: BigInt("100000000000000000000"),
        calculationParams: {
          perUnitAmount: BigInt("2000000000000000000"),
          unitField: "miles_completed",
          cap: BigInt(0),
          tiers: [],
          conditionField: "",
          conditionOperator: "exists",
          conditionValue: 0,
        },
      };

      const milestoneResults: VerificationResult[] = [
        {
          milestoneId: "milestone_0",
          oracleId: "race_timing",
          verified: true,
          oracleData: { miles_completed: 0 },
        },
      ];

      const result = calculatePerUnitPledge(pledge, milestoneResults);

      expect(result.releaseAmount).toBe(BigInt(0));
      expect(result.refundAmount).toBe(BigInt("100000000000000000000"));
    });

    it("should return full refund when unit field not found", () => {
      const pledge: PledgeForResolution = {
        pledgeId: "pledge_005",
        campaignId: "campaign_001",
        backer: "0x1234567890123456789012345678901234567890",
        pledgeType: "per_unit",
        escrowedAmount: BigInt("100000000000000000000"),
        calculationParams: {
          perUnitAmount: BigInt("2000000000000000000"),
          unitField: "miles_completed",
          cap: BigInt(0),
          tiers: [],
          conditionField: "",
          conditionOperator: "exists",
          conditionValue: 0,
        },
      };

      const milestoneResults: VerificationResult[] = [
        {
          milestoneId: "milestone_0",
          oracleId: "race_timing",
          verified: true,
          oracleData: { finish_time: "3:47:22" }, // Wrong field
        },
      ];

      const result = calculatePerUnitPledge(pledge, milestoneResults);

      expect(result.releaseAmount).toBe(BigInt(0));
      expect(result.refundAmount).toBe(BigInt("100000000000000000000"));
    });
  });

  describe("Tiered Pledge Calculations", () => {
    it("should calculate using tiered rates", () => {
      const pledge: PledgeForResolution = {
        pledgeId: "pledge_010",
        campaignId: "campaign_001",
        backer: "0x1234567890123456789012345678901234567890",
        pledgeType: "tiered",
        escrowedAmount: BigInt("200000000000000000000"), // 200 escrowed
        calculationParams: {
          perUnitAmount: BigInt(0),
          unitField: "miles_completed",
          cap: BigInt(0),
          tiers: [
            { threshold: 0, rate: BigInt("1000000000000000000") },   // $1 per mile for first 10
            { threshold: 10, rate: BigInt("2000000000000000000") },  // $2 per mile for 10-20
            { threshold: 20, rate: BigInt("3000000000000000000") },  // $3 per mile for 20+
          ],
          conditionField: "",
          conditionOperator: "exists",
          conditionValue: 0,
        },
      };

      const milestoneResults: VerificationResult[] = [
        {
          milestoneId: "milestone_0",
          oracleId: "race_timing",
          verified: true,
          oracleData: { miles_completed: 26 },
        },
      ];

      const result = calculateTieredPledge(pledge, milestoneResults);

      // First 10 miles: 10 * 1 = 10
      // Next 10 miles (10-20): 10 * 2 = 20
      // Last 6 miles (20-26): 6 * 3 = 18
      // Total: 48
      expect(result.releaseAmount).toBe(BigInt("48000000000000000000"));
      expect(result.refundAmount).toBe(BigInt("152000000000000000000"));
    });

    it("should handle partial tier completion", () => {
      const pledge: PledgeForResolution = {
        pledgeId: "pledge_011",
        campaignId: "campaign_001",
        backer: "0x1234567890123456789012345678901234567890",
        pledgeType: "tiered",
        escrowedAmount: BigInt("100000000000000000000"),
        calculationParams: {
          perUnitAmount: BigInt(0),
          unitField: "miles_completed",
          cap: BigInt(0),
          tiers: [
            { threshold: 0, rate: BigInt("1000000000000000000") },
            { threshold: 10, rate: BigInt("2000000000000000000") },
          ],
          conditionField: "",
          conditionOperator: "exists",
          conditionValue: 0,
        },
      };

      const milestoneResults: VerificationResult[] = [
        {
          milestoneId: "milestone_0",
          oracleId: "race_timing",
          verified: true,
          oracleData: { miles_completed: 15 },
        },
      ];

      const result = calculateTieredPledge(pledge, milestoneResults);

      // First 10 miles: 10 * 1 = 10
      // Next 5 miles (10-15): 5 * 2 = 10
      // Total: 20
      expect(result.releaseAmount).toBe(BigInt("20000000000000000000"));
      expect(result.refundAmount).toBe(BigInt("80000000000000000000"));
    });

    it("should handle unsorted tiers", () => {
      const pledge: PledgeForResolution = {
        pledgeId: "pledge_012",
        campaignId: "campaign_001",
        backer: "0x1234567890123456789012345678901234567890",
        pledgeType: "tiered",
        escrowedAmount: BigInt("100000000000000000000"),
        calculationParams: {
          perUnitAmount: BigInt(0),
          unitField: "miles_completed",
          cap: BigInt(0),
          tiers: [
            { threshold: 20, rate: BigInt("3000000000000000000") }, // Out of order
            { threshold: 0, rate: BigInt("1000000000000000000") },
            { threshold: 10, rate: BigInt("2000000000000000000") },
          ],
          conditionField: "",
          conditionOperator: "exists",
          conditionValue: 0,
        },
      };

      const milestoneResults: VerificationResult[] = [
        {
          milestoneId: "milestone_0",
          oracleId: "race_timing",
          verified: true,
          oracleData: { miles_completed: 25 },
        },
      ];

      const result = calculateTieredPledge(pledge, milestoneResults);

      // Should sort and calculate correctly
      // First 10: 10 * 1 = 10
      // Next 10: 10 * 2 = 20
      // Last 5: 5 * 3 = 15
      // Total: 45
      expect(result.releaseAmount).toBe(BigInt("45000000000000000000"));
    });

    it("should apply cap to tiered calculation", () => {
      const pledge: PledgeForResolution = {
        pledgeId: "pledge_013",
        campaignId: "campaign_001",
        backer: "0x1234567890123456789012345678901234567890",
        pledgeType: "tiered",
        escrowedAmount: BigInt("100000000000000000000"),
        calculationParams: {
          perUnitAmount: BigInt(0),
          unitField: "miles_completed",
          cap: BigInt("30000000000000000000"), // Cap at 30
          tiers: [
            { threshold: 0, rate: BigInt("1000000000000000000") },
            { threshold: 10, rate: BigInt("2000000000000000000") },
            { threshold: 20, rate: BigInt("3000000000000000000") },
          ],
          conditionField: "",
          conditionOperator: "exists",
          conditionValue: 0,
        },
      };

      const milestoneResults: VerificationResult[] = [
        {
          milestoneId: "milestone_0",
          oracleId: "race_timing",
          verified: true,
          oracleData: { miles_completed: 26 },
        },
      ];

      const result = calculateTieredPledge(pledge, milestoneResults);

      // Calculated would be 48, but capped at 30
      expect(result.releaseAmount).toBe(BigInt("30000000000000000000"));
      expect(result.refundAmount).toBe(BigInt("70000000000000000000"));
    });

    it("should return full refund when no tiers defined", () => {
      const pledge: PledgeForResolution = {
        pledgeId: "pledge_014",
        campaignId: "campaign_001",
        backer: "0x1234567890123456789012345678901234567890",
        pledgeType: "tiered",
        escrowedAmount: BigInt("100000000000000000000"),
        calculationParams: {
          perUnitAmount: BigInt(0),
          unitField: "miles_completed",
          cap: BigInt(0),
          tiers: [],
          conditionField: "",
          conditionOperator: "exists",
          conditionValue: 0,
        },
      };

      const milestoneResults: VerificationResult[] = [
        {
          milestoneId: "milestone_0",
          oracleId: "race_timing",
          verified: true,
          oracleData: { miles_completed: 26 },
        },
      ];

      const result = calculateTieredPledge(pledge, milestoneResults);

      expect(result.releaseAmount).toBe(BigInt(0));
      expect(result.refundAmount).toBe(BigInt("100000000000000000000"));
    });
  });

  describe("Conditional Pledge Calculations", () => {
    describe("exists operator", () => {
      it("should release when field exists", () => {
        const pledge: PledgeForResolution = {
          pledgeId: "pledge_020",
          campaignId: "campaign_001",
          backer: "0x1234567890123456789012345678901234567890",
          pledgeType: "conditional",
          escrowedAmount: BigInt("50000000000000000000"),
          calculationParams: {
            perUnitAmount: BigInt(0),
            unitField: "",
            cap: BigInt(0),
            tiers: [],
            conditionField: "finish_time",
            conditionOperator: "exists",
            conditionValue: 0,
          },
        };

        const milestoneResults: VerificationResult[] = [
          {
            milestoneId: "milestone_0",
            oracleId: "race_timing",
            verified: true,
            oracleData: { finish_time: "3:47:22" },
          },
        ];

        const result = calculateConditionalPledge(pledge, milestoneResults);

        expect(result.releaseAmount).toBe(BigInt("50000000000000000000"));
        expect(result.refundAmount).toBe(BigInt(0));
      });

      it("should refund when field does not exist", () => {
        const pledge: PledgeForResolution = {
          pledgeId: "pledge_021",
          campaignId: "campaign_001",
          backer: "0x1234567890123456789012345678901234567890",
          pledgeType: "conditional",
          escrowedAmount: BigInt("50000000000000000000"),
          calculationParams: {
            perUnitAmount: BigInt(0),
            unitField: "",
            cap: BigInt(0),
            tiers: [],
            conditionField: "finish_time",
            conditionOperator: "exists",
            conditionValue: 0,
          },
        };

        const milestoneResults: VerificationResult[] = [
          {
            milestoneId: "milestone_0",
            oracleId: "race_timing",
            verified: true,
            oracleData: { dnf: true },
          },
        ];

        const result = calculateConditionalPledge(pledge, milestoneResults);

        expect(result.releaseAmount).toBe(BigInt(0));
        expect(result.refundAmount).toBe(BigInt("50000000000000000000"));
      });
    });

    describe("eq operator", () => {
      it("should release when values are equal", () => {
        const pledge: PledgeForResolution = {
          pledgeId: "pledge_022",
          campaignId: "campaign_001",
          backer: "0x1234567890123456789012345678901234567890",
          pledgeType: "conditional",
          escrowedAmount: BigInt("50000000000000000000"),
          calculationParams: {
            perUnitAmount: BigInt(0),
            unitField: "",
            cap: BigInt(0),
            tiers: [],
            conditionField: "place",
            conditionOperator: "eq",
            conditionValue: 1,
          },
        };

        const milestoneResults: VerificationResult[] = [
          {
            milestoneId: "milestone_0",
            oracleId: "race_timing",
            verified: true,
            oracleData: { place: 1 },
          },
        ];

        const result = calculateConditionalPledge(pledge, milestoneResults);

        expect(result.releaseAmount).toBe(BigInt("50000000000000000000"));
        expect(result.refundAmount).toBe(BigInt(0));
      });

      it("should refund when values are not equal", () => {
        const pledge: PledgeForResolution = {
          pledgeId: "pledge_023",
          campaignId: "campaign_001",
          backer: "0x1234567890123456789012345678901234567890",
          pledgeType: "conditional",
          escrowedAmount: BigInt("50000000000000000000"),
          calculationParams: {
            perUnitAmount: BigInt(0),
            unitField: "",
            cap: BigInt(0),
            tiers: [],
            conditionField: "place",
            conditionOperator: "eq",
            conditionValue: 1,
          },
        };

        const milestoneResults: VerificationResult[] = [
          {
            milestoneId: "milestone_0",
            oracleId: "race_timing",
            verified: true,
            oracleData: { place: 5 },
          },
        ];

        const result = calculateConditionalPledge(pledge, milestoneResults);

        expect(result.releaseAmount).toBe(BigInt(0));
        expect(result.refundAmount).toBe(BigInt("50000000000000000000"));
      });
    });

    describe("gt operator", () => {
      it("should release when value is greater than threshold", () => {
        const pledge: PledgeForResolution = {
          pledgeId: "pledge_024",
          campaignId: "campaign_001",
          backer: "0x1234567890123456789012345678901234567890",
          pledgeType: "conditional",
          escrowedAmount: BigInt("50000000000000000000"),
          calculationParams: {
            perUnitAmount: BigInt(0),
            unitField: "",
            cap: BigInt(0),
            tiers: [],
            conditionField: "miles_completed",
            conditionOperator: "gt",
            conditionValue: 20,
          },
        };

        const milestoneResults: VerificationResult[] = [
          {
            milestoneId: "milestone_0",
            oracleId: "race_timing",
            verified: true,
            oracleData: { miles_completed: 26.2 },
          },
        ];

        const result = calculateConditionalPledge(pledge, milestoneResults);

        expect(result.releaseAmount).toBe(BigInt("50000000000000000000"));
        expect(result.refundAmount).toBe(BigInt(0));
      });

      it("should refund when value equals threshold (not greater)", () => {
        const pledge: PledgeForResolution = {
          pledgeId: "pledge_025",
          campaignId: "campaign_001",
          backer: "0x1234567890123456789012345678901234567890",
          pledgeType: "conditional",
          escrowedAmount: BigInt("50000000000000000000"),
          calculationParams: {
            perUnitAmount: BigInt(0),
            unitField: "",
            cap: BigInt(0),
            tiers: [],
            conditionField: "miles_completed",
            conditionOperator: "gt",
            conditionValue: 26,
          },
        };

        const milestoneResults: VerificationResult[] = [
          {
            milestoneId: "milestone_0",
            oracleId: "race_timing",
            verified: true,
            oracleData: { miles_completed: 26 },
          },
        ];

        const result = calculateConditionalPledge(pledge, milestoneResults);

        expect(result.releaseAmount).toBe(BigInt(0));
        expect(result.refundAmount).toBe(BigInt("50000000000000000000"));
      });
    });

    describe("gte operator", () => {
      it("should release when value equals threshold", () => {
        const pledge: PledgeForResolution = {
          pledgeId: "pledge_026",
          campaignId: "campaign_001",
          backer: "0x1234567890123456789012345678901234567890",
          pledgeType: "conditional",
          escrowedAmount: BigInt("50000000000000000000"),
          calculationParams: {
            perUnitAmount: BigInt(0),
            unitField: "",
            cap: BigInt(0),
            tiers: [],
            conditionField: "miles_completed",
            conditionOperator: "gte",
            conditionValue: 26,
          },
        };

        const milestoneResults: VerificationResult[] = [
          {
            milestoneId: "milestone_0",
            oracleId: "race_timing",
            verified: true,
            oracleData: { miles_completed: 26 },
          },
        ];

        const result = calculateConditionalPledge(pledge, milestoneResults);

        expect(result.releaseAmount).toBe(BigInt("50000000000000000000"));
        expect(result.refundAmount).toBe(BigInt(0));
      });
    });

    describe("lt operator", () => {
      it("should release when finish time is under target (time bonus)", () => {
        const pledge: PledgeForResolution = {
          pledgeId: "pledge_027",
          campaignId: "campaign_001",
          backer: "0x1234567890123456789012345678901234567890",
          pledgeType: "conditional",
          escrowedAmount: BigInt("100000000000000000000"),
          calculationParams: {
            perUnitAmount: BigInt(0),
            unitField: "",
            cap: BigInt(0),
            tiers: [],
            conditionField: "finish_time_seconds",
            conditionOperator: "lt",
            conditionValue: 14400, // 4 hours in seconds
          },
        };

        const milestoneResults: VerificationResult[] = [
          {
            milestoneId: "milestone_0",
            oracleId: "race_timing",
            verified: true,
            oracleData: { finish_time_seconds: 13642 }, // 3:47:22
          },
        ];

        const result = calculateConditionalPledge(pledge, milestoneResults);

        expect(result.releaseAmount).toBe(BigInt("100000000000000000000"));
        expect(result.refundAmount).toBe(BigInt(0));
      });
    });

    describe("lte operator", () => {
      it("should release when value is less than or equal to threshold", () => {
        const pledge: PledgeForResolution = {
          pledgeId: "pledge_028",
          campaignId: "campaign_001",
          backer: "0x1234567890123456789012345678901234567890",
          pledgeType: "conditional",
          escrowedAmount: BigInt("50000000000000000000"),
          calculationParams: {
            perUnitAmount: BigInt(0),
            unitField: "",
            cap: BigInt(0),
            tiers: [],
            conditionField: "finish_time_seconds",
            conditionOperator: "lte",
            conditionValue: 14400,
          },
        };

        const milestoneResults: VerificationResult[] = [
          {
            milestoneId: "milestone_0",
            oracleId: "race_timing",
            verified: true,
            oracleData: { finish_time_seconds: 14400 }, // Exactly 4 hours
          },
        ];

        const result = calculateConditionalPledge(pledge, milestoneResults);

        expect(result.releaseAmount).toBe(BigInt("50000000000000000000"));
        expect(result.refundAmount).toBe(BigInt(0));
      });
    });

    describe("between operator", () => {
      it("should release when value is within range", () => {
        const pledge: PledgeForResolution = {
          pledgeId: "pledge_029",
          campaignId: "campaign_001",
          backer: "0x1234567890123456789012345678901234567890",
          pledgeType: "conditional",
          escrowedAmount: BigInt("75000000000000000000"),
          calculationParams: {
            perUnitAmount: BigInt(0),
            unitField: "",
            cap: BigInt(0),
            tiers: [],
            conditionField: "miles_completed",
            conditionOperator: "between",
            conditionValue: 20,
            conditionValueEnd: 30,
          },
        };

        const milestoneResults: VerificationResult[] = [
          {
            milestoneId: "milestone_0",
            oracleId: "race_timing",
            verified: true,
            oracleData: { miles_completed: 26.2 },
          },
        ];

        const result = calculateConditionalPledge(pledge, milestoneResults);

        expect(result.releaseAmount).toBe(BigInt("75000000000000000000"));
        expect(result.refundAmount).toBe(BigInt(0));
      });

      it("should release when value is at range boundary", () => {
        const pledge: PledgeForResolution = {
          pledgeId: "pledge_030",
          campaignId: "campaign_001",
          backer: "0x1234567890123456789012345678901234567890",
          pledgeType: "conditional",
          escrowedAmount: BigInt("75000000000000000000"),
          calculationParams: {
            perUnitAmount: BigInt(0),
            unitField: "",
            cap: BigInt(0),
            tiers: [],
            conditionField: "miles_completed",
            conditionOperator: "between",
            conditionValue: 20,
            conditionValueEnd: 30,
          },
        };

        const milestoneResults: VerificationResult[] = [
          {
            milestoneId: "milestone_0",
            oracleId: "race_timing",
            verified: true,
            oracleData: { miles_completed: 20 }, // At lower boundary
          },
        ];

        const result = calculateConditionalPledge(pledge, milestoneResults);

        expect(result.releaseAmount).toBe(BigInt("75000000000000000000"));
      });

      it("should refund when value is outside range", () => {
        const pledge: PledgeForResolution = {
          pledgeId: "pledge_031",
          campaignId: "campaign_001",
          backer: "0x1234567890123456789012345678901234567890",
          pledgeType: "conditional",
          escrowedAmount: BigInt("75000000000000000000"),
          calculationParams: {
            perUnitAmount: BigInt(0),
            unitField: "",
            cap: BigInt(0),
            tiers: [],
            conditionField: "miles_completed",
            conditionOperator: "between",
            conditionValue: 20,
            conditionValueEnd: 30,
          },
        };

        const milestoneResults: VerificationResult[] = [
          {
            milestoneId: "milestone_0",
            oracleId: "race_timing",
            verified: true,
            oracleData: { miles_completed: 15 },
          },
        ];

        const result = calculateConditionalPledge(pledge, milestoneResults);

        expect(result.releaseAmount).toBe(BigInt(0));
        expect(result.refundAmount).toBe(BigInt("75000000000000000000"));
      });
    });

    it("should refund when condition field not found in any result", () => {
      const pledge: PledgeForResolution = {
        pledgeId: "pledge_032",
        campaignId: "campaign_001",
        backer: "0x1234567890123456789012345678901234567890",
        pledgeType: "conditional",
        escrowedAmount: BigInt("50000000000000000000"),
        calculationParams: {
          perUnitAmount: BigInt(0),
          unitField: "",
          cap: BigInt(0),
          tiers: [],
          conditionField: "bonus_field",
          conditionOperator: "exists",
          conditionValue: 0,
        },
      };

      const milestoneResults: VerificationResult[] = [
        {
          milestoneId: "milestone_0",
          oracleId: "race_timing",
          verified: true,
          oracleData: { finish_time: "3:47:22" },
        },
      ];

      const result = calculateConditionalPledge(pledge, milestoneResults);

      expect(result.releaseAmount).toBe(BigInt(0));
      expect(result.refundAmount).toBe(BigInt("50000000000000000000"));
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing calculation params", () => {
      const pledge: PledgeForResolution = {
        pledgeId: "pledge_040",
        campaignId: "campaign_001",
        backer: "0x1234567890123456789012345678901234567890",
        pledgeType: "per_unit",
        escrowedAmount: BigInt("100000000000000000000"),
        // No calculationParams
      };

      const milestoneResults: VerificationResult[] = [
        {
          milestoneId: "milestone_0",
          oracleId: "race_timing",
          verified: true,
          oracleData: { miles_completed: 26 },
        },
      ];

      const result = calculatePerUnitPledge(pledge, milestoneResults);

      expect(result.releaseAmount).toBe(BigInt(0));
      expect(result.refundAmount).toBe(BigInt("100000000000000000000"));
    });

    it("should handle empty milestone results", () => {
      const pledge: PledgeForResolution = {
        pledgeId: "pledge_041",
        campaignId: "campaign_001",
        backer: "0x1234567890123456789012345678901234567890",
        pledgeType: "per_unit",
        escrowedAmount: BigInt("100000000000000000000"),
        calculationParams: {
          perUnitAmount: BigInt("2000000000000000000"),
          unitField: "miles_completed",
          cap: BigInt(0),
          tiers: [],
          conditionField: "",
          conditionOperator: "exists",
          conditionValue: 0,
        },
      };

      const milestoneResults: VerificationResult[] = [];

      const result = calculatePerUnitPledge(pledge, milestoneResults);

      expect(result.releaseAmount).toBe(BigInt(0));
      expect(result.refundAmount).toBe(BigInt("100000000000000000000"));
    });

    it("should handle unverified milestone results", () => {
      const pledge: PledgeForResolution = {
        pledgeId: "pledge_042",
        campaignId: "campaign_001",
        backer: "0x1234567890123456789012345678901234567890",
        pledgeType: "per_unit",
        escrowedAmount: BigInt("100000000000000000000"),
        calculationParams: {
          perUnitAmount: BigInt("2000000000000000000"),
          unitField: "miles_completed",
          cap: BigInt(0),
          tiers: [],
          conditionField: "",
          conditionOperator: "exists",
          conditionValue: 0,
        },
      };

      const milestoneResults: VerificationResult[] = [
        {
          milestoneId: "milestone_0",
          oracleId: "race_timing",
          verified: false, // Not verified
          oracleData: { miles_completed: 26 },
        },
      ];

      const result = calculatePerUnitPledge(pledge, milestoneResults);

      expect(result.releaseAmount).toBe(BigInt(0));
      expect(result.refundAmount).toBe(BigInt("100000000000000000000"));
    });

    it("should handle negative values gracefully", () => {
      const pledge: PledgeForResolution = {
        pledgeId: "pledge_043",
        campaignId: "campaign_001",
        backer: "0x1234567890123456789012345678901234567890",
        pledgeType: "per_unit",
        escrowedAmount: BigInt("100000000000000000000"),
        calculationParams: {
          perUnitAmount: BigInt("2000000000000000000"),
          unitField: "miles_completed",
          cap: BigInt(0),
          tiers: [],
          conditionField: "",
          conditionOperator: "exists",
          conditionValue: 0,
        },
      };

      const milestoneResults: VerificationResult[] = [
        {
          milestoneId: "milestone_0",
          oracleId: "race_timing",
          verified: true,
          oracleData: { miles_completed: -5 }, // Invalid negative
        },
      ];

      const result = calculatePerUnitPledge(pledge, milestoneResults);

      expect(result.releaseAmount).toBe(BigInt(0));
      expect(result.refundAmount).toBe(BigInt("100000000000000000000"));
    });

    it("should handle very large unit values", () => {
      const pledge: PledgeForResolution = {
        pledgeId: "pledge_044",
        campaignId: "campaign_001",
        backer: "0x1234567890123456789012345678901234567890",
        pledgeType: "per_unit",
        escrowedAmount: BigInt("50000000000000000000"), // 50 escrowed
        calculationParams: {
          perUnitAmount: BigInt("1000000000000000000"),
          unitField: "commits",
          cap: BigInt(0),
          tiers: [],
          conditionField: "",
          conditionOperator: "exists",
          conditionValue: 0,
        },
      };

      const milestoneResults: VerificationResult[] = [
        {
          milestoneId: "milestone_0",
          oracleId: "github",
          verified: true,
          oracleData: { commits: 1000000 }, // Very large
        },
      ];

      const result = calculatePerUnitPledge(pledge, milestoneResults);

      // Should cap at escrowed amount
      expect(result.releaseAmount).toBe(BigInt("50000000000000000000"));
      expect(result.refundAmount).toBe(BigInt(0));
    });
  });

  describe("API Validation", () => {
    // These tests validate the request validation logic from campaigns.ts

    describe("Per-unit pledge validation", () => {
      it("should require perUnitAmount", () => {
        const pledgeType = {
          name: "Per Mile",
          calculationType: "per_unit",
          perUnitAmount: null,
          unitField: "miles_completed",
          minimum: "0",
        };

        const result = validatePledgeTypeConfig(pledgeType);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("perUnitAmount");
      });

      it("should require unitField", () => {
        const pledgeType = {
          name: "Per Mile",
          calculationType: "per_unit",
          perUnitAmount: "2000000000000000000",
          unitField: null,
          minimum: "0",
        };

        const result = validatePledgeTypeConfig(pledgeType);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("unitField");
      });

      it("should pass with valid per_unit config", () => {
        const pledgeType = {
          name: "Per Mile",
          calculationType: "per_unit",
          perUnitAmount: "2000000000000000000",
          unitField: "miles_completed",
          minimum: "0",
        };

        const result = validatePledgeTypeConfig(pledgeType);
        expect(result.valid).toBe(true);
      });
    });

    describe("Tiered pledge validation", () => {
      it("should require at least one tier", () => {
        const pledgeType = {
          name: "Tiered Sponsor",
          calculationType: "tiered",
          tiers: [],
          unitField: "miles_completed",
          minimum: "0",
        };

        const result = validatePledgeTypeConfig(pledgeType);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("at least one tier");
      });

      it("should require unitField for tiered", () => {
        const pledgeType = {
          name: "Tiered Sponsor",
          calculationType: "tiered",
          tiers: [{ threshold: 0, rate: "1000000000000000000" }],
          unitField: null,
          minimum: "0",
        };

        const result = validatePledgeTypeConfig(pledgeType);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("unitField");
      });

      it("should require ascending thresholds", () => {
        const pledgeType = {
          name: "Tiered Sponsor",
          calculationType: "tiered",
          tiers: [
            { threshold: 10, rate: "1000000000000000000" },
            { threshold: 5, rate: "2000000000000000000" }, // Out of order
          ],
          unitField: "miles_completed",
          minimum: "0",
        };

        const result = validatePledgeTypeConfig(pledgeType);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("ascending");
      });

      it("should pass with valid tiered config", () => {
        const pledgeType = {
          name: "Tiered Sponsor",
          calculationType: "tiered",
          tiers: [
            { threshold: 0, rate: "1000000000000000000" },
            { threshold: 10, rate: "2000000000000000000" },
          ],
          unitField: "miles_completed",
          minimum: "0",
        };

        const result = validatePledgeTypeConfig(pledgeType);
        expect(result.valid).toBe(true);
      });
    });

    describe("Conditional pledge validation", () => {
      it("should require condition", () => {
        const pledgeType = {
          name: "Completion Bonus",
          calculationType: "conditional",
          condition: null,
          minimum: "0",
        };

        const result = validatePledgeTypeConfig(pledgeType);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("condition");
      });

      it("should require condition field", () => {
        const pledgeType = {
          name: "Completion Bonus",
          calculationType: "conditional",
          condition: {
            field: "",
            operator: "exists",
          },
          minimum: "0",
        };

        const result = validatePledgeTypeConfig(pledgeType);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("field");
      });

      it("should require value for non-exists operators", () => {
        const pledgeType = {
          name: "Time Bonus",
          calculationType: "conditional",
          condition: {
            field: "finish_time_seconds",
            operator: "lt",
            // value missing
          },
          minimum: "0",
        };

        const result = validatePledgeTypeConfig(pledgeType);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("value");
      });

      it("should require valueEnd for between operator", () => {
        const pledgeType = {
          name: "Range Bonus",
          calculationType: "conditional",
          condition: {
            field: "miles_completed",
            operator: "between",
            value: 20,
            // valueEnd missing
          },
          minimum: "0",
        };

        const result = validatePledgeTypeConfig(pledgeType);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("valueEnd");
      });

      it("should pass with valid conditional config (exists)", () => {
        const pledgeType = {
          name: "Completion Bonus",
          calculationType: "conditional",
          condition: {
            field: "finish_time",
            operator: "exists",
          },
          minimum: "0",
        };

        const result = validatePledgeTypeConfig(pledgeType);
        expect(result.valid).toBe(true);
      });

      it("should pass with valid conditional config (between)", () => {
        const pledgeType = {
          name: "Range Bonus",
          calculationType: "conditional",
          condition: {
            field: "miles_completed",
            operator: "between",
            value: 20,
            valueEnd: 30,
          },
          minimum: "0",
        };

        const result = validatePledgeTypeConfig(pledgeType);
        expect(result.valid).toBe(true);
      });
    });
  });
});

// Helper function to validate pledge type configuration (mirrors campaigns.ts logic)
function validatePledgeTypeConfig(pledgeType: any): { valid: boolean; error?: string } {
  switch (pledgeType.calculationType) {
    case "flat":
      return { valid: true };

    case "per_unit":
      if (!pledgeType.perUnitAmount) {
        return { valid: false, error: `Per-unit pledge "${pledgeType.name}" requires perUnitAmount` };
      }
      if (!pledgeType.unitField) {
        return { valid: false, error: `Per-unit pledge "${pledgeType.name}" requires unitField` };
      }
      return { valid: true };

    case "tiered":
      if (!pledgeType.tiers || pledgeType.tiers.length === 0) {
        return { valid: false, error: `Tiered pledge "${pledgeType.name}" requires at least one tier` };
      }
      if (!pledgeType.unitField) {
        return { valid: false, error: `Tiered pledge "${pledgeType.name}" requires unitField` };
      }
      const tiers = pledgeType.tiers;
      for (let i = 1; i < tiers.length; i++) {
        if (tiers[i].threshold <= tiers[i - 1].threshold) {
          return { valid: false, error: `Tiered pledge "${pledgeType.name}" tiers must have ascending thresholds` };
        }
      }
      return { valid: true };

    case "conditional":
      if (!pledgeType.condition) {
        return { valid: false, error: `Conditional pledge "${pledgeType.name}" requires condition` };
      }
      const cond = pledgeType.condition;
      if (!cond.field) {
        return { valid: false, error: `Conditional pledge "${pledgeType.name}" condition requires field` };
      }
      if (cond.operator !== "exists" && cond.value === undefined) {
        return { valid: false, error: `Conditional pledge "${pledgeType.name}" condition requires value for ${cond.operator} operator` };
      }
      if (cond.operator === "between" && cond.valueEnd === undefined) {
        return { valid: false, error: `Conditional pledge "${pledgeType.name}" condition requires valueEnd for between operator` };
      }
      return { valid: true };

    default:
      return { valid: false, error: `Unknown calculation type: ${pledgeType.calculationType}` };
  }
}
