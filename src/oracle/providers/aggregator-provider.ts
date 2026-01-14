import { BaseOracleProvider, IOracleProvider } from "../base-provider";
import { OracleConfig, OracleResponse, MilestoneCondition, VerificationResult } from "../types";

/**
 * Aggregation methods for multi-source verification
 */
export type AggregationMethod = "all" | "majority" | "any" | "weighted" | "threshold";

/**
 * Source weight configuration
 */
export interface SourceWeight {
  sourceId: string;
  weight: number;
}

/**
 * Aggregated result with breakdown
 */
export interface AggregatedResult {
  finalData: any;
  finalVerified: boolean;
  aggregationMethod: AggregationMethod;
  sourceResults: SourceResult[];
  consensusReached: boolean;
  consensusPercentage: number;
  timestamp: number;
}

/**
 * Individual source result
 */
export interface SourceResult {
  sourceId: string;
  sourceName: string;
  success: boolean;
  data: any;
  verified?: boolean;
  weight: number;
  responseTime: number;
  error?: string;
}

/**
 * Dispute information
 */
export interface DisputeInfo {
  hasDispute: boolean;
  disputingSources: string[];
  agreementPercentage: number;
  recommendedAction: "accept" | "reject" | "manual_review";
}

/**
 * Aggregator Oracle Provider
 * Combines multiple oracle sources for consensus-based verification
 * Supports ALL, MAJORITY, ANY, WEIGHTED, and THRESHOLD consensus modes
 */
export class AggregatorProvider extends BaseOracleProvider {
  private sources: Map<string, IOracleProvider> = new Map();
  private sourceWeights: Map<string, number> = new Map();
  private threshold: number = 0.5; // Default 50% threshold for majority
  private timeout: number = 30000; // Default 30s timeout for all sources

  constructor(config: OracleConfig) {
    // Ensure aggregator type
    const aggregatorConfig: OracleConfig = {
      ...config,
      type: "aggregator",
    };

    super(aggregatorConfig);
  }

  /**
   * Add an oracle source
   */
  addSource(provider: IOracleProvider, weight: number = 1): void {
    this.sources.set(provider.config.id, provider);
    this.sourceWeights.set(provider.config.id, weight);
  }

  /**
   * Remove an oracle source
   */
  removeSource(sourceId: string): boolean {
    this.sourceWeights.delete(sourceId);
    return this.sources.delete(sourceId);
  }

  /**
   * Set source weight
   */
  setSourceWeight(sourceId: string, weight: number): void {
    if (this.sources.has(sourceId)) {
      this.sourceWeights.set(sourceId, weight);
    }
  }

  /**
   * Set consensus threshold (0.0 - 1.0)
   */
  setThreshold(threshold: number): void {
    this.threshold = Math.max(0, Math.min(1, threshold));
  }

  /**
   * Query all sources and aggregate results
   */
  async query(params: Record<string, any>): Promise<OracleResponse> {
    if (this.sources.size === 0) {
      return {
        success: false,
        data: null,
        timestamp: Date.now(),
        source: this.config.name,
        cached: false,
        error: "No oracle sources configured",
      };
    }

    const sourceResults = await this.queryAllSources(params);
    const aggregatedResult = this.aggregateResults(sourceResults);

    return {
      success: aggregatedResult.consensusReached,
      data: aggregatedResult.finalData,
      rawData: aggregatedResult,
      timestamp: aggregatedResult.timestamp,
      source: this.config.name,
      cached: false,
      error: aggregatedResult.consensusReached ? undefined : "Consensus not reached",
    };
  }

  /**
   * Query all sources in parallel
   */
  private async queryAllSources(params: Record<string, any>): Promise<SourceResult[]> {
    const queryPromises = Array.from(this.sources.entries()).map(
      async ([sourceId, provider]): Promise<SourceResult> => {
        const startTime = Date.now();

        try {
          const response = await Promise.race([
            provider.query(params),
            this.createTimeout(this.timeout),
          ]);

          return {
            sourceId,
            sourceName: provider.config.name,
            success: response.success,
            data: response.data,
            weight: this.sourceWeights.get(sourceId) || 1,
            responseTime: Date.now() - startTime,
            error: response.error,
          };
        } catch (error) {
          return {
            sourceId,
            sourceName: provider.config.name,
            success: false,
            data: null,
            weight: this.sourceWeights.get(sourceId) || 1,
            responseTime: Date.now() - startTime,
            error: (error as Error).message,
          };
        }
      }
    );

    return Promise.all(queryPromises);
  }

  /**
   * Create a timeout promise
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Query timeout")), ms);
    });
  }

  /**
   * Aggregate results based on configured method
   */
  private aggregateResults(sourceResults: SourceResult[]): AggregatedResult {
    const method = this.config.aggregationMethod || "majority";
    const successfulResults = sourceResults.filter((r) => r.success);

    let consensusReached = false;
    let finalData: any = null;

    switch (method) {
      case "all":
        consensusReached = this.checkAllConsensus(sourceResults);
        finalData = consensusReached ? this.mergeData(successfulResults) : null;
        break;

      case "majority":
        const majorityResult = this.checkMajorityConsensus(sourceResults);
        consensusReached = majorityResult.reached;
        finalData = majorityResult.data;
        break;

      case "any":
        consensusReached = successfulResults.length > 0;
        finalData = successfulResults[0]?.data || null;
        break;

      case "weighted":
        const weightedResult = this.checkWeightedConsensus(sourceResults);
        consensusReached = weightedResult.reached;
        finalData = weightedResult.data;
        break;

      case "threshold":
        const thresholdResult = this.checkThresholdConsensus(sourceResults);
        consensusReached = thresholdResult.reached;
        finalData = thresholdResult.data;
        break;

      default:
        consensusReached = false;
    }

    const consensusPercentage =
      sourceResults.length > 0
        ? (successfulResults.length / sourceResults.length) * 100
        : 0;

    return {
      finalData,
      finalVerified: consensusReached,
      aggregationMethod: method,
      sourceResults,
      consensusReached,
      consensusPercentage,
      timestamp: Date.now(),
    };
  }

  /**
   * Check ALL consensus - all sources must agree
   */
  private checkAllConsensus(results: SourceResult[]): boolean {
    if (results.length === 0) return false;
    return results.every((r) => r.success);
  }

  /**
   * Check MAJORITY consensus - more than threshold must agree
   */
  private checkMajorityConsensus(results: SourceResult[]): { reached: boolean; data: any } {
    if (results.length === 0) return { reached: false, data: null };

    const successfulResults = results.filter((r) => r.success);
    const successRate = successfulResults.length / results.length;

    if (successRate > this.threshold) {
      return {
        reached: true,
        data: this.mergeData(successfulResults),
      };
    }

    return { reached: false, data: null };
  }

  /**
   * Check WEIGHTED consensus - weighted votes must exceed threshold
   */
  private checkWeightedConsensus(results: SourceResult[]): { reached: boolean; data: any } {
    if (results.length === 0) return { reached: false, data: null };

    const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
    const successWeight = results
      .filter((r) => r.success)
      .reduce((sum, r) => sum + r.weight, 0);

    if (totalWeight === 0) return { reached: false, data: null };

    const weightedSuccessRate = successWeight / totalWeight;

    if (weightedSuccessRate > this.threshold) {
      const successfulResults = results.filter((r) => r.success);
      return {
        reached: true,
        data: this.mergeDataWeighted(successfulResults),
      };
    }

    return { reached: false, data: null };
  }

  /**
   * Check THRESHOLD consensus - at least N sources must agree
   */
  private checkThresholdConsensus(results: SourceResult[]): { reached: boolean; data: any } {
    const requiredCount = Math.ceil(results.length * this.threshold);
    const successfulResults = results.filter((r) => r.success);

    if (successfulResults.length >= requiredCount) {
      return {
        reached: true,
        data: this.mergeData(successfulResults),
      };
    }

    return { reached: false, data: null };
  }

  /**
   * Merge data from multiple sources
   */
  private mergeData(results: SourceResult[]): any {
    if (results.length === 0) return null;
    if (results.length === 1) return results[0].data;

    // For numeric fields, calculate average
    // For other fields, use the first non-null value
    const merged: Record<string, any> = {};
    const numericCounts: Record<string, number> = {};

    for (const result of results) {
      if (!result.data) continue;

      for (const [key, value] of Object.entries(result.data)) {
        if (typeof value === "number") {
          merged[key] = (merged[key] || 0) + value;
          numericCounts[key] = (numericCounts[key] || 0) + 1;
        } else if (merged[key] === undefined) {
          merged[key] = value;
        }
      }
    }

    // Average numeric fields
    for (const key of Object.keys(numericCounts)) {
      merged[key] = merged[key] / numericCounts[key];
    }

    return merged;
  }

  /**
   * Merge data with weighted averages
   */
  private mergeDataWeighted(results: SourceResult[]): any {
    if (results.length === 0) return null;
    if (results.length === 1) return results[0].data;

    const merged: Record<string, any> = {};
    const weightedSums: Record<string, number> = {};
    const weightTotals: Record<string, number> = {};

    for (const result of results) {
      if (!result.data) continue;

      for (const [key, value] of Object.entries(result.data)) {
        if (typeof value === "number") {
          weightedSums[key] = (weightedSums[key] || 0) + value * result.weight;
          weightTotals[key] = (weightTotals[key] || 0) + result.weight;
        } else if (merged[key] === undefined) {
          merged[key] = value;
        }
      }
    }

    // Calculate weighted averages
    for (const key of Object.keys(weightedSums)) {
      merged[key] = weightedSums[key] / weightTotals[key];
    }

    return merged;
  }

  /**
   * Verify condition with aggregated data
   */
  verifyCondition(data: any, condition: MilestoneCondition): boolean {
    // Use aggregated data for verification
    if (!data || !data.finalData) return false;
    return super.verifyCondition(data.finalData, condition);
  }

  /**
   * Get dispute information
   */
  getDisputeInfo(aggregatedResult: AggregatedResult): DisputeInfo {
    const totalSources = aggregatedResult.sourceResults.length;
    const successfulSources = aggregatedResult.sourceResults.filter((r) => r.success);
    const failedSources = aggregatedResult.sourceResults.filter((r) => !r.success);

    const agreementPercentage =
      totalSources > 0 ? (successfulSources.length / totalSources) * 100 : 0;

    let recommendedAction: DisputeInfo["recommendedAction"] = "accept";

    if (agreementPercentage < 50) {
      recommendedAction = "reject";
    } else if (agreementPercentage < 75) {
      recommendedAction = "manual_review";
    }

    return {
      hasDispute: failedSources.length > 0 && successfulSources.length > 0,
      disputingSources: failedSources.map((r) => r.sourceId),
      agreementPercentage,
      recommendedAction,
    };
  }

  /**
   * Health check - at least one source must be healthy
   */
  async healthCheck(): Promise<boolean> {
    const healthChecks = Array.from(this.sources.values()).map((provider) =>
      provider.healthCheck().catch(() => false)
    );

    const results = await Promise.all(healthChecks);
    return results.some((healthy) => healthy);
  }

  /**
   * Get list of configured sources
   */
  getSources(): Array<{ id: string; name: string; weight: number }> {
    return Array.from(this.sources.entries()).map(([id, provider]) => ({
      id,
      name: provider.config.name,
      weight: this.sourceWeights.get(id) || 1,
    }));
  }

  /**
   * Create an aggregator with multiple sources
   */
  static create(
    id: string,
    name: string,
    method: AggregationMethod,
    sources: IOracleProvider[],
    threshold: number = 0.5
  ): AggregatorProvider {
    const config: OracleConfig = {
      id,
      name,
      description: `Aggregated oracle combining ${sources.length} sources`,
      type: "aggregator",
      trustLevel: "verified",
      active: true,
      aggregationMethod: method,
      sources: sources.map((s) => s.config.id),
    };

    const aggregator = new AggregatorProvider(config);
    aggregator.setThreshold(threshold);

    for (const source of sources) {
      aggregator.addSource(source);
    }

    return aggregator;
  }

  /**
   * Create an aggregator requiring unanimous agreement
   */
  static createUnanimous(
    id: string,
    name: string,
    sources: IOracleProvider[]
  ): AggregatorProvider {
    return AggregatorProvider.create(id, name, "all", sources, 1.0);
  }

  /**
   * Create an aggregator requiring majority agreement
   */
  static createMajority(
    id: string,
    name: string,
    sources: IOracleProvider[],
    threshold: number = 0.5
  ): AggregatorProvider {
    return AggregatorProvider.create(id, name, "majority", sources, threshold);
  }

  /**
   * Create an aggregator using weighted voting
   */
  static createWeighted(
    id: string,
    name: string,
    sourcesWithWeights: Array<{ provider: IOracleProvider; weight: number }>,
    threshold: number = 0.5
  ): AggregatorProvider {
    const config: OracleConfig = {
      id,
      name,
      description: `Weighted aggregated oracle`,
      type: "aggregator",
      trustLevel: "verified",
      active: true,
      aggregationMethod: "weighted",
    };

    const aggregator = new AggregatorProvider(config);
    aggregator.setThreshold(threshold);

    for (const { provider, weight } of sourcesWithWeights) {
      aggregator.addSource(provider, weight);
    }

    return aggregator;
  }
}
