/**
 * Phase 9: Fraud Detection Service
 *
 * Risk assessment, fraud detection rules, and trust scoring.
 */

import { randomUUID } from "crypto";
import {
  VerificationRecord,
  VerificationStatus,
  VerificationLevel,
  VerificationType,
  VerificationSummary,
  Badge,
  BadgeType,
  TrustScore,
  TrustTier,
  TrustFactor,
  TrustScoreChange,
  TRUST_TIER_THRESHOLDS,
  RiskAssessment,
  RiskLevel,
  RiskAction,
  RiskSignal,
  RiskSignalType,
  FraudRule,
  RuleCondition,
  RiskAlert,
  AlertSeverity,
  AlertStatus,
  BlocklistEntry,
  RiskReport,
} from "./types";

// ============================================================================
// FRAUD DETECTOR SERVICE
// ============================================================================

export class FraudDetector {
  private verifications: Map<string, VerificationRecord[]> = new Map();
  private trustScores: Map<string, TrustScore> = new Map();
  private badges: Map<string, Badge[]> = new Map();
  private assessments: Map<string, RiskAssessment> = new Map();
  private rules: Map<string, FraudRule> = new Map();
  private alerts: Map<string, RiskAlert> = new Map();
  private blocklist: Map<string, BlocklistEntry> = new Map();

  constructor() {
    this.initializeDefaultRules();
  }

  // ==========================================================================
  // VERIFICATION
  // ==========================================================================

  async requestVerification(
    userAddress: string,
    type: VerificationType,
    level: VerificationLevel = "basic"
  ): Promise<VerificationRecord> {
    const verificationId = `ver_${randomUUID().replace(/-/g, "")}`;
    const now = Date.now();

    const record: VerificationRecord = {
      id: verificationId,
      userAddress,
      type,
      status: "pending",
      level,
      requestedAt: now,
      appealable: true,
    };

    const userVerifications = this.verifications.get(userAddress) || [];
    userVerifications.push(record);
    this.verifications.set(userAddress, userVerifications);

    return record;
  }

  async completeVerification(
    verificationId: string,
    success: boolean,
    data?: {
      verifiedData?: VerificationRecord["verifiedData"];
      rejectionReason?: string;
      provider?: string;
      expiresInDays?: number;
    }
  ): Promise<VerificationRecord> {
    let record: VerificationRecord | undefined;
    let userAddress: string | undefined;

    for (const [addr, records] of this.verifications.entries()) {
      const found = records.find((r) => r.id === verificationId);
      if (found) {
        record = found;
        userAddress = addr;
        break;
      }
    }

    if (!record) {
      throw new Error("Verification not found");
    }

    const now = Date.now();

    if (success) {
      record.status = "verified";
      record.verifiedAt = now;
      record.verifiedData = data?.verifiedData;
      record.provider = data?.provider;

      if (data?.expiresInDays) {
        record.expiresAt = now + data.expiresInDays * 24 * 60 * 60 * 1000;
      }

      // Award badge
      await this.awardVerificationBadge(userAddress!, record.type);

      // Update trust score
      await this.recalculateTrustScore(userAddress!);
    } else {
      record.status = "rejected";
      record.rejectionReason = data?.rejectionReason;
    }

    return record;
  }

  getVerificationSummary(userAddress: string): VerificationSummary {
    const records = this.verifications.get(userAddress) || [];
    const userBadges = this.badges.get(userAddress) || [];
    const trustScore = this.trustScores.get(userAddress);

    const verifications: Record<VerificationType, VerificationStatus> = {
      email: "unverified",
      phone: "unverified",
      identity: "unverified",
      address: "unverified",
      social: "unverified",
      business: "unverified",
    };

    let highestLevel: VerificationLevel = "basic";
    const levelOrder: VerificationLevel[] = [
      "basic",
      "standard",
      "enhanced",
      "premium",
    ];

    for (const record of records) {
      if (record.status === "verified") {
        verifications[record.type] = "verified";
        if (levelOrder.indexOf(record.level) > levelOrder.indexOf(highestLevel)) {
          highestLevel = record.level;
        }
      } else if (
        verifications[record.type] === "unverified" &&
        record.status === "pending"
      ) {
        verifications[record.type] = "pending";
      }
    }

    return {
      userAddress,
      overallLevel: highestLevel,
      verifications,
      badges: userBadges,
      trustScore: trustScore?.score || 0,
      lastUpdated: Date.now(),
    };
  }

  // ==========================================================================
  // BADGES
  // ==========================================================================

  private async awardVerificationBadge(
    userAddress: string,
    type: VerificationType
  ): Promise<void> {
    const badgeTypeMap: Partial<Record<VerificationType, BadgeType>> = {
      email: "verified_email",
      phone: "verified_phone",
      identity: "verified_identity",
      social: "verified_social",
    };

    const badgeType = badgeTypeMap[type];
    if (!badgeType) return;

    await this.awardBadge(userAddress, badgeType);
  }

  async awardBadge(userAddress: string, type: BadgeType): Promise<Badge> {
    const userBadges = this.badges.get(userAddress) || [];

    // Check if already has badge
    const existing = userBadges.find((b) => b.type === type);
    if (existing) {
      return existing;
    }

    const badgeInfo: Record<
      BadgeType,
      { name: string; description: string }
    > = {
      verified_identity: {
        name: "Verified Identity",
        description: "Identity verified through KYC",
      },
      verified_email: {
        name: "Verified Email",
        description: "Email address verified",
      },
      verified_phone: {
        name: "Verified Phone",
        description: "Phone number verified",
      },
      verified_social: {
        name: "Social Verified",
        description: "Social media accounts verified",
      },
      top_creator: {
        name: "Top Creator",
        description: "Top performing campaign creator",
      },
      top_backer: {
        name: "Top Backer",
        description: "Active supporter of campaigns",
      },
      early_adopter: {
        name: "Early Adopter",
        description: "Early platform member",
      },
      community_leader: {
        name: "Community Leader",
        description: "Active community contributor",
      },
      dispute_resolver: {
        name: "Dispute Resolver",
        description: "Trusted arbitrator",
      },
      milestone_master: {
        name: "Milestone Master",
        description: "100% milestone success rate",
      },
    };

    const info = badgeInfo[type];
    const badge: Badge = {
      id: `badge_${randomUUID().replace(/-/g, "")}`,
      type,
      name: info.name,
      description: info.description,
      earnedAt: Date.now(),
    };

    userBadges.push(badge);
    this.badges.set(userAddress, userBadges);

    return badge;
  }

  getUserBadges(userAddress: string): Badge[] {
    return this.badges.get(userAddress) || [];
  }

  // ==========================================================================
  // TRUST SCORES
  // ==========================================================================

  async calculateTrustScore(
    userAddress: string,
    stats?: {
      campaignsCreated?: number;
      campaignsSuccessful?: number;
      campaignsFailed?: number;
      pledgesMade?: number;
      pledgesHonored?: number;
      disputesWon?: number;
      disputesLost?: number;
    }
  ): Promise<TrustScore> {
    const factors: TrustFactor[] = [];
    let totalScore = 0;
    let totalWeight = 0;

    // Factor 1: Verification level (20%)
    const verification = this.getVerificationSummary(userAddress);
    const verificationScore = this.calculateVerificationScore(verification);
    factors.push({
      name: "verification",
      weight: 0.2,
      score: verificationScore,
      reason: `Verification level: ${verification.overallLevel}`,
    });
    totalScore += verificationScore * 0.2;
    totalWeight += 0.2;

    // Factor 2: Campaign success rate (25%)
    if (stats?.campaignsCreated && stats.campaignsCreated > 0) {
      const successRate =
        ((stats.campaignsSuccessful || 0) / stats.campaignsCreated) * 100;
      factors.push({
        name: "campaign_success",
        weight: 0.25,
        score: Math.min(successRate, 100),
        reason: `${stats.campaignsSuccessful || 0}/${stats.campaignsCreated} campaigns successful`,
      });
      totalScore += Math.min(successRate, 100) * 0.25;
      totalWeight += 0.25;
    }

    // Factor 3: Pledge honor rate (20%)
    if (stats?.pledgesMade && stats.pledgesMade > 0) {
      const honorRate =
        ((stats.pledgesHonored || 0) / stats.pledgesMade) * 100;
      factors.push({
        name: "pledge_honor",
        weight: 0.2,
        score: honorRate,
        reason: `${stats.pledgesHonored || 0}/${stats.pledgesMade} pledges honored`,
      });
      totalScore += honorRate * 0.2;
      totalWeight += 0.2;
    }

    // Factor 4: Dispute record (15%)
    const totalDisputes = (stats?.disputesWon || 0) + (stats?.disputesLost || 0);
    if (totalDisputes > 0) {
      const disputeScore =
        ((stats?.disputesWon || 0) / totalDisputes) * 100;
      factors.push({
        name: "dispute_record",
        weight: 0.15,
        score: disputeScore,
        reason: `${stats?.disputesWon || 0}/${totalDisputes} disputes won`,
      });
      totalScore += disputeScore * 0.15;
      totalWeight += 0.15;
    }

    // Factor 5: Account age and activity (10%)
    const accountAgeFactor = Math.min(50, 50); // Simplified
    factors.push({
      name: "account_age",
      weight: 0.1,
      score: accountAgeFactor,
      reason: "Account age and activity",
    });
    totalScore += accountAgeFactor * 0.1;
    totalWeight += 0.1;

    // Factor 6: Badges (10%)
    const badgeScore = Math.min(
      (this.badges.get(userAddress)?.length || 0) * 20,
      100
    );
    factors.push({
      name: "badges",
      weight: 0.1,
      score: badgeScore,
      reason: `${this.badges.get(userAddress)?.length || 0} badges earned`,
    });
    totalScore += badgeScore * 0.1;
    totalWeight += 0.1;

    // Normalize score
    const finalScore =
      totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;

    // Determine tier
    let tier: TrustTier = "new";
    for (const [t, threshold] of Object.entries(TRUST_TIER_THRESHOLDS).reverse()) {
      if (finalScore >= threshold) {
        tier = t as TrustTier;
        break;
      }
    }

    const existingScore = this.trustScores.get(userAddress);
    const history: TrustScoreChange[] = existingScore?.history || [];

    if (existingScore && existingScore.score !== finalScore) {
      history.push({
        timestamp: Date.now(),
        previousScore: existingScore.score,
        newScore: finalScore,
        reason: "Score recalculated",
      });
    }

    const trustScore: TrustScore = {
      userAddress,
      score: finalScore,
      tier,
      factors,
      history: history.slice(-50), // Keep last 50 changes
      campaignsCreated: stats?.campaignsCreated || 0,
      campaignsSuccessful: stats?.campaignsSuccessful || 0,
      campaignsFailed: stats?.campaignsFailed || 0,
      pledgesMade: stats?.pledgesMade || 0,
      pledgesHonored: stats?.pledgesHonored || 0,
      disputesWon: stats?.disputesWon || 0,
      disputesLost: stats?.disputesLost || 0,
      calculatedAt: Date.now(),
    };

    this.trustScores.set(userAddress, trustScore);
    return trustScore;
  }

  private calculateVerificationScore(summary: VerificationSummary): number {
    let score = 0;
    const weights: Record<VerificationType, number> = {
      email: 15,
      phone: 15,
      identity: 40,
      address: 10,
      social: 10,
      business: 10,
    };

    for (const [type, status] of Object.entries(summary.verifications)) {
      if (status === "verified") {
        score += weights[type as VerificationType] || 0;
      }
    }

    return score;
  }

  private async recalculateTrustScore(userAddress: string): Promise<void> {
    const existing = this.trustScores.get(userAddress);
    if (existing) {
      await this.calculateTrustScore(userAddress, {
        campaignsCreated: existing.campaignsCreated,
        campaignsSuccessful: existing.campaignsSuccessful,
        campaignsFailed: existing.campaignsFailed,
        pledgesMade: existing.pledgesMade,
        pledgesHonored: existing.pledgesHonored,
        disputesWon: existing.disputesWon,
        disputesLost: existing.disputesLost,
      });
    }
  }

  getTrustScore(userAddress: string): TrustScore | undefined {
    return this.trustScores.get(userAddress);
  }

  // ==========================================================================
  // RISK ASSESSMENT
  // ==========================================================================

  async assessRisk(
    entityType: RiskAssessment["entityType"],
    entityId: string,
    data: Record<string, any>
  ): Promise<RiskAssessment> {
    const assessmentId = `risk_${randomUUID().replace(/-/g, "")}`;
    const signals: RiskSignal[] = [];

    // Check blocklist
    const blocklistSignals = this.checkBlocklist(data);
    signals.push(...blocklistSignals);

    // Run rules
    for (const rule of this.rules.values()) {
      if (rule.enabled && rule.entityType === entityType) {
        const triggered = this.evaluateRule(rule, data);
        if (triggered) {
          signals.push({
            type: "pattern_match",
            severity: rule.riskLevel,
            description: rule.description,
            score: this.getRiskLevelScore(rule.riskLevel),
            evidence: { ruleId: rule.id, ruleName: rule.name },
          });
          rule.triggeredCount++;
          rule.lastTriggeredAt = Date.now();
        }
      }
    }

    // Apply entity-specific checks
    if (entityType === "campaign") {
      signals.push(...this.assessCampaignRisk(data));
    } else if (entityType === "user") {
      signals.push(...this.assessUserRisk(data));
    } else if (entityType === "transaction") {
      signals.push(...this.assessTransactionRisk(data));
    }

    // Calculate overall risk
    const { level, score } = this.calculateOverallRisk(signals);
    const action = this.determineAction(level, signals);

    const assessment: RiskAssessment = {
      id: assessmentId,
      entityType,
      entityId,
      riskLevel: level,
      riskScore: score,
      confidence: signals.length > 0 ? 0.8 : 0.5,
      signals,
      recommendedAction: action,
      autoActioned: false,
      assessedAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };

    this.assessments.set(assessmentId, assessment);

    // Create alert if high risk
    if (level === "high" || level === "critical") {
      this.createAlert(assessment);
    }

    // Auto-action if critical
    if (level === "critical" && action !== "approve") {
      assessment.autoActioned = true;
    }

    return assessment;
  }

  private assessCampaignRisk(data: Record<string, any>): RiskSignal[] {
    const signals: RiskSignal[] = [];

    // Check for unrealistic goal
    if (data.goal && data.goal > 10000000) {
      signals.push({
        type: "unrealistic_goal",
        severity: "medium",
        description: "Campaign goal is unusually high",
        score: 30,
      });
    }

    // Check for short deadline
    if (data.deadline && data.deadline - Date.now() < 7 * 24 * 60 * 60 * 1000) {
      signals.push({
        type: "short_deadline",
        severity: "low",
        description: "Campaign deadline is less than 7 days",
        score: 15,
      });
    }

    // Check for missing milestones
    if (!data.milestones || data.milestones.length === 0) {
      signals.push({
        type: "no_milestones",
        severity: "medium",
        description: "Campaign has no verifiable milestones",
        score: 25,
      });
    }

    // Check description quality
    if (data.description && data.description.length < 100) {
      signals.push({
        type: "vague_description",
        severity: "low",
        description: "Campaign description is too short",
        score: 10,
      });
    }

    return signals;
  }

  private assessUserRisk(data: Record<string, any>): RiskSignal[] {
    const signals: RiskSignal[] = [];

    // Check if new account
    if (data.createdAt && Date.now() - data.createdAt < 24 * 60 * 60 * 1000) {
      signals.push({
        type: "new_account",
        severity: "low",
        description: "Account created less than 24 hours ago",
        score: 15,
      });
    }

    // Check verification status
    if (!data.verified) {
      signals.push({
        type: "unverified_account",
        severity: "low",
        description: "Account is not verified",
        score: 20,
      });
    }

    return signals;
  }

  private assessTransactionRisk(data: Record<string, any>): RiskSignal[] {
    const signals: RiskSignal[] = [];

    // Check for round amounts
    if (data.amount && data.amount % 1000 === 0 && data.amount > 10000) {
      signals.push({
        type: "round_amounts",
        severity: "low",
        description: "Transaction has suspicious round amount",
        score: 10,
      });
    }

    // Check for self-funding
    if (data.sender === data.campaignCreator) {
      signals.push({
        type: "self_funding",
        severity: "medium",
        description: "Creator appears to be funding own campaign",
        score: 35,
      });
    }

    return signals;
  }

  private checkBlocklist(data: Record<string, any>): RiskSignal[] {
    const signals: RiskSignal[] = [];

    const fieldsToCheck = ["address", "email", "ip", "domain"];
    for (const field of fieldsToCheck) {
      if (data[field]) {
        const entry = this.isBlocked(
          field as BlocklistEntry["type"],
          data[field]
        );
        if (entry) {
          signals.push({
            type: "blacklist_match",
            severity: entry.severity,
            description: `${field} is on blocklist: ${entry.reason}`,
            score: this.getRiskLevelScore(entry.severity),
            evidence: { blocklistId: entry.id, field },
          });
        }
      }
    }

    return signals;
  }

  private calculateOverallRisk(signals: RiskSignal[]): {
    level: RiskLevel;
    score: number;
  } {
    if (signals.length === 0) {
      return { level: "low", score: 0 };
    }

    // Sum scores with diminishing returns
    let totalScore = 0;
    const sortedSignals = [...signals].sort((a, b) => b.score - a.score);

    for (let i = 0; i < sortedSignals.length; i++) {
      const diminishingFactor = Math.pow(0.8, i);
      totalScore += sortedSignals[i].score * diminishingFactor;
    }

    totalScore = Math.min(100, Math.round(totalScore));

    // Determine level
    let level: RiskLevel;
    if (totalScore >= 80) {
      level = "critical";
    } else if (totalScore >= 60) {
      level = "high";
    } else if (totalScore >= 30) {
      level = "medium";
    } else {
      level = "low";
    }

    // Upgrade level if any critical signal
    if (signals.some((s) => s.severity === "critical")) {
      level = "critical";
    }

    return { level, score: totalScore };
  }

  private determineAction(
    level: RiskLevel,
    signals: RiskSignal[]
  ): RiskAction {
    if (level === "critical") {
      return "reject";
    }
    if (level === "high") {
      return "review";
    }
    if (level === "medium") {
      return "flag";
    }
    if (signals.some((s) => s.type === "blacklist_match")) {
      return "hold";
    }
    return "approve";
  }

  private getRiskLevelScore(level: RiskLevel): number {
    const scores: Record<RiskLevel, number> = {
      low: 15,
      medium: 35,
      high: 60,
      critical: 90,
    };
    return scores[level];
  }

  getAssessment(assessmentId: string): RiskAssessment | undefined {
    return this.assessments.get(assessmentId);
  }

  // ==========================================================================
  // FRAUD RULES
  // ==========================================================================

  private initializeDefaultRules(): void {
    const defaultRules: Omit<FraudRule, "id" | "triggeredCount" | "falsePositiveCount" | "createdAt" | "updatedAt">[] = [
      {
        name: "High-value new account",
        description: "New account creating high-value campaign",
        enabled: true,
        entityType: "campaign",
        conditions: [
          { field: "creatorAccountAge", operator: "less_than", value: 86400000 },
          { field: "goal", operator: "greater_than", value: 100000 },
        ],
        combinator: "all",
        riskLevel: "high",
        action: "review",
        autoAction: false,
      },
      {
        name: "Rapid funding",
        description: "Campaign funded very quickly",
        enabled: true,
        entityType: "campaign",
        conditions: [
          { field: "fundingRate", operator: "greater_than", value: 0.5 }, // 50% in first hour
        ],
        combinator: "all",
        riskLevel: "medium",
        action: "flag",
        autoAction: false,
      },
      {
        name: "Blocked address",
        description: "Address is on blocklist",
        enabled: true,
        entityType: "user",
        conditions: [
          { field: "isBlocked", operator: "equals", value: true },
        ],
        combinator: "any",
        riskLevel: "critical",
        action: "reject",
        autoAction: true,
      },
    ];

    for (const rule of defaultRules) {
      const ruleId = `rule_${randomUUID().replace(/-/g, "")}`;
      this.rules.set(ruleId, {
        ...rule,
        id: ruleId,
        triggeredCount: 0,
        falsePositiveCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  private evaluateRule(rule: FraudRule, data: Record<string, any>): boolean {
    const results = rule.conditions.map((condition) =>
      this.evaluateCondition(condition, data)
    );

    if (rule.combinator === "all") {
      return results.every((r) => r);
    } else {
      return results.some((r) => r);
    }
  }

  private evaluateCondition(
    condition: RuleCondition,
    data: Record<string, any>
  ): boolean {
    const value = data[condition.field];

    switch (condition.operator) {
      case "equals":
        return value === condition.value;
      case "not_equals":
        return value !== condition.value;
      case "greater_than":
        return value > condition.value;
      case "less_than":
        return value < condition.value;
      case "contains":
        return String(value).includes(condition.value);
      case "in":
        return Array.isArray(condition.value) && condition.value.includes(value);
      case "exists":
        return value !== undefined && value !== null;
      case "not_exists":
        return value === undefined || value === null;
      default:
        return false;
    }
  }

  // ==========================================================================
  // ALERTS
  // ==========================================================================

  private createAlert(assessment: RiskAssessment): RiskAlert {
    const alertId = `alert_${randomUUID().replace(/-/g, "")}`;

    const severity: AlertSeverity =
      assessment.riskLevel === "critical"
        ? "critical"
        : assessment.riskLevel === "high"
          ? "error"
          : "warning";

    const alert: RiskAlert = {
      id: alertId,
      severity,
      status: "open",
      entityType: assessment.entityType,
      entityId: assessment.entityId,
      assessmentId: assessment.id,
      title: `${assessment.riskLevel.toUpperCase()} risk detected`,
      description: `Risk assessment triggered ${assessment.signals.length} signals`,
      signals: assessment.signals,
      recommendedAction: assessment.recommendedAction,
      createdAt: Date.now(),
    };

    this.alerts.set(alertId, alert);
    return alert;
  }

  acknowledgeAlert(alertId: string, acknowledgedBy: string): RiskAlert {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error("Alert not found");
    }

    alert.status = "acknowledged";
    alert.acknowledgedAt = Date.now();
    alert.acknowledgedBy = acknowledgedBy;

    return alert;
  }

  resolveAlert(
    alertId: string,
    resolvedBy: string,
    resolution: string,
    actionTaken: RiskAction
  ): RiskAlert {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error("Alert not found");
    }

    alert.status = "resolved";
    alert.resolvedAt = Date.now();
    alert.resolvedBy = resolvedBy;
    alert.resolution = resolution;
    alert.actionTaken = actionTaken;

    return alert;
  }

  getOpenAlerts(): RiskAlert[] {
    const alerts: RiskAlert[] = [];
    for (const alert of this.alerts.values()) {
      if (alert.status === "open" || alert.status === "acknowledged") {
        alerts.push(alert);
      }
    }
    return alerts.sort((a, b) => b.createdAt - a.createdAt);
  }

  // ==========================================================================
  // BLOCKLIST
  // ==========================================================================

  addToBlocklist(
    type: BlocklistEntry["type"],
    value: string,
    reason: string,
    severity: RiskLevel,
    addedBy?: string
  ): BlocklistEntry {
    const entryId = `block_${randomUUID().replace(/-/g, "")}`;

    const entry: BlocklistEntry = {
      id: entryId,
      type,
      value: value.toLowerCase(),
      reason,
      severity,
      source: addedBy ? "manual" : "automated",
      addedBy,
      addedAt: Date.now(),
    };

    this.blocklist.set(`${type}:${value.toLowerCase()}`, entry);
    return entry;
  }

  removeFromBlocklist(type: BlocklistEntry["type"], value: string): void {
    const key = `${type}:${value.toLowerCase()}`;
    const entry = this.blocklist.get(key);
    if (entry) {
      entry.removedAt = Date.now();
    }
  }

  isBlocked(
    type: BlocklistEntry["type"],
    value: string
  ): BlocklistEntry | null {
    const key = `${type}:${value.toLowerCase()}`;
    const entry = this.blocklist.get(key);
    if (entry && !entry.removedAt) {
      if (!entry.expiresAt || entry.expiresAt > Date.now()) {
        return entry;
      }
    }
    return null;
  }

  // ==========================================================================
  // REPORTS
  // ==========================================================================

  generateReport(periodStart: number, periodEnd: number): RiskReport {
    const assessmentsByLevel: Record<RiskLevel, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    const assessmentsByEntity: Record<string, number> = {};
    const alertsBySeverity: Record<AlertSeverity, number> = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0,
    };
    const actionsTaken: Record<RiskAction, number> = {
      approve: 0,
      flag: 0,
      review: 0,
      hold: 0,
      reject: 0,
      suspend: 0,
    };
    let alertsResolved = 0;
    let totalResolutionTime = 0;
    let resolvedCount = 0;
    let autoActioned = 0;

    for (const assessment of this.assessments.values()) {
      if (
        assessment.assessedAt >= periodStart &&
        assessment.assessedAt <= periodEnd
      ) {
        assessmentsByLevel[assessment.riskLevel]++;
        assessmentsByEntity[assessment.entityType] =
          (assessmentsByEntity[assessment.entityType] || 0) + 1;
        actionsTaken[assessment.recommendedAction]++;
        if (assessment.autoActioned) autoActioned++;
      }
    }

    for (const alert of this.alerts.values()) {
      if (alert.createdAt >= periodStart && alert.createdAt <= periodEnd) {
        alertsBySeverity[alert.severity]++;
        if (alert.status === "resolved" && alert.resolvedAt) {
          alertsResolved++;
          totalResolutionTime += alert.resolvedAt - alert.createdAt;
          resolvedCount++;
        }
      }
    }

    return {
      id: `report_${randomUUID().replace(/-/g, "")}`,
      period: { start: periodStart, end: periodEnd },
      totalAssessments: Object.values(assessmentsByLevel).reduce(
        (a, b) => a + b,
        0
      ),
      assessmentsByLevel,
      assessmentsByEntity,
      totalAlerts: Object.values(alertsBySeverity).reduce((a, b) => a + b, 0),
      alertsBySeverity,
      alertsResolved,
      averageResolutionTime:
        resolvedCount > 0 ? Math.round(totalResolutionTime / resolvedCount) : 0,
      actionsTaken,
      autoActioned,
      manualReviewed:
        Object.values(assessmentsByLevel).reduce((a, b) => a + b, 0) -
        autoActioned,
      falsePositiveRate: 0, // Would need feedback to calculate
      rulesTriggered: {},
      generatedAt: Date.now(),
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createFraudDetector(): FraudDetector {
  return new FraudDetector();
}
