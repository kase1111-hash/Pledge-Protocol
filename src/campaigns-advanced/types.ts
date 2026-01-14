/**
 * Phase 10: Advanced Campaign Types
 *
 * Recurring campaigns, stretch goals, scheduling, and series.
 */

// ============================================================================
// RECURRING CAMPAIGNS
// ============================================================================

export type RecurrenceFrequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export type RecurringCampaignStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export interface RecurringCampaign {
  id: string;
  templateCampaignId: string;
  ownerAddress: string;
  name: string;
  description: string;
  frequency: RecurrenceFrequency;
  schedule: RecurrenceSchedule;
  settings: RecurrenceSettings;
  status: RecurringCampaignStatus;
  instances: RecurringInstance[];
  metadata: {
    createdAt: number;
    updatedAt: number;
    totalInstancesCreated: number;
    totalRaised: string;
  };
}

export interface RecurrenceSchedule {
  startDate: number;
  endDate?: number; // Optional end date
  maxInstances?: number; // Maximum number of instances to create
  timezone: string;
  // For weekly
  dayOfWeek?: number; // 0-6 (Sunday-Saturday)
  // For monthly
  dayOfMonth?: number; // 1-31
  weekOfMonth?: number; // 1-5
  // For yearly
  monthOfYear?: number; // 0-11
}

export interface RecurrenceSettings {
  autoCreateInstances: boolean;
  instanceDurationDays: number;
  carryOverBackers: boolean;
  accumulativeGoal: boolean;
  notifyBackersBeforeEnd: number; // Hours before instance ends
  allowEarlyClose: boolean;
}

export interface RecurringInstance {
  id: string;
  recurringCampaignId: string;
  campaignId: string; // Actual campaign created
  instanceNumber: number;
  startDate: number;
  endDate: number;
  status: "scheduled" | "active" | "completed" | "cancelled";
  metrics: {
    totalPledged: string;
    backerCount: number;
    goalReached: boolean;
  };
  createdAt: number;
}

// ============================================================================
// STRETCH GOALS
// ============================================================================

export type StretchGoalType =
  | "amount" // Reach a funding amount
  | "backers" // Reach a backer count
  | "milestone"; // Complete a milestone

export type StretchGoalStatus =
  | "locked"
  | "unlocked"
  | "achieved"
  | "expired";

export interface StretchGoal {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  type: StretchGoalType;
  threshold: string; // Amount or count as string
  reward: StretchGoalReward;
  status: StretchGoalStatus;
  unlockedAt?: number;
  achievedAt?: number;
  order: number; // Display order
  metadata: {
    createdAt: number;
    updatedAt: number;
  };
}

export interface StretchGoalReward {
  type: "bonus" | "feature" | "content" | "upgrade" | "donation";
  description: string;
  value?: string; // For bonuses/donations
  beneficiaryAddress?: string; // For donations
  imageUrl?: string;
}

export interface StretchGoalProgress {
  campaignId: string;
  currentAmount: string;
  currentBackers: number;
  goals: {
    id: string;
    name: string;
    threshold: string;
    progress: number; // 0-100
    status: StretchGoalStatus;
  }[];
  nextGoal?: {
    id: string;
    name: string;
    remaining: string;
    progress: number;
  };
}

// ============================================================================
// CAMPAIGN SCHEDULING
// ============================================================================

export type ScheduledActionType =
  | "launch"
  | "pause"
  | "resume"
  | "extend"
  | "close"
  | "notify"
  | "milestone_check";

export type ScheduledActionStatus =
  | "pending"
  | "executed"
  | "cancelled"
  | "failed";

export interface ScheduledAction {
  id: string;
  campaignId: string;
  type: ScheduledActionType;
  scheduledFor: number;
  status: ScheduledActionStatus;
  params?: Record<string, unknown>;
  executedAt?: number;
  errorMessage?: string;
  createdBy: string;
  createdAt: number;
}

export interface LaunchSchedule {
  campaignId: string;
  scheduledLaunch: number;
  countdown: {
    days: number;
    hours: number;
    minutes: number;
  };
  prelaunchSettings: {
    allowPrePledges: boolean;
    showPreview: boolean;
    notifyFollowers: boolean;
    reminderHours: number[];
  };
}

// ============================================================================
// CAMPAIGN SERIES
// ============================================================================

export type SeriesStatus =
  | "active"
  | "completed"
  | "cancelled";

export interface CampaignSeries {
  id: string;
  ownerAddress: string;
  name: string;
  description: string;
  campaigns: SeriesCampaign[];
  settings: SeriesSettings;
  status: SeriesStatus;
  metadata: {
    createdAt: number;
    updatedAt: number;
    totalRaised: string;
    totalBackers: number;
    averagePerCampaign: string;
  };
}

export interface SeriesCampaign {
  campaignId: string;
  name: string;
  order: number;
  status: string;
  relationship: "prerequisite" | "sequel" | "parallel" | "standalone";
  addedAt: number;
}

export interface SeriesSettings {
  requireSequentialCompletion: boolean;
  sharedBackerBenefits: boolean;
  seriesDiscount?: {
    percentage: number;
    minCampaigns: number;
  };
  bundleAvailable: boolean;
  bundleDiscount?: number;
}

// ============================================================================
// CAMPAIGN MILESTONES ENHANCED
// ============================================================================

export interface MilestoneSchedule {
  milestoneId: string;
  campaignId: string;
  name: string;
  scheduledVerification: number;
  remindersSent: number[];
  autoVerify: boolean;
  oracleConfig?: {
    providerId: string;
    query: string;
    expectedResult?: unknown;
  };
  status: "pending" | "scheduled" | "verifying" | "verified" | "failed";
}

export interface MilestoneReminder {
  id: string;
  milestoneId: string;
  campaignId: string;
  scheduledFor: number;
  sent: boolean;
  sentAt?: number;
  recipientType: "creator" | "backers" | "both";
  message?: string;
}

// ============================================================================
// CAMPAIGN ANALYTICS ENHANCED
// ============================================================================

export interface CampaignPrediction {
  campaignId: string;
  predictedFinalAmount: string;
  confidence: number; // 0-100
  predictedBackers: number;
  fundingProbability: number; // 0-100 probability of reaching goal
  projectedEndDate?: number;
  factors: {
    factor: string;
    impact: "positive" | "negative" | "neutral";
    weight: number;
  }[];
  generatedAt: number;
}

export interface FundingVelocity {
  campaignId: string;
  period: "hour" | "day" | "week";
  dataPoints: {
    timestamp: number;
    amount: string;
    cumulative: string;
    backers: number;
    velocity: number; // Amount per hour
  }[];
  averageVelocity: number;
  peakVelocity: {
    value: number;
    timestamp: number;
  };
  trend: "accelerating" | "steady" | "decelerating";
}

// ============================================================================
// SERVICE INTERFACE
// ============================================================================

export interface AdvancedCampaignServiceInterface {
  // Recurring campaigns
  createRecurringCampaign(params: CreateRecurringCampaignParams): RecurringCampaign;
  getRecurringCampaign(id: string): RecurringCampaign | null;
  listRecurringCampaigns(ownerAddress: string): RecurringCampaign[];
  updateRecurringCampaign(
    id: string,
    updates: Partial<RecurrenceSettings>
  ): RecurringCampaign;
  pauseRecurringCampaign(id: string): RecurringCampaign;
  resumeRecurringCampaign(id: string): RecurringCampaign;
  cancelRecurringCampaign(id: string): RecurringCampaign;
  createNextInstance(id: string): RecurringInstance;

  // Stretch goals
  addStretchGoal(campaignId: string, goal: CreateStretchGoalParams): StretchGoal;
  getStretchGoals(campaignId: string): StretchGoal[];
  updateStretchGoal(goalId: string, updates: Partial<StretchGoal>): StretchGoal;
  removeStretchGoal(goalId: string): boolean;
  checkStretchGoalProgress(campaignId: string): StretchGoalProgress;

  // Scheduling
  scheduleLaunch(campaignId: string, launchDate: number, settings?: LaunchSchedule["prelaunchSettings"]): LaunchSchedule;
  scheduleAction(campaignId: string, action: Omit<ScheduledAction, "id" | "status" | "createdAt">): ScheduledAction;
  getScheduledActions(campaignId: string): ScheduledAction[];
  cancelScheduledAction(actionId: string): boolean;
  processScheduledActions(): Promise<ScheduledAction[]>;

  // Series
  createSeries(params: CreateSeriesParams): CampaignSeries;
  getSeries(id: string): CampaignSeries | null;
  addCampaignToSeries(seriesId: string, campaignId: string, relationship: SeriesCampaign["relationship"]): CampaignSeries;
  removeCampaignFromSeries(seriesId: string, campaignId: string): CampaignSeries;
  getSeriesForCampaign(campaignId: string): CampaignSeries | null;

  // Milestone scheduling
  scheduleMilestoneVerification(
    milestoneId: string,
    scheduledDate: number,
    autoVerify?: boolean
  ): MilestoneSchedule;
  addMilestoneReminder(milestoneId: string, params: CreateReminderParams): MilestoneReminder;
  processScheduledMilestones(): Promise<MilestoneSchedule[]>;

  // Predictions
  getPrediction(campaignId: string): CampaignPrediction;
  getFundingVelocity(campaignId: string, period: FundingVelocity["period"]): FundingVelocity;
}

export interface CreateRecurringCampaignParams {
  templateCampaignId: string;
  ownerAddress: string;
  name: string;
  description: string;
  frequency: RecurrenceFrequency;
  schedule: Omit<RecurrenceSchedule, "timezone"> & { timezone?: string };
  settings?: Partial<RecurrenceSettings>;
}

export interface CreateStretchGoalParams {
  name: string;
  description: string;
  type: StretchGoalType;
  threshold: string;
  reward: StretchGoalReward;
  order?: number;
}

export interface CreateSeriesParams {
  ownerAddress: string;
  name: string;
  description: string;
  settings?: Partial<SeriesSettings>;
}

export interface CreateReminderParams {
  campaignId: string;
  scheduledFor: number;
  recipientType: MilestoneReminder["recipientType"];
  message?: string;
}
