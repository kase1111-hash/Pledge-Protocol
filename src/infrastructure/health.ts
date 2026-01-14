/**
 * Health Check and Metrics
 * Phase 7: Production Infrastructure - System health monitoring and metrics collection
 */

import { oracleCache, campaignCache, generalCache } from "./cache";
import { jobQueue } from "./job-queue";
import { authService } from "../security/auth-service";
import { auditLogger } from "../security/audit-logger";
import { ipRateLimiter, userRateLimiter } from "../security/rate-limiter";

/**
 * Component health status
 */
export type HealthStatus = "healthy" | "degraded" | "unhealthy";

/**
 * Health check result for a single component
 */
export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  message?: string;
  latency?: number;
  details?: Record<string, any>;
}

/**
 * Overall system health
 */
export interface SystemHealth {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  version: string;
  components: ComponentHealth[];
}

/**
 * Metrics snapshot
 */
export interface MetricsSnapshot {
  timestamp: string;
  system: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage?: NodeJS.CpuUsage;
  };
  cache: {
    oracle: {
      size: number;
      hitRate: number;
    };
    campaign: {
      size: number;
      hitRate: number;
    };
    general: {
      size: number;
      hitRate: number;
    };
  };
  jobs: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    byType: Record<string, number>;
  };
  security: {
    activeSessions: number;
    activeApiKeys: number;
    recentAuthFailures: number;
    rateLimitBlocked: number;
  };
  audit: {
    totalEntries: number;
    recentFailures: number;
    recentErrors: number;
  };
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  version: string;
  startTime: number;
  checks: Array<{
    name: string;
    check: () => Promise<ComponentHealth>;
  }>;
}

/**
 * Health Check Service
 */
export class HealthCheckService {
  private config: HealthCheckConfig;

  constructor(config?: Partial<HealthCheckConfig>) {
    this.config = {
      version: config?.version || process.env.npm_package_version || "7.0.0",
      startTime: config?.startTime || Date.now(),
      checks: config?.checks || [],
    };

    // Register default checks
    this.registerDefaultChecks();
  }

  /**
   * Register default health checks
   */
  private registerDefaultChecks(): void {
    // Memory check
    this.registerCheck("memory", async () => {
      const usage = process.memoryUsage();
      const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
      const heapPercent = (usage.heapUsed / usage.heapTotal) * 100;

      let status: HealthStatus = "healthy";
      let message = `Heap: ${heapUsedMB}MB / ${heapTotalMB}MB`;

      if (heapPercent > 90) {
        status = "unhealthy";
        message = `Critical memory usage: ${heapPercent.toFixed(1)}%`;
      } else if (heapPercent > 75) {
        status = "degraded";
        message = `High memory usage: ${heapPercent.toFixed(1)}%`;
      }

      return {
        name: "memory",
        status,
        message,
        details: {
          heapUsed: usage.heapUsed,
          heapTotal: usage.heapTotal,
          rss: usage.rss,
          external: usage.external,
        },
      };
    });

    // Cache check
    this.registerCheck("cache", async () => {
      const oracleStats = oracleCache.getStats();
      const campaignStats = campaignCache.getStats();

      const totalHitRate =
        (oracleStats.hitRate + campaignStats.hitRate) / 2;

      let status: HealthStatus = "healthy";
      let message = `Hit rate: ${(totalHitRate * 100).toFixed(1)}%`;

      if (totalHitRate < 0.3) {
        status = "degraded";
        message = `Low cache hit rate: ${(totalHitRate * 100).toFixed(1)}%`;
      }

      return {
        name: "cache",
        status,
        message,
        details: {
          oracle: oracleStats,
          campaign: campaignStats,
        },
      };
    });

    // Job queue check
    this.registerCheck("jobs", async () => {
      const stats = jobQueue.getStats();

      let status: HealthStatus = "healthy";
      let message = `Processing: ${stats.processing}, Pending: ${stats.pending}`;

      if (stats.pending > 1000) {
        status = "degraded";
        message = `High job backlog: ${stats.pending} pending`;
      }

      if (stats.failed > stats.completed * 0.1 && stats.failed > 10) {
        status = "degraded";
        message = `High failure rate: ${stats.failed} failed jobs`;
      }

      return {
        name: "jobs",
        status,
        message,
        details: stats,
      };
    });

    // Auth service check
    this.registerCheck("auth", async () => {
      const stats = authService.getStatistics();

      let status: HealthStatus = "healthy";
      let message = `Active sessions: ${stats.activeSessions}`;

      if (stats.recentAuthFailures > 100) {
        status = "degraded";
        message = `High auth failures: ${stats.recentAuthFailures} in last hour`;
      }

      return {
        name: "auth",
        status,
        message,
        details: stats,
      };
    });

    // Rate limiter check
    this.registerCheck("rateLimit", async () => {
      const ipStats = ipRateLimiter.getStatistics();
      const userStats = userRateLimiter.getStatistics();

      let status: HealthStatus = "healthy";
      let message = `Blocked: ${ipStats.blockedEntries + userStats.blockedEntries}`;

      if (ipStats.blockedEntries > 100) {
        status = "degraded";
        message = `Many IPs blocked: ${ipStats.blockedEntries}`;
      }

      return {
        name: "rateLimit",
        status,
        message,
        details: {
          ip: ipStats,
          user: userStats,
        },
      };
    });
  }

  /**
   * Register a custom health check
   */
  registerCheck(name: string, check: () => Promise<ComponentHealth>): void {
    // Remove existing check with same name
    this.config.checks = this.config.checks.filter((c) => c.name !== name);
    this.config.checks.push({ name, check });
  }

  /**
   * Run all health checks
   */
  async checkHealth(): Promise<SystemHealth> {
    const components: ComponentHealth[] = [];
    let overallStatus: HealthStatus = "healthy";

    for (const { name, check } of this.config.checks) {
      try {
        const start = Date.now();
        const result = await check();
        result.latency = Date.now() - start;
        components.push(result);

        if (result.status === "unhealthy") {
          overallStatus = "unhealthy";
        } else if (result.status === "degraded" && overallStatus !== "unhealthy") {
          overallStatus = "degraded";
        }
      } catch (error) {
        components.push({
          name,
          status: "unhealthy",
          message: (error as Error).message,
        });
        overallStatus = "unhealthy";
      }
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.config.startTime,
      version: this.config.version,
      components,
    };
  }

  /**
   * Run a quick liveness check
   */
  async checkLiveness(): Promise<{ alive: boolean; timestamp: string }> {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Run a readiness check
   */
  async checkReadiness(): Promise<{
    ready: boolean;
    timestamp: string;
    checks: Array<{ name: string; ready: boolean }>;
  }> {
    const health = await this.checkHealth();

    return {
      ready: health.status !== "unhealthy",
      timestamp: health.timestamp,
      checks: health.components.map((c) => ({
        name: c.name,
        ready: c.status !== "unhealthy",
      })),
    };
  }
}

/**
 * Metrics Collector
 */
export class MetricsCollector {
  private snapshots: MetricsSnapshot[] = [];
  private maxSnapshots: number;

  constructor(maxSnapshots: number = 1000) {
    this.maxSnapshots = maxSnapshots;
  }

  /**
   * Collect current metrics
   */
  collect(): MetricsSnapshot {
    const oracleStats = oracleCache.getStats();
    const campaignStats = campaignCache.getStats();
    const generalStats = generalCache.getStats();
    const jobStats = jobQueue.getStats();
    const authStats = authService.getStatistics();
    const auditStats = auditLogger.getStatistics();
    const rateLimitStats = ipRateLimiter.getStatistics();

    const snapshot: MetricsSnapshot = {
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime() * 1000,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
      cache: {
        oracle: {
          size: oracleStats.size,
          hitRate: oracleStats.hitRate,
        },
        campaign: {
          size: campaignStats.size,
          hitRate: campaignStats.hitRate,
        },
        general: {
          size: generalStats.size,
          hitRate: generalStats.hitRate,
        },
      },
      jobs: {
        total: jobStats.total,
        pending: jobStats.pending,
        processing: jobStats.processing,
        completed: jobStats.completed,
        failed: jobStats.failed,
        byType: jobStats.byType,
      },
      security: {
        activeSessions: authStats.activeSessions,
        activeApiKeys: authStats.activeApiKeys,
        recentAuthFailures: authStats.recentAuthFailures,
        rateLimitBlocked: rateLimitStats.blockedEntries,
      },
      audit: {
        totalEntries: auditStats.totalEntries,
        recentFailures: auditStats.entriesByResult["failure"] || 0,
        recentErrors: auditStats.entriesByResult["error"] || 0,
      },
    };

    // Store snapshot
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.maxSnapshots);
    }

    return snapshot;
  }

  /**
   * Get latest snapshot
   */
  getLatest(): MetricsSnapshot | undefined {
    return this.snapshots[this.snapshots.length - 1];
  }

  /**
   * Get snapshots within time range
   */
  getRange(since: number, until?: number): MetricsSnapshot[] {
    const sinceDate = new Date(since).toISOString();
    const untilDate = until ? new Date(until).toISOString() : new Date().toISOString();

    return this.snapshots.filter(
      (s) => s.timestamp >= sinceDate && s.timestamp <= untilDate
    );
  }

  /**
   * Get Prometheus-formatted metrics
   */
  getPrometheusMetrics(): string {
    const snapshot = this.collect();
    const lines: string[] = [];

    // System metrics
    lines.push(`# HELP process_uptime_seconds Process uptime in seconds`);
    lines.push(`# TYPE process_uptime_seconds gauge`);
    lines.push(`process_uptime_seconds ${snapshot.system.uptime / 1000}`);

    lines.push(`# HELP process_memory_heap_bytes Heap memory usage`);
    lines.push(`# TYPE process_memory_heap_bytes gauge`);
    lines.push(`process_memory_heap_bytes{type="used"} ${snapshot.system.memoryUsage.heapUsed}`);
    lines.push(`process_memory_heap_bytes{type="total"} ${snapshot.system.memoryUsage.heapTotal}`);

    // Cache metrics
    lines.push(`# HELP cache_size_total Number of entries in cache`);
    lines.push(`# TYPE cache_size_total gauge`);
    lines.push(`cache_size_total{cache="oracle"} ${snapshot.cache.oracle.size}`);
    lines.push(`cache_size_total{cache="campaign"} ${snapshot.cache.campaign.size}`);
    lines.push(`cache_size_total{cache="general"} ${snapshot.cache.general.size}`);

    lines.push(`# HELP cache_hit_rate Cache hit rate`);
    lines.push(`# TYPE cache_hit_rate gauge`);
    lines.push(`cache_hit_rate{cache="oracle"} ${snapshot.cache.oracle.hitRate}`);
    lines.push(`cache_hit_rate{cache="campaign"} ${snapshot.cache.campaign.hitRate}`);
    lines.push(`cache_hit_rate{cache="general"} ${snapshot.cache.general.hitRate}`);

    // Job metrics
    lines.push(`# HELP jobs_total Total jobs by status`);
    lines.push(`# TYPE jobs_total gauge`);
    lines.push(`jobs_total{status="pending"} ${snapshot.jobs.pending}`);
    lines.push(`jobs_total{status="processing"} ${snapshot.jobs.processing}`);
    lines.push(`jobs_total{status="completed"} ${snapshot.jobs.completed}`);
    lines.push(`jobs_total{status="failed"} ${snapshot.jobs.failed}`);

    // Security metrics
    lines.push(`# HELP security_sessions_active Active sessions`);
    lines.push(`# TYPE security_sessions_active gauge`);
    lines.push(`security_sessions_active ${snapshot.security.activeSessions}`);

    lines.push(`# HELP security_auth_failures_total Auth failures in last hour`);
    lines.push(`# TYPE security_auth_failures_total gauge`);
    lines.push(`security_auth_failures_total ${snapshot.security.recentAuthFailures}`);

    lines.push(`# HELP security_ratelimit_blocked_total Rate limited requests`);
    lines.push(`# TYPE security_ratelimit_blocked_total gauge`);
    lines.push(`security_ratelimit_blocked_total ${snapshot.security.rateLimitBlocked}`);

    return lines.join("\n");
  }

  /**
   * Clear all snapshots
   */
  clear(): void {
    this.snapshots = [];
  }
}

// Export singleton instances
export const healthCheck = new HealthCheckService();
export const metricsCollector = new MetricsCollector();
