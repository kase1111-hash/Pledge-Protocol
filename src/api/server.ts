import express, { Express, Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
dotenv.config();

// Validate environment variables early — fails fast if misconfigured
import { env } from "../config/env";

import campaignRoutes from "./routes/campaigns";
import pledgeRoutes from "./routes/pledges";
import oracleRoutes, { initializeOracleServices } from "./routes/oracles";
import backerRoutes from "./routes/backers";
import resolutionRoutes, { webhookHandler, resolutionEngine } from "./routes/resolution";
import commemorativeRoutes from "./routes/commemoratives";
import templateRoutes from "./routes/templates";
import disputeRoutes from "./routes/disputes";
import webhookRoutes from "./routes/webhooks";
import analyticsRoutes from "./routes/analytics";
import authRoutes from "./routes/auth";
import monitoringRoutes from "./routes/monitoring";
import socialRoutes from "./routes/social";
import chainRoutes from "./routes/chains";
import paymentRoutes from "./routes/payments";
import complianceRoutes from "./routes/compliance";
import enterpriseRoutes from "./routes/enterprise";
import riskRoutes from "./routes/risk";

// Phase 10: Platform maturity routes
import notificationRoutes from "./routes/notifications";
import reportRoutes from "./routes/reports";
import integrationRoutes from "./routes/integrations";
import i18nRoutes from "./routes/i18n";
import campaignsAdvancedRoutes from "./routes/campaigns-advanced";

// Phase 7: Security middleware
import {
  requestIdMiddleware,
  requestLoggerMiddleware,
  corsMiddleware,
  securityHeadersMiddleware,
  rateLimitMiddleware,
  errorHandlerMiddleware,
  notFoundMiddleware,
} from "../security/middleware";
import { jobQueue } from "../infrastructure/job-queue";
import { oracleCache, campaignCache, sessionCache, generalCache } from "../infrastructure/cache";
import { authService } from "../security/auth-service";
import { ipRateLimiter, userRateLimiter, endpointRateLimiter } from "../security/rate-limiter";
import { logger } from "../security/audit-logger";
import { initializeDatabase, closeDatabase } from "../database/database-service";

const app: Express = express();
const PORT = env.PORT;

// Initialize oracle services
initializeOracleServices(webhookHandler, resolutionEngine);

// Start background job queue
jobQueue.start();

// Schedule automatic resource cleanup
const FIVE_MINUTES = 5 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;
const SIX_HOURS = 6 * 60 * 60 * 1000;

const cleanupIntervals = [
  setInterval(() => oracleCache.cleanup(), FIVE_MINUTES),
  setInterval(() => campaignCache.cleanup(), FIVE_MINUTES),
  setInterval(() => sessionCache.cleanup(), FIVE_MINUTES),
  setInterval(() => generalCache.cleanup(), FIVE_MINUTES),
  setInterval(() => authService.cleanup(), FIVE_MINUTES),
  setInterval(() => ipRateLimiter.cleanup(), THIRTY_MINUTES),
  setInterval(() => userRateLimiter.cleanup(), THIRTY_MINUTES),
  setInterval(() => endpointRateLimiter.cleanup(), THIRTY_MINUTES),
  setInterval(() => jobQueue.cleanup(24 * 60 * 60 * 1000), SIX_HOURS),
];

// ============================================================================
// PHASE 7: SECURITY MIDDLEWARE
// ============================================================================

// Request ID for tracing
app.use(requestIdMiddleware);

// CORS configuration
// SECURITY: Require explicit CORS_ORIGINS in production
const corsOrigins = process.env.CORS_ORIGINS?.split(",");
if (!corsOrigins && process.env.NODE_ENV === "production") {
  throw new Error("CORS_ORIGINS environment variable is required in production");
}
app.use(
  corsMiddleware({
    origins: corsOrigins || ["http://localhost:3000", "http://localhost:5173"],
    credentials: true,
  })
);

// Security headers
app.use(securityHeadersMiddleware);

// Body parsing
app.use(express.json({ limit: "10mb" }));

// Request logging
app.use(requestLoggerMiddleware);

// Rate limiting (applies to all routes)
app.use(rateLimitMiddleware());

// ============================================================================
// HEALTH & MONITORING (No auth required)
// ============================================================================

// Basic health check (legacy)
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "10.0.0",
    phase: 10,
  });
});

// Full monitoring endpoints
app.use("/v1/monitoring", monitoringRoutes);

// ============================================================================
// AUTHENTICATION
// ============================================================================

app.use("/v1/auth", authRoutes);

// ============================================================================
// API ROUTES
// ============================================================================

app.use("/v1/campaigns", campaignRoutes);
app.use("/v1/pledges", pledgeRoutes);
app.use("/v1/oracles", oracleRoutes);
app.use("/v1/backers", backerRoutes);
app.use("/v1/resolution", resolutionRoutes);
app.use("/v1/commemoratives", commemorativeRoutes);
app.use("/v1/templates", templateRoutes);
app.use("/v1/disputes", disputeRoutes);
app.use("/v1/webhooks", webhookRoutes);
app.use("/v1/analytics", analyticsRoutes);

// Phase 8: Ecosystem routes
app.use("/v1/social", socialRoutes);
app.use("/v1/chains", chainRoutes);

// Phase 9: Enterprise routes
app.use("/v1/payments", paymentRoutes);
app.use("/v1/compliance", complianceRoutes);
app.use("/v1/enterprise", enterpriseRoutes);
app.use("/v1/risk", riskRoutes);

// Phase 10: Platform maturity routes
app.use("/v1/notifications", notificationRoutes);
app.use("/v1/reports", reportRoutes);
app.use("/v1/integrations", integrationRoutes);
app.use("/v1/i18n", i18nRoutes);
app.use("/v1/campaigns/advanced", campaignsAdvancedRoutes);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Error handler
app.use(errorHandlerMiddleware);

// 404 handler
app.use(notFoundMiddleware);

// ============================================================================
// SERVER STARTUP
// ============================================================================

// Initialize database then start server
const dbType = (env.DATABASE_TYPE === "postgres" || env.DATABASE_TYPE === "postgresql")
  ? "postgresql" as const
  : "memory" as const;

initializeDatabase({
  type: dbType,
  connectionString: env.DATABASE_URL,
}).then(() => {
  const server = app.listen(PORT, () => {
    logger.info(`Pledge Protocol API started`, {
      port: PORT,
      version: "10.0.0",
      phase: 10,
      environment: process.env.NODE_ENV || "development",
      database: dbType,
    });
    console.log(`Pledge Protocol API running on port ${PORT}`);
    console.log(`Database: ${dbType}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Monitoring: http://localhost:${PORT}/v1/monitoring/health`);
  });

  // Graceful shutdown
  function shutdown(signal: string) {
    logger.info(`${signal} received, shutting down gracefully`);

    // Stop accepting new connections
    server.close(() => {
      logger.info("HTTP server closed");
    });

    // Clear all cleanup intervals
    for (const interval of cleanupIntervals) {
      clearInterval(interval);
    }

    // Stop background job queue
    jobQueue.stop();

    // Close database connections
    closeDatabase().catch((err) => {
      logger.error("Error closing database", err);
    });

    // Allow in-flight requests to drain (10s timeout)
    setTimeout(() => {
      logger.warn("Shutdown timeout reached, forcing exit");
      process.exit(1);
    }, 10_000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}).catch((err) => {
  logger.error("Failed to initialize database", err);
  process.exit(1);
});

export default app;
