/**
 * Phase 10: Advanced Campaigns API Routes
 *
 * Recurring campaigns, stretch goals, scheduling, and series. Changes are
 * limited to the campaign's creator (or the owner of the recurring campaign
 * or series) and admins.
 */

import { Router, Request, Response } from "express";
import { advancedCampaignService } from "../../campaigns-advanced";
import { getStore } from "../../database";
import {
  asyncHandler,
  authMiddleware,
  hasRole,
  requireRole,
  sameAddress,
} from "../../security/middleware";

const router = Router();

function failure(res: Response, error: unknown, fallback: string, status = 400) {
  const message = error instanceof Error ? error.message : fallback;
  res.status(/not found$/i.test(message) ? 404 : status).json({ error: message });
}

function isOwnerOrAdmin(req: Request, owner: string): boolean {
  return sameAddress(owner, req.auth?.address) || hasRole(req, "admin");
}

/**
 * Sends 404/403 and returns false unless the caller created the campaign
 */
async function ownsCampaign(req: Request, res: Response, campaignId: unknown): Promise<boolean> {
  if (typeof campaignId !== "string" || !campaignId) {
    res.status(400).json({ error: "campaignId is required" });
    return false;
  }
  const campaign = await getStore().getCampaign(campaignId);
  if (!campaign) {
    res.status(404).json({ error: `Campaign ${campaignId} not found` });
    return false;
  }
  if (!isOwnerOrAdmin(req, campaign.creator)) {
    res.status(403).json({ error: "Only the campaign creator can do this" });
    return false;
  }
  return true;
}

// ============================================================================
// RECURRING CAMPAIGNS
// ============================================================================

/**
 * Sends 404/403 and returns null unless the caller owns the recurring campaign
 */
function ownedRecurring(req: Request, res: Response) {
  const recurring = advancedCampaignService.getRecurringCampaign(req.params.id);
  if (!recurring) {
    res.status(404).json({ error: "Recurring campaign not found" });
    return null;
  }
  if (!isOwnerOrAdmin(req, recurring.ownerAddress)) {
    res.status(403).json({ error: "Only the owner can change this recurring campaign" });
    return null;
  }
  return recurring;
}

/**
 * POST /campaigns/advanced/recurring
 * Create a recurring campaign from one of the caller's campaigns
 */
router.post("/recurring", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  if (!(await ownsCampaign(req, res, req.body?.templateCampaignId))) return;

  try {
    const recurring = await advancedCampaignService.createRecurringCampaign({
      ...req.body,
      ownerAddress: req.auth!.address,
    });
    res.status(201).json(recurring);
  } catch (error) {
    failure(res, error, "Failed to create recurring campaign");
  }
}));

/**
 * GET /campaigns/advanced/recurring
 * List recurring campaigns
 */
router.get("/recurring", (req: Request, res: Response) => {
  const { address } = req.query;
  const campaigns = advancedCampaignService.listRecurringCampaigns(
    address as string || ""
  );
  res.json({ campaigns });
});

/**
 * GET /campaigns/advanced/recurring/:id
 * Get recurring campaign details
 */
router.get("/recurring/:id", (req: Request, res: Response) => {
  const recurring = advancedCampaignService.getRecurringCampaign(req.params.id);

  if (!recurring) {
    return res.status(404).json({ error: "Recurring campaign not found" });
  }

  res.json(recurring);
});

/**
 * PUT /campaigns/advanced/recurring/:id
 * Update recurring campaign settings
 */
router.put("/recurring/:id", authMiddleware(), (req: Request, res: Response) => {
  if (!ownedRecurring(req, res)) return;
  try {
    res.json(advancedCampaignService.updateRecurringCampaign(req.params.id, req.body));
  } catch (error) {
    failure(res, error, "Failed to update recurring campaign");
  }
});

/**
 * POST /campaigns/advanced/recurring/:id/pause
 * Pause recurring campaign
 */
router.post("/recurring/:id/pause", authMiddleware(), (req: Request, res: Response) => {
  if (!ownedRecurring(req, res)) return;
  try {
    res.json(advancedCampaignService.pauseRecurringCampaign(req.params.id));
  } catch (error) {
    failure(res, error, "Failed to pause recurring campaign");
  }
});

/**
 * POST /campaigns/advanced/recurring/:id/resume
 * Resume recurring campaign
 */
router.post("/recurring/:id/resume", authMiddleware(), (req: Request, res: Response) => {
  if (!ownedRecurring(req, res)) return;
  try {
    res.json(advancedCampaignService.resumeRecurringCampaign(req.params.id));
  } catch (error) {
    failure(res, error, "Failed to resume recurring campaign");
  }
});

/**
 * POST /campaigns/advanced/recurring/:id/cancel
 * Cancel recurring campaign
 */
router.post("/recurring/:id/cancel", authMiddleware(), (req: Request, res: Response) => {
  if (!ownedRecurring(req, res)) return;
  try {
    res.json(advancedCampaignService.cancelRecurringCampaign(req.params.id));
  } catch (error) {
    failure(res, error, "Failed to cancel recurring campaign");
  }
});

/**
 * POST /campaigns/advanced/recurring/:id/instance
 * Create the next instance: a new campaign copied from the template
 */
router.post("/recurring/:id/instance", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  if (!ownedRecurring(req, res)) return;
  try {
    res.status(201).json(await advancedCampaignService.createNextInstance(req.params.id));
  } catch (error) {
    failure(res, error, "Failed to create instance");
  }
}));

// ============================================================================
// STRETCH GOALS
// ============================================================================

/**
 * Sends 404/403 and returns null unless the caller created the goal's campaign
 */
async function ownedGoal(req: Request, res: Response) {
  const goal = advancedCampaignService.getStretchGoal(req.params.goalId);
  if (!goal) {
    res.status(404).json({ error: "Stretch goal not found" });
    return null;
  }
  return (await ownsCampaign(req, res, goal.campaignId)) ? goal : null;
}

/**
 * POST /campaigns/advanced/:campaignId/stretch-goals
 * Add a stretch goal
 */
router.post("/:campaignId/stretch-goals", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  if (!(await ownsCampaign(req, res, req.params.campaignId))) return;
  try {
    res.status(201).json(advancedCampaignService.addStretchGoal(req.params.campaignId, req.body));
  } catch (error) {
    failure(res, error, "Failed to add stretch goal");
  }
}));

/**
 * GET /campaigns/advanced/:campaignId/stretch-goals
 * Get stretch goals
 */
router.get("/:campaignId/stretch-goals", (req: Request, res: Response) => {
  const goals = advancedCampaignService.getStretchGoals(req.params.campaignId);
  res.json({ goals });
});

/**
 * GET /campaigns/advanced/:campaignId/stretch-goals/progress
 * Get stretch goal progress from the campaign's pledges
 */
router.get("/:campaignId/stretch-goals/progress", asyncHandler(async (req: Request, res: Response) => {
  try {
    res.json(await advancedCampaignService.checkStretchGoalProgress(req.params.campaignId));
  } catch (error) {
    failure(res, error, "Failed to check stretch goals");
  }
}));

/**
 * PUT /campaigns/advanced/stretch-goals/:goalId
 * Update stretch goal (status is derived from progress, not set)
 */
router.put("/stretch-goals/:goalId", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  if (!(await ownedGoal(req, res))) return;
  const { name, description, threshold, reward, order } = req.body ?? {};
  const updates = Object.fromEntries(
    Object.entries({ name, description, threshold, reward, order }).filter(([, v]) => v !== undefined)
  );
  try {
    res.json(advancedCampaignService.updateStretchGoal(req.params.goalId, updates));
  } catch (error) {
    failure(res, error, "Failed to update stretch goal");
  }
}));

/**
 * DELETE /campaigns/advanced/stretch-goals/:goalId
 * Remove stretch goal
 */
router.delete("/stretch-goals/:goalId", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  if (!(await ownedGoal(req, res))) return;
  advancedCampaignService.removeStretchGoal(req.params.goalId);
  res.json({ success: true });
}));

// ============================================================================
// SCHEDULING
// ============================================================================

/**
 * POST /campaigns/advanced/:campaignId/schedule/launch
 * Schedule a draft campaign's launch
 */
router.post("/:campaignId/schedule/launch", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  if (!(await ownsCampaign(req, res, req.params.campaignId))) return;
  try {
    const { launchDate, settings } = req.body;
    res.status(201).json(advancedCampaignService.scheduleLaunch(req.params.campaignId, launchDate, settings));
  } catch (error) {
    failure(res, error, "Failed to schedule launch");
  }
}));

/**
 * POST /campaigns/advanced/:campaignId/schedule/action
 * Schedule an action (launch, close, notify or milestone_check)
 */
router.post("/:campaignId/schedule/action", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  if (!(await ownsCampaign(req, res, req.params.campaignId))) return;
  try {
    const { type, scheduledFor, params } = req.body;
    const action = advancedCampaignService.scheduleAction(req.params.campaignId, {
      campaignId: req.params.campaignId,
      type,
      scheduledFor,
      params,
      createdBy: req.auth!.address,
    });
    res.status(201).json(action);
  } catch (error) {
    failure(res, error, "Failed to schedule action");
  }
}));

/**
 * GET /campaigns/advanced/:campaignId/schedule
 * Get scheduled actions
 */
router.get("/:campaignId/schedule", (req: Request, res: Response) => {
  const actions = advancedCampaignService.getScheduledActions(
    req.params.campaignId
  );
  res.json({ actions });
});

/**
 * DELETE /campaigns/advanced/schedule/:actionId
 * Cancel scheduled action
 */
router.delete("/schedule/:actionId", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  const action = advancedCampaignService.getScheduledAction(req.params.actionId);
  if (!action) {
    return res.status(404).json({ error: "Scheduled action not found" });
  }
  if (!(await ownsCampaign(req, res, action.campaignId))) return;

  if (advancedCampaignService.cancelScheduledAction(req.params.actionId)) {
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "Cannot cancel action" });
  }
}));

/**
 * POST /campaigns/advanced/schedule/process
 * Run due scheduled actions now (they also run periodically)
 */
router.post("/schedule/process", authMiddleware(), requireRole("admin"), asyncHandler(async (_req: Request, res: Response) => {
  const processed = await advancedCampaignService.processScheduledActions();
  res.json({
    processed: processed.length,
    actions: processed,
  });
}));

// ============================================================================
// SERIES
// ============================================================================

/**
 * Sends 404/403 and returns null unless the caller owns the series
 */
function ownedSeries(req: Request, res: Response) {
  const series = advancedCampaignService.getSeries(req.params.seriesId);
  if (!series) {
    res.status(404).json({ error: "Series not found" });
    return null;
  }
  if (!isOwnerOrAdmin(req, series.ownerAddress)) {
    res.status(403).json({ error: "Only the owner can change this series" });
    return null;
  }
  return series;
}

/**
 * POST /campaigns/advanced/series
 * Create a campaign series
 */
router.post("/series", authMiddleware(), (req: Request, res: Response) => {
  try {
    const series = advancedCampaignService.createSeries({ ...req.body, ownerAddress: req.auth!.address });
    res.status(201).json(series);
  } catch (error) {
    failure(res, error, "Failed to create series");
  }
});

/**
 * GET /campaigns/advanced/series/:seriesId
 * Get series details with current totals
 */
router.get("/series/:seriesId", asyncHandler(async (req: Request, res: Response) => {
  const series = await advancedCampaignService.getSeriesWithTotals(req.params.seriesId);

  if (!series) {
    return res.status(404).json({ error: "Series not found" });
  }

  res.json(series);
}));

/**
 * POST /campaigns/advanced/series/:seriesId/campaigns
 * Add one of the caller's campaigns to their series
 */
router.post("/series/:seriesId/campaigns", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  if (!ownedSeries(req, res)) return;
  const { campaignId, relationship } = req.body;
  if (!(await ownsCampaign(req, res, campaignId))) return;

  try {
    res.json(await advancedCampaignService.addCampaignToSeries(req.params.seriesId, campaignId, relationship));
  } catch (error) {
    failure(res, error, "Failed to add campaign to series");
  }
}));

/**
 * DELETE /campaigns/advanced/series/:seriesId/campaigns/:campaignId
 * Remove campaign from series
 */
router.delete("/series/:seriesId/campaigns/:campaignId", authMiddleware(), (req: Request, res: Response) => {
  if (!ownedSeries(req, res)) return;
  try {
    res.json(advancedCampaignService.removeCampaignFromSeries(req.params.seriesId, req.params.campaignId));
  } catch (error) {
    failure(res, error, "Failed to remove campaign from series");
  }
});

/**
 * GET /campaigns/advanced/:campaignId/series
 * Get series for a campaign
 */
router.get("/:campaignId/series", (req: Request, res: Response) => {
  const series = advancedCampaignService.getSeriesForCampaign(
    req.params.campaignId
  );

  if (!series) {
    return res.json({ series: null });
  }

  res.json({ series });
});

// ============================================================================
// MILESTONE SCHEDULING
// ============================================================================

/**
 * POST /campaigns/advanced/milestones/:milestoneId/schedule
 * Schedule a check of one of the caller's campaign milestones
 * Body: { campaignId, scheduledDate, autoVerify? }
 */
router.post("/milestones/:milestoneId/schedule", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  const { campaignId, scheduledDate, autoVerify } = req.body ?? {};
  if (!(await ownsCampaign(req, res, campaignId))) return;

  try {
    const schedule = await advancedCampaignService.scheduleMilestoneVerification(
      campaignId,
      req.params.milestoneId,
      scheduledDate,
      autoVerify === true
    );
    res.status(201).json(schedule);
  } catch (error) {
    failure(res, error, "Failed to schedule milestone");
  }
}));

/**
 * POST /campaigns/advanced/milestones/:milestoneId/reminder
 * Add milestone reminder
 */
router.post("/milestones/:milestoneId/reminder", authMiddleware(), asyncHandler(async (req: Request, res: Response) => {
  if (!(await ownsCampaign(req, res, req.body?.campaignId))) return;
  try {
    res.status(201).json(advancedCampaignService.addMilestoneReminder(req.params.milestoneId, req.body));
  } catch (error) {
    failure(res, error, "Failed to add reminder");
  }
}));

// ============================================================================
// PREDICTIONS
// ============================================================================

/**
 * GET /campaigns/advanced/:campaignId/prediction
 * Project the campaign's funding from its pledges so far
 */
router.get("/:campaignId/prediction", asyncHandler(async (req: Request, res: Response) => {
  try {
    res.json(await advancedCampaignService.getPrediction(req.params.campaignId));
  } catch (error) {
    failure(res, error, "Failed to build prediction");
  }
}));

/**
 * GET /campaigns/advanced/:campaignId/velocity
 * Get funding velocity (?period=hour|day|week)
 */
router.get("/:campaignId/velocity", asyncHandler(async (req: Request, res: Response) => {
  const period = (req.query.period as string) || "day";
  if (period !== "hour" && period !== "day" && period !== "week") {
    return res.status(400).json({ error: "period must be hour, day or week" });
  }

  try {
    res.json(await advancedCampaignService.getFundingVelocity(req.params.campaignId, period));
  } catch (error) {
    failure(res, error, "Failed to compute velocity");
  }
}));

export default router;
