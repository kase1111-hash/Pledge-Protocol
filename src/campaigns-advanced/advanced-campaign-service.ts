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
  AdvancedCampaignServiceInterface,
} from "./types";
import { formatEther } from "ethers";
import { Campaign, getStore, Milestone, Pledge } from "../database";
import { oracleRouter } from "../oracle";
import { notificationService } from "../notifications";

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

/** Scheduled actions the service can carry out */
export const SUPPORTED_ACTIONS: ScheduledActionType[] = ["launch", "close", "notify", "milestone_check"];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Percentage of target reached, capped at 100 */
function percentOf(current: bigint, target: bigint): number {
  if (target <= 0n) return 100;
  return Math.min(100, Number((current * 10000n) / target) / 100);
}

async function storedCampaign(campaignId: string): Promise<Campaign> {
  const campaign = await getStore().getCampaign(campaignId);
  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }
  return campaign;
}

/** Pledges that count towards a campaign's funding */
async function countedPledges(campaignId: string): Promise<Pledge[]> {
  const { items } = await getStore().listPledges({ campaignId });
  return items.filter((p) => p.status !== "cancelled");
}

function distinctBackers(pledges: Pledge[]): number {
  return new Set(pledges.map((p) => p.backer.toLowerCase())).size;
}

function sumEscrowed(pledges: Pledge[]): bigint {
  return pledges.reduce((sum, p) => sum + BigInt(p.escrowedAmount), 0n);
}

// ============================================================================
// ADVANCED CAMPAIGN SERVICE
// ============================================================================

export class AdvancedCampaignService implements AdvancedCampaignServiceInterface {
  private recurringCampaigns: Map<string, RecurringCampaign> = new Map();
  private stretchGoals: Map<string, StretchGoal> = new Map();
  private scheduledActions: Map<string, ScheduledAction> = new Map();
  private campaignSeries: Map<string, CampaignSeries> = new Map();
  private milestoneSchedules: Map<string, MilestoneSchedule> = new Map();
  private milestoneReminders: Map<string, MilestoneReminder> = new Map();

  // ==========================================================================
  // RECURRING CAMPAIGNS
  // ==========================================================================

  async createRecurringCampaign(params: CreateRecurringCampaignParams): Promise<RecurringCampaign> {
    // Instances are copies of the template campaign
    await storedCampaign(params.templateCampaignId);

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
      await this.createNextInstance(recurring.id);
      recurring.status = "active";
    }

    return recurring;
  }

  getRecurringCampaign(id: string): RecurringCampaign | null {
    return this.recurringCampaigns.get(id) || null;
  }

  listRecurringCampaigns(ownerAddress: string): RecurringCampaign[] {
    return Array.from(this.recurringCampaigns.values()).filter(
      (r) => r.ownerAddress.toLowerCase() === ownerAddress.toLowerCase()
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

  async createNextInstance(id: string): Promise<RecurringInstance> {
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

    const campaignId = await this.createInstanceCampaign(recurring, instanceNumber, startDate, endDate);

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

  /**
   * Store a new campaign copied from the template, with its pledge window
   * moved to the instance's dates. A future instance is stored as a draft
   * with a scheduled launch.
   */
  private async createInstanceCampaign(
    recurring: RecurringCampaign,
    instanceNumber: number,
    startDate: number,
    endDate: number
  ): Promise<string> {
    const template = await storedCampaign(recurring.templateCampaignId);
    const start = Math.floor(startDate / 1000);
    const end = Math.floor(endDate / 1000);
    const shift = end - template.pledgeWindowEnd;
    const timestamp = nowSeconds();

    const campaign: Campaign = {
      ...template,
      id: `campaign_${recurring.id.replace(/^rec_/, "")}_${instanceNumber}`,
      chainId: null,
      name: `${recurring.name} #${instanceNumber}`,
      creator: recurring.ownerAddress,
      pledgeWindowStart: start,
      pledgeWindowEnd: end,
      eventDate: template.eventDate === null ? null : template.eventDate + shift,
      resolutionDeadline: template.resolutionDeadline + shift,
      milestones: template.milestones.map((m) => ({
        ...m,
        status: "pending",
        verifiedAt: null,
        oracleData: null,
      })),
      status: startDate <= Date.now() ? "active" : "draft",
      totalEscrowed: "0",
      totalReleased: "0",
      totalRefunded: "0",
      pledgeCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      resolvedAt: null,
    };
    await getStore().saveCampaign(campaign);

    if (campaign.status === "draft") {
      this.scheduleAction(campaign.id, {
        campaignId: campaign.id,
        type: "launch",
        scheduledFor: startDate,
        createdBy: "system",
      });
    }

    return campaign.id;
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
    if (params.type === "amount" || params.type === "backers") {
      if (!/^\d+$/.test(String(params.threshold)) || BigInt(params.threshold) <= 0n) {
        throw new Error(
          params.type === "amount"
            ? "Amount thresholds are positive whole numbers in wei"
            : "Backer thresholds are positive whole numbers"
        );
      }
    }

    const existingGoals = this.getStretchGoals(campaignId);
    const order = params.order ?? existingGoals.length;

    const goal: StretchGoal = {
      id: `sg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      campaignId,
      name: params.name,
      description: params.description,
      type: params.type,
      threshold: String(params.threshold),
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

  getStretchGoal(goalId: string): StretchGoal | null {
    return this.stretchGoals.get(goalId) || null;
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

  async checkStretchGoalProgress(campaignId: string): Promise<StretchGoalProgress> {
    const goals = this.getStretchGoals(campaignId);
    const campaign = await storedCampaign(campaignId);
    const pledges = await countedPledges(campaignId);
    const currentAmount = sumEscrowed(pledges);
    const currentBackers = distinctBackers(pledges);

    // What is left to reach a goal, in the goal's own unit
    const remainingFor = (goal: StretchGoal): string => {
      switch (goal.type) {
        case "amount": {
          const left = BigInt(goal.threshold) - currentAmount;
          return (left > 0n ? left : 0n).toString();
        }
        case "backers":
          return String(Math.max(0, Number(goal.threshold) - currentBackers));
        default:
          return "0";
      }
    };

    const goalProgress = goals.map((goal) => {
      let progress: number;

      switch (goal.type) {
        case "amount":
          progress = percentOf(currentAmount, BigInt(goal.threshold));
          break;
        case "backers":
          progress = percentOf(BigInt(currentBackers), BigInt(goal.threshold));
          break;
        case "milestone": {
          const milestone = campaign.milestones.find((m) => m.id === goal.threshold);
          progress = milestone?.status === "verified" ? 100 : 0;
          break;
        }
        default:
          progress = 0;
      }

      // Update status
      if (progress > 0 && goal.status === "locked") {
        goal.status = "unlocked";
        goal.unlockedAt = Date.now();
      }
      if (progress >= 100 && goal.status === "unlocked") {
        goal.status = "achieved";
        goal.achievedAt = Date.now();
      }
      this.stretchGoals.set(goal.id, goal);

      return {
        id: goal.id,
        name: goal.name,
        threshold: goal.threshold,
        progress,
        status: goal.status,
      };
    });

    // Find next unachieved goal
    const nextIndex = goalProgress.findIndex((g) => g.status !== "achieved");
    let nextGoalInfo: StretchGoalProgress["nextGoal"];

    if (nextIndex >= 0) {
      const nextGoal = goalProgress[nextIndex];
      nextGoalInfo = {
        id: nextGoal.id,
        name: nextGoal.name,
        remaining: remainingFor(goals[nextIndex]),
        progress: nextGoal.progress,
      };
    }

    return {
      campaignId,
      currentAmount: currentAmount.toString(),
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
    if (!SUPPORTED_ACTIONS.includes(action.type)) {
      throw new Error(
        `Scheduled "${action.type}" actions are not supported (supported: ${SUPPORTED_ACTIONS.join(", ")})`
      );
    }
    if (typeof action.scheduledFor !== "number" || !Number.isFinite(action.scheduledFor)) {
      throw new Error("scheduledFor must be a timestamp in milliseconds");
    }

    const scheduled: ScheduledAction = {
      id: `sa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...action,
      campaignId,
      status: "pending",
      createdAt: Date.now(),
    };

    this.scheduledActions.set(scheduled.id, scheduled);
    return scheduled;
  }

  getScheduledAction(actionId: string): ScheduledAction | null {
    return this.scheduledActions.get(actionId) || null;
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

  async processScheduledActions(now: number = Date.now()): Promise<ScheduledAction[]> {
    const dueActions = Array.from(this.scheduledActions.values())
      .filter((a) => a.status === "pending" && a.scheduledFor <= now)
      .sort((a, b) => a.scheduledFor - b.scheduledFor);

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
    switch (action.type) {
      case "launch":
        return this.launchCampaign(action.campaignId);
      case "close":
        return this.closePledging(action.campaignId);
      case "notify":
        return this.sendReminder(action.campaignId, action.params ?? {});
      case "milestone_check":
        await this.checkMilestone(
          action.campaignId,
          String(action.params?.milestoneId),
          action.params?.autoVerify === true
        );
        return;
      default:
        throw new Error(`Scheduled "${action.type}" actions are not supported`);
    }
  }

  /** Draft → active, as POST /campaigns/:id/activate does */
  private async launchCampaign(campaignId: string): Promise<void> {
    await getStore().transaction(async (tx) => {
      const campaign = await tx.getCampaign(campaignId, { forUpdate: true });
      if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
      if (campaign.status !== "draft") throw new Error(`Campaign is ${campaign.status}, not draft`);
      if (nowSeconds() > campaign.pledgeWindowEnd) throw new Error("Pledge window has already ended");
      campaign.status = "active";
      campaign.updatedAt = nowSeconds();
      await tx.saveCampaign(campaign);
    });
  }

  /** Active → pledging closed: no new pledges, resolution unaffected */
  private async closePledging(campaignId: string): Promise<void> {
    await getStore().transaction(async (tx) => {
      const campaign = await tx.getCampaign(campaignId, { forUpdate: true });
      if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
      if (campaign.status !== "active") throw new Error(`Campaign is ${campaign.status}, not active`);
      campaign.status = "pledging_closed";
      campaign.updatedAt = nowSeconds();
      await tx.saveCampaign(campaign);
    });
  }

  /** In-app notification to the campaign's creator and/or backers */
  private async sendReminder(campaignId: string, params: Record<string, unknown>): Promise<void> {
    const campaign = await storedCampaign(campaignId);
    const recipientType = (params.recipientType as MilestoneReminder["recipientType"]) ?? "creator";

    const recipients = new Set<string>();
    if (recipientType === "creator" || recipientType === "both") {
      recipients.add(campaign.creator.toLowerCase());
    }
    if (recipientType === "backers" || recipientType === "both") {
      for (const pledge of await countedPledges(campaignId)) {
        recipients.add(pledge.backer.toLowerCase());
      }
    }

    const hours = typeof params.hoursRemaining === "number" ? params.hoursRemaining : null;
    const message =
      typeof params.message === "string" && params.message
        ? params.message
        : params.notificationType === "launch_reminder" && hours !== null
          ? `${campaign.name} launches in ${hours} hour${hours === 1 ? "" : "s"}`
          : `Reminder for ${campaign.name}`;

    await notificationService.emit({
      type: "campaign_reminder",
      source: "campaigns-advanced",
      campaignId,
      milestoneId: typeof params.milestoneId === "string" ? params.milestoneId : undefined,
      actorType: "system",
      recipients: Array.from(recipients),
      data: { ...params, campaignName: campaign.name },
      summary: message,
      priority: "normal",
    });
  }

  /**
   * Refresh a scheduled milestone from the campaign and, with autoVerify,
   * check a pending milestone against its (non-attestation) oracle
   */
  private async checkMilestone(
    campaignId: string,
    milestoneId: string,
    autoVerify: boolean
  ): Promise<Milestone["status"]> {
    const campaign = await storedCampaign(campaignId);
    const milestone = campaign.milestones.find((m) => m.id === milestoneId);
    if (!milestone) throw new Error(`Milestone ${milestoneId} not found`);

    let status = milestone.status;
    const oracle = await getStore().getOracle(milestone.oracleId);
    const checkable =
      autoVerify &&
      status === "pending" &&
      oracle?.type !== "attestation" &&
      (campaign.status === "active" || campaign.status === "pledging_closed");

    if (checkable) {
      const result = await oracleRouter.verifyMilestone(
        milestone.oracleId,
        campaign.id,
        milestone.id,
        milestone.condition,
        milestone.oracleParams
      );
      if (result.verified) {
        await getStore().transaction(async (tx) => {
          const current = await tx.getCampaign(campaign.id, { forUpdate: true });
          const target = current?.milestones.find((m) => m.id === milestone.id);
          if (!current || !target || target.status !== "pending") return;
          target.status = "verified";
          target.verifiedAt = nowSeconds();
          target.oracleData = result.oracleData;
          current.updatedAt = nowSeconds();
          await tx.saveCampaign(current);
        });
        status = "verified";
      } else if (result.error) {
        throw new Error(`Oracle check failed: ${result.error}`);
      }
    }

    const schedule = this.milestoneSchedules.get(scheduleKey(campaignId, milestoneId));
    if (schedule) {
      schedule.status = status === "verified" ? "verified" : status === "failed" ? "failed" : "pending";
      this.milestoneSchedules.set(scheduleKey(campaignId, milestoneId), schedule);
    }
    return status;
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

  /**
   * A series with its campaigns' names, statuses and totals read from the
   * store
   */
  async getSeriesWithTotals(id: string): Promise<CampaignSeries | null> {
    const series = this.campaignSeries.get(id);
    if (!series) return null;

    let totalRaised = 0n;
    const backers = new Set<string>();
    for (const entry of series.campaigns) {
      const campaign = await getStore().getCampaign(entry.campaignId);
      if (!campaign) continue;
      entry.name = campaign.name;
      entry.status = campaign.status;
      const pledges = await countedPledges(campaign.id);
      totalRaised += sumEscrowed(pledges);
      pledges.forEach((p) => backers.add(p.backer.toLowerCase()));
    }

    series.metadata.totalRaised = totalRaised.toString();
    series.metadata.totalBackers = backers.size;
    series.metadata.averagePerCampaign =
      series.campaigns.length > 0 ? (totalRaised / BigInt(series.campaigns.length)).toString() : "0";
    this.campaignSeries.set(id, series);
    return series;
  }

  async addCampaignToSeries(
    seriesId: string,
    campaignId: string,
    relationship: SeriesCampaign["relationship"]
  ): Promise<CampaignSeries> {
    const series = this.campaignSeries.get(seriesId);
    if (!series) {
      throw new Error("Series not found");
    }

    // Check if campaign already in series
    if (series.campaigns.some((c) => c.campaignId === campaignId)) {
      throw new Error("Campaign already in series");
    }

    const campaign = await storedCampaign(campaignId);
    const seriesCampaign: SeriesCampaign = {
      campaignId,
      name: campaign.name,
      order: series.campaigns.length,
      status: campaign.status,
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

  async scheduleMilestoneVerification(
    campaignId: string,
    milestoneId: string,
    scheduledDate: number,
    autoVerify: boolean = false
  ): Promise<MilestoneSchedule> {
    const campaign = await storedCampaign(campaignId);
    const milestone = campaign.milestones.find((m) => m.id === milestoneId);
    if (!milestone) {
      throw new Error(`Milestone ${milestoneId} not found in campaign ${campaignId}`);
    }

    const schedule: MilestoneSchedule = {
      milestoneId,
      campaignId,
      name: milestone.name,
      scheduledVerification: scheduledDate,
      remindersSent: [],
      autoVerify,
      status: "scheduled",
    };

    this.milestoneSchedules.set(scheduleKey(campaignId, milestoneId), schedule);

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


  // ==========================================================================
  // PREDICTIONS
  // ==========================================================================

  /**
   * Linear projection of a campaign's funding from its pledges so far.
   * Campaigns have no funding goal, so fundingProbability is null.
   */
  async getPrediction(campaignId: string): Promise<CampaignPrediction> {
    const campaign = await storedCampaign(campaignId);
    const pledges = await countedPledges(campaignId);
    const now = Date.now();

    const totalPledged = sumEscrowed(pledges);
    const backers = distinctBackers(pledges);
    const windowStart = campaign.pledgeWindowStart * 1000;
    const windowEnd = campaign.pledgeWindowEnd * 1000;
    const open = campaign.status === "active" && now < windowEnd;

    const elapsedDays = Math.max((Math.min(now, windowEnd) - windowStart) / DAY_MS, 1 / 24);
    const remainingDays = open ? (windowEnd - now) / DAY_MS : 0;

    // Scale by the share of the window still to come, in integer maths
    const scale = BigInt(Math.round((remainingDays / elapsedDays) * 1_000_000));
    const projectedAmount = totalPledged + (totalPledged * scale) / 1_000_000n;
    const projectedBackers = backers + Math.round((backers * remainingDays) / elapsedDays);

    const velocity = await this.getFundingVelocity(campaignId, "day");
    const factors: CampaignPrediction["factors"] = [];
    if (!open) {
      factors.push({ factor: "Pledge window closed: no further pledges expected", impact: "neutral", weight: 1 });
    } else {
      if (velocity.trend !== "steady") {
        factors.push({
          factor: `Daily pledging is ${velocity.trend}`,
          impact: velocity.trend === "accelerating" ? "positive" : "negative",
          weight: 0.5,
        });
      }
      if (pledges.length < 5) {
        factors.push({ factor: "Few pledges so far", impact: "neutral", weight: 0.5 });
      }
    }

    // More pledges and more of the window elapsed → more reliable projection
    const windowElapsed = Math.min(1, elapsedDays / Math.max(elapsedDays + remainingDays, 1 / 24));
    const confidence = open
      ? Math.round(100 * windowElapsed * Math.min(1, pledges.length / 20))
      : 100;

    return {
      campaignId,
      predictedFinalAmount: projectedAmount.toString(),
      confidence,
      predictedBackers: projectedBackers,
      fundingProbability: null,
      projectedEndDate: windowEnd,
      factors,
      generatedAt: now,
    };
  }

  /**
   * Pledged amounts per period, from the campaign's pledges. Velocity is in
   * ETH per hour.
   */
  async getFundingVelocity(campaignId: string, period: FundingVelocity["period"]): Promise<FundingVelocity> {
    await storedCampaign(campaignId);
    const pledges = await countedPledges(campaignId);
    const now = Date.now();

    const { periodMs, pointCount } = {
      hour: { periodMs: HOUR_MS, pointCount: 24 },
      day: { periodMs: DAY_MS, pointCount: 30 },
      week: { periodMs: 7 * DAY_MS, pointCount: 12 },
    }[period];
    const hoursPerPeriod = periodMs / HOUR_MS;
    const windowStart = now - pointCount * periodMs;

    // Pledges before the window count towards the starting cumulative total
    let cumulative = sumEscrowed(pledges.filter((p) => p.createdAt * 1000 <= windowStart));

    const dataPoints: FundingVelocity["dataPoints"] = [];
    let peakVelocity = { value: 0, timestamp: 0 };

    for (let i = pointCount - 1; i >= 0; i--) {
      const timestamp = now - i * periodMs;
      const inPeriod = pledges.filter((p) => {
        const at = p.createdAt * 1000;
        return at > timestamp - periodMs && at <= timestamp;
      });
      const amount = sumEscrowed(inPeriod);
      cumulative += amount;
      const velocity = Number(formatEther(amount)) / hoursPerPeriod;

      if (velocity > peakVelocity.value) {
        peakVelocity = { value: velocity, timestamp };
      }

      dataPoints.push({
        timestamp,
        amount: amount.toString(),
        cumulative: cumulative.toString(),
        backers: distinctBackers(inPeriod),
        velocity,
      });
    }

    const averageVelocity = dataPoints.reduce((sum, d) => sum + d.velocity, 0) / pointCount;
    const recentVelocity = dataPoints.slice(-3).reduce((sum, d) => sum + d.velocity, 0) / 3;

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

function scheduleKey(campaignId: string, milestoneId: string): string {
  return `${campaignId}:${milestoneId}`;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createAdvancedCampaignService(): AdvancedCampaignService {
  return new AdvancedCampaignService();
}

// Default instance
export const advancedCampaignService = new AdvancedCampaignService();
