import express, { Express, Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
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
import { logger } from "../security/audit-logger";

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Initialize oracle services
initializeOracleServices(webhookHandler, resolutionEngine);

// Start background job queue
jobQueue.start();

// ============================================================================
// PHASE 7: SECURITY MIDDLEWARE
// ============================================================================

// Request ID for tracing
app.use(requestIdMiddleware);

// CORS configuration
app.use(
  corsMiddleware({
    origins: process.env.CORS_ORIGINS?.split(",") || ["*"],
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
    version: "8.0.0",
    phase: 8,
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

app.listen(PORT, () => {
  logger.info(`Pledge Protocol API started`, {
    port: PORT,
    version: "8.0.0",
    phase: 8,
    environment: process.env.NODE_ENV || "development",
  });
  console.log(`Pledge Protocol API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Monitoring: http://localhost:${PORT}/v1/monitoring/health`);
  console.log(`Metrics: http://localhost:${PORT}/v1/monitoring/metrics`);
  console.log(`Social: http://localhost:${PORT}/v1/social`);
  console.log(`Chains: http://localhost:${PORT}/v1/chains`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  jobQueue.stop();
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  jobQueue.stop();
  process.exit(0);
});

export default app;
