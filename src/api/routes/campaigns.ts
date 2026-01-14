import { Router, Request, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const router = Router();

// In-memory storage for Phase 1 (replace with DB in production)
const campaigns: Map<string, Campaign> = new Map();

// Types
interface Campaign {
  id: string;
  chainId: string | null;
  name: string;
  description: string;
  creator: string;
  beneficiary: string;
  beneficiaryName: string;
  subject: Subject | null;
  pledgeWindowStart: number;
  pledgeWindowEnd: number;
  eventDate: number | null;
  resolutionDeadline: number;
  milestones: Milestone[];
  pledgeTypes: PledgeType[];
  minimumPledge: string;
  maximumPledge: string | null;
  status: CampaignStatus;
  totalEscrowed: string;
  totalReleased: string;
  totalRefunded: string;
  pledgeCount: number;
  visibility: "public" | "semi-private" | "private";
  metadataUri: string;
  createdAt: number;
  updatedAt: number;
}

interface Subject {
  name: string;
  identifier: string;
  verificationSource: string;
}

interface Milestone {
  id: string;
  name: string;
  description: string;
  oracleId: string;
  condition: MilestoneCondition;
  releasePercentage: number;
  status: "pending" | "verified" | "failed" | "expired";
}

interface MilestoneCondition {
  type: "completion" | "threshold" | "range" | "custom";
  field: string;
  operator: string;
  value: any;
}

interface PledgeType {
  id: string;
  name: string;
  description: string;
  calculationType: "flat" | "per_unit" | "tiered" | "conditional";
  baseAmount: string | null;
  perUnitAmount: string | null;
  cap: string | null;
  minimum: string;
  maximum: string | null;
  enabled: boolean;
}

type CampaignStatus = "draft" | "active" | "pledging_closed" | "resolved" | "expired" | "cancelled";

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
    condition: z.object({
      type: z.enum(["completion", "threshold", "range", "custom"]),
      field: z.string(),
      operator: z.string(),
      value: z.any(),
    }),
    releasePercentage: z.number().min(0).max(100),
  })),
  pledgeTypes: z.array(z.object({
    name: z.string(),
    description: z.string(),
    calculationType: z.enum(["flat", "per_unit", "tiered", "conditional"]),
    baseAmount: z.string().nullable().optional(),
    perUnitAmount: z.string().nullable().optional(),
    cap: z.string().nullable().optional(),
    minimum: z.string(),
    maximum: z.string().nullable().optional(),
  })),
  minimumPledge: z.string(),
  maximumPledge: z.string().nullable().optional(),
  visibility: z.enum(["public", "semi-private", "private"]).optional(),
});

// Create campaign
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = createCampaignSchema.parse(req.body);

    // Validate timeline
    if (body.pledgeWindowStart >= body.pledgeWindowEnd) {
      return res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Pledge window start must be before end",
        },
      });
    }

    if (body.pledgeWindowEnd >= body.resolutionDeadline) {
      return res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Resolution deadline must be after pledge window",
        },
      });
    }

    // Validate milestone percentages sum to 100
    const totalPercentage = body.milestones.reduce(
      (sum, m) => sum + m.releasePercentage,
      0
    );
    if (totalPercentage !== 100) {
      return res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Milestone release percentages must sum to 100",
        },
      });
    }

    const id = `campaign_${uuidv4().slice(0, 8)}`;
    const now = Math.floor(Date.now() / 1000);

    const campaign: Campaign = {
      id,
      chainId: null,
      name: body.name,
      description: body.description,
      creator: req.headers["x-wallet-address"] as string || "0x0000000000000000000000000000000000000000",
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
        status: "pending" as const,
      })),
      pledgeTypes: body.pledgeTypes.map((pt, i) => ({
        ...pt,
        id: `pt_${i}`,
        baseAmount: pt.baseAmount || null,
        perUnitAmount: pt.perUnitAmount || null,
        cap: pt.cap || null,
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
      createdAt: now,
      updatedAt: now,
    };

    campaigns.set(id, campaign);

    res.status(201).json(campaign);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid request body",
          details: error.errors,
        },
      });
    }
    throw error;
  }
});

// Get campaign
router.get("/:id", (req: Request, res: Response) => {
  const campaign = campaigns.get(req.params.id);

  if (!campaign) {
    return res.status(404).json({
      error: {
        code: "CAMPAIGN_NOT_FOUND",
        message: `Campaign with ID ${req.params.id} does not exist`,
      },
    });
  }

  res.json(campaign);
});

// List campaigns
router.get("/", (req: Request, res: Response) => {
  const { status, limit = "20", offset = "0" } = req.query;

  let result = Array.from(campaigns.values());

  // Filter by status
  if (status) {
    result = result.filter((c) => c.status === status);
  }

  // Filter by visibility (only show public by default)
  result = result.filter((c) => c.visibility === "public");

  // Pagination
  const total = result.length;
  const limitNum = parseInt(limit as string, 10);
  const offsetNum = parseInt(offset as string, 10);

  result = result.slice(offsetNum, offsetNum + limitNum);

  res.json({
    campaigns: result,
    total,
    limit: limitNum,
    offset: offsetNum,
  });
});

// Activate campaign
router.post("/:id/activate", (req: Request, res: Response) => {
  const campaign = campaigns.get(req.params.id);

  if (!campaign) {
    return res.status(404).json({
      error: {
        code: "CAMPAIGN_NOT_FOUND",
        message: `Campaign with ID ${req.params.id} does not exist`,
      },
    });
  }

  if (campaign.status !== "draft") {
    return res.status(409).json({
      error: {
        code: "CONFLICT",
        message: "Campaign must be in draft status to activate",
      },
    });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > campaign.pledgeWindowEnd) {
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Cannot activate: pledge window has already ended",
      },
    });
  }

  campaign.status = "active";
  campaign.updatedAt = now;

  res.json({
    id: campaign.id,
    status: campaign.status,
    activatedAt: now,
  });
});

// Resolve campaign
router.post("/:id/resolve", (req: Request, res: Response) => {
  const campaign = campaigns.get(req.params.id);

  if (!campaign) {
    return res.status(404).json({
      error: {
        code: "CAMPAIGN_NOT_FOUND",
        message: `Campaign with ID ${req.params.id} does not exist`,
      },
    });
  }

  if (campaign.status !== "active" && campaign.status !== "pledging_closed") {
    return res.status(409).json({
      error: {
        code: "CONFLICT",
        message: "Campaign must be active or pledging_closed to resolve",
      },
    });
  }

  const now = Math.floor(Date.now() / 1000);
  campaign.status = "resolved";
  campaign.updatedAt = now;

  res.json({
    id: campaign.id,
    status: campaign.status,
    resolution: {
      totalReleased: campaign.totalReleased,
      totalRefunded: campaign.totalRefunded,
      pledgesResolved: campaign.pledgeCount,
      milestonesVerified: campaign.milestones.filter((m) => m.status === "verified").length,
    },
  });
});

// Get campaign stats
router.get("/:id/stats", (req: Request, res: Response) => {
  const campaign = campaigns.get(req.params.id);

  if (!campaign) {
    return res.status(404).json({
      error: {
        code: "CAMPAIGN_NOT_FOUND",
        message: `Campaign with ID ${req.params.id} does not exist`,
      },
    });
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
});

export default router;
