import { Router, Request, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { authMiddleware, asyncHandler, hasRole, sameAddress } from "../../security/middleware";
import { oracleRouter } from "../../oracle";
import {
  getStore,
  Campaign,
  CampaignStatus,
  PledgeCondition,
  Tier,
} from "../../database";
import { resolutionEngine } from "../resolution-services";
import { campaignEvent, milestoneEvent } from "../../events";

const router = Router();

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function campaignNotFound(res: Response, id: string) {
  return res.status(404).json({
    error: {
      code: "CAMPAIGN_NOT_FOUND",
      message: `Campaign with ID ${id} does not exist`,
    },
  });
}

function forbidden(res: Response, message: string) {
  return res.status(403).json({ error: { code: "FORBIDDEN", message } });
}

function conflict(res: Response, message: string, code = "CONFLICT") {
  return res.status(409).json({ error: { code, message } });
}

function isCreatorOrAdmin(req: Request, campaign: Campaign): boolean {
  return sameAddress(campaign.creator, req.auth?.address) || hasRole(req, "admin");
}

// Amounts are wei, encoded as non-negative integer strings
const weiAmount = z.string().regex(/^\d+$/, "Must be a non-negative integer amount in wei");

const operatorSchema = z.enum(["exists", "eq", "gt", "gte", "lt", "lte", "between"]);

// Tier schema for tiered pledges
const tierSchema = z.object({
  threshold: z.number().min(0),
  rate: weiAmount,
});

// Condition schema for conditional pledges
const conditionSchema = z.object({
  field: z.string().min(1),
  operator: operatorSchema,
  value: z.number().optional(),
  valueEnd: z.number().optional(),
});

// Validation schemas
const createCampaignSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  beneficiary: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  beneficiaryName: z.string().min(1).max(100),
  subject: z.object({
    name: z.string(),
    identifier: z.string(),
    verificationSource: z.string(),
  }).nullable().optional(),
  pledgeWindowStart: z.number().int().positive(),
  pledgeWindowEnd: z.number().int().positive(),
  eventDate: z.number().int().positive().nullable().optional(),
  resolutionDeadline: z.number().int().positive(),
  milestones: z.array(z.object({
    name: z.string(),
    description: z.string(),
    oracleId: z.string(),
    oracleParams: z.record(z.unknown()).optional(),
    condition: z.object({
      type: z.enum(["completion", "threshold", "range", "custom"]),
      field: z.string(),
      operator: operatorSchema,
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
      valueEnd: z.number().optional(),
    }),
    releasePercentage: z.number().min(0).max(100),
  })).min(1),
  pledgeTypes: z.array(z.object({
    name: z.string(),
    description: z.string(),
    calculationType: z.enum(["flat", "per_unit", "tiered", "conditional"]),
    baseAmount: weiAmount.nullable().optional(),
    // Per-unit fields
    perUnitAmount: weiAmount.nullable().optional(),
    unitField: z.string().nullable().optional(),
    cap: weiAmount.nullable().optional(),
    // Tiered fields (Phase 4)
    tiers: z.array(tierSchema).nullable().optional(),
    // Conditional fields (Phase 4)
    condition: conditionSchema.nullable().optional(),
    // Common fields
    minimum: weiAmount,
    maximum: weiAmount.nullable().optional(),
  })).min(1),
  minimumPledge: weiAmount,
  maximumPledge: weiAmount.nullable().optional(),
  visibility: z.enum(["public", "semi-private", "private"]).optional(),
});

const campaignStatuses: [CampaignStatus, ...CampaignStatus[]] = [
  "draft",
  "active",
  "pledging_closed",
  "resolved",
  "expired",
  "cancelled",
];

const listQuerySchema = z.object({
  status: z.enum(campaignStatuses).optional(),
  creator: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// Input type for pledge type validation
interface PledgeTypeInput {
  name: string;
  calculationType: "flat" | "per_unit" | "tiered" | "conditional";
  perUnitAmount?: string | null;
  unitField?: string | null;
  tiers?: Tier[] | null;
  condition?: PledgeCondition | null;
}

/**
 * Validate pledge type configuration based on calculation type
 */
function validatePledgeTypeConfig(pledgeType: PledgeTypeInput): { valid: boolean; error?: string } {
  switch (pledgeType.calculationType) {
    case "flat":
      // Flat pledges need a base amount or just minimum
      return { valid: true };

    case "per_unit":
      if (!pledgeType.perUnitAmount) {
        return { valid: false, error: `Per-unit pledge "${pledgeType.name}" requires perUnitAmount` };
      }
      if (!pledgeType.unitField) {
        return { valid: false, error: `Per-unit pledge "${pledgeType.name}" requires unitField` };
      }
      return { valid: true };

    case "tiered": {
      if (!pledgeType.tiers || pledgeType.tiers.length === 0) {
        return { valid: false, error: `Tiered pledge "${pledgeType.name}" requires at least one tier` };
      }
      if (!pledgeType.unitField) {
        return { valid: false, error: `Tiered pledge "${pledgeType.name}" requires unitField` };
      }
      // Validate tiers are sorted and have valid thresholds
      const tiers = pledgeType.tiers;
      for (let i = 1; i < tiers.length; i++) {
        if (tiers[i].threshold <= tiers[i - 1].threshold) {
          return { valid: false, error: `Tiered pledge "${pledgeType.name}" tiers must have ascending thresholds` };
        }
      }
      return { valid: true };
    }

    case "conditional": {
      if (!pledgeType.condition) {
        return { valid: false, error: `Conditional pledge "${pledgeType.name}" requires condition` };
      }
      const cond = pledgeType.condition;
      if (!cond.field) {
        return { valid: false, error: `Conditional pledge "${pledgeType.name}" condition requires field` };
      }
      // Validate value is provided for operators that need it
      if (cond.operator !== "exists" && cond.value === undefined) {
        return { valid: false, error: `Conditional pledge "${pledgeType.name}" condition requires value for ${cond.operator} operator` };
      }
      if (cond.operator === "between" && cond.valueEnd === undefined) {
        return { valid: false, error: `Conditional pledge "${pledgeType.name}" condition requires valueEnd for between operator` };
      }
      return { valid: true };
    }

    default:
      return { valid: false, error: `Unknown calculation type: ${pledgeType.calculationType}` };
  }
}

function validationError(res: Response, message: string) {
  return res.status(422).json({ error: { code: "VALIDATION_ERROR", message } });
}

/**
 * A refusal to create or change a campaign, with the HTTP status and error
 * code the API answers with
 */
export class CampaignActionError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "CampaignActionError";
  }
}

function invalid(message: string): never {
  throw new CampaignActionError(422, "VALIDATION_ERROR", message);
}

/**
 * Validate a campaign definition and store it as a draft created by
 * `creator`. Used by POST /campaigns and organization bulk operations.
 */
export async function createCampaignFrom(input: unknown, creator: string): Promise<Campaign> {
  const parsed = createCampaignSchema.safeParse(input);
  if (!parsed.success) {
    throw new CampaignActionError(400, "INVALID_REQUEST", "Invalid request body", parsed.error.errors);
  }
  const body = parsed.data;

  // Validate timeline
  if (body.pledgeWindowStart >= body.pledgeWindowEnd) {
    invalid("Pledge window start must be before end");
  }

  if (body.pledgeWindowEnd >= body.resolutionDeadline) {
    invalid("Resolution deadline must be after pledge window");
  }

  // Validate milestone percentages sum to 100
  const totalPercentage = body.milestones.reduce((sum, m) => sum + m.releasePercentage, 0);
  if (totalPercentage !== 100) {
    invalid("Milestone release percentages must sum to 100");
  }

  if (body.maximumPledge && BigInt(body.maximumPledge) < BigInt(body.minimumPledge)) {
    invalid("maximumPledge must not be less than minimumPledge");
  }

  // Milestones must be verifiable by a registered, active oracle
  for (const milestone of body.milestones) {
    const oracle = await getStore().getOracle(milestone.oracleId);
    if (!oracle || !oracle.active) {
      invalid(`Milestone "${milestone.name}" uses unknown or inactive oracle ${milestone.oracleId}`);
    }
  }

  // Validate pledge type configurations (Phase 4)
  for (const pledgeType of body.pledgeTypes) {
    const validation = validatePledgeTypeConfig(pledgeType);
    if (!validation.valid) {
      invalid(validation.error!);
    }
  }

  const id = `campaign_${uuidv4().slice(0, 8)}`;
  const timestamp = now();

  const campaign: Campaign = {
    id,
    chainId: null,
    name: body.name,
    description: body.description,
    creator,
    beneficiary: body.beneficiary,
    beneficiaryName: body.beneficiaryName,
    subject: body.subject || null,
    pledgeWindowStart: body.pledgeWindowStart,
    pledgeWindowEnd: body.pledgeWindowEnd,
    eventDate: body.eventDate || null,
    resolutionDeadline: body.resolutionDeadline,
    milestones: body.milestones.map((m, i) => ({
      ...m,
      id: `milestone_${i}`,
      oracleParams: m.oracleParams || {},
      status: "pending" as const,
      verifiedAt: null,
      oracleData: null,
    })),
    pledgeTypes: body.pledgeTypes.map((pt, i) => ({
      ...pt,
      id: `pt_${i}`,
      baseAmount: pt.baseAmount || null,
      perUnitAmount: pt.perUnitAmount || null,
      unitField: pt.unitField || null,
      cap: pt.cap || null,
      tiers: pt.tiers || null,
      condition: pt.condition || null,
      maximum: pt.maximum || null,
      enabled: true,
    })),
    minimumPledge: body.minimumPledge,
    maximumPledge: body.maximumPledge || null,
    status: "draft",
    totalEscrowed: "0",
    totalReleased: "0",
    totalRefunded: "0",
    pledgeCount: 0,
    visibility: body.visibility || "public",
    metadataUri: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    resolvedAt: null,
  };

  await getStore().saveCampaign(campaign);
  campaignEvent("campaign_created", campaign);
  return campaign;
}

function sendActionError(res: Response, error: unknown): boolean {
  if (!(error instanceof CampaignActionError)) return false;
  res.status(error.status).json({
    error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
  });
  return true;
}

// Create campaign
router.post("/", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  try {
    res.status(201).json(await createCampaignFrom(req.body, req.auth!.address));
  } catch (error) {
    if (!sendActionError(res, error)) throw error;
  }
}));

// Get campaign
router.get("/:id", asyncHandler(async (req: Request, res: Response) => {
  const campaign = await getStore().getCampaign(req.params.id);

  if (!campaign) {
    return campaignNotFound(res, req.params.id);
  }

  res.json(campaign);
}));

// List public campaigns
router.get("/", asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid query parameters",
        details: parsed.error.errors,
      },
    });
  }
  const { status, creator, limit, offset } = parsed.data;

  const page = await getStore().listCampaigns({
    status,
    creator,
    visibility: "public",
    limit,
    offset,
  });

  res.json({
    campaigns: page.items,
    total: page.total,
    limit,
    offset,
  });
}));

// List pledges for a campaign
router.get("/:id/pledges", asyncHandler(async (req: Request, res: Response) => {
  const campaign = await getStore().getCampaign(req.params.id);
  if (!campaign) {
    return campaignNotFound(res, req.params.id);
  }

  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 100);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
  const page = await getStore().listPledges({ campaignId: campaign.id, limit, offset });

  res.json({ pledges: page.items, total: page.total, limit, offset });
}));

// Activate campaign
router.post("/:id/activate", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  const result = await getStore().transaction(async (tx) => {
    const campaign = await tx.getCampaign(req.params.id, { forUpdate: true });

    if (!campaign) {
      return () => campaignNotFound(res, req.params.id);
    }

    if (!sameAddress(campaign.creator, req.auth!.address)) {
      return () => forbidden(res, "Only the campaign creator can activate this campaign");
    }

    if (campaign.status !== "draft") {
      return () => conflict(res, "Campaign must be in draft status to activate");
    }

    const timestamp = now();
    if (timestamp > campaign.pledgeWindowEnd) {
      return () => validationError(res, "Cannot activate: pledge window has already ended");
    }

    campaign.status = "active";
    campaign.updatedAt = timestamp;
    await tx.saveCampaign(campaign);

    return () => {
      campaignEvent("campaign_activated", campaign);
      res.json({
        id: campaign.id,
        status: campaign.status,
        activatedAt: timestamp,
      });
    };
  });

  result();
}));

/**
 * Cancel a draft or active campaign, refunding every active pledge (mirrors
 * CampaignRegistry.cancelCampaign). Only the creator may cancel.
 */
export async function cancelCampaignAs(
  id: string,
  actor: string
): Promise<{ campaign: Campaign; pledgesRefunded: number; totalRefunded: bigint }> {
  const outcome = await getStore().transaction(async (tx) => {
    const campaign = await tx.getCampaign(id, { forUpdate: true });

    if (!campaign) {
      throw new CampaignActionError(404, "CAMPAIGN_NOT_FOUND", `Campaign with ID ${id} does not exist`);
    }

    if (!sameAddress(campaign.creator, actor)) {
      throw new CampaignActionError(403, "FORBIDDEN", "Only the campaign creator can cancel this campaign");
    }

    if (campaign.status !== "draft" && campaign.status !== "active") {
      throw new CampaignActionError(409, "CONFLICT", "Only draft or active campaigns can be cancelled");
    }

    const timestamp = now();
    const active = await tx.listPledges({ campaignId: campaign.id, status: "active" });
    let refunded = BigInt(0);
    for (const listed of active.items) {
      const pledge = await tx.getPledge(listed.id, { forUpdate: true });
      if (!pledge || pledge.status !== "active") continue;
      pledge.status = "refunded";
      pledge.finalAmount = "0";
      pledge.refundedAmount = pledge.escrowedAmount;
      pledge.resolvedAt = timestamp;
      refunded += BigInt(pledge.escrowedAmount);
      await tx.savePledge(pledge);
    }

    campaign.status = "cancelled";
    campaign.totalEscrowed = (BigInt(campaign.totalEscrowed) - refunded).toString();
    campaign.totalRefunded = (BigInt(campaign.totalRefunded) + refunded).toString();
    campaign.pledgeCount = 0;
    campaign.updatedAt = timestamp;
    await tx.saveCampaign(campaign);

    return { campaign, pledgesRefunded: active.items.length, totalRefunded: refunded };
  });

  campaignEvent("campaign_cancelled", outcome.campaign);
  return outcome;
}

// Cancel campaign
router.post("/:id/cancel", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  try {
    const { campaign, pledgesRefunded, totalRefunded } = await cancelCampaignAs(req.params.id, req.auth!.address);
    res.json({
      id: campaign.id,
      status: campaign.status,
      pledgesRefunded,
      totalRefunded: totalRefunded.toString(),
    });
  } catch (error) {
    if (!sendActionError(res, error)) throw error;
  }
}));

// Check a milestone against its (non-attestation) oracle and record a pass.
// Attestation milestones are decided by POST /v1/oracles/attestations.
router.post(
  "/:id/milestones/:milestoneId/verify",
  authMiddleware(),
  asyncHandler(async (req: Request, res: Response) => {
    const store = getStore();
    const campaign = await store.getCampaign(req.params.id);
    if (!campaign) {
      return campaignNotFound(res, req.params.id);
    }

    const milestone = campaign.milestones.find((m) => m.id === req.params.milestoneId);
    if (!milestone) {
      return res.status(404).json({
        error: { code: "MILESTONE_NOT_FOUND", message: `Milestone ${req.params.milestoneId} does not exist` },
      });
    }

    if (campaign.status !== "active" && campaign.status !== "pledging_closed") {
      return conflict(res, `Milestones cannot be verified while the campaign is ${campaign.status}`);
    }

    if (milestone.status !== "pending") {
      return conflict(res, `Milestone is already ${milestone.status}`);
    }

    const oracle = await store.getOracle(milestone.oracleId);
    if (oracle?.type === "attestation") {
      return conflict(res, "Attestation milestones are verified by the oracle's attestor", "ATTESTATION_REQUIRED");
    }

    const result = await oracleRouter.verifyMilestone(
      milestone.oracleId,
      campaign.id,
      milestone.id,
      milestone.condition,
      milestone.oracleParams
    );

    if (result.verified) {
      const recorded = await store.transaction(async (tx) => {
        const current = await tx.getCampaign(campaign.id, { forUpdate: true });
        const target = current?.milestones.find((m) => m.id === milestone.id);
        if (!current || !target || target.status !== "pending") return false;
        target.status = "verified";
        target.verifiedAt = now();
        target.oracleData = result.oracleData;
        current.updatedAt = now();
        await tx.saveCampaign(current);
        return true;
      });
      if (recorded) milestoneEvent("milestone_verified", campaign, milestone.id);
    }

    res.json({
      campaignId: campaign.id,
      milestoneId: milestone.id,
      verified: result.verified,
      status: result.verified ? "verified" : "pending",
      oracleData: result.oracleData,
      error: result.error,
    });
  })
);

// Resolve campaign: releases or refunds every pledge according to the
// oracle-verified milestones. Refused while any milestone is undecided, until
// the resolution deadline (after which undecided milestones count as failed).
router.post("/:id/resolve", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  const campaign = await getStore().getCampaign(req.params.id);

  if (!campaign) {
    return campaignNotFound(res, req.params.id);
  }

  if (!isCreatorOrAdmin(req, campaign)) {
    return forbidden(res, "Only the campaign creator can resolve this campaign");
  }

  const job = await resolutionEngine.resolveNow(campaign.id, "manual");

  if (job.status !== "completed") {
    if (job.errorCode) {
      return conflict(res, job.error!, job.errorCode.toUpperCase());
    }
    throw new Error(job.error || "Resolution failed");
  }

  const resolved = await getStore().getCampaign(campaign.id);

  res.json({
    id: campaign.id,
    status: resolved!.status,
    resolution: {
      totalReleased: job.result!.totalReleased,
      totalRefunded: job.result!.totalRefunded,
      pledgesResolved: job.result!.pledgesResolved,
      milestonesVerified: job.result!.milestonesVerified,
      milestonesFailed: job.result!.milestonesFailed,
    },
    milestones: resolved!.milestones.map((m) => ({ id: m.id, status: m.status })),
  });
}));

// Get campaign stats
router.get("/:id/stats", asyncHandler(async (req: Request, res: Response) => {
  const campaign = await getStore().getCampaign(req.params.id);

  if (!campaign) {
    return campaignNotFound(res, req.params.id);
  }

  res.json({
    campaignId: campaign.id,
    totalEscrowed: campaign.totalEscrowed,
    totalReleased: campaign.totalReleased,
    totalRefunded: campaign.totalRefunded,
    pledgeCount: campaign.pledgeCount,
    milestonesCompleted: campaign.milestones.filter((m) => m.status === "verified").length,
    milestonesTotal: campaign.milestones.length,
  });
}));

// Get pledge types summary (Phase 4)
router.get("/:id/pledge-types", asyncHandler(async (req: Request, res: Response) => {
  const campaign = await getStore().getCampaign(req.params.id);

  if (!campaign) {
    return campaignNotFound(res, req.params.id);
  }

  res.json({
    campaignId: campaign.id,
    pledgeTypes: campaign.pledgeTypes.map(pt => ({
      id: pt.id,
      name: pt.name,
      description: pt.description,
      calculationType: pt.calculationType,
      minimum: pt.minimum,
      maximum: pt.maximum,
      enabled: pt.enabled,
      // Type-specific details
      ...(pt.calculationType === "per_unit" && {
        perUnitAmount: pt.perUnitAmount,
        unitField: pt.unitField,
        cap: pt.cap,
      }),
      ...(pt.calculationType === "tiered" && {
        unitField: pt.unitField,
        tiers: pt.tiers,
        cap: pt.cap,
      }),
      ...(pt.calculationType === "conditional" && {
        condition: pt.condition,
      }),
    })),
  });
}));

export default router;
