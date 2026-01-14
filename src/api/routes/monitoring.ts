/**
 * Monitoring API Routes
 * Phase 7: Production Infrastructure - Health checks, metrics, and system monitoring
 */

import { Router, Request, Response } from "express";
import { healthCheck, metricsCollector, jobQueue } from "../../infrastructure";
import { auditLogger } from "../../security/audit-logger";
import { authService } from "../../security/auth-service";
import { authMiddleware, requirePermission } from "../../security/middleware";

const router = Router();

// ============================================================================
// HEALTH CHECKS (Public)
// ============================================================================

/**
 * GET /monitoring/health
 * Full health check
 */
router.get("/health", async (_req: Request, res: Response) => {
  try {
    const health = await healthCheck.checkHealth();

    const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;

    res.status(statusCode).json({
      success: health.status !== "unhealthy",
      data: health,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /monitoring/health/live
 * Kubernetes liveness probe
 */
router.get("/health/live", async (_req: Request, res: Response) => {
  const liveness = await healthCheck.checkLiveness();

  res.json({
    success: true,
    data: liveness,
  });
});

/**
 * GET /monitoring/health/ready
 * Kubernetes readiness probe
 */
router.get("/health/ready", async (_req: Request, res: Response) => {
  try {
    const readiness = await healthCheck.checkReadiness();

    const statusCode = readiness.ready ? 200 : 503;

    res.status(statusCode).json({
      success: readiness.ready,
      data: readiness,
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ============================================================================
// METRICS (Public for Prometheus scraping)
// ============================================================================

/**
 * GET /monitoring/metrics
 * Prometheus-formatted metrics
 */
router.get("/metrics", (_req: Request, res: Response) => {
  try {
    const metrics = metricsCollector.getPrometheusMetrics();

    res.set("Content-Type", "text/plain; charset=utf-8");
    res.send(metrics);
  } catch (error) {
    res.status(500).send(`# Error collecting metrics: ${(error as Error).message}`);
  }
});

/**
 * GET /monitoring/metrics/json
 * JSON metrics for dashboards
 */
router.get("/metrics/json", (_req: Request, res: Response) => {
  try {
    const snapshot = metricsCollector.collect();

    res.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ============================================================================
// ADMIN ENDPOINTS (Authenticated)
// ============================================================================

/**
 * GET /monitoring/stats
 * Detailed system statistics
 */
router.get(
  "/stats",
  authMiddleware(),
  requirePermission("admin:metrics"),
  async (_req: Request, res: Response) => {
    try {
      const jobStats = jobQueue.getStats();
      const authStats = authService.getStatistics();
      const auditStats = auditLogger.getStatistics();

      res.json({
        success: true,
        data: {
          jobs: jobStats,
          auth: authStats,
          audit: auditStats,
          memory: process.memoryUsage(),
          uptime: process.uptime(),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

/**
 * GET /monitoring/jobs
 * List background jobs
 */
router.get(
  "/jobs",
  authMiddleware(),
  requirePermission("admin:system"),
  (req: Request, res: Response) => {
    try {
      const { type, status, priority, limit } = req.query;

      const jobs = jobQueue.listJobs({
        type: type as string,
        status: status as any,
        priority: priority as any,
        limit: limit ? parseInt(limit as string) : 100,
      });

      res.json({
        success: true,
        data: jobs,
        count: jobs.length,
        stats: jobQueue.getStats(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

/**
 * POST /monitoring/jobs/:jobId/retry
 * Retry a failed job
 */
router.post(
  "/jobs/:jobId/retry",
  authMiddleware(),
  requirePermission("admin:system"),
  (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const retried = jobQueue.retryJob(jobId);

      if (!retried) {
        res.status(400).json({
          success: false,
          error: "Job not found or not in failed state",
        });
        return;
      }

      res.json({
        success: true,
        message: "Job scheduled for retry",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

/**
 * POST /monitoring/jobs/:jobId/cancel
 * Cancel a pending job
 */
router.post(
  "/jobs/:jobId/cancel",
  authMiddleware(),
  requirePermission("admin:system"),
  (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const cancelled = jobQueue.cancelJob(jobId);

      if (!cancelled) {
        res.status(400).json({
          success: false,
          error: "Job not found or cannot be cancelled",
        });
        return;
      }

      res.json({
        success: true,
        message: "Job cancelled",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

/**
 * GET /monitoring/audit
 * Query audit logs
 */
router.get(
  "/audit",
  authMiddleware(),
  requirePermission("admin:audit"),
  (req: Request, res: Response) => {
    try {
      const {
        action,
        actorAddress,
        actorType,
        resourceType,
        resourceId,
        result,
        since,
        until,
        limit,
        offset,
      } = req.query;

      const { entries, total } = auditLogger.query({
        action: action as string,
        actorAddress: actorAddress as string,
        actorType: actorType as any,
        resourceType: resourceType as string,
        resourceId: resourceId as string,
        result: result as any,
        since: since ? parseInt(since as string) : undefined,
        until: until ? parseInt(until as string) : undefined,
        limit: limit ? parseInt(limit as string) : 100,
        offset: offset ? parseInt(offset as string) : 0,
      });

      res.json({
        success: true,
        data: entries,
        total,
        count: entries.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

/**
 * GET /monitoring/audit/resource/:type/:id
 * Get audit trail for a specific resource
 */
router.get(
  "/audit/resource/:type/:id",
  authMiddleware(),
  requirePermission("admin:audit"),
  (req: Request, res: Response) => {
    try {
      const { type, id } = req.params;
      const trail = auditLogger.getResourceTrail(type, id);

      res.json({
        success: true,
        data: trail,
        count: trail.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

/**
 * GET /monitoring/audit/user/:address
 * Get audit trail for a specific user
 */
router.get(
  "/audit/user/:address",
  authMiddleware(),
  requirePermission("admin:audit"),
  (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      const trail = auditLogger.getUserTrail(address, limit);

      res.json({
        success: true,
        data: trail,
        count: trail.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

/**
 * GET /monitoring/audit/export
 * Export audit logs for compliance
 */
router.get(
  "/audit/export",
  authMiddleware(),
  requirePermission("admin:audit"),
  (req: Request, res: Response) => {
    try {
      const { since, until, format } = req.query;

      const data = auditLogger.export({
        since: since ? parseInt(since as string) : undefined,
        until: until ? parseInt(until as string) : undefined,
        format: (format as "json" | "csv") || "json",
      });

      const contentType = format === "csv" ? "text/csv" : "application/json";
      const filename = `audit-export-${Date.now()}.${format === "csv" ? "csv" : "json"}`;

      res.set("Content-Type", contentType);
      res.set("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(data);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

/**
 * GET /monitoring/security
 * Security events and statistics
 */
router.get(
  "/security",
  authMiddleware(),
  requirePermission("admin:system"),
  (req: Request, res: Response) => {
    try {
      const { type, severity, since, limit } = req.query;

      const events = authService.getSecurityEvents({
        type: type as any,
        severity: severity as any,
        since: since ? parseInt(since as string) : undefined,
        limit: limit ? parseInt(limit as string) : 100,
      });

      res.json({
        success: true,
        data: events,
        count: events.length,
        stats: authService.getStatistics(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

/**
 * POST /monitoring/cleanup
 * Run cleanup tasks
 */
router.post(
  "/cleanup",
  authMiddleware(),
  requirePermission("admin:system"),
  (req: Request, res: Response) => {
    try {
      const { expiredSessions, expiredChallenges } = authService.cleanup();
      const cleanedJobs = jobQueue.cleanup();

      res.json({
        success: true,
        data: {
          sessions: expiredSessions,
          challenges: expiredChallenges,
          jobs: cleanedJobs,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

export default router;
