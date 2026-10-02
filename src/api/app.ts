/**
 * Express application: middleware and routes, without starting a server or
 * background work. server.ts runs it; tests drive it directly.
 */

import express, { Express, Request, Response } from "express";

import campaignRoutes from "./routes/campaigns";
import pledgeRoutes from "./routes/pledges";
import oracleRoutes from "./routes/oracles";
import backerRoutes from "./routes/backers";
import resolutionRoutes from "./routes/resolution";
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
import { persistBeforeResponse, registerPersistentState } from "./persistence";
import { invalidateSearchIndex } from "../discovery";

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

const app: Express = express();

registerPersistentState();

// Amounts are bigints in several services; JSON.stringify throws on them
app.set("json replacer", (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value
);

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

// Body parsing. The raw bytes are kept because webhook signatures (Stripe,
// Circle, oracle callbacks) are computed over them, not over re-serialized JSON.
app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      (req as Request).rawBody = buf;
    },
  })
);

// Request logging
app.use(requestLoggerMiddleware);

// Store state changes before answering requests that make them
app.use(persistBeforeResponse);

// Discovery is rebuilt from the store after anything that may have changed it
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") res.on("finish", invalidateSearchIndex);
  next();
});

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

// Mounted before /v1/campaigns so "advanced" is never read as a campaign ID
app.use("/v1/campaigns/advanced", campaignsAdvancedRoutes);
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

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Error handler
app.use(errorHandlerMiddleware);

// 404 handler
app.use(notFoundMiddleware);

export default app;
