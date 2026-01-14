/**
 * Dispute Resolution Service
 * Phase 6: Governance - Manages dispute lifecycle
 */

import {
  Dispute,
  DisputeStatus,
  DisputeCategory,
  ResolutionTier,
  DisputeEvidence,
  DisputeVote,
  DisputeEvent,
  VoteTally,
  ResolutionDecision,
  CreateDisputeRequest,
  DisputeFilterOptions,
  EscalationRules,
  VoteOption,
  DEFAULT_ESCALATION_RULES,
} from "./types";

/**
 * Dispute Service - Handles dispute creation, voting, and resolution
 */
export class DisputeService {
  private disputes: Map<string, Dispute> = new Map();
  private evidence: Map<string, DisputeEvidence[]> = new Map();
  private votes: Map<string, DisputeVote[]> = new Map();
  private events: Map<string, DisputeEvent[]> = new Map();
  private escalationRules: EscalationRules;

  constructor(rules: EscalationRules = DEFAULT_ESCALATION_RULES) {
    this.escalationRules = rules;
  }

  /**
   * Create a new dispute
   */
  async createDispute(
    request: CreateDisputeRequest,
    raisedBy: string
  ): Promise<Dispute> {
    const id = this.generateDisputeId();
    const now = Date.now();

    // Determine initial tier based on category
    const initialTier = this.determineInitialTier(request.category);

    // Calculate priority based on category and potential value
    const priority = this.calculatePriority(request.category);

    const dispute: Dispute = {
      id,
      campaignId: request.campaignId,
      pledgeIds: request.pledgeIds || [],
      milestoneId: request.milestoneId,
      category: request.category,
      title: request.title,
      description: request.description,
      raisedBy,
      raisedAt: now,
      status: "pending",
      currentTier: initialTier,
      priority,
      votingEnabled: false,
      eligibleVoters: [],
      totalEscrowedAmount: BigInt(0),
      affectedBackerCount: 0,
      updatedAt: now,
      tags: [],
    };

    this.disputes.set(id, dispute);
    this.evidence.set(id, []);
    this.votes.set(id, []);
    this.events.set(id, []);

    // Record creation event
    await this.recordEvent(id, "created", "Dispute created", raisedBy, {
      category: request.category,
      title: request.title,
    });

    // Add initial evidence if provided
    if (request.initialEvidence) {
      for (const ev of request.initialEvidence) {
        await this.submitEvidence(id, raisedBy, ev);
      }
    }

    return dispute;
  }

  /**
   * Get dispute by ID
   */
  getDispute(id: string): Dispute | undefined {
    return this.disputes.get(id);
  }

  /**
   * List disputes with filters
   */
  listDisputes(filters: DisputeFilterOptions = {}): Dispute[] {
    let disputes = Array.from(this.disputes.values());

    if (filters.campaignId) {
      disputes = disputes.filter((d) => d.campaignId === filters.campaignId);
    }

    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      disputes = disputes.filter((d) => statuses.includes(d.status));
    }

    if (filters.category) {
      disputes = disputes.filter((d) => d.category === filters.category);
    }

    if (filters.tier) {
      disputes = disputes.filter((d) => d.currentTier === filters.tier);
    }

    if (filters.raisedBy) {
      disputes = disputes.filter((d) => d.raisedBy === filters.raisedBy);
    }

    if (filters.affectsAddress) {
      disputes = disputes.filter(
        (d) =>
          d.eligibleVoters.includes(filters.affectsAddress!) ||
          d.raisedBy === filters.affectsAddress
      );
    }

    if (filters.priority) {
      disputes = disputes.filter((d) => d.priority === filters.priority);
    }

    if (filters.votingActive) {
      const now = Date.now();
      disputes = disputes.filter(
        (d) =>
          d.votingEnabled &&
          d.votingStartedAt &&
          d.votingEndsAt &&
          now >= d.votingStartedAt &&
          now <= d.votingEndsAt
      );
    }

    if (filters.fromDate) {
      disputes = disputes.filter((d) => d.raisedAt >= filters.fromDate!);
    }

    if (filters.toDate) {
      disputes = disputes.filter((d) => d.raisedAt <= filters.toDate!);
    }

    // Sort by priority then by date
    return disputes.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.raisedAt - a.raisedAt;
    });
  }

  /**
   * Submit evidence for a dispute
   */
  async submitEvidence(
    disputeId: string,
    submittedBy: string,
    evidence: Omit<DisputeEvidence, "id" | "disputeId" | "submittedBy" | "submittedAt" | "verified">
  ): Promise<DisputeEvidence> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    if (dispute.status === "closed" || dispute.status === "resolved") {
      throw new Error("Cannot submit evidence to closed/resolved dispute");
    }

    const ev: DisputeEvidence = {
      id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      disputeId,
      submittedBy,
      ...evidence,
      submittedAt: Date.now(),
      verified: false,
    };

    const disputeEvidence = this.evidence.get(disputeId) || [];
    disputeEvidence.push(ev);
    this.evidence.set(disputeId, disputeEvidence);

    await this.recordEvent(disputeId, "evidence_submitted", `Evidence submitted: ${evidence.title}`, submittedBy, {
      evidenceId: ev.id,
      type: evidence.type,
    });

    return ev;
  }

  /**
   * Get evidence for a dispute
   */
  getEvidence(disputeId: string): DisputeEvidence[] {
    return this.evidence.get(disputeId) || [];
  }

  /**
   * Start voting on a dispute
   */
  async openVoting(
    disputeId: string,
    eligibleVoters: string[],
    votingPowers: Map<string, bigint>
  ): Promise<void> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    if (dispute.votingEnabled) {
      throw new Error("Voting already enabled for this dispute");
    }

    const now = Date.now();
    const votingDurationMs = this.escalationRules.votingDuration * 60 * 60 * 1000;

    dispute.votingEnabled = true;
    dispute.votingStartedAt = now;
    dispute.votingEndsAt = now + votingDurationMs;
    dispute.eligibleVoters = eligibleVoters;
    dispute.status = "voting";
    dispute.updatedAt = now;

    // Initialize vote tally
    const totalVotingPower = Array.from(votingPowers.values()).reduce(
      (sum, power) => sum + power,
      BigInt(0)
    );

    dispute.voteTally = {
      totalVotingPower,
      release: BigInt(0),
      refund: BigInt(0),
      partial: BigInt(0),
      abstain: BigInt(0),
      voterCount: 0,
      quorumReached: false,
      quorumThreshold: this.escalationRules.quorumPercent,
      consensusReached: false,
      leadingOption: "abstain",
      leadingPercent: 0,
    };

    this.disputes.set(disputeId, dispute);

    await this.recordEvent(disputeId, "voting_opened", "Community voting opened", "system", {
      eligibleVoters: eligibleVoters.length,
      votingEndsAt: dispute.votingEndsAt,
    });
  }

  /**
   * Cast a vote on a dispute
   */
  async castVote(
    disputeId: string,
    voter: string,
    votingPower: bigint,
    vote: VoteOption,
    partialPercent?: number,
    reason?: string
  ): Promise<DisputeVote> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    if (!dispute.votingEnabled) {
      throw new Error("Voting not enabled for this dispute");
    }

    const now = Date.now();
    if (dispute.votingEndsAt && now > dispute.votingEndsAt) {
      throw new Error("Voting period has ended");
    }

    if (!dispute.eligibleVoters.includes(voter)) {
      throw new Error("Address not eligible to vote on this dispute");
    }

    // Check if already voted
    const existingVotes = this.votes.get(disputeId) || [];
    if (existingVotes.some((v) => v.voter === voter)) {
      throw new Error("Already voted on this dispute");
    }

    // Validate partial percentage
    if (vote === "partial" && (partialPercent === undefined || partialPercent < 0 || partialPercent > 100)) {
      throw new Error("Partial vote requires valid percentage (0-100)");
    }

    const voteRecord: DisputeVote = {
      id: `vote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      disputeId,
      voter,
      votingPower,
      vote,
      partialPercent,
      reason,
      votedAt: now,
    };

    existingVotes.push(voteRecord);
    this.votes.set(disputeId, existingVotes);

    // Update tally
    this.updateVoteTally(dispute);
    dispute.updatedAt = now;
    this.disputes.set(disputeId, dispute);

    await this.recordEvent(disputeId, "vote_cast", `Vote cast: ${vote}`, voter, {
      voteId: voteRecord.id,
      vote,
      votingPower: votingPower.toString(),
    });

    return voteRecord;
  }

  /**
   * Get votes for a dispute
   */
  getVotes(disputeId: string): DisputeVote[] {
    return this.votes.get(disputeId) || [];
  }

  /**
   * Close voting and determine outcome
   */
  async closeVoting(disputeId: string): Promise<VoteTally> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    if (!dispute.votingEnabled) {
      throw new Error("Voting not enabled for this dispute");
    }

    // Update final tally
    this.updateVoteTally(dispute);

    dispute.votingEnabled = false;
    dispute.updatedAt = Date.now();

    await this.recordEvent(disputeId, "voting_closed", "Community voting closed", "system", {
      tally: {
        release: dispute.voteTally?.release.toString(),
        refund: dispute.voteTally?.refund.toString(),
        partial: dispute.voteTally?.partial.toString(),
        voterCount: dispute.voteTally?.voterCount,
        quorumReached: dispute.voteTally?.quorumReached,
      },
    });

    // Check if we should auto-resolve based on vote
    if (dispute.voteTally?.quorumReached && dispute.voteTally?.consensusReached) {
      await this.resolveByVote(dispute);
    } else if (!dispute.voteTally?.quorumReached) {
      // Escalate if quorum not reached
      await this.escalate(disputeId, "Quorum not reached during voting");
    }

    this.disputes.set(disputeId, dispute);
    return dispute.voteTally!;
  }

  /**
   * Escalate dispute to next tier
   */
  async escalate(disputeId: string, reason: string): Promise<void> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    const tierOrder: ResolutionTier[] = ["automated", "community", "creator", "council"];
    const currentIndex = tierOrder.indexOf(dispute.currentTier);

    if (currentIndex >= tierOrder.length - 1) {
      throw new Error("Dispute already at highest tier");
    }

    const newTier = tierOrder[currentIndex + 1];
    dispute.currentTier = newTier;
    dispute.status = "escalated";
    dispute.updatedAt = Date.now();

    this.disputes.set(disputeId, dispute);

    await this.recordEvent(disputeId, "tier_escalated", `Escalated to ${newTier}: ${reason}`, "system", {
      previousTier: tierOrder[currentIndex],
      newTier,
      reason,
    });
  }

  /**
   * Resolve a dispute
   */
  async resolve(
    disputeId: string,
    decision: Omit<ResolutionDecision, "decidedAt" | "appealable" | "appealDeadline">
  ): Promise<Dispute> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    const now = Date.now();
    const appealDeadline = now + this.escalationRules.appealWindow * 60 * 60 * 1000;

    dispute.decision = {
      ...decision,
      decidedAt: now,
      appealable: true,
      appealDeadline,
    };

    dispute.status = "resolved";
    dispute.resolvedAt = now;
    dispute.updatedAt = now;

    this.disputes.set(disputeId, dispute);

    await this.recordEvent(disputeId, "resolved", `Dispute resolved: ${decision.outcome}`, "system", {
      outcome: decision.outcome,
      releasePercent: decision.releasePercent,
      refundPercent: decision.refundPercent,
      decidedBy: decision.decidedBy,
    });

    return dispute;
  }

  /**
   * Appeal a resolution
   */
  async appeal(
    disputeId: string,
    appealedBy: string,
    reason: string
  ): Promise<void> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    if (dispute.status !== "resolved") {
      throw new Error("Can only appeal resolved disputes");
    }

    if (!dispute.decision?.appealable) {
      throw new Error("This decision is not appealable");
    }

    const now = Date.now();
    if (dispute.decision.appealDeadline && now > dispute.decision.appealDeadline) {
      throw new Error("Appeal window has expired");
    }

    dispute.status = "appealed";
    dispute.updatedAt = now;

    this.disputes.set(disputeId, dispute);

    await this.recordEvent(disputeId, "appealed", `Resolution appealed: ${reason}`, appealedBy, {
      previousDecision: dispute.decision?.outcome,
      reason,
    });

    // Escalate to next tier
    await this.escalate(disputeId, `Appeal filed: ${reason}`);
  }

  /**
   * Close a dispute (after resolution period or manual close)
   */
  async close(disputeId: string, closedBy: string): Promise<void> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    const now = Date.now();
    dispute.status = "closed";
    dispute.closedAt = now;
    dispute.updatedAt = now;

    // Make decision non-appealable
    if (dispute.decision) {
      dispute.decision.appealable = false;
    }

    this.disputes.set(disputeId, dispute);

    await this.recordEvent(disputeId, "closed", "Dispute closed", closedBy);
  }

  /**
   * Get timeline of events for a dispute
   */
  getTimeline(disputeId: string): DisputeEvent[] {
    return (this.events.get(disputeId) || []).sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Automatically check disputes for timeout escalation
   */
  async processTimeouts(): Promise<string[]> {
    const now = Date.now();
    const escalationTimeoutMs = this.escalationRules.escalationTimeout * 60 * 60 * 1000;
    const escalatedIds: string[] = [];

    for (const dispute of this.disputes.values()) {
      if (
        dispute.status === "pending" ||
        dispute.status === "reviewing" ||
        dispute.status === "escalated"
      ) {
        if (now - dispute.updatedAt > escalationTimeoutMs) {
          await this.escalate(dispute.id, "Escalation timeout reached");
          escalatedIds.push(dispute.id);
        }
      }

      // Close voting if time expired
      if (dispute.votingEnabled && dispute.votingEndsAt && now > dispute.votingEndsAt) {
        await this.closeVoting(dispute.id);
      }
    }

    return escalatedIds;
  }

  /**
   * Get dispute statistics
   */
  getStatistics(): {
    total: number;
    byStatus: Record<DisputeStatus, number>;
    byCategory: Record<DisputeCategory, number>;
    byTier: Record<ResolutionTier, number>;
    averageResolutionTime: number;
    totalValueDisputed: string;
  } {
    const disputes = Array.from(this.disputes.values());

    const byStatus: Record<DisputeStatus, number> = {
      pending: 0,
      reviewing: 0,
      voting: 0,
      escalated: 0,
      resolved: 0,
      appealed: 0,
      closed: 0,
    };

    const byCategory: Record<DisputeCategory, number> = {
      oracle_disagreement: 0,
      oracle_failure: 0,
      milestone_dispute: 0,
      calculation_error: 0,
      fraud_claim: 0,
      technical_issue: 0,
      other: 0,
    };

    const byTier: Record<ResolutionTier, number> = {
      automated: 0,
      community: 0,
      creator: 0,
      council: 0,
    };

    let totalResolutionTime = 0;
    let resolvedCount = 0;
    let totalValue = BigInt(0);

    for (const dispute of disputes) {
      byStatus[dispute.status]++;
      byCategory[dispute.category]++;
      byTier[dispute.currentTier]++;
      totalValue += dispute.totalEscrowedAmount;

      if (dispute.resolvedAt && dispute.raisedAt) {
        totalResolutionTime += dispute.resolvedAt - dispute.raisedAt;
        resolvedCount++;
      }
    }

    return {
      total: disputes.length,
      byStatus,
      byCategory,
      byTier,
      averageResolutionTime: resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0,
      totalValueDisputed: totalValue.toString(),
    };
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private generateDisputeId(): string {
    return `dispute_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private determineInitialTier(category: DisputeCategory): ResolutionTier {
    switch (category) {
      case "oracle_disagreement":
      case "oracle_failure":
        return "automated"; // Try auto-resolution first
      case "calculation_error":
      case "technical_issue":
        return "automated";
      case "milestone_dispute":
        return "community";
      case "fraud_claim":
        return "council"; // Serious claims go to council
      default:
        return "community";
    }
  }

  private calculatePriority(category: DisputeCategory): Dispute["priority"] {
    switch (category) {
      case "fraud_claim":
        return "critical";
      case "oracle_failure":
        return "high";
      case "milestone_dispute":
      case "calculation_error":
        return "medium";
      default:
        return "low";
    }
  }

  private updateVoteTally(dispute: Dispute): void {
    const votes = this.votes.get(dispute.id) || [];

    let release = BigInt(0);
    let refund = BigInt(0);
    let partial = BigInt(0);
    let abstain = BigInt(0);

    for (const vote of votes) {
      switch (vote.vote) {
        case "release":
          release += vote.votingPower;
          break;
        case "refund":
          refund += vote.votingPower;
          break;
        case "partial":
          partial += vote.votingPower;
          break;
        case "abstain":
          abstain += vote.votingPower;
          break;
      }
    }

    const totalVoted = release + refund + partial + abstain;
    const totalVotingPower = dispute.voteTally?.totalVotingPower || totalVoted;

    const quorumReached =
      totalVotingPower > BigInt(0) &&
      Number((totalVoted * BigInt(100)) / totalVotingPower) >= this.escalationRules.quorumPercent;

    // Find leading option
    const options: Array<{ option: VoteOption; power: bigint }> = [
      { option: "release", power: release },
      { option: "refund", power: refund },
      { option: "partial", power: partial },
    ];

    options.sort((a, b) => (b.power > a.power ? 1 : b.power < a.power ? -1 : 0));
    const leadingOption = options[0].option;
    const leadingPercent =
      totalVoted > BigInt(0) ? Number((options[0].power * BigInt(100)) / totalVoted) : 0;

    const consensusReached = leadingPercent >= this.escalationRules.communityVoteThreshold;

    dispute.voteTally = {
      totalVotingPower,
      release,
      refund,
      partial,
      abstain,
      voterCount: votes.length,
      quorumReached,
      quorumThreshold: this.escalationRules.quorumPercent,
      consensusReached,
      leadingOption,
      leadingPercent,
    };
  }

  private async resolveByVote(dispute: Dispute): Promise<void> {
    if (!dispute.voteTally) return;

    const { leadingOption, leadingPercent } = dispute.voteTally;

    let releasePercent = 0;
    let refundPercent = 0;

    switch (leadingOption) {
      case "release":
        releasePercent = 100;
        refundPercent = 0;
        break;
      case "refund":
        releasePercent = 0;
        refundPercent = 100;
        break;
      case "partial":
        // Calculate average partial percentage from votes
        const partialVotes = (this.votes.get(dispute.id) || []).filter(
          (v) => v.vote === "partial" && v.partialPercent !== undefined
        );
        if (partialVotes.length > 0) {
          const avgPartial =
            partialVotes.reduce((sum, v) => sum + (v.partialPercent || 50), 0) /
            partialVotes.length;
          releasePercent = Math.round(avgPartial);
          refundPercent = 100 - releasePercent;
        } else {
          releasePercent = 50;
          refundPercent = 50;
        }
        break;
    }

    await this.resolve(dispute.id, {
      outcome: leadingOption === "partial" ? "partial" : leadingOption,
      releasePercent,
      refundPercent,
      decidedBy: "community",
      rationale: `Community vote: ${leadingPercent}% voted for ${leadingOption}`,
      evidenceIds: this.getEvidence(dispute.id).map((e) => e.id),
      voteTally: dispute.voteTally,
    });
  }

  private async recordEvent(
    disputeId: string,
    type: DisputeEvent["type"],
    description: string,
    actor: string,
    data?: Record<string, any>
  ): Promise<void> {
    const event: DisputeEvent = {
      id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      disputeId,
      type,
      description,
      actor,
      data,
      timestamp: Date.now(),
    };

    const events = this.events.get(disputeId) || [];
    events.push(event);
    this.events.set(disputeId, events);
  }
}

// Export singleton instance
export const disputeService = new DisputeService();
