/**
 * Search and Discovery Service
 * Phase 6: Governance - Campaign discovery and search
 */

/**
 * Campaign status for search
 */
export type CampaignStatus = "draft" | "active" | "resolved" | "cancelled" | "expired";

/**
 * Campaign category
 */
export type CampaignCategory =
  | "fitness"
  | "education"
  | "creative"
  | "opensource"
  | "business"
  | "research"
  | "personal"
  | "other";

/**
 * Campaign index entry
 */
export interface CampaignIndexEntry {
  id: string;
  name: string;
  description: string;
  category: CampaignCategory;
  status: CampaignStatus;
  creatorAddress: string;
  creatorName?: string;
  beneficiaryAddress: string;
  beneficiaryName?: string;
  subjectName?: string;

  // Metrics
  totalPledged: bigint;
  goalAmount?: bigint;
  backerCount: number;
  pledgeCount: number;
  milestoneCount: number;
  completedMilestones: number;

  // Oracle info
  oracleTypes: string[];
  templateId?: string;

  // Timestamps
  createdAt: number;
  activatedAt?: number;
  deadline?: number;
  resolvedAt?: number;

  // Tags and keywords
  tags: string[];
  keywords: string[];

  // Engagement
  viewCount: number;
  shareCount: number;
  featuredAt?: number;
  trendingScore: number;
}

/**
 * Search filters
 */
export interface SearchFilters {
  query?: string;
  category?: CampaignCategory | CampaignCategory[];
  status?: CampaignStatus | CampaignStatus[];
  creatorAddress?: string;
  beneficiaryAddress?: string;
  oracleType?: string;
  templateId?: string;
  tags?: string[];
  minPledged?: bigint;
  maxPledged?: bigint;
  minBackers?: number;
  hasGoal?: boolean;
  featured?: boolean;
  trending?: boolean;
  fromDate?: number;
  toDate?: number;
  deadlineBefore?: number;
  deadlineAfter?: number;
}

/**
 * Sort options
 */
export type SortField =
  | "created_at"
  | "total_pledged"
  | "backer_count"
  | "deadline"
  | "trending_score"
  | "relevance";

export type SortOrder = "asc" | "desc";

/**
 * Search options
 */
export interface SearchOptions {
  filters?: SearchFilters;
  sort?: {
    field: SortField;
    order: SortOrder;
  };
  pagination?: {
    page: number;
    limit: number;
  };
}

/**
 * Search result
 */
export interface SearchResult {
  campaigns: CampaignIndexEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  facets: {
    categories: Record<CampaignCategory, number>;
    statuses: Record<CampaignStatus, number>;
    oracleTypes: Record<string, number>;
    tags: Array<{ tag: string; count: number }>;
  };
}

/**
 * Trending campaign entry
 */
export interface TrendingCampaign {
  campaign: CampaignIndexEntry;
  trendingReason: string;
  changePercent: number;
  timeFrame: "1h" | "24h" | "7d";
}

/**
 * Similar campaign
 */
export interface SimilarCampaign {
  campaign: CampaignIndexEntry;
  similarityScore: number;
  matchedOn: string[];
}

/**
 * Search and Discovery Service
 */
export class SearchService {
  private index: Map<string, CampaignIndexEntry> = new Map();
  private trendingCache: TrendingCampaign[] = [];
  private trendingCacheTime: number = 0;
  private trendingCacheTTL: number = 5 * 60 * 1000; // 5 minutes

  /**
   * Index a campaign
   */
  indexCampaign(campaign: CampaignIndexEntry): void {
    // Generate keywords from text fields
    campaign.keywords = this.extractKeywords(campaign);
    campaign.trendingScore = this.calculateTrendingScore(campaign);
    this.index.set(campaign.id, campaign);
  }

  /**
   * Update campaign in index
   */
  updateCampaign(campaignId: string, updates: Partial<CampaignIndexEntry>): void {
    const existing = this.index.get(campaignId);
    if (!existing) return;

    const updated = { ...existing, ...updates };
    updated.keywords = this.extractKeywords(updated);
    updated.trendingScore = this.calculateTrendingScore(updated);
    this.index.set(campaignId, updated);
  }

  /**
   * Remove campaign from index
   */
  removeCampaign(campaignId: string): boolean {
    return this.index.delete(campaignId);
  }

  /**
   * Search campaigns
   */
  search(options: SearchOptions = {}): SearchResult {
    const { filters = {}, sort, pagination = { page: 1, limit: 20 } } = options;

    let campaigns = Array.from(this.index.values());

    // Apply filters
    campaigns = this.applyFilters(campaigns, filters);

    // Calculate facets before pagination
    const facets = this.calculateFacets(campaigns);

    // Apply sorting
    campaigns = this.applySorting(campaigns, sort, filters.query);

    // Apply pagination
    const total = campaigns.length;
    const totalPages = Math.ceil(total / pagination.limit);
    const startIndex = (pagination.page - 1) * pagination.limit;
    campaigns = campaigns.slice(startIndex, startIndex + pagination.limit);

    return {
      campaigns,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages,
      facets,
    };
  }

  /**
   * Full-text search
   */
  textSearch(query: string, limit: number = 20): CampaignIndexEntry[] {
    const queryTerms = this.tokenize(query.toLowerCase());
    if (queryTerms.length === 0) return [];

    const scored = Array.from(this.index.values()).map((campaign) => {
      const score = this.calculateRelevanceScore(campaign, queryTerms);
      return { campaign, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.campaign);
  }

  /**
   * Get trending campaigns
   */
  getTrending(limit: number = 10): TrendingCampaign[] {
    const now = Date.now();

    // Return cached if fresh
    if (this.trendingCache.length > 0 && now - this.trendingCacheTime < this.trendingCacheTTL) {
      return this.trendingCache.slice(0, limit);
    }

    // Calculate trending
    const campaigns = Array.from(this.index.values())
      .filter((c) => c.status === "active")
      .sort((a, b) => b.trendingScore - a.trendingScore)
      .slice(0, 50);

    this.trendingCache = campaigns.map((campaign) => ({
      campaign,
      trendingReason: this.getTrendingReason(campaign),
      changePercent: Math.random() * 50 + 10, // Simulated change
      timeFrame: "24h",
    }));
    this.trendingCacheTime = now;

    return this.trendingCache.slice(0, limit);
  }

  /**
   * Get featured campaigns
   */
  getFeatured(limit: number = 6): CampaignIndexEntry[] {
    return Array.from(this.index.values())
      .filter((c) => c.featuredAt && c.status === "active")
      .sort((a, b) => (b.featuredAt || 0) - (a.featuredAt || 0))
      .slice(0, limit);
  }

  /**
   * Get campaigns by category
   */
  getByCategory(category: CampaignCategory, limit: number = 20): CampaignIndexEntry[] {
    return Array.from(this.index.values())
      .filter((c) => c.category === category && c.status === "active")
      .sort((a, b) => b.trendingScore - a.trendingScore)
      .slice(0, limit);
  }

  /**
   * Get similar campaigns
   */
  getSimilar(campaignId: string, limit: number = 5): SimilarCampaign[] {
    const campaign = this.index.get(campaignId);
    if (!campaign) return [];

    const candidates = Array.from(this.index.values())
      .filter((c) => c.id !== campaignId && c.status === "active");

    return candidates
      .map((candidate) => {
        const { score, matchedOn } = this.calculateSimilarity(campaign, candidate);
        return { campaign: candidate, similarityScore: score, matchedOn };
      })
      .filter((s) => s.similarityScore > 0.2)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, limit);
  }

  /**
   * Get campaigns ending soon
   */
  getEndingSoon(days: number = 7, limit: number = 10): CampaignIndexEntry[] {
    const now = Date.now();
    const cutoff = now + days * 24 * 60 * 60 * 1000;

    return Array.from(this.index.values())
      .filter((c) => c.status === "active" && c.deadline && c.deadline > now && c.deadline <= cutoff)
      .sort((a, b) => (a.deadline || 0) - (b.deadline || 0))
      .slice(0, limit);
  }

  /**
   * Get recently resolved campaigns
   */
  getRecentlyResolved(limit: number = 10): CampaignIndexEntry[] {
    return Array.from(this.index.values())
      .filter((c) => c.status === "resolved" && c.resolvedAt)
      .sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0))
      .slice(0, limit);
  }

  /**
   * Get campaigns for a creator
   */
  getCreatorCampaigns(creatorAddress: string): CampaignIndexEntry[] {
    return Array.from(this.index.values())
      .filter((c) => c.creatorAddress.toLowerCase() === creatorAddress.toLowerCase())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Increment view count
   */
  incrementViewCount(campaignId: string): void {
    const campaign = this.index.get(campaignId);
    if (campaign) {
      campaign.viewCount++;
      campaign.trendingScore = this.calculateTrendingScore(campaign);
      this.index.set(campaignId, campaign);
    }
  }

  /**
   * Increment share count
   */
  incrementShareCount(campaignId: string): void {
    const campaign = this.index.get(campaignId);
    if (campaign) {
      campaign.shareCount++;
      campaign.trendingScore = this.calculateTrendingScore(campaign);
      this.index.set(campaignId, campaign);
    }
  }

  /**
   * Set campaign as featured
   */
  setFeatured(campaignId: string, featured: boolean): void {
    const campaign = this.index.get(campaignId);
    if (campaign) {
      campaign.featuredAt = featured ? Date.now() : undefined;
      this.index.set(campaignId, campaign);
    }
  }

  /**
   * Get search statistics
   */
  getStatistics(): {
    totalCampaigns: number;
    byStatus: Record<CampaignStatus, number>;
    byCategory: Record<CampaignCategory, number>;
    totalPledged: string;
    totalBackers: number;
    activeCampaigns: number;
  } {
    const campaigns = Array.from(this.index.values());

    const byStatus: Record<CampaignStatus, number> = {
      draft: 0,
      active: 0,
      resolved: 0,
      cancelled: 0,
      expired: 0,
    };

    const byCategory: Record<CampaignCategory, number> = {
      fitness: 0,
      education: 0,
      creative: 0,
      opensource: 0,
      business: 0,
      research: 0,
      personal: 0,
      other: 0,
    };

    let totalPledged = BigInt(0);
    let totalBackers = 0;

    for (const campaign of campaigns) {
      byStatus[campaign.status]++;
      byCategory[campaign.category]++;
      totalPledged += campaign.totalPledged;
      totalBackers += campaign.backerCount;
    }

    return {
      totalCampaigns: campaigns.length,
      byStatus,
      byCategory,
      totalPledged: totalPledged.toString(),
      totalBackers,
      activeCampaigns: byStatus.active,
    };
  }

  // =========================================================================
  // Private methods
  // =========================================================================

  private applyFilters(campaigns: CampaignIndexEntry[], filters: SearchFilters): CampaignIndexEntry[] {
    let result = campaigns;

    if (filters.query) {
      const queryTerms = this.tokenize(filters.query.toLowerCase());
      result = result.filter((c) => this.calculateRelevanceScore(c, queryTerms) > 0);
    }

    if (filters.category) {
      const categories = Array.isArray(filters.category) ? filters.category : [filters.category];
      result = result.filter((c) => categories.includes(c.category));
    }

    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      result = result.filter((c) => statuses.includes(c.status));
    }

    if (filters.creatorAddress) {
      result = result.filter(
        (c) => c.creatorAddress.toLowerCase() === filters.creatorAddress!.toLowerCase()
      );
    }

    if (filters.beneficiaryAddress) {
      result = result.filter(
        (c) => c.beneficiaryAddress.toLowerCase() === filters.beneficiaryAddress!.toLowerCase()
      );
    }

    if (filters.oracleType) {
      result = result.filter((c) => c.oracleTypes.includes(filters.oracleType!));
    }

    if (filters.templateId) {
      result = result.filter((c) => c.templateId === filters.templateId);
    }

    if (filters.tags && filters.tags.length > 0) {
      const searchTags = filters.tags.map((t) => t.toLowerCase());
      result = result.filter((c) =>
        c.tags.some((t) => searchTags.includes(t.toLowerCase()))
      );
    }

    if (filters.minPledged !== undefined) {
      result = result.filter((c) => c.totalPledged >= filters.minPledged!);
    }

    if (filters.maxPledged !== undefined) {
      result = result.filter((c) => c.totalPledged <= filters.maxPledged!);
    }

    if (filters.minBackers !== undefined) {
      result = result.filter((c) => c.backerCount >= filters.minBackers!);
    }

    if (filters.hasGoal !== undefined) {
      result = result.filter((c) => (c.goalAmount !== undefined) === filters.hasGoal);
    }

    if (filters.featured) {
      result = result.filter((c) => c.featuredAt !== undefined);
    }

    if (filters.trending) {
      result = result.filter((c) => c.trendingScore > 50);
    }

    if (filters.fromDate) {
      result = result.filter((c) => c.createdAt >= filters.fromDate!);
    }

    if (filters.toDate) {
      result = result.filter((c) => c.createdAt <= filters.toDate!);
    }

    if (filters.deadlineBefore) {
      result = result.filter((c) => c.deadline && c.deadline <= filters.deadlineBefore!);
    }

    if (filters.deadlineAfter) {
      result = result.filter((c) => c.deadline && c.deadline >= filters.deadlineAfter!);
    }

    return result;
  }

  private applySorting(
    campaigns: CampaignIndexEntry[],
    sort?: { field: SortField; order: SortOrder },
    query?: string
  ): CampaignIndexEntry[] {
    const sortField = sort?.field || "created_at";
    const sortOrder = sort?.order || "desc";

    if (sortField === "relevance" && query) {
      const queryTerms = this.tokenize(query.toLowerCase());
      return campaigns.sort((a, b) => {
        const scoreA = this.calculateRelevanceScore(a, queryTerms);
        const scoreB = this.calculateRelevanceScore(b, queryTerms);
        return sortOrder === "desc" ? scoreB - scoreA : scoreA - scoreB;
      });
    }

    return campaigns.sort((a, b) => {
      let valueA: any;
      let valueB: any;

      switch (sortField) {
        case "created_at":
          valueA = a.createdAt;
          valueB = b.createdAt;
          break;
        case "total_pledged":
          valueA = a.totalPledged;
          valueB = b.totalPledged;
          break;
        case "backer_count":
          valueA = a.backerCount;
          valueB = b.backerCount;
          break;
        case "deadline":
          valueA = a.deadline || 0;
          valueB = b.deadline || 0;
          break;
        case "trending_score":
          valueA = a.trendingScore;
          valueB = b.trendingScore;
          break;
        default:
          valueA = a.createdAt;
          valueB = b.createdAt;
      }

      if (typeof valueA === "bigint" && typeof valueB === "bigint") {
        return sortOrder === "desc"
          ? valueB > valueA ? 1 : valueB < valueA ? -1 : 0
          : valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
      }

      return sortOrder === "desc" ? valueB - valueA : valueA - valueB;
    });
  }

  private calculateFacets(campaigns: CampaignIndexEntry[]): SearchResult["facets"] {
    const categories: Record<CampaignCategory, number> = {
      fitness: 0,
      education: 0,
      creative: 0,
      opensource: 0,
      business: 0,
      research: 0,
      personal: 0,
      other: 0,
    };

    const statuses: Record<CampaignStatus, number> = {
      draft: 0,
      active: 0,
      resolved: 0,
      cancelled: 0,
      expired: 0,
    };

    const oracleTypes: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};

    for (const campaign of campaigns) {
      categories[campaign.category]++;
      statuses[campaign.status]++;

      for (const oracle of campaign.oracleTypes) {
        oracleTypes[oracle] = (oracleTypes[oracle] || 0) + 1;
      }

      for (const tag of campaign.tags) {
        tagCounts[tag.toLowerCase()] = (tagCounts[tag.toLowerCase()] || 0) + 1;
      }
    }

    const tags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return { categories, statuses, oracleTypes, tags };
  }

  private extractKeywords(campaign: CampaignIndexEntry): string[] {
    const text = [
      campaign.name,
      campaign.description,
      campaign.creatorName,
      campaign.beneficiaryName,
      campaign.subjectName,
      ...campaign.tags,
    ]
      .filter(Boolean)
      .join(" ");

    return this.tokenize(text.toLowerCase());
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2);
  }

  private calculateRelevanceScore(campaign: CampaignIndexEntry, queryTerms: string[]): number {
    let score = 0;

    for (const term of queryTerms) {
      // Exact match in name (highest weight)
      if (campaign.name.toLowerCase().includes(term)) {
        score += 10;
      }

      // Match in description
      if (campaign.description.toLowerCase().includes(term)) {
        score += 5;
      }

      // Match in keywords
      if (campaign.keywords.includes(term)) {
        score += 3;
      }

      // Match in tags
      if (campaign.tags.some((t) => t.toLowerCase().includes(term))) {
        score += 4;
      }

      // Match in creator/beneficiary names
      if (campaign.creatorName?.toLowerCase().includes(term)) {
        score += 2;
      }
      if (campaign.beneficiaryName?.toLowerCase().includes(term)) {
        score += 2;
      }
    }

    return score;
  }

  private calculateTrendingScore(campaign: CampaignIndexEntry): number {
    const now = Date.now();
    const ageHours = (now - campaign.createdAt) / (1000 * 60 * 60);

    // Recency factor (higher for newer campaigns)
    const recencyFactor = Math.max(0, 1 - ageHours / 168); // Decay over 1 week

    // Engagement factors
    const pledgeScore = Math.log10(Number(campaign.totalPledged) / 1e18 + 1) * 10;
    const backerScore = Math.log10(campaign.backerCount + 1) * 15;
    const viewScore = Math.log10(campaign.viewCount + 1) * 5;
    const shareScore = Math.log10(campaign.shareCount + 1) * 8;

    // Featured bonus
    const featuredBonus = campaign.featuredAt ? 20 : 0;

    // Milestone progress bonus
    const progressBonus = campaign.milestoneCount > 0
      ? (campaign.completedMilestones / campaign.milestoneCount) * 10
      : 0;

    return (
      (pledgeScore + backerScore + viewScore + shareScore + featuredBonus + progressBonus) *
      (0.5 + recencyFactor * 0.5)
    );
  }

  private getTrendingReason(campaign: CampaignIndexEntry): string {
    const reasons: string[] = [];

    if (campaign.backerCount > 50) reasons.push("High backer count");
    if (campaign.viewCount > 1000) reasons.push("Popular campaign");
    if (campaign.shareCount > 100) reasons.push("Widely shared");
    if (campaign.featuredAt) reasons.push("Featured");
    if (campaign.completedMilestones > 0) reasons.push("Making progress");

    return reasons.length > 0 ? reasons[0] : "Trending";
  }

  private calculateSimilarity(
    source: CampaignIndexEntry,
    candidate: CampaignIndexEntry
  ): { score: number; matchedOn: string[] } {
    let score = 0;
    const matchedOn: string[] = [];

    // Same category (high weight)
    if (source.category === candidate.category) {
      score += 0.4;
      matchedOn.push("category");
    }

    // Same template
    if (source.templateId && source.templateId === candidate.templateId) {
      score += 0.2;
      matchedOn.push("template");
    }

    // Shared tags
    const sharedTags = source.tags.filter((t) =>
      candidate.tags.map((ct) => ct.toLowerCase()).includes(t.toLowerCase())
    );
    if (sharedTags.length > 0) {
      score += Math.min(0.2, sharedTags.length * 0.05);
      matchedOn.push("tags");
    }

    // Same oracle types
    const sharedOracles = source.oracleTypes.filter((o) => candidate.oracleTypes.includes(o));
    if (sharedOracles.length > 0) {
      score += Math.min(0.15, sharedOracles.length * 0.05);
      matchedOn.push("oracle");
    }

    // Keyword overlap
    const sharedKeywords = source.keywords.filter((k) => candidate.keywords.includes(k));
    if (sharedKeywords.length >= 3) {
      score += Math.min(0.1, sharedKeywords.length * 0.01);
      matchedOn.push("keywords");
    }

    return { score, matchedOn };
  }
}

// Export singleton instance
export const searchService = new SearchService();
