/**
 * Rate Limiting Service
 * Phase 7: Production Infrastructure - Request rate limiting with configurable tiers
 */

import { RateLimitConfig, RateLimitTier, RATE_LIMIT_TIERS, SecurityEvent } from "./types";

/**
 * Rate limit entry for tracking requests
 */
interface RateLimitEntry {
  count: number;
  windowStart: number;
  blocked: boolean;
  blockedUntil?: number;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
  tier: RateLimitTier;
}

/**
 * Rate Limiter Service
 * Implements sliding window rate limiting with tiered access levels
 */
export class RateLimiter {
  private entries: Map<string, RateLimitEntry> = new Map();
  private customLimits: Map<string, RateLimitConfig> = new Map();
  private blockDurationMs: number = 60 * 1000; // 1 minute block after exceeding
  private onLimitExceeded?: (key: string, tier: RateLimitTier) => void;

  constructor(options?: {
    blockDurationMs?: number;
    onLimitExceeded?: (key: string, tier: RateLimitTier) => void;
  }) {
    this.blockDurationMs = options?.blockDurationMs || 60 * 1000;
    this.onLimitExceeded = options?.onLimitExceeded;
  }

  /**
   * Check if request is allowed and consume a token
   */
  check(key: string, tier: RateLimitTier = "anonymous"): RateLimitResult {
    const config = this.customLimits.get(key) || RATE_LIMIT_TIERS[tier];
    const now = Date.now();

    let entry = this.entries.get(key);

    // Check if currently blocked
    if (entry?.blocked && entry.blockedUntil && now < entry.blockedUntil) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.blockedUntil,
        retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
        tier,
      };
    }

    // Initialize or reset window
    if (!entry || now - entry.windowStart >= config.windowMs) {
      entry = {
        count: 0,
        windowStart: now,
        blocked: false,
      };
    }

    const windowEnd = entry.windowStart + config.windowMs;
    const remaining = Math.max(0, config.maxRequests - entry.count - 1);

    // Check if limit exceeded
    if (entry.count >= config.maxRequests) {
      entry.blocked = true;
      entry.blockedUntil = now + this.blockDurationMs;
      this.entries.set(key, entry);

      if (this.onLimitExceeded) {
        this.onLimitExceeded(key, tier);
      }

      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.blockedUntil,
        retryAfter: Math.ceil(this.blockDurationMs / 1000),
        tier,
      };
    }

    // Consume token
    entry.count++;
    entry.blocked = false;
    this.entries.set(key, entry);

    return {
      allowed: true,
      remaining,
      resetAt: windowEnd,
      tier,
    };
  }

  /**
   * Check without consuming a token (for preflight checks)
   */
  peek(key: string, tier: RateLimitTier = "anonymous"): RateLimitResult {
    const config = this.customLimits.get(key) || RATE_LIMIT_TIERS[tier];
    const now = Date.now();

    const entry = this.entries.get(key);

    // Check if currently blocked
    if (entry?.blocked && entry.blockedUntil && now < entry.blockedUntil) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.blockedUntil,
        retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
        tier,
      };
    }

    // No entry or expired window
    if (!entry || now - entry.windowStart >= config.windowMs) {
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt: now + config.windowMs,
        tier,
      };
    }

    const windowEnd = entry.windowStart + config.windowMs;
    const remaining = Math.max(0, config.maxRequests - entry.count);

    return {
      allowed: remaining > 0,
      remaining,
      resetAt: windowEnd,
      retryAfter: remaining <= 0 ? Math.ceil((windowEnd - now) / 1000) : undefined,
      tier,
    };
  }

  /**
   * Set custom limit for a specific key
   */
  setCustomLimit(key: string, config: RateLimitConfig): void {
    this.customLimits.set(key, config);
  }

  /**
   * Remove custom limit
   */
  removeCustomLimit(key: string): boolean {
    return this.customLimits.delete(key);
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.entries.delete(key);
  }

  /**
   * Block a key temporarily
   */
  block(key: string, durationMs?: number): void {
    const entry: RateLimitEntry = {
      count: 0,
      windowStart: Date.now(),
      blocked: true,
      blockedUntil: Date.now() + (durationMs || this.blockDurationMs),
    };
    this.entries.set(key, entry);
  }

  /**
   * Unblock a key
   */
  unblock(key: string): boolean {
    const entry = this.entries.get(key);
    if (entry) {
      entry.blocked = false;
      entry.blockedUntil = undefined;
      return true;
    }
    return false;
  }

  /**
   * Get current status for a key
   */
  getStatus(key: string, tier: RateLimitTier = "anonymous"): {
    isBlocked: boolean;
    currentCount: number;
    maxRequests: number;
    windowMs: number;
    resetAt: number;
  } {
    const config = this.customLimits.get(key) || RATE_LIMIT_TIERS[tier];
    const entry = this.entries.get(key);
    const now = Date.now();

    if (!entry || now - entry.windowStart >= config.windowMs) {
      return {
        isBlocked: false,
        currentCount: 0,
        maxRequests: config.maxRequests,
        windowMs: config.windowMs,
        resetAt: now + config.windowMs,
      };
    }

    return {
      isBlocked: entry.blocked && entry.blockedUntil ? now < entry.blockedUntil : false,
      currentCount: entry.count,
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      resetAt: entry.windowStart + config.windowMs,
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.entries.entries()) {
      // Remove entries where window has expired and not blocked
      const tier = this.customLimits.has(key) ? undefined : "anonymous";
      const config = this.customLimits.get(key) || RATE_LIMIT_TIERS[tier || "anonymous"];

      if (now - entry.windowStart >= config.windowMs * 2) {
        // Keep for 2 windows for sliding calculation
        if (!entry.blocked || (entry.blockedUntil && now >= entry.blockedUntil)) {
          this.entries.delete(key);
          cleaned++;
        }
      }
    }

    return cleaned;
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalEntries: number;
    blockedEntries: number;
    customLimits: number;
  } {
    const now = Date.now();
    let blockedEntries = 0;

    for (const entry of this.entries.values()) {
      if (entry.blocked && entry.blockedUntil && now < entry.blockedUntil) {
        blockedEntries++;
      }
    }

    return {
      totalEntries: this.entries.size,
      blockedEntries,
      customLimits: this.customLimits.size,
    };
  }
}

/**
 * IP-based rate limiter for anonymous requests
 */
export class IpRateLimiter extends RateLimiter {
  /**
   * Check rate limit by IP address
   */
  checkIp(ip: string, tier: RateLimitTier = "anonymous"): RateLimitResult {
    const key = `ip:${ip}`;
    return this.check(key, tier);
  }

  /**
   * Block an IP address
   */
  blockIp(ip: string, durationMs?: number): void {
    const key = `ip:${ip}`;
    this.block(key, durationMs);
  }

  /**
   * Unblock an IP address
   */
  unblockIp(ip: string): boolean {
    const key = `ip:${ip}`;
    return this.unblock(key);
  }
}

/**
 * User-based rate limiter for authenticated requests
 */
export class UserRateLimiter extends RateLimiter {
  /**
   * Check rate limit by user address
   */
  checkUser(address: string, tier: RateLimitTier = "authenticated"): RateLimitResult {
    const key = `user:${address.toLowerCase()}`;
    return this.check(key, tier);
  }

  /**
   * Block a user address
   */
  blockUser(address: string, durationMs?: number): void {
    const key = `user:${address.toLowerCase()}`;
    this.block(key, durationMs);
  }

  /**
   * Unblock a user address
   */
  unblockUser(address: string): boolean {
    const key = `user:${address.toLowerCase()}`;
    return this.unblock(key);
  }

  /**
   * Set premium tier for a user
   */
  setPremium(address: string, premium: boolean): void {
    const key = `user:${address.toLowerCase()}`;
    if (premium) {
      this.setCustomLimit(key, RATE_LIMIT_TIERS.premium);
    } else {
      this.removeCustomLimit(key);
    }
  }
}

/**
 * Endpoint-specific rate limiter
 */
export class EndpointRateLimiter extends RateLimiter {
  /**
   * Check rate limit for specific endpoint
   */
  checkEndpoint(
    endpoint: string,
    identifier: string,
    tier: RateLimitTier = "anonymous"
  ): RateLimitResult {
    const key = `endpoint:${endpoint}:${identifier}`;
    return this.check(key, tier);
  }

  /**
   * Set custom limit for an endpoint
   */
  setEndpointLimit(endpoint: string, config: RateLimitConfig): void {
    // Apply to endpoint pattern
    this.setCustomLimit(`endpoint:${endpoint}`, config);
  }
}

// Export singleton instances
export const ipRateLimiter = new IpRateLimiter();
export const userRateLimiter = new UserRateLimiter();
export const endpointRateLimiter = new EndpointRateLimiter();
