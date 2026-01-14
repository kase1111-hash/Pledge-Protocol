/**
 * Cache Layer
 * Phase 7: Production Infrastructure - In-memory and Redis-compatible caching
 */

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
  createdAt: number;
  accessCount: number;
  lastAccessedAt: number;
  tags: string[];
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  size: number;
  hitRate: number;
}

/**
 * Cache options
 */
export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  tags?: string[]; // Tags for bulk invalidation
}

/**
 * In-Memory Cache
 * LRU cache with TTL support, suitable for single-instance deployments
 * Can be swapped with Redis client for production
 */
export class MemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private maxSize: number;
  private defaultTtl: number;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    size: 0,
    hitRate: 0,
  };

  constructor(options?: { maxSize?: number; defaultTtl?: number }) {
    this.maxSize = options?.maxSize || 10000;
    this.defaultTtl = options?.defaultTtl || 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.size = this.cache.size;
      this.updateHitRate();
      return undefined;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();
    this.stats.hits++;
    this.updateHitRate();

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, options?: CacheOptions): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const ttl = options?.ttl ?? this.defaultTtl;
    const now = Date.now();

    const entry: CacheEntry<T> = {
      value,
      expiresAt: ttl ? now + ttl : null,
      createdAt: now,
      accessCount: 0,
      lastAccessedAt: now,
      tags: options?.tags || [],
    };

    this.cache.set(key, entry);
    this.stats.sets++;
    this.stats.size = this.cache.size;
  }

  /**
   * Check if key exists (and not expired)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.size = this.cache.size;
      return false;
    }

    return true;
  }

  /**
   * Delete value from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
      this.stats.size = this.cache.size;
    }
    return deleted;
  }

  /**
   * Delete multiple keys by pattern
   */
  deletePattern(pattern: string): number {
    const regex = new RegExp(pattern.replace(/\*/g, ".*"));
    let deleted = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deleted++;
      }
    }

    if (deleted > 0) {
      this.stats.deletes += deleted;
      this.stats.size = this.cache.size;
    }

    return deleted;
  }

  /**
   * Delete all entries with a specific tag
   */
  deleteByTag(tag: string): number {
    let deleted = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.includes(tag)) {
        this.cache.delete(key);
        deleted++;
      }
    }

    if (deleted > 0) {
      this.stats.deletes += deleted;
      this.stats.size = this.cache.size;
    }

    return deleted;
  }

  /**
   * Get or set with callback
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, options);
    return value;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.deletes += size;
    this.stats.size = 0;
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get keys matching pattern
   */
  keysMatching(pattern: string): string[] {
    const regex = new RegExp(pattern.replace(/\*/g, ".*"));
    return Array.from(this.cache.keys()).filter((key) => regex.test(key));
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      size: this.cache.size,
      hitRate: 0,
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.stats.evictions += cleaned;
      this.stats.size = this.cache.size;
    }

    return cleaned;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessedAt < oldestAccess) {
        oldestAccess = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      this.stats.size = this.cache.size;
    }
  }

  /**
   * Update hit rate calculation
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
}

/**
 * Specialized cache for oracle responses
 */
export class OracleCache extends MemoryCache {
  constructor() {
    super({
      maxSize: 5000,
      defaultTtl: 60 * 1000, // 1 minute default for oracle data
    });
  }

  /**
   * Cache oracle response
   */
  cacheResponse(
    oracleId: string,
    queryParams: Record<string, any>,
    response: any,
    ttl?: number
  ): void {
    const key = this.buildKey(oracleId, queryParams);
    this.set(key, response, { ttl, tags: [`oracle:${oracleId}`] });
  }

  /**
   * Get cached oracle response
   */
  getCachedResponse(oracleId: string, queryParams: Record<string, any>): any | undefined {
    const key = this.buildKey(oracleId, queryParams);
    return this.get(key);
  }

  /**
   * Invalidate all responses for an oracle
   */
  invalidateOracle(oracleId: string): number {
    return this.deleteByTag(`oracle:${oracleId}`);
  }

  /**
   * Build cache key from oracle ID and query params
   */
  private buildKey(oracleId: string, queryParams: Record<string, any>): string {
    const sortedParams = Object.keys(queryParams)
      .sort()
      .map((k) => `${k}=${JSON.stringify(queryParams[k])}`)
      .join("&");
    return `oracle:${oracleId}:${sortedParams}`;
  }
}

/**
 * Specialized cache for campaign data
 */
export class CampaignCache extends MemoryCache {
  constructor() {
    super({
      maxSize: 10000,
      defaultTtl: 5 * 60 * 1000, // 5 minutes
    });
  }

  /**
   * Cache campaign data
   */
  cacheCampaign(campaignId: string, data: any): void {
    this.set(`campaign:${campaignId}`, data, { tags: ["campaigns"] });
  }

  /**
   * Get cached campaign
   */
  getCampaign(campaignId: string): any | undefined {
    return this.get(`campaign:${campaignId}`);
  }

  /**
   * Invalidate campaign cache
   */
  invalidateCampaign(campaignId: string): boolean {
    return this.delete(`campaign:${campaignId}`);
  }

  /**
   * Cache search results
   */
  cacheSearchResults(queryHash: string, results: any, ttl?: number): void {
    this.set(`search:${queryHash}`, results, { ttl: ttl || 30 * 1000, tags: ["search"] });
  }

  /**
   * Get cached search results
   */
  getSearchResults(queryHash: string): any | undefined {
    return this.get(`search:${queryHash}`);
  }

  /**
   * Invalidate all search caches
   */
  invalidateSearches(): number {
    return this.deleteByTag("search");
  }

  /**
   * Cache trending campaigns
   */
  cacheTrending(campaigns: any[], ttl?: number): void {
    this.set("trending", campaigns, { ttl: ttl || 60 * 1000, tags: ["trending"] });
  }

  /**
   * Get cached trending campaigns
   */
  getTrending(): any[] | undefined {
    return this.get("trending");
  }
}

/**
 * Specialized cache for sessions
 */
export class SessionCache extends MemoryCache {
  constructor() {
    super({
      maxSize: 50000,
      defaultTtl: 24 * 60 * 60 * 1000, // 24 hours
    });
  }

  /**
   * Store session
   */
  storeSession(sessionId: string, data: any, ttl?: number): void {
    this.set(`session:${sessionId}`, data, { ttl, tags: ["sessions"] });
  }

  /**
   * Get session
   */
  getSession(sessionId: string): any | undefined {
    return this.get(`session:${sessionId}`);
  }

  /**
   * Invalidate session
   */
  invalidateSession(sessionId: string): boolean {
    return this.delete(`session:${sessionId}`);
  }

  /**
   * Invalidate all sessions for an address
   */
  invalidateUserSessions(address: string): number {
    return this.deletePattern(`session:.*:${address.toLowerCase()}`);
  }
}

// Export singleton instances
export const oracleCache = new OracleCache();
export const campaignCache = new CampaignCache();
export const sessionCache = new SessionCache();
export const generalCache = new MemoryCache();
