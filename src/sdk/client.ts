/**
 * Pledge Protocol SDK Client
 * Phase 8: Ecosystem Expansion - Main SDK client implementation
 */

import {
  SDKConfig,
  APIResponse,
  PaginatedResponse,
  Address,
  Campaign,
  CreateCampaignRequest,
  UpdateCampaignRequest,
  CampaignListOptions,
  Pledge,
  CreatePledgeRequest,
  PledgeListOptions,
  Dispute,
  CreateDisputeRequest,
  Commemorative,
  UserProfile,
  OracleQueryResult,
} from "./types";
import { ChainId } from "../multichain/config";

/**
 * HTTP client for API requests
 */
class HTTPClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeout: number;
  private retries: number;

  constructor(config: SDKConfig) {
    this.baseUrl = config.apiUrl.replace(/\/$/, "");
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;
    this.headers = {
      "Content-Type": "application/json",
    };

    if (config.apiKey) {
      this.headers["X-API-Key"] = config.apiKey;
    }

    if (config.sessionId) {
      this.headers["Authorization"] = `Bearer ${config.sessionId}`;
    }
  }

  setSessionId(sessionId: string): void {
    this.headers["Authorization"] = `Bearer ${sessionId}`;
  }

  clearSession(): void {
    delete this.headers["Authorization"];
  }

  async request<T>(
    method: string,
    path: string,
    body?: any
  ): Promise<APIResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method,
          headers: this.headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json();

        if (!response.ok) {
          return {
            success: false,
            error: data.error || `HTTP ${response.status}`,
            code: data.code,
            requestId: response.headers.get("X-Request-ID") || undefined,
          };
        }

        return {
          success: true,
          data: data.data || data,
          requestId: response.headers.get("X-Request-ID") || undefined,
        };
      } catch (error) {
        lastError = error as Error;

        // Don't retry on abort
        if ((error as Error).name === "AbortError") {
          break;
        }

        // Wait before retry with exponential backoff
        if (attempt < this.retries - 1) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || "Request failed",
    };
  }

  get<T>(path: string): Promise<APIResponse<T>> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body?: any): Promise<APIResponse<T>> {
    return this.request<T>("POST", path, body);
  }

  put<T>(path: string, body?: any): Promise<APIResponse<T>> {
    return this.request<T>("PUT", path, body);
  }

  delete<T>(path: string): Promise<APIResponse<T>> {
    return this.request<T>("DELETE", path);
  }
}

/**
 * Campaign client
 */
export class CampaignClient {
  constructor(private http: HTTPClient, private chainId?: ChainId) {}

  async list(options?: CampaignListOptions): Promise<APIResponse<PaginatedResponse<Campaign>>> {
    const params = new URLSearchParams();

    if (options?.page) params.set("page", options.page.toString());
    if (options?.limit) params.set("limit", options.limit.toString());
    if (options?.sort) params.set("sort", options.sort);
    if (options?.order) params.set("order", options.order);
    if (options?.status) params.set("status", options.status);
    if (options?.category) params.set("category", options.category);
    if (options?.creator) params.set("creator", options.creator);
    if (options?.chainId) params.set("chainId", options.chainId.toString());
    if (options?.query) params.set("q", options.query);
    if (options?.tags) params.set("tags", options.tags.join(","));

    const query = params.toString() ? `?${params.toString()}` : "";
    return this.http.get(`/v1/campaigns${query}`);
  }

  async get(campaignId: string): Promise<APIResponse<Campaign>> {
    return this.http.get(`/v1/campaigns/${campaignId}`);
  }

  async create(request: CreateCampaignRequest): Promise<APIResponse<Campaign>> {
    return this.http.post("/v1/campaigns", {
      ...request,
      chainId: this.chainId,
    });
  }

  async update(campaignId: string, request: UpdateCampaignRequest): Promise<APIResponse<Campaign>> {
    return this.http.put(`/v1/campaigns/${campaignId}`, request);
  }

  async activate(campaignId: string): Promise<APIResponse<Campaign>> {
    return this.http.post(`/v1/campaigns/${campaignId}/activate`);
  }

  async cancel(campaignId: string, reason?: string): Promise<APIResponse<Campaign>> {
    return this.http.post(`/v1/campaigns/${campaignId}/cancel`, { reason });
  }

  async deployToChain(campaignId: string, chainId: ChainId): Promise<APIResponse<any>> {
    return this.http.post(`/v1/campaigns/${campaignId}/deploy`, { chainId });
  }

  async getChains(campaignId: string): Promise<APIResponse<any[]>> {
    return this.http.get(`/v1/campaigns/${campaignId}/chains`);
  }

  async getTrending(limit?: number): Promise<APIResponse<Campaign[]>> {
    return this.http.get(`/v1/analytics/platform/trending?limit=${limit || 10}`);
  }

  async search(query: string, options?: CampaignListOptions): Promise<APIResponse<PaginatedResponse<Campaign>>> {
    return this.list({ ...options, query });
  }
}

/**
 * Pledge client
 */
export class PledgeClient {
  constructor(private http: HTTPClient, private chainId?: ChainId) {}

  async list(options?: PledgeListOptions): Promise<APIResponse<PaginatedResponse<Pledge>>> {
    const params = new URLSearchParams();

    if (options?.page) params.set("page", options.page.toString());
    if (options?.limit) params.set("limit", options.limit.toString());
    if (options?.campaignId) params.set("campaignId", options.campaignId);
    if (options?.backer) params.set("backer", options.backer);
    if (options?.status) params.set("status", options.status);
    if (options?.chainId) params.set("chainId", options.chainId.toString());

    const query = params.toString() ? `?${params.toString()}` : "";
    return this.http.get(`/v1/pledges${query}`);
  }

  async get(pledgeId: string): Promise<APIResponse<Pledge>> {
    return this.http.get(`/v1/pledges/${pledgeId}`);
  }

  async create(request: CreatePledgeRequest): Promise<APIResponse<Pledge>> {
    return this.http.post("/v1/pledges", {
      ...request,
      chainId: request.chainId || this.chainId,
    });
  }

  async cancel(pledgeId: string): Promise<APIResponse<Pledge>> {
    return this.http.post(`/v1/pledges/${pledgeId}/cancel`);
  }

  async getByBacker(backerAddress: Address): Promise<APIResponse<Pledge[]>> {
    return this.http.get(`/v1/backers/${backerAddress}/pledges`);
  }

  async getForCampaign(campaignId: string): Promise<APIResponse<Pledge[]>> {
    return this.http.get(`/v1/campaigns/${campaignId}/pledges`);
  }
}

/**
 * Oracle client
 */
export class OracleClient {
  constructor(private http: HTTPClient) {}

  async query(oracleId: string, params: Record<string, any>): Promise<APIResponse<OracleQueryResult>> {
    return this.http.post(`/v1/oracles/${oracleId}/query`, params);
  }

  async list(): Promise<APIResponse<any[]>> {
    return this.http.get("/v1/oracles");
  }

  async get(oracleId: string): Promise<APIResponse<any>> {
    return this.http.get(`/v1/oracles/${oracleId}`);
  }
}

/**
 * Dispute client
 */
export class DisputeClient {
  constructor(private http: HTTPClient) {}

  async list(options?: { campaignId?: string; status?: string }): Promise<APIResponse<Dispute[]>> {
    const params = new URLSearchParams();
    if (options?.campaignId) params.set("campaignId", options.campaignId);
    if (options?.status) params.set("status", options.status);

    const query = params.toString() ? `?${params.toString()}` : "";
    return this.http.get(`/v1/disputes${query}`);
  }

  async get(disputeId: string): Promise<APIResponse<Dispute>> {
    return this.http.get(`/v1/disputes/${disputeId}`);
  }

  async create(request: CreateDisputeRequest): Promise<APIResponse<Dispute>> {
    return this.http.post("/v1/disputes", request);
  }

  async submitEvidence(
    disputeId: string,
    evidence: { type: string; description: string; content: string }
  ): Promise<APIResponse<any>> {
    return this.http.post(`/v1/disputes/${disputeId}/evidence`, evidence);
  }

  async vote(
    disputeId: string,
    vote: { vote: string; rationale?: string }
  ): Promise<APIResponse<any>> {
    return this.http.post(`/v1/disputes/${disputeId}/vote`, vote);
  }

  async appeal(disputeId: string, reason: string): Promise<APIResponse<any>> {
    return this.http.post(`/v1/disputes/${disputeId}/appeal`, { reason });
  }
}

/**
 * Commemorative client
 */
export class CommemorativeClient {
  constructor(private http: HTTPClient) {}

  async get(commemorativeId: string): Promise<APIResponse<Commemorative>> {
    return this.http.get(`/v1/commemoratives/${commemorativeId}`);
  }

  async getByPledge(pledgeId: string): Promise<APIResponse<Commemorative>> {
    return this.http.get(`/v1/commemoratives/pledge/${pledgeId}`);
  }

  async listForCampaign(campaignId: string): Promise<APIResponse<Commemorative[]>> {
    return this.http.get(`/v1/commemoratives/campaign/${campaignId}`);
  }

  async listForBacker(backerAddress: Address): Promise<APIResponse<Commemorative[]>> {
    return this.http.get(`/v1/backers/${backerAddress}/commemoratives`);
  }
}

/**
 * User client
 */
export class UserClient {
  constructor(private http: HTTPClient) {}

  async getProfile(address: Address): Promise<APIResponse<UserProfile>> {
    return this.http.get(`/v1/users/${address}`);
  }

  async updateProfile(profile: Partial<UserProfile>): Promise<APIResponse<UserProfile>> {
    return this.http.put("/v1/users/me", profile);
  }

  async follow(address: Address): Promise<APIResponse<void>> {
    return this.http.post(`/v1/users/${address}/follow`);
  }

  async unfollow(address: Address): Promise<APIResponse<void>> {
    return this.http.delete(`/v1/users/${address}/follow`);
  }

  async getFollowers(address: Address): Promise<APIResponse<UserProfile[]>> {
    return this.http.get(`/v1/users/${address}/followers`);
  }

  async getFollowing(address: Address): Promise<APIResponse<UserProfile[]>> {
    return this.http.get(`/v1/users/${address}/following`);
  }
}

/**
 * Auth client
 */
export class AuthClient {
  constructor(private http: HTTPClient) {}

  async getChallenge(address: Address): Promise<APIResponse<{ message: string; nonce: string; expiresAt: number }>> {
    return this.http.post("/v1/auth/challenge", { address });
  }

  async verify(
    address: Address,
    message: string,
    signature: string,
    chainId?: ChainId
  ): Promise<APIResponse<{ sessionId: string; expiresAt: number }>> {
    return this.http.post("/v1/auth/verify", {
      address,
      message,
      signature,
      chainId,
    });
  }

  async logout(): Promise<APIResponse<void>> {
    return this.http.post("/v1/auth/logout");
  }

  async getSession(): Promise<APIResponse<any>> {
    return this.http.get("/v1/auth/session");
  }
}

/**
 * Main Pledge Protocol SDK Client
 */
export class PledgeProtocolClient {
  private http: HTTPClient;
  private config: SDKConfig;

  public campaigns: CampaignClient;
  public pledges: PledgeClient;
  public oracles: OracleClient;
  public disputes: DisputeClient;
  public commemoratives: CommemorativeClient;
  public users: UserClient;
  public auth: AuthClient;

  constructor(config: SDKConfig) {
    this.config = config;
    this.http = new HTTPClient(config);

    this.campaigns = new CampaignClient(this.http, config.chainId);
    this.pledges = new PledgeClient(this.http, config.chainId);
    this.oracles = new OracleClient(this.http);
    this.disputes = new DisputeClient(this.http);
    this.commemoratives = new CommemorativeClient(this.http);
    this.users = new UserClient(this.http);
    this.auth = new AuthClient(this.http);
  }

  /**
   * Set the session ID for authenticated requests
   */
  setSession(sessionId: string): void {
    this.http.setSessionId(sessionId);
  }

  /**
   * Clear the current session
   */
  clearSession(): void {
    this.http.clearSession();
  }

  /**
   * Create a client for a specific chain
   */
  forChain(chainId: ChainId): PledgeProtocolClient {
    return new PledgeProtocolClient({
      ...this.config,
      chainId,
    });
  }

  /**
   * Get health status
   */
  async health(): Promise<APIResponse<any>> {
    return this.http.get("/health");
  }

  /**
   * Get monitoring metrics
   */
  async metrics(): Promise<APIResponse<any>> {
    return this.http.get("/v1/monitoring/metrics/json");
  }
}

/**
 * Create a new SDK client
 */
export function createClient(config: SDKConfig): PledgeProtocolClient {
  return new PledgeProtocolClient(config);
}
