/**
 * Phase 10: Advanced Campaign Service
 *
 * Recurring campaigns, stretch goals, scheduling, and series.
 */

import {
  RecurrenceFrequency,
  RecurringCampaignStatus,
  RecurringCampaign,
  RecurrenceSchedule,
  RecurrenceSettings,
  RecurringInstance,
  StretchGoalType,
  StretchGoalStatus,
  StretchGoal,
  StretchGoalReward,
  StretchGoalProgress,
  ScheduledActionType,
  ScheduledActionStatus,
  ScheduledAction,
  LaunchSchedule,
  CampaignSeries,
  SeriesCampaign,
  SeriesSettings,
  MilestoneSchedule,
  MilestoneReminder,
  CampaignPrediction,
  FundingVelocity,
  CreateRecurringCampaignParams,
  CreateStretchGoalParams,
  CreateSeriesParams,
  CreateReminderParams,
} from "./types";

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

const DEFAULT_RECURRENCE_SETTINGS: RecurrenceSettings = {
  autoCreateInstances: true,
  instanceDurationDays: 30,
  carryOverBackers: false,
  accumulativeGoal: false,
  notifyBackersBeforeEnd: 24,
  allowEarlyClose: false,
};

const DEFAULT_SERIES_SETTINGS: SeriesSettings = {
  requireSequentialCompletion: false,
  sharedBackerBenefits: true,
  bundleAvailable: false,
};

// ============================================================================
// ADVANCED CAMPAIGN SERVICE
// ============================================================================

export class AdvancedCampaignService {
  private recurringCampaigns: Map<string, RecurringCampaign> = new Map();
  private stretchGoals: Map<string, StretchGoal> = new Map();
  private scheduledActions: Map<string, ScheduledAction> = new Map();
  private campaignSeries: Map<string, CampaignSeries> = new Map();
  private milestoneSchedules: Map<string, MilestoneSchedule> = new Map();
  private milestoneReminders: Map<string, MilestoneReminder> = new Map();

  // ==========================================================================
  // RECURRING CAMPAIGNS
  // ==========================================================================

  createRecurringCampaign(params: CreateRecurringCampaignParams): RecurringCampaign {
    const recurring: RecurringCampaign = {
      id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      templateCampaignId: params.templateCampaignId,
      ownerAddress: params.ownerAddress,
      name: params.name,
      description: params.description,
      frequency: params.frequency,
      schedule: {
        ...params.schedule,
        timezone: params.schedule.timezone || "UTC",
      },
      settings: {
        ...DEFAULT_RECURRENCE_SETTINGS,
        ...params.settings,
      },
      status: "scheduled",
      instances: [],
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        totalInstancesCreated: 0,
        totalRaised: "0",
      },
    };

    this.recurringCampaigns.set(recurring.id, recurring);

    // Create first instance if auto-create is enabled and start date is now or past
    if (recurring.settings.autoCreateInstances && recurring.schedule.startDate <= Date.now()) {
      this.createNextInstance(recurring.id);
      recurring.status = "active";
    }

    return recurring;
  }

  getRecurringCampaign(id: string): RecurringCampaign | null {
    return this.recurringCampaigns.get(id) || null;
  }

  listRecurringCampaigns(ownerAddress: string): RecurringCampaign[] {
    return Array.from(this.recurringCampaigns.values()).filter(
      (r) => r.ownerAddress === ownerAddress
    );
  }

  updateRecurringCampaign(
    id: string,
    updates: Partial<RecurrenceSettings>
  ): RecurringCampaign {
    const recurring = this.recurringCampaigns.get(id);
    if (!recurring) {
      throw new Error("Recurring campaign not found");
    }

    recurring.settings = { ...recurring.settings, ...updates };
    recurring.metadata.updatedAt = Date.now();

    this.recurringCampaigns.set(id, recurring);
    return recurring;
  }

  pauseRecurringCampaign(id: string): RecurringCampaign {
    const recurring = this.recurringCampaigns.get(id);
    if (!recurring) {
      throw new Error("Recurring campaign not found");
    }

    if (recurring.status !== "active") {
      throw new Error("Can only pause active recurring campaigns");
    }

    recurring.status = "paused";
    recurring.metadata.updatedAt = Date.now();

    this.recurringCampaigns.set(id, recurring);
    return recurring;
  }

  resumeRecurringCampaign(id: string): RecurringCampaign {
    const recurring = this.recurringCampaigns.get(id);
    if (!recurring) {
      throw new Error("Recurring campaign not found");
    }

    if (recurring.status !== "paused") {
      throw new Error("Can only resume paused recurring campaigns");
    }

    recurring.status = "active";
    recurring.metadata.updatedAt = Date.now();

    this.recurringCampaigns.set(id, recurring);
    return recurring;
  }

  cancelRecurringCampaign(id: string): RecurringCampaign {
    const recurring = this.recurringCampaigns.get(id);
    if (!recurring) {
      throw new Error("Recurring campaign not found");
    }

    recurring.status = "cancelled";
    recurring.metadata.updatedAt = Date.now();

    this.recurringCampaigns.set(id, recurring);
    return recurring;
  }

  createNextInstance(id: string): RecurringInstance {
    const recurring = this.recurringCampaigns.get(id);
    if (!recurring) {
      throw new Error("Recurring campaign not found");
    }

    // Check if max instances reached
    if (
      recurring.schedule.maxInstances &&
      recurring.instances.length >= recurring.schedule.maxInstances
    ) {
      recurring.status = "completed";
      throw new Error("Maximum instances reached");
    }

    // Check if end date passed
    if (recurring.schedule.endDate && Date.now() > recurring.schedule.endDate) {
      recurring.status = "completed";
      throw new Error("Recurring campaign has ended");
    }

    const instanceNumber = recurring.instances.length + 1;
    const startDate = this.calculateNextStartDate(recurring);
    const endDate = startDate + recurring.settings.instanceDurationDays * 24 * 60 * 60 * 1000;

    // In production, this would create an actual campaign
    const campaignId = `campaign_${recurring.id}_${instanceNumber}`;

    const instance: RecurringInstance = {
      id: `inst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      recurringCampaignId: id,
      campaignId,
      instanceNumber,
      startDate,
      endDate,
      status: startDate <= Date.now() ? "active" : "scheduled",
      metrics: {
        totalPledged: "0",
        backerCount: 0,
        goalReached: false,
      },
      createdAt: Date.now(),
    };

    recurring.instances.push(instance);
    recurring.metadata.totalInstancesCreated++;
    recurring.metadata.updatedAt = Date.now();

    this.recurringCampaigns.set(id, recurring);
    return instance;
  }

  private calculateNextStartDate(recurring: RecurringCampaign): number {
    const lastInstance = recurring.instances[recurring.instances.length - 1];
    const baseDate = lastInstance
      ? new Date(lastInstance.endDate)
      : new Date(recurring.schedule.startDate);

    switch (recurring.frequency) {
      case "daily":
        baseDate.setDate(baseDate.getDate() + 1);
        break;
      case "weekly":
        baseDate.setDate(baseDate.getDate() + 7);
        break;
      case "biweekly":
        baseDate.setDate(baseDate.getDate() + 14);
        break;
      case "monthly":
        baseDate.setMonth(baseDate.getMonth() + 1);
        if (recurring.schedule.dayOfMonth) {
          baseDate.setDate(recurring.schedule.dayOfMonth);
        }
        break;
      case "quarterly":
        baseDate.setMonth(baseDate.getMonth() + 3);
        break;
      case "yearly":
        baseDate.setFullYear(baseDate.getFullYear() + 1);
        break;
    }

    return baseDate.getTime();
  }

  // ==========================================================================
  // STRETCH GOALS
  // ==========================================================================

  addStretchGoal(campaignId: string, params: CreateStretchGoalParams): StretchGoal {
    const existingGoals = this.getStretchGoals(campaignId);
    const order = params.order ?? existingGoals.length;

    const goal: StretchGoal = {
      id: `sg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      campaignId,
      name: params.name,
      description: params.description,
      type: params.type,
      threshold: params.threshold,
      reward: params.reward,
      status: "locked",
      order,
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };

    this.stretchGoals.set(goal.id, goal);
    return goal;
  }

  getStretchGoals(campaignId: string): StretchGoal[] {
    return Array.from(this.stretchGoals.values())
      .filter((g) => g.campaignId === campaignId)
      .sort((a, b) => a.order - b.order);
  }

  updateStretchGoal(goalId: string, updates: Partial<StretchGoal>): StretchGoal {
    const goal = this.stretchGoals.get(goalId);
    if (!goal) {
      throw new Error("Stretch goal not found");
    }

    const updated: StretchGoal = {
      ...goal,
      ...updates,
      id: goalId, // Prevent ID change
      campaignId: goal.campaignId, // Prevent campaign change
      metadata: {
        ...goal.metadata,
        updatedAt: Date.now(),
      },
    };

    this.stretchGoals.set(goalId, updated);
    return updated;
  }

  removeStretchGoal(goalId: string): boolean {
    return this.stretchGoals.delete(goalId);
  }

  checkStretchGoalProgress(campaignId: string): StretchGoalProgress {
    const goals = this.getStretchGoals(campaignId);

    // In production, fetch actual campaign data
    const currentAmount = "35000"; // Example
    const currentBackers = 150;

    const goalProgress = goals.map((goal) => {
      let progress: number;
      const threshold = parseFloat(goal.threshold);

      switch (goal.type) {
        case "amount":
          progress = (parseFloat(currentAmount) / threshold) * 100;
          break;
        case "backers":
          progress = (currentBackers / threshold) * 100;
          break;
        default:
          progress = 0;
      }

      progress = Math.min(progress, 100);

      // Update status
      if (progress >= 100 && goal.status === "unlocked") {
        goal.status = "achieved";
        goal.achievedAt = Date.now();
        this.stretchGoals.set(goal.id, goal);
      } else if (progress > 0 && goal.status === "locked") {
        goal.status = "unlocked";
        goal.unlockedAt = Date.now();
        this.stretchGoals.set(goal.id, goal);
      }

      return {
        id: goal.id,
        name: goal.name,
        threshold: goal.threshold,
        progress,
        status: goal.status,
      };
    });

    // Find next unachieved goal
    const nextGoal = goalProgress.find((g) => g.status !== "achieved");
    let nextGoalInfo: StretchGoalProgress["nextGoal"];

    if (nextGoal) {
      const remaining =
        nextGoal.progress < 100
          ? parseFloat(nextGoal.threshold) - parseFloat(currentAmount)
          : 0;

      nextGoalInfo = {
        id: nextGoal.id,
        name: nextGoal.name,
        remaining: String(Math.max(0, remaining)),
        progress: nextGoal.progress,
      };
    }

    return {
      campaignId,
      currentAmount,
      currentBackers,
      goals: goalProgress,
      nextGoal: nextGoalInfo,
    };
  }

  // ==========================================================================
  // SCHEDULING
  // ==========================================================================

  scheduleLaunch(
    campaignId: string,
    launchDate: number,
    settings?: LaunchSchedule["prelaunchSettings"]
  ): LaunchSchedule {
    // Create scheduled action for launch
    this.scheduleAction(campaignId, {
      campaignId,
      type: "launch",
      scheduledFor: launchDate,
      createdBy: "system",
    });

    const now = Date.now();
    const diff = launchDate - now;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));

    const defaultSettings: LaunchSchedule["prelaunchSettings"] = {
      allowPrePledges: false,
      showPreview: true,
      notifyFollowers: true,
      reminderHours: [24, 1],
    };

    // Schedule reminder notifications
    const prelaunchSettings = settings || defaultSettings;
    for (const hours of prelaunchSettings.reminderHours) {
      const reminderTime = launchDate - hours * 60 * 60 * 1000;
      if (reminderTime > now) {
        this.scheduleAction(campaignId, {
          campaignId,
          type: "notify",
          scheduledFor: reminderTime,
          params: { notificationType: "launch_reminder", hoursRemaining: hours },
          createdBy: "system",
        });
      }
    }

    return {
      campaignId,
      scheduledLaunch: launchDate,
      countdown: { days, hours, minutes },
      prelaunchSettings,
    };
  }

  scheduleAction(
    campaignId: string,
    action: Omit<ScheduledAction, "id" | "status" | "createdAt">
  ): ScheduledAction {
    const scheduled: ScheduledAction = {
      id: `sa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...action,
      status: "pending",
      createdAt: Date.now(),
    };

    this.scheduledActions.set(scheduled.id, scheduled);
    return scheduled;
  }

  getScheduledActions(campaignId: string): ScheduledAction[] {
    return Array.from(this.scheduledActions.values())
      .filter((a) => a.campaignId === campaignId)
      .sort((a, b) => a.scheduledFor - b.scheduledFor);
  }

  cancelScheduledAction(actionId: string): boolean {
    const action = this.scheduledActions.get(actionId);
    if (!action || action.status !== "pending") {
      return false;
    }

    action.status = "cancelled";
    this.scheduledActions.set(actionId, action);
    return true;
  }

  async processScheduledActions(): Promise<ScheduledAction[]> {
    const now = Date.now();
    const dueActions = Array.from(this.scheduledActions.values()).filter(
      (a) => a.status === "pending" && a.scheduledFor <= now
    );

    const processed: ScheduledAction[] = [];

    for (const action of dueActions) {
      try {
        await this.executeAction(action);
        action.status = "executed";
        action.executedAt = Date.now();
      } catch (error) {
        action.status = "failed";
        action.errorMessage = error instanceof Error ? error.message : "Unknown error";
      }

      this.scheduledActions.set(action.id, action);
      processed.push(action);
    }

    return processed;
  }

  private async executeAction(action: ScheduledAction): Promise<void> {
    // In production, these would trigger actual campaign operations
    switch (action.type) {
      case "launch":
        console.log(`[Scheduler] Launching campaign ${action.campaignId}`);
        break;
      case "pause":
        console.log(`[Scheduler] Pausing campaign ${action.campaignId}`);
        break;
      case "resume":
        console.log(`[Scheduler] Resuming campaign ${action.campaignId}`);
        break;
      case "close":
        console.log(`[Scheduler] Closing campaign ${action.campaignId}`);
        break;
      case "notify":
        console.log(`[Scheduler] Sending notification for ${action.campaignId}:`, action.params);
        break;
      case "milestone_check":
        console.log(`[Scheduler] Checking milestone for ${action.campaignId}`);
        break;
      default:
        console.log(`[Scheduler] Unknown action type: ${action.type}`);
    }
  }

  // ==========================================================================
  // SERIES
  // ==========================================================================

  createSeries(params: CreateSeriesParams): CampaignSeries {
    const series: CampaignSeries = {
      id: `ser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ownerAddress: params.ownerAddress,
      name: params.name,
      description: params.description,
      campaigns: [],
      settings: {
        ...DEFAULT_SERIES_SETTINGS,
        ...params.settings,
      },
      status: "active",
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        totalRaised: "0",
        totalBackers: 0,
        averagePerCampaign: "0",
      },
    };

    this.campaignSeries.set(series.id, series);
    return series;
  }

  getSeries(id: string): CampaignSeries | null {
    return this.campaignSeries.get(id) || null;
  }

  addCampaignToSeries(
    seriesId: string,
    campaignId: string,
    relationship: SeriesCampaign["relationship"]
  ): CampaignSeries {
    const series = this.campaignSeries.get(seriesId);
    if (!series) {
      throw new Error("Series not found");
    }

    // Check if campaign already in series
    if (series.campaigns.some((c) => c.campaignId === campaignId)) {
      throw new Error("Campaign already in series");
    }

    const seriesCampaign: SeriesCampaign = {
      campaignId,
      name: `Campaign ${series.campaigns.length + 1}`, // In production, fetch actual name
      order: series.campaigns.length,
      status: "active",
      relationship,
      addedAt: Date.now(),
    };

    series.campaigns.push(seriesCampaign);
    series.metadata.updatedAt = Date.now();

    this.campaignSeries.set(seriesId, series);
    return series;
  }

  removeCampaignFromSeries(seriesId: string, campaignId: string): CampaignSeries {
    const series = this.campaignSeries.get(seriesId);
    if (!series) {
      throw new Error("Series not found");
    }

    series.campaigns = series.campaigns.filter((c) => c.campaignId !== campaignId);

    // Re-order remaining campaigns
    series.campaigns.forEach((c, i) => {
      c.order = i;
    });

    series.metadata.updatedAt = Date.now();

    this.campaignSeries.set(seriesId, series);
    return series;
  }

  getSeriesForCampaign(campaignId: string): CampaignSeries | null {
    for (const series of this.campaignSeries.values()) {
      if (series.campaigns.some((c) => c.campaignId === campaignId)) {
        return series;
      }
    }
    return null;
  }

  // ==========================================================================
  // MILESTONE SCHEDULING
  // ==========================================================================

  scheduleMilestoneVerification(
    milestoneId: string,
    scheduledDate: number,
    autoVerify: boolean = false
  ): MilestoneSchedule {
    const campaignId = milestoneId.split("_")[1] || "unknown"; // Extract from ID

    const schedule: MilestoneSchedule = {
      milestoneId,
      campaignId,
      name: `Milestone ${milestoneId}`,
      scheduledVerification: scheduledDate,
      remindersSent: [],
      autoVerify,
      status: "scheduled",
    };

    this.milestoneSchedules.set(milestoneId, schedule);

    // Schedule the verification action
    this.scheduleAction(campaignId, {
      campaignId,
      type: "milestone_check",
      scheduledFor: scheduledDate,
      params: { milestoneId, autoVerify },
      createdBy: "system",
    });

    return schedule;
  }

  addMilestoneReminder(
    milestoneId: string,
    params: CreateReminderParams
  ): MilestoneReminder {
    const reminder: MilestoneReminder = {
      id: `rem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      milestoneId,
      campaignId: params.campaignId,
      scheduledFor: params.scheduledFor,
      sent: false,
      recipientType: params.recipientType,
      message: params.message,
    };

    this.milestoneReminders.set(reminder.id, reminder);

    // Schedule notification
    this.scheduleAction(params.campaignId, {
      campaignId: params.campaignId,
      type: "notify",
      scheduledFor: params.scheduledFor,
      params: {
        notificationType: "milestone_reminder",
        milestoneId,
        recipientType: params.recipientType,
        message: params.message,
      },
      createdBy: "system",
    });

    return reminder;
  }

  async processScheduledMilestones(): Promise<MilestoneSchedule[]> {
    const now = Date.now();
    const dueSchedules = Array.from(this.milestoneSchedules.values()).filter(
      (s) => s.status === "scheduled" && s.scheduledVerification <= now
    );

    const processed: MilestoneSchedule[] = [];

    for (const schedule of dueSchedules) {
      schedule.status = "verifying";

      if (schedule.autoVerify && schedule.oracleConfig) {
        // In production, trigger oracle verification
        console.log(`[Milestone] Auto-verifying ${schedule.milestoneId}`);
        schedule.status = "verified";
      }

      this.milestoneSchedules.set(schedule.milestoneId, schedule);
      processed.push(schedule);
    }

    return processed;
  }

  // ==========================================================================
  // PREDICTIONS
  // ==========================================================================

  getPrediction(campaignId: string): CampaignPrediction {
    // In production, this would use ML models based on historical data
    const velocity = this.getFundingVelocity(campaignId, "day");

    // Simple linear projection
    const avgDaily = velocity.averageVelocity * 24; // Per day
    const daysRemaining = 14; // Example
    const projected = parseFloat("25000") + avgDaily * daysRemaining;

    return {
      campaignId,
      predictedFinalAmount: String(Math.round(projected)),
      confidence: 72,
      predictedBackers: 180,
      fundingProbability: 85,
      factors: [
        { factor: "Strong initial velocity", impact: "positive", weight: 0.3 },
        { factor: "Active creator engagement", impact: "positive", weight: 0.2 },
        { factor: "Similar campaigns success rate", impact: "positive", weight: 0.15 },
        { factor: "Approaching weekend", impact: "negative", weight: 0.1 },
        { factor: "Category average", impact: "neutral", weight: 0.25 },
      ],
      generatedAt: Date.now(),
    };
  }

  getFundingVelocity(campaignId: string, period: FundingVelocity["period"]): FundingVelocity {
    // Generate sample data points
    const dataPoints: FundingVelocity["dataPoints"] = [];
    const now = Date.now();

    let periodMs: number;
    let pointCount: number;

    switch (period) {
      case "hour":
        periodMs = 60 * 60 * 1000;
        pointCount = 24;
        break;
      case "day":
        periodMs = 24 * 60 * 60 * 1000;
        pointCount = 30;
        break;
      case "week":
        periodMs = 7 * 24 * 60 * 60 * 1000;
        pointCount = 12;
        break;
    }

    let cumulative = 0;
    let totalVelocity = 0;
    let peakVelocity = { value: 0, timestamp: 0 };

    for (let i = pointCount - 1; i >= 0; i--) {
      const timestamp = now - i * periodMs;
      const amount = Math.floor(Math.random() * 1000) + 200;
      cumulative += amount;
      const velocity = amount / (periodMs / (60 * 60 * 1000)); // Per hour

      totalVelocity += velocity;

      if (velocity > peakVelocity.value) {
        peakVelocity = { value: velocity, timestamp };
      }

      dataPoints.push({
        timestamp,
        amount: String(amount),
        cumulative: String(cumulative),
        backers: Math.floor(Math.random() * 10) + 1,
        velocity,
      });
    }

    const averageVelocity = totalVelocity / pointCount;
    const recentVelocity =
      dataPoints.slice(-3).reduce((sum, d) => sum + d.velocity, 0) / 3;

    let trend: FundingVelocity["trend"];
    if (recentVelocity > averageVelocity * 1.1) {
      trend = "accelerating";
    } else if (recentVelocity < averageVelocity * 0.9) {
      trend = "decelerating";
    } else {
      trend = "steady";
    }

    return {
      campaignId,
      period,
      dataPoints,
      averageVelocity,
      peakVelocity,
      trend,
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createAdvancedCampaignService(): AdvancedCampaignService {
  return new AdvancedCampaignService();
}

// Default instance
export const advancedCampaignService = new AdvancedCampaignService();
