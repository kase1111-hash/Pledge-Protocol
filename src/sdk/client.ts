/**
 * Pledge Protocol SDK Client
 * Phase 8: Ecosystem Expansion - Main SDK client implementation
 */

import {
  SDKConfig,
  APIResponse,
  PaginatedResponse,
  Address,
  AttestationResult,
  Campaign,
  CampaignListOptions,
  CampaignResolution,
  CampaignStats,
  CancelPledgeResult,
  CastVoteRequest,
  CreateCampaignRequest,
  CreatePledgeRequest,
  CreateDisputeRequest,
  Commemorative,
  CommemorativeSummary,
  Dispute,
  DisputeEvidence,
  MilestoneVerification,
  Oracle,
  OracleQueryResult,
  PledgeListOptions,
  PledgeView,
  SubmitAttestationRequest,
  UserProfile,
} from "./types";
import { ChainId } from "../multichain/config";

/** Methods that are safe to repeat after a network failure */
const IDEMPOTENT_METHODS = new Set(["GET", "PUT", "DELETE"]);

/**
 * Pull a message and code out of the API's error bodies, which come as
 * { error: "message", code } or { error: { code, message } }
 */
function parseError(body: unknown, status: number): { error: string; code?: string } {
  const payload = (body ?? {}) as { error?: unknown; code?: unknown; message?: unknown };
  const error = payload.error;

  if (error && typeof error === "object") {
    const { code, message } = error as { code?: unknown; message?: unknown };
    return {
      error: typeof message === "string" ? message : `HTTP ${status}`,
      code: typeof code === "string" ? code : undefined,
    };
  }

  return {
    error: typeof error === "string" ? error : typeof payload.message === "string" ? payload.message : `HTTP ${status}`,
    code: typeof payload.code === "string" ? payload.code : undefined,
  };
}

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

  /**
   * @param raw Return the body as-is instead of unwrapping { success, data }
   *   envelopes (for endpoints whose payload itself has those fields)
   */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    raw = false
  ): Promise<APIResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    // Repeating a POST could, e.g., create a pledge twice
    const attempts = IDEMPOTENT_METHODS.has(method) ? this.retries : 1;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        let response: Response;
        try {
          response = await fetch(url, {
            method,
            headers: this.headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        const text = await response.text();
        let data: unknown = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }
        const requestId = response.headers.get("X-Request-ID") || undefined;

        if (!response.ok) {
          return {
            success: false,
            status: response.status,
            ...parseError(data, response.status),
            requestId,
          };
        }

        // Some endpoints wrap their payload as { success, data }
        const wrapped = data as { success?: unknown; data?: unknown } | null;
        const payload = !raw && wrapped && wrapped.success === true && "data" in wrapped ? wrapped.data : data;

        return {
          success: true,
          data: payload as T,
          requestId,
        };
      } catch (error) {
        lastError = error as Error;

        // Don't retry on abort
        if ((error as Error).name === "AbortError") {
          break;
        }

        // Wait before retry with exponential backoff
        if (attempt < attempts - 1) {
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

  post<T>(path: string, body?: unknown, raw = false): Promise<APIResponse<T>> {
    return this.request<T>("POST", path, body ?? {}, raw);
  }

  put<T>(path: string, body?: unknown): Promise<APIResponse<T>> {
    return this.request<T>("PUT", path, body ?? {});
  }

  delete<T>(path: string): Promise<APIResponse<T>> {
    return this.request<T>("DELETE", path);
  }
}

/**
 * Turn page/limit options into the API's limit/offset query string
 */
function pageQuery(options: { page?: number; limit?: number } | undefined, filters: Record<string, string | undefined>): {
  query: string;
  page: number;
  limit: number;
} {
  const page = Math.max(1, Math.floor(options?.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.floor(options?.limit ?? 20)));
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) params.set(key, value);
  }
  params.set("limit", String(limit));
  params.set("offset", String((page - 1) * limit));
  return { query: `?${params.toString()}`, page, limit };
}

/**
 * Convert a { [key]: items, total } list response into a PaginatedResponse
 */
function paginate<T>(
  response: APIResponse<Record<string, unknown>>,
  key: string,
  page: number,
  limit: number
): APIResponse<PaginatedResponse<T>> {
  if (!response.success || !response.data) {
    return response as APIResponse<never>;
  }
  const total = Number(response.data.total ?? 0);
  return {
    ...response,
    data: {
      data: (response.data[key] as T[]) ?? [],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Unwrap a { [key]: items } response into the items
 */
function unwrapList<T>(response: APIResponse<Record<string, unknown>>, key: string): APIResponse<T[]> {
  if (!response.success || !response.data) {
    return response as APIResponse<never>;
  }
  return { ...response, data: (response.data[key] as T[]) ?? [] };
}

/**
 * Campaign client
 */
export class CampaignClient {
  constructor(private http: HTTPClient) {}

  async list(options?: CampaignListOptions): Promise<APIResponse<PaginatedResponse<Campaign>>> {
    const { query, page, limit } = pageQuery(options, {
      status: options?.status,
      creator: options?.creator,
    });
    const response = await this.http.get<Record<string, unknown>>(`/v1/campaigns${query}`);
    return paginate<Campaign>(response, "campaigns", page, limit);
  }

  async get(campaignId: string): Promise<APIResponse<Campaign>> {
    return this.http.get(`/v1/campaigns/${encodeURIComponent(campaignId)}`);
  }

  async create(request: CreateCampaignRequest): Promise<APIResponse<Campaign>> {
    return this.http.post("/v1/campaigns", request);
  }

  async activate(campaignId: string): Promise<APIResponse<{ id: string; status: string; activatedAt: number }>> {
    return this.http.post(`/v1/campaigns/${encodeURIComponent(campaignId)}/activate`);
  }

  /**
   * Cancel a draft or active campaign, refunding every active pledge
   */
  async cancel(campaignId: string): Promise<APIResponse<{
    id: string;
    status: string;
    pledgesRefunded: number;
    totalRefunded: string;
  }>> {
    return this.http.post(`/v1/campaigns/${encodeURIComponent(campaignId)}/cancel`);
  }

  /**
   * Check a milestone against its (API) oracle and record it if it passes
   */
  async verifyMilestone(campaignId: string, milestoneId: string): Promise<APIResponse<MilestoneVerification>> {
    return this.http.post(
      `/v1/campaigns/${encodeURIComponent(campaignId)}/milestones/${encodeURIComponent(milestoneId)}/verify`
    );
  }

  /**
   * Release or refund every pledge according to the verified milestones.
   * Fails with code PLEDGE_WINDOW_OPEN or MILESTONES_PENDING when it is too early.
   */
  async resolve(campaignId: string): Promise<APIResponse<CampaignResolution>> {
    return this.http.post(`/v1/campaigns/${encodeURIComponent(campaignId)}/resolve`);
  }

  async getStats(campaignId: string): Promise<APIResponse<CampaignStats>> {
    return this.http.get(`/v1/campaigns/${encodeURIComponent(campaignId)}/stats`);
  }

  /**
   * Chains the campaign is deployed to
   */
  async getChains(campaignId: string): Promise<APIResponse<Record<string, unknown>>> {
    return this.http.get(`/v1/chains/campaigns/${encodeURIComponent(campaignId)}`);
  }

  async getTrending(limit?: number): Promise<APIResponse<{
    trending: unknown[];
    featured: unknown[];
    endingSoon: unknown[];
    recentlyResolved: unknown[];
  }>> {
    return this.http.get(`/v1/analytics/platform/trending?limit=${limit || 10}`);
  }
}

/**
 * Pledge client
 */
export class PledgeClient {
  constructor(private http: HTTPClient) {}

  async list(options?: PledgeListOptions): Promise<APIResponse<PaginatedResponse<PledgeView>>> {
    const { query, page, limit } = pageQuery(options, {
      campaignId: options?.campaignId,
      backer: options?.backer,
      status: options?.status,
    });
    const response = await this.http.get<Record<string, unknown>>(`/v1/pledges${query}`);
    return paginate<PledgeView>(response, "pledges", page, limit);
  }

  async get(pledgeId: string): Promise<APIResponse<PledgeView>> {
    return this.http.get(`/v1/pledges/${encodeURIComponent(pledgeId)}`);
  }

  async create(request: CreatePledgeRequest): Promise<APIResponse<PledgeView>> {
    return this.http.post("/v1/pledges", request);
  }

  /**
   * Cancel your own pledge while the campaign's pledge window is open
   */
  async cancel(pledgeId: string): Promise<APIResponse<CancelPledgeResult>> {
    return this.http.delete(`/v1/pledges/${encodeURIComponent(pledgeId)}`);
  }

  async getByBacker(backerAddress: Address, options?: PledgeListOptions): Promise<APIResponse<PaginatedResponse<PledgeView>>> {
    const { query, page, limit } = pageQuery(options, { status: options?.status });
    const response = await this.http.get<Record<string, unknown>>(
      `/v1/backers/${encodeURIComponent(backerAddress)}/pledges${query}`
    );
    return paginate<PledgeView>(response, "pledges", page, limit);
  }

  /**
   * Pledges of the signed-in account
   */
  async mine(options?: PledgeListOptions): Promise<APIResponse<PaginatedResponse<PledgeView>>> {
    const { query, page, limit } = pageQuery(options, { status: options?.status });
    const response = await this.http.get<Record<string, unknown>>(`/v1/backers/me/pledges${query}`);
    return paginate<PledgeView>(response, "pledges", page, limit);
  }

  async getForCampaign(campaignId: string, options?: PledgeListOptions): Promise<APIResponse<PaginatedResponse<PledgeView>>> {
    const { query, page, limit } = pageQuery(options, {});
    const response = await this.http.get<Record<string, unknown>>(
      `/v1/campaigns/${encodeURIComponent(campaignId)}/pledges${query}`
    );
    return paginate<PledgeView>(response, "pledges", page, limit);
  }
}

/**
 * Oracle client
 */
export class OracleClient {
  constructor(private http: HTTPClient) {}

  async query(oracleId: string, params: Record<string, unknown>): Promise<APIResponse<OracleQueryResult>> {
    // The result's own success/data fields are the oracle's answer
    return this.http.post(`/v1/oracles/${encodeURIComponent(oracleId)}/query`, { params }, true);
  }

  async list(options?: { type?: Oracle["type"]; includeInactive?: boolean }): Promise<APIResponse<Oracle[]>> {
    const params = new URLSearchParams();
    if (options?.type) params.set("type", options.type);
    if (options?.includeInactive) params.set("active", "false");
    const query = params.toString() ? `?${params.toString()}` : "";
    return unwrapList<Oracle>(await this.http.get(`/v1/oracles${query}`), "oracles");
  }

  async get(oracleId: string): Promise<APIResponse<Oracle>> {
    return this.http.get(`/v1/oracles/${encodeURIComponent(oracleId)}`);
  }

  /**
   * Decide a milestone as its oracle's attestor
   */
  async submitAttestation(request: SubmitAttestationRequest): Promise<APIResponse<AttestationResult>> {
    return this.http.post("/v1/oracles/attestations", request);
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
    return this.http.get(`/v1/disputes/${encodeURIComponent(disputeId)}`);
  }

  async create(request: CreateDisputeRequest): Promise<APIResponse<Dispute>> {
    return this.http.post("/v1/disputes", request);
  }

  async submitEvidence(disputeId: string, evidence: DisputeEvidence): Promise<APIResponse<Record<string, unknown>>> {
    return this.http.post(`/v1/disputes/${encodeURIComponent(disputeId)}/evidence`, evidence);
  }

  /**
   * Vote as the signed-in account, with the voting power assigned when voting opened
   */
  async vote(disputeId: string, vote: CastVoteRequest): Promise<APIResponse<Record<string, unknown>>> {
    return this.http.post(`/v1/disputes/${encodeURIComponent(disputeId)}/voting/vote`, vote);
  }

  async appeal(disputeId: string, reason: string): Promise<APIResponse<Record<string, unknown>>> {
    return this.http.post(`/v1/disputes/${encodeURIComponent(disputeId)}/appeal`, { reason });
  }
}

/**
 * Commemorative client
 */
export class CommemorativeClient {
  constructor(private http: HTTPClient) {}

  async get(commemorativeId: string): Promise<APIResponse<Commemorative>> {
    return this.http.get(`/v1/commemoratives/${encodeURIComponent(commemorativeId)}`);
  }

  async getByPledge(pledgeId: string): Promise<APIResponse<Commemorative>> {
    return this.http.get(`/v1/commemoratives/pledge/${encodeURIComponent(pledgeId)}`);
  }

  async listForCampaign(campaignId: string): Promise<APIResponse<CommemorativeSummary[]>> {
    return unwrapList<CommemorativeSummary>(
      await this.http.get(`/v1/commemoratives/campaign/${encodeURIComponent(campaignId)}`),
      "commemoratives"
    );
  }

  async listForBacker(backerAddress: Address): Promise<APIResponse<CommemorativeSummary[]>> {
    return unwrapList<CommemorativeSummary>(
      await this.http.get(`/v1/backers/${encodeURIComponent(backerAddress)}/commemoratives`),
      "commemoratives"
    );
  }
}

/**
 * User client
 */
export class UserClient {
  constructor(private http: HTTPClient) {}

  async getProfile(address: Address): Promise<APIResponse<UserProfile>> {
    return this.http.get(`/v1/social/users/${encodeURIComponent(address)}`);
  }

  async updateProfile(profile: Partial<UserProfile>): Promise<APIResponse<UserProfile>> {
    return this.http.put("/v1/social/users/me", profile);
  }

  async follow(address: Address): Promise<APIResponse<void>> {
    return this.http.post(`/v1/social/users/${encodeURIComponent(address)}/follow`);
  }

  async unfollow(address: Address): Promise<APIResponse<void>> {
    return this.http.delete(`/v1/social/users/${encodeURIComponent(address)}/follow`);
  }

  async getFollowers(address: Address): Promise<APIResponse<UserProfile[]>> {
    return this.http.get(`/v1/social/users/${encodeURIComponent(address)}/followers`);
  }

  async getFollowing(address: Address): Promise<APIResponse<UserProfile[]>> {
    return this.http.get(`/v1/social/users/${encodeURIComponent(address)}/following`);
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
  ): Promise<APIResponse<{
    sessionId: string;
    address: string;
    roles: string[];
    permissions: string[];
    expiresAt: number;
  }>> {
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

  async getSession(): Promise<APIResponse<Record<string, unknown>>> {
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

    this.campaigns = new CampaignClient(this.http);
    this.pledges = new PledgeClient(this.http);
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
   * Sign in with a wallet: requests a challenge, signs it with signMessage,
   * and uses the resulting session for subsequent requests
   */
  async signIn(
    address: Address,
    signMessage: (message: string) => Promise<string>
  ): Promise<APIResponse<{ sessionId: string; expiresAt: number }>> {
    const challenge = await this.auth.getChallenge(address);
    if (!challenge.success || !challenge.data) {
      return challenge as APIResponse<never>;
    }

    const signature = await signMessage(challenge.data.message);
    const verified = await this.auth.verify(address, challenge.data.message, signature, this.config.chainId);
    if (verified.success && verified.data) {
      this.setSession(verified.data.sessionId);
    }
    return verified;
  }

  /**
   * A client with the same settings for a different chain
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
  async health(): Promise<APIResponse<{ status: string; timestamp: string; version: string }>> {
    return this.http.get("/health");
  }

  /**
   * Get monitoring metrics
   */
  async metrics(): Promise<APIResponse<Record<string, unknown>>> {
    return this.http.get("/v1/monitoring/metrics/json");
  }
}

/**
 * Create a new SDK client
 */
export function createClient(config: SDKConfig): PledgeProtocolClient {
  return new PledgeProtocolClient(config);
}
