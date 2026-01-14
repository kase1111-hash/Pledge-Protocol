import { EventEmitter } from "events";
import { IOracleProvider, BaseOracleProvider } from "./base-provider";
import {
  OracleConfig,
  OracleQuery,
  OracleResponse,
  MilestoneCondition,
  VerificationResult,
} from "./types";
import { ApiOracleProvider } from "./providers/api-provider";
import { RaceTimingProvider } from "./providers/race-timing-provider";
import { GitHubProvider } from "./providers/github-provider";

/**
 * Oracle Router
 * Central hub for managing oracle providers and routing queries
 */
export class OracleRouter extends EventEmitter {
  private providers: Map<string, IOracleProvider> = new Map();
  private subscriptions: Map<string, NodeJS.Timeout> = new Map();
  private responseCache: Map<string, { response: OracleResponse; expiry: number }> = new Map();

  private cacheTimeout = 60000; // 1 minute default
  private defaultPollInterval = 30000; // 30 seconds

  constructor() {
    super();
  }

  /**
   * Register an oracle provider
   */
  registerProvider(config: OracleConfig): IOracleProvider {
    let provider: IOracleProvider;

    switch (config.type) {
      case "api":
        // Check for specialized providers
        if (config.id.includes("race") || config.id.includes("timing")) {
          provider = new RaceTimingProvider(config);
        } else if (config.id.includes("github")) {
          provider = new GitHubProvider(config);
        } else {
          provider = new ApiOracleProvider(config);
        }
        break;

      case "attestation":
        // Attestation providers don't need HTTP client
        provider = new AttestationProvider(config);
        break;

      case "aggregator":
        provider = new AggregatorProvider(config, this);
        break;

      default:
        throw new Error(`Unknown oracle type: ${config.type}`);
    }

    this.providers.set(config.id, provider);
    this.emit("provider:registered", config.id);

    return provider;
  }

  /**
   * Get a provider by ID
   */
  getProvider(oracleId: string): IOracleProvider | undefined {
    return this.providers.get(oracleId);
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(oracleId: string): void {
    this.providers.delete(oracleId);
    this.stopPolling(oracleId);
    this.emit("provider:unregistered", oracleId);
  }

  /**
   * Query an oracle
   */
  async query(oracleQuery: OracleQuery): Promise<OracleResponse> {
    const { oracleId, params } = oracleQuery;

    const provider = this.providers.get(oracleId);
    if (!provider) {
      return {
        success: false,
        data: null,
        timestamp: Date.now(),
        source: oracleId,
        cached: false,
        error: `Oracle not found: ${oracleId}`,
      };
    }

    // Check cache
    const cacheKey = this.getCacheKey(oracleQuery);
    const cached = this.responseCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return { ...cached.response, cached: true };
    }

    // Query the provider
    const response = await provider.query(params);

    // Cache successful responses
    if (response.success) {
      this.responseCache.set(cacheKey, {
        response,
        expiry: Date.now() + this.cacheTimeout,
      });
    }

    this.emit("query:completed", oracleQuery, response);
    return response;
  }

  /**
   * Verify a milestone condition
   */
  async verifyMilestone(
    oracleId: string,
    campaignId: string,
    milestoneId: string,
    condition: MilestoneCondition,
    params: Record<string, any>
  ): Promise<VerificationResult> {
    const provider = this.providers.get(oracleId);

    if (!provider) {
      return {
        milestoneId,
        campaignId,
        verified: false,
        oracleData: null,
        evaluatedCondition: condition,
        timestamp: Date.now(),
        error: `Oracle not found: ${oracleId}`,
      };
    }

    const response = await this.query({ oracleId, campaignId, milestoneId, params });

    if (!response.success) {
      return {
        milestoneId,
        campaignId,
        verified: false,
        oracleData: null,
        evaluatedCondition: condition,
        timestamp: Date.now(),
        error: response.error,
      };
    }

    const verified = provider.verifyCondition(response.data, condition);

    const result: VerificationResult = {
      milestoneId,
      campaignId,
      verified,
      oracleData: response.data,
      evaluatedCondition: condition,
      timestamp: Date.now(),
    };

    this.emit("milestone:verified", result);
    return result;
  }

  /**
   * Subscribe to oracle updates (polling)
   */
  subscribe(
    oracleId: string,
    campaignId: string,
    params: Record<string, any>,
    callback: (response: OracleResponse) => void,
    interval?: number
  ): string {
    const subscriptionId = `${oracleId}:${campaignId}:${Date.now()}`;
    const pollInterval = interval || this.defaultPollInterval;

    const poll = async () => {
      const response = await this.query({
        oracleId,
        campaignId,
        milestoneId: "",
        params,
      });
      callback(response);
    };

    // Initial poll
    poll();

    // Set up recurring poll
    const timer = setInterval(poll, pollInterval);
    this.subscriptions.set(subscriptionId, timer);

    return subscriptionId;
  }

  /**
   * Unsubscribe from oracle updates
   */
  unsubscribe(subscriptionId: string): void {
    const timer = this.subscriptions.get(subscriptionId);
    if (timer) {
      clearInterval(timer);
      this.subscriptions.delete(subscriptionId);
    }
  }

  /**
   * Stop all polling for an oracle
   */
  stopPolling(oracleId: string): void {
    for (const [subId, timer] of this.subscriptions.entries()) {
      if (subId.startsWith(oracleId)) {
        clearInterval(timer);
        this.subscriptions.delete(subId);
      }
    }
  }

  /**
   * Health check all providers
   */
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [id, provider] of this.providers.entries()) {
      results[id] = await provider.healthCheck();
    }

    return results;
  }

  /**
   * Clear response cache
   */
  clearCache(): void {
    this.responseCache.clear();
  }

  /**
   * Get cache key for a query
   */
  private getCacheKey(query: OracleQuery): string {
    return `${query.oracleId}:${query.campaignId}:${query.milestoneId}:${JSON.stringify(query.params)}`;
  }

  /**
   * Get all registered provider IDs
   */
  getProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Shutdown the router
   */
  shutdown(): void {
    // Clear all subscriptions
    for (const timer of this.subscriptions.values()) {
      clearInterval(timer);
    }
    this.subscriptions.clear();

    // Clear cache
    this.clearCache();

    // Clear providers
    this.providers.clear();

    this.emit("shutdown");
  }
}

/**
 * Attestation Provider (for manual attestations)
 */
class AttestationProvider extends BaseOracleProvider {
  private attestations: Map<string, any> = new Map();

  async query(params: Record<string, any>): Promise<OracleResponse> {
    const { campaignId, milestoneId } = params;
    const key = `${campaignId}:${milestoneId}`;

    const attestation = this.attestations.get(key);

    if (attestation) {
      return {
        success: true,
        data: attestation,
        timestamp: Date.now(),
        source: this.config.name,
        cached: false,
      };
    }

    return {
      success: false,
      data: null,
      timestamp: Date.now(),
      source: this.config.name,
      cached: false,
      error: "No attestation found",
    };
  }

  /**
   * Submit an attestation
   */
  submitAttestation(
    campaignId: string,
    milestoneId: string,
    data: any
  ): void {
    const key = `${campaignId}:${milestoneId}`;
    this.attestations.set(key, {
      ...data,
      timestamp: Date.now(),
    });
  }
}

/**
 * Aggregator Provider (combines multiple oracle sources)
 */
class AggregatorProvider extends BaseOracleProvider {
  constructor(config: OracleConfig, private router: OracleRouter) {
    super(config);
  }

  async query(params: Record<string, any>): Promise<OracleResponse> {
    if (!this.config.sources || this.config.sources.length === 0) {
      return {
        success: false,
        data: null,
        timestamp: Date.now(),
        source: this.config.name,
        cached: false,
        error: "No sources configured",
      };
    }

    const results = await Promise.all(
      this.config.sources.map((sourceId) =>
        this.router.query({
          oracleId: sourceId,
          campaignId: params.campaignId || "",
          milestoneId: params.milestoneId || "",
          params,
        })
      )
    );

    const successfulResults = results.filter((r) => r.success);
    const method = this.config.aggregationMethod || "all";

    let success = false;
    let aggregatedData: any = null;

    switch (method) {
      case "all":
        success = successfulResults.length === results.length;
        if (success) {
          aggregatedData = this.mergeResults(successfulResults);
        }
        break;

      case "majority":
        success = successfulResults.length > results.length / 2;
        if (success) {
          aggregatedData = this.mergeResults(successfulResults);
        }
        break;

      case "any":
        success = successfulResults.length > 0;
        if (success) {
          aggregatedData = successfulResults[0].data;
        }
        break;
    }

    return {
      success,
      data: aggregatedData,
      timestamp: Date.now(),
      source: this.config.name,
      cached: false,
      error: success ? undefined : "Aggregation failed",
    };
  }

  private mergeResults(results: OracleResponse[]): any {
    // Simple merge - take first result's data
    // Could be made more sophisticated for specific use cases
    return results[0].data;
  }
}

// Export singleton instance
export const oracleRouter = new OracleRouter();
