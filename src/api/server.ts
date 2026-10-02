import dotenv from "dotenv";
dotenv.config();

// Validate environment variables early — fails fast if misconfigured
import { env } from "../config/env";

import app from "./app";
import { initializeOracles } from "./routes/oracles";
import { resolutionEngine } from "./resolution-services";
import { jobQueue } from "../infrastructure/job-queue";
import { oracleCache, campaignCache, sessionCache, generalCache } from "../infrastructure/cache";
import { authService } from "../security/auth-service";
import { ipRateLimiter, userRateLimiter, endpointRateLimiter } from "../security/rate-limiter";
import { logger } from "../security/audit-logger";
import { initializeDatabase, closeDatabase } from "../database";
import { restorePersistentState, flushPersistentState } from "./persistence";

const PORT = env.PORT;

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
// SERVER STARTUP
// ============================================================================

// Initialize database then start server
const dbType = (env.DATABASE_TYPE === "postgres" || env.DATABASE_TYPE === "postgresql")
  ? "postgresql" as const
  : "memory" as const;

initializeDatabase({
  type: dbType,
  connectionString: env.DATABASE_URL,
}).then(async () => {
  await initializeOracles();
  // Load persisted service state before serving or running background work
  await restorePersistentState();
  jobQueue.start();

  // Changes made outside a request (timers, background jobs) are stored here;
  // request handlers are flushed before they respond
  const flushInterval = setInterval(() => {
    flushPersistentState().catch((err) => logger.error("Periodic state flush failed", err));
  }, 1000);

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

    // Clear all cleanup intervals
    for (const interval of cleanupIntervals) {
      clearInterval(interval);
    }

    // Stop background job queue and scheduled resolutions
    jobQueue.stop();
    resolutionEngine.shutdown();
    clearInterval(flushInterval);

    // Stop accepting connections; once in-flight requests finish, store any
    // remaining changes and close the database
    server.close(() => {
      logger.info("HTTP server closed");
      flushPersistentState()
        .catch((err) => logger.error("Final state flush failed", err))
        .then(() => closeDatabase())
        .then(() => process.exit(0))
        .catch((err) => {
          logger.error("Error closing database", err);
          process.exit(1);
        });
    });
    // Idle keep-alive connections would otherwise hold close() open
    server.closeIdleConnections();

    // Allow in-flight requests to drain (10s timeout)
    setTimeout(() => {
      logger.warn("Shutdown timeout reached, forcing exit");
      process.exit(1);
    }, 10_000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}).catch((err) => {
  logger.error("Failed to start: database or oracle initialization failed", err);
  process.exit(1);
});

export default app;
