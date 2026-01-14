/**
 * Phase 10: Advanced Campaigns API Routes
 *
 * Recurring campaigns, stretch goals, scheduling, and series.
 */

import { Router, Request, Response } from "express";
import { advancedCampaignService } from "../../campaigns-advanced";

const router = Router();

// ============================================================================
// RECURRING CAMPAIGNS
// ============================================================================

/**
 * POST /campaigns/advanced/recurring
 * Create a recurring campaign
 */
router.post("/recurring", (req: Request, res: Response) => {
  try {
    const recurring = advancedCampaignService.createRecurringCampaign(req.body);
    res.status(201).json(recurring);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to create recurring campaign",
    });
  }
});

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
router.put("/recurring/:id", (req: Request, res: Response) => {
  try {
    const updated = advancedCampaignService.updateRecurringCampaign(
      req.params.id,
      req.body
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to update recurring campaign",
    });
  }
});

/**
 * POST /campaigns/advanced/recurring/:id/pause
 * Pause recurring campaign
 */
router.post("/recurring/:id/pause", (req: Request, res: Response) => {
  try {
    const paused = advancedCampaignService.pauseRecurringCampaign(req.params.id);
    res.json(paused);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to pause recurring campaign",
    });
  }
});

/**
 * POST /campaigns/advanced/recurring/:id/resume
 * Resume recurring campaign
 */
router.post("/recurring/:id/resume", (req: Request, res: Response) => {
  try {
    const resumed = advancedCampaignService.resumeRecurringCampaign(req.params.id);
    res.json(resumed);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to resume recurring campaign",
    });
  }
});

/**
 * POST /campaigns/advanced/recurring/:id/cancel
 * Cancel recurring campaign
 */
router.post("/recurring/:id/cancel", (req: Request, res: Response) => {
  try {
    const cancelled = advancedCampaignService.cancelRecurringCampaign(req.params.id);
    res.json(cancelled);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to cancel recurring campaign",
    });
  }
});

/**
 * POST /campaigns/advanced/recurring/:id/instance
 * Create next instance
 */
router.post("/recurring/:id/instance", (req: Request, res: Response) => {
  try {
    const instance = advancedCampaignService.createNextInstance(req.params.id);
    res.status(201).json(instance);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to create instance",
    });
  }
});

// ============================================================================
// STRETCH GOALS
// ============================================================================

/**
 * POST /campaigns/advanced/:campaignId/stretch-goals
 * Add a stretch goal
 */
router.post("/:campaignId/stretch-goals", (req: Request, res: Response) => {
  try {
    const goal = advancedCampaignService.addStretchGoal(
      req.params.campaignId,
      req.body
    );
    res.status(201).json(goal);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to add stretch goal",
    });
  }
});

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
 * Get stretch goal progress
 */
router.get("/:campaignId/stretch-goals/progress", (req: Request, res: Response) => {
  const progress = advancedCampaignService.checkStretchGoalProgress(
    req.params.campaignId
  );
  res.json(progress);
});

/**
 * PUT /campaigns/advanced/stretch-goals/:goalId
 * Update stretch goal
 */
router.put("/stretch-goals/:goalId", (req: Request, res: Response) => {
  try {
    const updated = advancedCampaignService.updateStretchGoal(
      req.params.goalId,
      req.body
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to update stretch goal",
    });
  }
});

/**
 * DELETE /campaigns/advanced/stretch-goals/:goalId
 * Remove stretch goal
 */
router.delete("/stretch-goals/:goalId", (req: Request, res: Response) => {
  const success = advancedCampaignService.removeStretchGoal(req.params.goalId);

  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Stretch goal not found" });
  }
});

// ============================================================================
// SCHEDULING
// ============================================================================

/**
 * POST /campaigns/advanced/:campaignId/schedule/launch
 * Schedule campaign launch
 */
router.post("/:campaignId/schedule/launch", (req: Request, res: Response) => {
  try {
    const { launchDate, settings } = req.body;

    const schedule = advancedCampaignService.scheduleLaunch(
      req.params.campaignId,
      launchDate,
      settings
    );
    res.status(201).json(schedule);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to schedule launch",
    });
  }
});

/**
 * POST /campaigns/advanced/:campaignId/schedule/action
 * Schedule an action
 */
router.post("/:campaignId/schedule/action", (req: Request, res: Response) => {
  try {
    const { type, scheduledFor, params, createdBy } = req.body;

    const action = advancedCampaignService.scheduleAction(req.params.campaignId, {
      campaignId: req.params.campaignId,
      type,
      scheduledFor,
      params,
      createdBy: createdBy || "user",
    });
    res.status(201).json(action);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to schedule action",
    });
  }
});

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
router.delete("/schedule/:actionId", (req: Request, res: Response) => {
  const success = advancedCampaignService.cancelScheduledAction(
    req.params.actionId
  );

  if (success) {
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "Cannot cancel action" });
  }
});

/**
 * POST /campaigns/advanced/schedule/process
 * Process due scheduled actions (admin)
 */
router.post("/schedule/process", async (_req: Request, res: Response) => {
  try {
    const processed = await advancedCampaignService.processScheduledActions();
    res.json({
      processed: processed.length,
      actions: processed,
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to process actions",
    });
  }
});

// ============================================================================
// SERIES
// ============================================================================

/**
 * POST /campaigns/advanced/series
 * Create a campaign series
 */
router.post("/series", (req: Request, res: Response) => {
  try {
    const series = advancedCampaignService.createSeries(req.body);
    res.status(201).json(series);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to create series",
    });
  }
});

/**
 * GET /campaigns/advanced/series/:seriesId
 * Get series details
 */
router.get("/series/:seriesId", (req: Request, res: Response) => {
  const series = advancedCampaignService.getSeries(req.params.seriesId);

  if (!series) {
    return res.status(404).json({ error: "Series not found" });
  }

  res.json(series);
});

/**
 * POST /campaigns/advanced/series/:seriesId/campaigns
 * Add campaign to series
 */
router.post("/series/:seriesId/campaigns", (req: Request, res: Response) => {
  try {
    const { campaignId, relationship } = req.body;

    const updated = advancedCampaignService.addCampaignToSeries(
      req.params.seriesId,
      campaignId,
      relationship
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to add campaign to series",
    });
  }
});

/**
 * DELETE /campaigns/advanced/series/:seriesId/campaigns/:campaignId
 * Remove campaign from series
 */
router.delete("/series/:seriesId/campaigns/:campaignId", (req: Request, res: Response) => {
  try {
    const updated = advancedCampaignService.removeCampaignFromSeries(
      req.params.seriesId,
      req.params.campaignId
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to remove campaign from series",
    });
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
 * Schedule milestone verification
 */
router.post("/milestones/:milestoneId/schedule", (req: Request, res: Response) => {
  try {
    const { scheduledDate, autoVerify } = req.body;

    const schedule = advancedCampaignService.scheduleMilestoneVerification(
      req.params.milestoneId,
      scheduledDate,
      autoVerify
    );
    res.status(201).json(schedule);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to schedule milestone",
    });
  }
});

/**
 * POST /campaigns/advanced/milestones/:milestoneId/reminder
 * Add milestone reminder
 */
router.post("/milestones/:milestoneId/reminder", (req: Request, res: Response) => {
  try {
    const reminder = advancedCampaignService.addMilestoneReminder(
      req.params.milestoneId,
      req.body
    );
    res.status(201).json(reminder);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to add reminder",
    });
  }
});

// ============================================================================
// PREDICTIONS
// ============================================================================

/**
 * GET /campaigns/advanced/:campaignId/prediction
 * Get funding prediction
 */
router.get("/:campaignId/prediction", (req: Request, res: Response) => {
  const prediction = advancedCampaignService.getPrediction(req.params.campaignId);
  res.json(prediction);
});

/**
 * GET /campaigns/advanced/:campaignId/velocity
 * Get funding velocity
 */
router.get("/:campaignId/velocity", (req: Request, res: Response) => {
  const { period = "day" } = req.query;

  const velocity = advancedCampaignService.getFundingVelocity(
    req.params.campaignId,
    period as any
  );
  res.json(velocity);
});

export default router;
