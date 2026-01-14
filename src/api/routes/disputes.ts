/**
 * Dispute Resolution API Routes
 * Phase 6: Governance - Dispute management endpoints
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { disputeService } from "../../governance";
import { DisputeCategory, DisputeStatus, VoteOption } from "../../governance/types";

const router = Router();

/**
 * Create dispute schema
 */
const CreateDisputeSchema = z.object({
  campaignId: z.string().min(1),
  pledgeIds: z.array(z.string()).optional(),
  milestoneId: z.string().optional(),
  category: z.enum([
    "oracle_disagreement",
    "oracle_failure",
    "milestone_dispute",
    "calculation_error",
    "fraud_claim",
    "technical_issue",
    "other",
  ]),
  title: z.string().min(5).max(200),
  description: z.string().min(20).max(5000),
  initialEvidence: z
    .array(
      z.object({
        type: z.enum(["document", "screenshot", "api_response", "attestation", "link", "text"]),
        title: z.string().min(1),
        description: z.string().min(1),
        content: z.string().min(1),
      })
    )
    .optional(),
});

/**
 * Submit evidence schema
 */
const SubmitEvidenceSchema = z.object({
  type: z.enum(["document", "screenshot", "api_response", "attestation", "link", "text"]),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  content: z.string().min(1),
  contentHash: z.string().optional(),
});

/**
 * Cast vote schema
 */
const CastVoteSchema = z.object({
  voter: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  votingPower: z.string().min(1), // BigInt as string
  vote: z.enum(["release", "refund", "partial", "abstain"]),
  partialPercent: z.number().min(0).max(100).optional(),
  reason: z.string().max(1000).optional(),
});

/**
 * Resolve dispute schema
 */
const ResolveDisputeSchema = z.object({
  outcome: z.enum(["release", "refund", "partial"]),
  releasePercent: z.number().min(0).max(100),
  refundPercent: z.number().min(0).max(100),
  rationale: z.string().min(10).max(2000),
  evidenceIds: z.array(z.string()).optional(),
});

/**
 * Appeal schema
 */
const AppealSchema = z.object({
  appealedBy: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  reason: z.string().min(20).max(2000),
});

/**
 * Open voting schema
 */
const OpenVotingSchema = z.object({
  eligibleVoters: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/)),
  votingPowers: z.record(z.string()), // { address: votingPower }
});

/**
 * Filter query schema
 */
const FilterQuerySchema = z.object({
  campaignId: z.string().optional(),
  status: z.string().optional(), // Can be comma-separated
  category: z.string().optional(),
  tier: z.string().optional(),
  raisedBy: z.string().optional(),
  affectsAddress: z.string().optional(),
  priority: z.string().optional(),
  votingActive: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

/**
 * POST /disputes
 * Create a new dispute
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = CreateDisputeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid request body",
        details: parsed.error.errors,
      });
      return;
    }

    // Get raiser address from header or body
    const raisedBy = req.headers["x-wallet-address"] as string || req.body.raisedBy;
    if (!raisedBy || !/^0x[a-fA-F0-9]{40}$/.test(raisedBy)) {
      res.status(400).json({
        success: false,
        error: "Valid wallet address required (x-wallet-address header or raisedBy field)",
      });
      return;
    }

    const dispute = await disputeService.createDispute(parsed.data, raisedBy);

    res.status(201).json({
      success: true,
      data: {
        ...dispute,
        totalEscrowedAmount: dispute.totalEscrowedAmount.toString(),
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /disputes
 * List disputes with optional filters
 */
router.get("/", (req: Request, res: Response) => {
  try {
    const query = FilterQuerySchema.parse(req.query);

    const filters: any = {};
    if (query.campaignId) filters.campaignId = query.campaignId;
    if (query.status) {
      const statuses = query.status.split(",").map((s) => s.trim());
      filters.status = statuses.length === 1 ? statuses[0] : statuses;
    }
    if (query.category) filters.category = query.category;
    if (query.tier) filters.tier = query.tier;
    if (query.raisedBy) filters.raisedBy = query.raisedBy;
    if (query.affectsAddress) filters.affectsAddress = query.affectsAddress;
    if (query.priority) filters.priority = query.priority;
    if (query.votingActive) filters.votingActive = query.votingActive === "true";
    if (query.fromDate) filters.fromDate = parseInt(query.fromDate);
    if (query.toDate) filters.toDate = parseInt(query.toDate);

    const disputes = disputeService.listDisputes(filters);

    res.json({
      success: true,
      data: disputes.map((d) => ({
        ...d,
        totalEscrowedAmount: d.totalEscrowedAmount.toString(),
        voteTally: d.voteTally
          ? {
              ...d.voteTally,
              totalVotingPower: d.voteTally.totalVotingPower.toString(),
              release: d.voteTally.release.toString(),
              refund: d.voteTally.refund.toString(),
              partial: d.voteTally.partial.toString(),
              abstain: d.voteTally.abstain.toString(),
            }
          : undefined,
      })),
      count: disputes.length,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /disputes/stats
 * Get dispute statistics
 */
router.get("/stats", (_req: Request, res: Response) => {
  try {
    const stats = disputeService.getStatistics();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /disputes/:disputeId
 * Get a specific dispute
 */
router.get("/:disputeId", (req: Request, res: Response) => {
  try {
    const { disputeId } = req.params;
    const dispute = disputeService.getDispute(disputeId);

    if (!dispute) {
      res.status(404).json({
        success: false,
        error: `Dispute "${disputeId}" not found`,
      });
      return;
    }

    res.json({
      success: true,
      data: {
        ...dispute,
        totalEscrowedAmount: dispute.totalEscrowedAmount.toString(),
        voteTally: dispute.voteTally
          ? {
              ...dispute.voteTally,
              totalVotingPower: dispute.voteTally.totalVotingPower.toString(),
              release: dispute.voteTally.release.toString(),
              refund: dispute.voteTally.refund.toString(),
              partial: dispute.voteTally.partial.toString(),
              abstain: dispute.voteTally.abstain.toString(),
            }
          : undefined,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /disputes/:disputeId/timeline
 * Get dispute event timeline
 */
router.get("/:disputeId/timeline", (req: Request, res: Response) => {
  try {
    const { disputeId } = req.params;
    const dispute = disputeService.getDispute(disputeId);

    if (!dispute) {
      res.status(404).json({
        success: false,
        error: `Dispute "${disputeId}" not found`,
      });
      return;
    }

    const timeline = disputeService.getTimeline(disputeId);

    res.json({
      success: true,
      data: timeline,
      count: timeline.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /disputes/:disputeId/evidence
 * Submit evidence for a dispute
 */
router.post("/:disputeId/evidence", async (req: Request, res: Response) => {
  try {
    const { disputeId } = req.params;
    const parsed = SubmitEvidenceSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid evidence data",
        details: parsed.error.errors,
      });
      return;
    }

    const submittedBy = req.headers["x-wallet-address"] as string || req.body.submittedBy;
    if (!submittedBy) {
      res.status(400).json({
        success: false,
        error: "Wallet address required",
      });
      return;
    }

    const evidence = await disputeService.submitEvidence(disputeId, submittedBy, parsed.data);

    res.status(201).json({
      success: true,
      data: evidence,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /disputes/:disputeId/evidence
 * Get evidence for a dispute
 */
router.get("/:disputeId/evidence", (req: Request, res: Response) => {
  try {
    const { disputeId } = req.params;
    const evidence = disputeService.getEvidence(disputeId);

    res.json({
      success: true,
      data: evidence,
      count: evidence.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /disputes/:disputeId/voting/open
 * Open voting on a dispute
 */
router.post("/:disputeId/voting/open", async (req: Request, res: Response) => {
  try {
    const { disputeId } = req.params;
    const parsed = OpenVotingSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid voting configuration",
        details: parsed.error.errors,
      });
      return;
    }

    // Convert voting powers to Map<string, bigint>
    const votingPowers = new Map<string, bigint>();
    for (const [address, power] of Object.entries(parsed.data.votingPowers)) {
      votingPowers.set(address, BigInt(power));
    }

    await disputeService.openVoting(disputeId, parsed.data.eligibleVoters, votingPowers);

    const dispute = disputeService.getDispute(disputeId);

    res.json({
      success: true,
      data: {
        disputeId,
        votingStartedAt: dispute?.votingStartedAt,
        votingEndsAt: dispute?.votingEndsAt,
        eligibleVoterCount: parsed.data.eligibleVoters.length,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /disputes/:disputeId/voting/vote
 * Cast a vote on a dispute
 */
router.post("/:disputeId/voting/vote", async (req: Request, res: Response) => {
  try {
    const { disputeId } = req.params;
    const parsed = CastVoteSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid vote data",
        details: parsed.error.errors,
      });
      return;
    }

    const vote = await disputeService.castVote(
      disputeId,
      parsed.data.voter,
      BigInt(parsed.data.votingPower),
      parsed.data.vote as VoteOption,
      parsed.data.partialPercent,
      parsed.data.reason
    );

    res.status(201).json({
      success: true,
      data: {
        ...vote,
        votingPower: vote.votingPower.toString(),
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /disputes/:disputeId/voting/votes
 * Get all votes for a dispute
 */
router.get("/:disputeId/voting/votes", (req: Request, res: Response) => {
  try {
    const { disputeId } = req.params;
    const votes = disputeService.getVotes(disputeId);

    res.json({
      success: true,
      data: votes.map((v) => ({
        ...v,
        votingPower: v.votingPower.toString(),
      })),
      count: votes.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /disputes/:disputeId/voting/close
 * Close voting on a dispute
 */
router.post("/:disputeId/voting/close", async (req: Request, res: Response) => {
  try {
    const { disputeId } = req.params;
    const tally = await disputeService.closeVoting(disputeId);

    res.json({
      success: true,
      data: {
        ...tally,
        totalVotingPower: tally.totalVotingPower.toString(),
        release: tally.release.toString(),
        refund: tally.refund.toString(),
        partial: tally.partial.toString(),
        abstain: tally.abstain.toString(),
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /disputes/:disputeId/resolve
 * Resolve a dispute (admin/council)
 */
router.post("/:disputeId/resolve", async (req: Request, res: Response) => {
  try {
    const { disputeId } = req.params;
    const parsed = ResolveDisputeSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid resolution data",
        details: parsed.error.errors,
      });
      return;
    }

    // Validate percentages sum to 100
    if (parsed.data.releasePercent + parsed.data.refundPercent !== 100) {
      res.status(400).json({
        success: false,
        error: "releasePercent + refundPercent must equal 100",
      });
      return;
    }

    // Determine tier based on who is resolving (could check admin status)
    const decidedBy = req.headers["x-resolution-tier"] as string || "council";

    const dispute = await disputeService.resolve(disputeId, {
      outcome: parsed.data.outcome,
      releasePercent: parsed.data.releasePercent,
      refundPercent: parsed.data.refundPercent,
      decidedBy: decidedBy as any,
      rationale: parsed.data.rationale,
      evidenceIds: parsed.data.evidenceIds || [],
    });

    res.json({
      success: true,
      data: {
        ...dispute,
        totalEscrowedAmount: dispute.totalEscrowedAmount.toString(),
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /disputes/:disputeId/appeal
 * Appeal a dispute resolution
 */
router.post("/:disputeId/appeal", async (req: Request, res: Response) => {
  try {
    const { disputeId } = req.params;
    const parsed = AppealSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid appeal data",
        details: parsed.error.errors,
      });
      return;
    }

    await disputeService.appeal(disputeId, parsed.data.appealedBy, parsed.data.reason);

    const dispute = disputeService.getDispute(disputeId);

    res.json({
      success: true,
      data: {
        ...dispute,
        totalEscrowedAmount: dispute?.totalEscrowedAmount.toString(),
      },
      message: "Appeal submitted and dispute escalated",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /disputes/:disputeId/escalate
 * Manually escalate a dispute
 */
router.post("/:disputeId/escalate", async (req: Request, res: Response) => {
  try {
    const { disputeId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      res.status(400).json({
        success: false,
        error: "Escalation reason required",
      });
      return;
    }

    await disputeService.escalate(disputeId, reason);

    const dispute = disputeService.getDispute(disputeId);

    res.json({
      success: true,
      data: {
        disputeId,
        currentTier: dispute?.currentTier,
        status: dispute?.status,
      },
      message: `Dispute escalated to ${dispute?.currentTier}`,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /disputes/:disputeId/close
 * Close a dispute
 */
router.post("/:disputeId/close", async (req: Request, res: Response) => {
  try {
    const { disputeId } = req.params;
    const closedBy = req.headers["x-wallet-address"] as string || req.body.closedBy || "system";

    await disputeService.close(disputeId, closedBy);

    res.json({
      success: true,
      message: "Dispute closed",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /disputes/process-timeouts
 * Process timeout escalations (called by scheduler)
 */
router.post("/process-timeouts", async (_req: Request, res: Response) => {
  try {
    const escalatedIds = await disputeService.processTimeouts();

    res.json({
      success: true,
      data: {
        escalatedCount: escalatedIds.length,
        escalatedIds,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
