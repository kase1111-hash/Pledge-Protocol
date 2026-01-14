/**
 * Dispute Resolution Types
 * Phase 6: Governance - Dispute tracking and resolution
 */

/**
 * Dispute status lifecycle
 */
export type DisputeStatus =
  | "pending"      // Just raised, awaiting review
  | "reviewing"    // Under active investigation
  | "voting"       // Community voting in progress
  | "escalated"    // Escalated to higher authority
  | "resolved"     // Final decision made
  | "appealed"     // Resolution appealed
  | "closed";      // Dispute closed (resolved or expired)

/**
 * Resolution tiers for escalation
 */
export type ResolutionTier =
  | "automated"    // Auto-resolved by consensus threshold
  | "community"    // Backer community vote
  | "creator"      // Creator/beneficiary input required
  | "council";     // Protocol council (final authority)

/**
 * Dispute categories
 */
export type DisputeCategory =
  | "oracle_disagreement"     // Oracle sources disagree
  | "oracle_failure"          // Oracle failed to respond
  | "milestone_dispute"       // Milestone completion contested
  | "calculation_error"       // Pledge calculation disputed
  | "fraud_claim"             // Suspected fraud
  | "technical_issue"         // Technical problem with resolution
  | "other";                  // Other disputes

/**
 * Vote option
 */
export type VoteOption = "release" | "refund" | "partial" | "abstain";

/**
 * Dispute evidence
 */
export interface DisputeEvidence {
  id: string;
  disputeId: string;
  submittedBy: string;
  type: "document" | "screenshot" | "api_response" | "attestation" | "link" | "text";
  title: string;
  description: string;
  content: string; // URL or text content
  contentHash?: string; // IPFS hash for immutability
  submittedAt: number;
  verified: boolean;
}

/**
 * Vote record
 */
export interface DisputeVote {
  id: string;
  disputeId: string;
  voter: string;
  votingPower: bigint; // Pledge amount or governance weight
  vote: VoteOption;
  partialPercent?: number; // If vote is "partial", what percentage?
  reason?: string;
  votedAt: number;
  signature?: string;
}

/**
 * Vote tally
 */
export interface VoteTally {
  totalVotingPower: bigint;
  release: bigint;
  refund: bigint;
  partial: bigint;
  abstain: bigint;
  voterCount: number;
  quorumReached: boolean;
  quorumThreshold: number; // Percentage required
  consensusReached: boolean;
  leadingOption: VoteOption;
  leadingPercent: number;
}

/**
 * Resolution decision
 */
export interface ResolutionDecision {
  outcome: "release" | "refund" | "partial";
  releasePercent: number; // 0-100
  refundPercent: number; // 0-100
  decidedBy: ResolutionTier;
  decidedAt: number;
  rationale: string;
  evidenceIds: string[];
  voteTally?: VoteTally;
  appealable: boolean;
  appealDeadline?: number;
}

/**
 * Dispute timeline event
 */
export interface DisputeEvent {
  id: string;
  disputeId: string;
  type:
    | "created"
    | "evidence_submitted"
    | "status_changed"
    | "tier_escalated"
    | "vote_cast"
    | "voting_opened"
    | "voting_closed"
    | "resolved"
    | "appealed"
    | "closed";
  description: string;
  actor: string;
  data?: Record<string, any>;
  timestamp: number;
}

/**
 * Main dispute record
 */
export interface Dispute {
  id: string;
  campaignId: string;
  pledgeIds: string[]; // Affected pledges
  milestoneId?: string; // If dispute is about specific milestone

  // Dispute details
  category: DisputeCategory;
  title: string;
  description: string;
  raisedBy: string; // Address of person who raised dispute
  raisedAt: number;

  // Status
  status: DisputeStatus;
  currentTier: ResolutionTier;
  priority: "low" | "medium" | "high" | "critical";

  // Oracle context (if oracle disagreement)
  oracleContext?: {
    oracleIds: string[];
    oracleResponses: Array<{
      oracleId: string;
      success: boolean;
      data: any;
      timestamp: number;
    }>;
    consensusPercent: number;
    expectedConsensus: number;
  };

  // Voting
  votingEnabled: boolean;
  votingStartedAt?: number;
  votingEndsAt?: number;
  eligibleVoters: string[]; // Addresses eligible to vote
  voteTally?: VoteTally;

  // Resolution
  decision?: ResolutionDecision;

  // Value at stake
  totalEscrowedAmount: bigint;
  affectedBackerCount: number;

  // Timestamps
  updatedAt: number;
  resolvedAt?: number;
  closedAt?: number;

  // Metadata
  tags: string[];
}

/**
 * Dispute creation request
 */
export interface CreateDisputeRequest {
  campaignId: string;
  pledgeIds?: string[];
  milestoneId?: string;
  category: DisputeCategory;
  title: string;
  description: string;
  initialEvidence?: Array<{
    type: DisputeEvidence["type"];
    title: string;
    description: string;
    content: string;
  }>;
}

/**
 * Dispute filter options
 */
export interface DisputeFilterOptions {
  campaignId?: string;
  status?: DisputeStatus | DisputeStatus[];
  category?: DisputeCategory;
  tier?: ResolutionTier;
  raisedBy?: string;
  affectsAddress?: string; // Disputes affecting a specific backer
  priority?: Dispute["priority"];
  votingActive?: boolean;
  fromDate?: number;
  toDate?: number;
}

/**
 * Escalation rules
 */
export interface EscalationRules {
  autoResolveThreshold: number; // Consensus % for auto-resolve (e.g., 90)
  communityVoteThreshold: number; // Consensus % triggering community vote (e.g., 70)
  votingDuration: number; // Hours for voting period
  quorumPercent: number; // % of eligible voters needed for valid vote
  escalationTimeout: number; // Hours before auto-escalation
  appealWindow: number; // Hours to file appeal after resolution
}

/**
 * Default escalation rules
 */
export const DEFAULT_ESCALATION_RULES: EscalationRules = {
  autoResolveThreshold: 90,
  communityVoteThreshold: 70,
  votingDuration: 72, // 3 days
  quorumPercent: 25,
  escalationTimeout: 168, // 7 days
  appealWindow: 48, // 2 days
};
