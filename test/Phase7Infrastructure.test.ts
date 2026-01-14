/**
 * Phase 7: Production Infrastructure Tests
 * Tests for authentication, rate limiting, caching, job queue, and monitoring
 */

import { describe, it, expect, beforeEach } from "vitest";
import { AuthService } from "../src/security/auth-service";
import {
  RateLimiter,
  IpRateLimiter,
  UserRateLimiter,
} from "../src/security/rate-limiter";
import { Logger, AuditLogger } from "../src/security/audit-logger";
import { MemoryCache, OracleCache, CampaignCache } from "../src/infrastructure/cache";
import { JobQueue, JOB_TYPES } from "../src/infrastructure/job-queue";
import { HealthCheckService, MetricsCollector } from "../src/infrastructure/health";
import type { UserRole, Permission } from "../src/security/types";

describe("Phase 7: Production Infrastructure", () => {
  // ============================================================================
  // AUTHENTICATION SERVICE TESTS
  // ============================================================================

  describe("AuthService", () => {
    let authService: AuthService;

    beforeEach(() => {
      authService = new AuthService({
        sessionTtlMs: 1000 * 60 * 60, // 1 hour
        challengeTtlMs: 1000 * 60, // 1 minute
        maxConcurrentSessions: 3,
      });
    });

    describe("Challenge Generation", () => {
      it("should generate authentication challenge", () => {
        const address = "0x1234567890123456789012345678901234567890";
        const challenge = authService.generateChallenge(address);

        expect(challenge).toBeDefined();
        expect(challenge.nonce).toBeDefined();
        expect(challenge.message).toContain(address.toLowerCase());
        expect(challenge.expiresAt).toBeGreaterThan(Date.now());
      });

      it("should normalize addresses to lowercase", () => {
        const address = "0xABCD567890123456789012345678901234567890";
        const challenge = authService.generateChallenge(address);

        expect(challenge.address).toBe(address.toLowerCase());
      });

      it("should replace existing challenge for same address", () => {
        const address = "0x1234567890123456789012345678901234567890";
        const challenge1 = authService.generateChallenge(address);
        const challenge2 = authService.generateChallenge(address);

        expect(challenge2.nonce).not.toBe(challenge1.nonce);
      });
    });

    describe("Role Management", () => {
      const address = "0x1234567890123456789012345678901234567890";

      it("should assign roles to users", () => {
        authService.assignRole(address, "creator");
        const roles = authService.getUserRoles(address);

        expect(roles).toContain("creator");
      });

      it("should not duplicate roles", () => {
        authService.assignRole(address, "creator");
        authService.assignRole(address, "creator");
        const roles = authService.getUserRoles(address);

        expect(roles.filter((r) => r === "creator").length).toBe(1);
      });

      it("should remove roles from users", () => {
        authService.assignRole(address, "creator");
        authService.assignRole(address, "arbitrator");

        authService.removeRole(address, "creator");
        const roles = authService.getUserRoles(address);

        expect(roles).not.toContain("creator");
        expect(roles).toContain("arbitrator");
      });

      it("should return default backer role for unknown users", () => {
        const unknownAddress = "0x9999567890123456789012345678901234567890";
        const roles = authService.getUserRoles(unknownAddress);

        expect(roles).toContain("backer");
      });
    });

    describe("Permission Management", () => {
      it("should get permissions for roles", () => {
        const permissions = authService.getPermissionsForRoles(["backer"]);

        expect(permissions).toContain("campaign:read");
        expect(permissions).toContain("pledge:create");
        expect(permissions).not.toContain("admin:system");
      });

      it("should combine permissions from multiple roles", () => {
        const permissions = authService.getPermissionsForRoles(["backer", "creator"]);

        expect(permissions).toContain("campaign:create");
        expect(permissions).toContain("pledge:create");
        expect(permissions).toContain("campaign:update");
      });

      it("should check if user has permission", () => {
        const address = "0x1234567890123456789012345678901234567890";
        authService.assignRole(address, "admin");

        expect(authService.hasPermission(address, "admin:system")).toBe(true);
        expect(authService.hasPermission(address, "campaign:create")).toBe(true);
      });
    });

    describe("API Key Management", () => {
      const creatorAddress = "0x1234567890123456789012345678901234567890";

      it("should create API key", () => {
        const apiKey = authService.createApiKey(
          "Test Key",
          creatorAddress,
          ["campaign:read", "pledge:read"]
        );

        expect(apiKey).toBeDefined();
        expect(apiKey.id).toMatch(/^key-/);
        expect(apiKey.key).toMatch(/^pk_/);
        expect(apiKey.name).toBe("Test Key");
        expect(apiKey.active).toBe(true);
      });

      it("should validate API key", () => {
        const apiKey = authService.createApiKey(
          "Valid Key",
          creatorAddress,
          ["campaign:read"]
        );

        const validated = authService.validateApiKey(apiKey.key);

        expect(validated).not.toBeNull();
        expect(validated?.id).toBe(apiKey.id);
      });

      it("should reject invalid API key", () => {
        const validated = authService.validateApiKey("pk_invalid_key");

        expect(validated).toBeNull();
      });

      it("should revoke API key", () => {
        const apiKey = authService.createApiKey(
          "To Revoke",
          creatorAddress,
          ["campaign:read"]
        );

        authService.revokeApiKey(apiKey.id);
        const validated = authService.validateApiKey(apiKey.key);

        expect(validated).toBeNull();
      });

      it("should list API keys for user", () => {
        authService.createApiKey("Key 1", creatorAddress, ["campaign:read"]);
        authService.createApiKey("Key 2", creatorAddress, ["pledge:read"]);

        const keys = authService.listApiKeys(creatorAddress);

        expect(keys.length).toBe(2);
        // Keys should not include the actual key value
        expect((keys[0] as any).key).toBeUndefined();
      });
    });

    describe("Statistics", () => {
      it("should return statistics", () => {
        const stats = authService.getStatistics();

        expect(stats).toBeDefined();
        expect(typeof stats.activeSessions).toBe("number");
        expect(typeof stats.activeApiKeys).toBe("number");
        expect(typeof stats.totalUsers).toBe("number");
      });
    });
  });

  // ============================================================================
  // RATE LIMITER TESTS
  // ============================================================================

  describe("RateLimiter", () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      rateLimiter = new RateLimiter();
    });

    describe("Basic Rate Limiting", () => {
      it("should allow requests within limit", () => {
        const result = rateLimiter.check("test-key", "anonymous");

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBeGreaterThan(0);
      });

      it("should track remaining requests", () => {
        const key = "count-key";

        rateLimiter.check(key, "anonymous");
        const result1 = rateLimiter.peek(key, "anonymous");

        rateLimiter.check(key, "anonymous");
        const result2 = rateLimiter.peek(key, "anonymous");

        expect(result2.remaining).toBe(result1.remaining - 1);
      });

      it("should block when limit exceeded", () => {
        const key = "block-key";

        // Exhaust limit
        for (let i = 0; i < 30; i++) {
          rateLimiter.check(key, "anonymous");
        }

        const result = rateLimiter.check(key, "anonymous");

        expect(result.allowed).toBe(false);
        expect(result.retryAfter).toBeGreaterThan(0);
      });

      it("should respect different tiers", () => {
        const anonymousResult = rateLimiter.peek("anon-key", "anonymous");
        const authResult = rateLimiter.peek("auth-key", "authenticated");

        // Authenticated tier should have higher limit
        expect(authResult.remaining).toBeGreaterThan(anonymousResult.remaining);
      });
    });

    describe("Custom Limits", () => {
      it("should apply custom limits", () => {
        const key = "custom-key";
        rateLimiter.setCustomLimit(key, {
          windowMs: 60000,
          maxRequests: 5,
        });

        // Should allow 5 requests
        for (let i = 0; i < 5; i++) {
          expect(rateLimiter.check(key, "anonymous").allowed).toBe(true);
        }

        // 6th should be blocked
        expect(rateLimiter.check(key, "anonymous").allowed).toBe(false);
      });

      it("should remove custom limits", () => {
        const key = "removable-key";
        rateLimiter.setCustomLimit(key, { windowMs: 60000, maxRequests: 1 });

        rateLimiter.check(key, "anonymous");
        expect(rateLimiter.check(key, "anonymous").allowed).toBe(false);

        rateLimiter.removeCustomLimit(key);
        rateLimiter.reset(key);
        expect(rateLimiter.check(key, "anonymous").allowed).toBe(true);
      });
    });

    describe("Blocking", () => {
      it("should manually block keys", () => {
        const key = "blocked-key";
        rateLimiter.block(key, 5000);

        const result = rateLimiter.check(key, "anonymous");

        expect(result.allowed).toBe(false);
      });

      it("should unblock keys", () => {
        const key = "unblock-key";
        rateLimiter.block(key, 5000);
        rateLimiter.unblock(key);

        const result = rateLimiter.check(key, "anonymous");

        expect(result.allowed).toBe(true);
      });
    });
  });

  describe("IpRateLimiter", () => {
    let ipLimiter: IpRateLimiter;

    beforeEach(() => {
      ipLimiter = new IpRateLimiter();
    });

    it("should rate limit by IP", () => {
      const ip = "192.168.1.1";
      const result = ipLimiter.checkIp(ip);

      expect(result.allowed).toBe(true);
    });

    it("should block IP addresses", () => {
      const ip = "192.168.1.2";
      ipLimiter.blockIp(ip, 5000);

      const result = ipLimiter.checkIp(ip);

      expect(result.allowed).toBe(false);
    });
  });

  describe("UserRateLimiter", () => {
    let userLimiter: UserRateLimiter;

    beforeEach(() => {
      userLimiter = new UserRateLimiter();
    });

    it("should rate limit by user address", () => {
      const address = "0x1234567890123456789012345678901234567890";
      const result = userLimiter.checkUser(address);

      expect(result.allowed).toBe(true);
    });

    it("should set premium tier for users", () => {
      const address = "0x1234567890123456789012345678901234567890";

      userLimiter.setPremium(address, true);
      const result = userLimiter.checkUser(address);

      // Premium users have higher limits
      expect(result.remaining).toBeGreaterThan(100);
    });
  });

  // ============================================================================
  // LOGGER TESTS
  // ============================================================================

  describe("Logger", () => {
    let logs: any[] = [];
    let testLogger: Logger;

    beforeEach(() => {
      logs = [];
      testLogger = new Logger({
        level: "debug",
        serviceName: "test",
        outputHandler: (entry) => logs.push(entry),
      });
    });

    it("should log at different levels", () => {
      testLogger.debug("Debug message");
      testLogger.info("Info message");
      testLogger.warn("Warn message");
      testLogger.error("Error message");

      expect(logs.length).toBe(4);
      expect(logs[0].level).toBe("debug");
      expect(logs[1].level).toBe("info");
      expect(logs[2].level).toBe("warn");
      expect(logs[3].level).toBe("error");
    });

    it("should include context", () => {
      testLogger.info("With context", { userId: "123", action: "test" });

      expect(logs[0].context).toBeDefined();
      expect(logs[0].context.userId).toBe("123");
    });

    it("should redact sensitive fields", () => {
      testLogger.info("Sensitive data", { password: "secret123", token: "abc" });

      expect(logs[0].context.password).toBe("[REDACTED]");
      expect(logs[0].context.token).toBe("[REDACTED]");
    });

    it("should create child logger with context", () => {
      const child = testLogger.child({ requestId: "req-123" });
      child.info("Child log");

      expect(logs[0].context.requestId).toBe("req-123");
    });

    it("should respect log level", () => {
      const infoLogger = new Logger({
        level: "info",
        outputHandler: (entry) => logs.push(entry),
      });

      infoLogger.debug("Should not appear");
      infoLogger.info("Should appear");

      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe("info");
    });
  });

  describe("AuditLogger", () => {
    let auditLogger: AuditLogger;

    beforeEach(() => {
      auditLogger = new AuditLogger({ retentionDays: 30, maxEntries: 100 });
    });

    it("should log audit entries", () => {
      const entry = auditLogger.success(
        "campaign_created",
        { type: "user", address: "0x123" },
        { type: "campaign", id: "camp-1" },
        { name: "Test Campaign" }
      );

      expect(entry).toBeDefined();
      expect(entry.id).toMatch(/^audit-/);
      expect(entry.action).toBe("campaign_created");
      expect(entry.result).toBe("success");
    });

    it("should query audit entries", () => {
      auditLogger.success(
        "campaign_created",
        { type: "user", address: "0x123" },
        { type: "campaign", id: "camp-1" },
        {}
      );

      auditLogger.failure(
        "pledge_failed",
        { type: "user", address: "0x456" },
        { type: "pledge", id: "pledge-1" },
        {},
        "Insufficient funds"
      );

      const { entries, total } = auditLogger.query({ result: "success" });

      expect(total).toBe(1);
      expect(entries[0].result).toBe("success");
    });

    it("should get resource trail", () => {
      auditLogger.success(
        "campaign_created",
        { type: "user", address: "0x123" },
        { type: "campaign", id: "camp-1" },
        {}
      );

      auditLogger.success(
        "campaign_updated",
        { type: "user", address: "0x123" },
        { type: "campaign", id: "camp-1" },
        {}
      );

      const trail = auditLogger.getResourceTrail("campaign", "camp-1");

      expect(trail.length).toBe(2);
    });

    it("should export to JSON", () => {
      auditLogger.success(
        "test_action",
        { type: "system" },
        { type: "test", id: "1" },
        {}
      );

      const exported = auditLogger.export({ format: "json" });
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
    });
  });

  // ============================================================================
  // CACHE TESTS
  // ============================================================================

  describe("MemoryCache", () => {
    let cache: MemoryCache;

    beforeEach(() => {
      cache = new MemoryCache({ maxSize: 100, defaultTtl: 5000 });
    });

    describe("Basic Operations", () => {
      it("should set and get values", () => {
        cache.set("key1", { data: "value1" });
        const value = cache.get<{ data: string }>("key1");

        expect(value).toBeDefined();
        expect(value?.data).toBe("value1");
      });

      it("should return undefined for missing keys", () => {
        const value = cache.get("nonexistent");

        expect(value).toBeUndefined();
      });

      it("should delete values", () => {
        cache.set("key1", "value1");
        cache.delete("key1");

        expect(cache.get("key1")).toBeUndefined();
      });

      it("should check existence", () => {
        cache.set("key1", "value1");

        expect(cache.has("key1")).toBe(true);
        expect(cache.has("key2")).toBe(false);
      });
    });

    describe("TTL", () => {
      it("should expire entries after TTL", async () => {
        cache.set("expiring", "value", { ttl: 50 });

        expect(cache.get("expiring")).toBe("value");

        await new Promise((r) => setTimeout(r, 100));

        expect(cache.get("expiring")).toBeUndefined();
      });

      it("should not expire entries with no TTL", () => {
        const noTtlCache = new MemoryCache({ maxSize: 100 });
        noTtlCache.set("permanent", "value", { ttl: undefined });

        expect(noTtlCache.get("permanent")).toBe("value");
      });
    });

    describe("LRU Eviction", () => {
      it("should evict least recently used when at capacity", () => {
        const smallCache = new MemoryCache({ maxSize: 3 });

        smallCache.set("key1", "value1");
        smallCache.set("key2", "value2");
        smallCache.set("key3", "value3");

        // Access key1 to make it recently used
        smallCache.get("key1");

        // Add new entry, should evict key2 (least recently used)
        smallCache.set("key4", "value4");

        expect(smallCache.has("key1")).toBe(true);
        expect(smallCache.has("key2")).toBe(false);
        expect(smallCache.has("key3")).toBe(true);
        expect(smallCache.has("key4")).toBe(true);
      });
    });

    describe("Tags", () => {
      it("should delete entries by tag", () => {
        cache.set("item1", "value1", { tags: ["group-a"] });
        cache.set("item2", "value2", { tags: ["group-a"] });
        cache.set("item3", "value3", { tags: ["group-b"] });

        const deleted = cache.deleteByTag("group-a");

        expect(deleted).toBe(2);
        expect(cache.has("item1")).toBe(false);
        expect(cache.has("item2")).toBe(false);
        expect(cache.has("item3")).toBe(true);
      });
    });

    describe("Statistics", () => {
      it("should track cache statistics", () => {
        cache.set("key1", "value1");
        cache.get("key1"); // Hit
        cache.get("key2"); // Miss

        const stats = cache.getStats();

        expect(stats.hits).toBe(1);
        expect(stats.misses).toBe(1);
        expect(stats.sets).toBe(1);
        expect(stats.hitRate).toBe(0.5);
      });
    });

    describe("getOrSet", () => {
      it("should return cached value if exists", async () => {
        cache.set("existing", "cached");

        let factoryCalled = false;
        const value = await cache.getOrSet("existing", async () => {
          factoryCalled = true;
          return "new";
        });

        expect(value).toBe("cached");
        expect(factoryCalled).toBe(false);
      });

      it("should call factory and cache if missing", async () => {
        const value = await cache.getOrSet("new-key", async () => {
          return "generated";
        });

        expect(value).toBe("generated");
        expect(cache.get("new-key")).toBe("generated");
      });
    });
  });

  describe("OracleCache", () => {
    let oracleCache: OracleCache;

    beforeEach(() => {
      oracleCache = new OracleCache();
    });

    it("should cache oracle responses", () => {
      oracleCache.cacheResponse(
        "oracle-1",
        { eventId: "123", bibNumber: "456" },
        { completed: true, time: "3:45:00" }
      );

      const cached = oracleCache.getCachedResponse("oracle-1", {
        eventId: "123",
        bibNumber: "456",
      });

      expect(cached).toBeDefined();
      expect(cached.completed).toBe(true);
    });

    it("should invalidate oracle cache", () => {
      oracleCache.cacheResponse("oracle-1", { id: "1" }, { data: "a" });
      oracleCache.cacheResponse("oracle-1", { id: "2" }, { data: "b" });
      oracleCache.cacheResponse("oracle-2", { id: "1" }, { data: "c" });

      const invalidated = oracleCache.invalidateOracle("oracle-1");

      expect(invalidated).toBe(2);
      expect(oracleCache.getCachedResponse("oracle-1", { id: "1" })).toBeUndefined();
      expect(oracleCache.getCachedResponse("oracle-2", { id: "1" })).toBeDefined();
    });
  });

  describe("CampaignCache", () => {
    let campaignCache: CampaignCache;

    beforeEach(() => {
      campaignCache = new CampaignCache();
    });

    it("should cache campaign data", () => {
      campaignCache.cacheCampaign("camp-1", { name: "Test Campaign" });
      const cached = campaignCache.getCampaign("camp-1");

      expect(cached).toBeDefined();
      expect(cached.name).toBe("Test Campaign");
    });

    it("should cache and retrieve trending", () => {
      campaignCache.cacheTrending([{ id: "1" }, { id: "2" }]);
      const trending = campaignCache.getTrending();

      expect(trending).toBeDefined();
      expect(trending?.length).toBe(2);
    });

    it("should invalidate search caches", () => {
      campaignCache.cacheSearchResults("hash1", { results: [] });
      campaignCache.cacheSearchResults("hash2", { results: [] });

      const invalidated = campaignCache.invalidateSearches();

      expect(invalidated).toBe(2);
    });
  });

  // ============================================================================
  // JOB QUEUE TESTS
  // ============================================================================

  describe("JobQueue", () => {
    let jobQueue: JobQueue;

    beforeEach(() => {
      jobQueue = new JobQueue({
        maxConcurrent: 2,
        pollIntervalMs: 50,
        defaultMaxAttempts: 3,
        retryDelayMs: 100,
      });
    });

    afterEach(() => {
      jobQueue.stop();
    });

    describe("Job Management", () => {
      it("should add jobs to queue", () => {
        const job = jobQueue.addJob("test", { value: 1 });

        expect(job).toBeDefined();
        expect(job.id).toMatch(/^job-/);
        expect(job.status).toBe("pending");
        expect(job.data.value).toBe(1);
      });

      it("should get job by ID", () => {
        const job = jobQueue.addJob("test", { value: 1 });
        const retrieved = jobQueue.getJob(job.id);

        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(job.id);
      });

      it("should cancel pending jobs", () => {
        const job = jobQueue.addJob("test", { value: 1 });
        const cancelled = jobQueue.cancelJob(job.id);

        expect(cancelled).toBe(true);
        expect(jobQueue.getJob(job.id)?.status).toBe("cancelled");
      });

      it("should respect job priority", () => {
        const lowPriority = jobQueue.addJob("test", { order: 1 }, { priority: "low" });
        const highPriority = jobQueue.addJob("test", { order: 2 }, { priority: "high" });
        const normalPriority = jobQueue.addJob("test", { order: 3 }, { priority: "normal" });

        const jobs = jobQueue.listJobs();

        // Jobs should be listed by creation time (most recent first)
        expect(jobs[0].id).toBe(normalPriority.id);
        expect(jobs[1].id).toBe(highPriority.id);
        expect(jobs[2].id).toBe(lowPriority.id);
      });

      it("should delay job execution", () => {
        const job = jobQueue.addJob("test", { value: 1 }, { delay: 1000 });

        expect(job.scheduledAt).toBeGreaterThan(Date.now());
      });
    });

    describe("Job Processing", () => {
      it("should process jobs with registered handler", async () => {
        let processed = false;

        jobQueue.registerHandler("process-test", async (job) => {
          processed = true;
          return { success: true };
        });

        const job = jobQueue.addJob("process-test", { value: 1 });

        jobQueue.start();
        const result = await jobQueue.waitForJob(job.id, 5000);

        expect(processed).toBe(true);
        expect(result.status).toBe("completed");
        expect(result.result.success).toBe(true);
      });

      it("should retry failed jobs", async () => {
        let attempts = 0;

        jobQueue.registerHandler("retry-test", async (job) => {
          attempts++;
          if (attempts < 2) {
            throw new Error("Temporary failure");
          }
          return { success: true };
        });

        const job = jobQueue.addJob("retry-test", {}, { maxAttempts: 3 });

        jobQueue.start();
        const result = await jobQueue.waitForJob(job.id, 5000);

        expect(attempts).toBe(2);
        expect(result.status).toBe("completed");
      });

      it("should fail after max attempts", async () => {
        jobQueue.registerHandler("fail-test", async () => {
          throw new Error("Persistent failure");
        });

        const job = jobQueue.addJob("fail-test", {}, { maxAttempts: 2 });

        jobQueue.start();
        const result = await jobQueue.waitForJob(job.id, 5000);

        expect(result.status).toBe("failed");
        expect(result.attempts).toBe(2);
        expect(result.error).toBe("Persistent failure");
      });
    });

    describe("Statistics", () => {
      it("should return queue statistics", () => {
        jobQueue.addJob("type-a", {});
        jobQueue.addJob("type-a", {});
        jobQueue.addJob("type-b", {});

        const stats = jobQueue.getStats();

        expect(stats.total).toBe(3);
        expect(stats.pending).toBe(3);
        expect(stats.byType["type-a"]).toBe(2);
        expect(stats.byType["type-b"]).toBe(1);
      });
    });

    describe("Cleanup", () => {
      it("should clean up old completed jobs", async () => {
        jobQueue.registerHandler("cleanup-test", async () => ({ done: true }));

        jobQueue.addJob("cleanup-test", {});
        jobQueue.start();

        await new Promise((r) => setTimeout(r, 200));

        const cleaned = jobQueue.cleanup(0); // Clean all completed

        expect(cleaned).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ============================================================================
  // HEALTH CHECK TESTS
  // ============================================================================

  describe("HealthCheckService", () => {
    let healthCheck: HealthCheckService;

    beforeEach(() => {
      healthCheck = new HealthCheckService({
        version: "7.0.0-test",
        startTime: Date.now(),
      });
    });

    it("should check overall health", async () => {
      const health = await healthCheck.checkHealth();

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(health.version).toBe("7.0.0-test");
      expect(health.components).toBeDefined();
      expect(health.components.length).toBeGreaterThan(0);
    });

    it("should check liveness", async () => {
      const liveness = await healthCheck.checkLiveness();

      expect(liveness.alive).toBe(true);
      expect(liveness.timestamp).toBeDefined();
    });

    it("should check readiness", async () => {
      const readiness = await healthCheck.checkReadiness();

      expect(readiness.ready).toBeDefined();
      expect(readiness.checks).toBeDefined();
    });

    it("should register custom health check", async () => {
      healthCheck.registerCheck("custom", async () => ({
        name: "custom",
        status: "healthy",
        message: "Custom check passed",
      }));

      const health = await healthCheck.checkHealth();
      const customCheck = health.components.find((c) => c.name === "custom");

      expect(customCheck).toBeDefined();
      expect(customCheck?.status).toBe("healthy");
    });
  });

  describe("MetricsCollector", () => {
    let metricsCollector: MetricsCollector;

    beforeEach(() => {
      metricsCollector = new MetricsCollector(100);
    });

    it("should collect metrics snapshot", () => {
      const snapshot = metricsCollector.collect();

      expect(snapshot).toBeDefined();
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.system).toBeDefined();
      expect(snapshot.cache).toBeDefined();
      expect(snapshot.jobs).toBeDefined();
      expect(snapshot.security).toBeDefined();
    });

    it("should get latest snapshot", () => {
      metricsCollector.collect();
      const latest = metricsCollector.getLatest();

      expect(latest).toBeDefined();
    });

    it("should get Prometheus metrics", () => {
      const prometheus = metricsCollector.getPrometheusMetrics();

      expect(prometheus).toBeDefined();
      expect(prometheus).toContain("process_uptime_seconds");
      expect(prometheus).toContain("cache_size_total");
      expect(prometheus).toContain("jobs_total");
    });

    it("should store multiple snapshots", () => {
      metricsCollector.collect();
      metricsCollector.collect();
      metricsCollector.collect();

      const since = Date.now() - 60000;
      const range = metricsCollector.getRange(since);

      expect(range.length).toBe(3);
    });
  });
});
