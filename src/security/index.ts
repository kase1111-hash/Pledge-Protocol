/**
 * Security System Exports
 * Phase 7: Production Infrastructure - Authentication, Authorization, and Security
 */

// Types
export * from "./types";

// Services
export { AuthService, authService } from "./auth-service";
export {
  RateLimiter,
  IpRateLimiter,
  UserRateLimiter,
  EndpointRateLimiter,
  ipRateLimiter,
  userRateLimiter,
  endpointRateLimiter,
} from "./rate-limiter";
export type { RateLimitResult } from "./rate-limiter";
export { Logger, AuditLogger, logger, auditLogger } from "./audit-logger";
export type { LogLevel, LogEntry, LoggerConfig } from "./audit-logger";

// Middleware
export {
  requestIdMiddleware,
  requestLoggerMiddleware,
  authMiddleware,
  requirePermission,
  requireRole,
  rateLimitMiddleware,
  corsMiddleware,
  securityHeadersMiddleware,
  validateInput,
  errorHandlerMiddleware,
  notFoundMiddleware,
} from "./middleware";
