/**
 * Security Middleware
 * Phase 7: Production Infrastructure - Express middleware for auth, rate limiting, and security
 */

import { Request, Response, NextFunction } from "express";
import { randomBytes } from "crypto";
import { AuthContext, Permission, RateLimitTier, ValidationSchema } from "./types";
import { authService } from "./auth-service";
import { ipRateLimiter, userRateLimiter, RateLimitResult } from "./rate-limiter";
import { logger, auditLogger } from "./audit-logger";

/**
 * Extend Express Request with auth context
 */
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      requestId?: string;
      startTime?: number;
    }
  }
}

/**
 * Request ID middleware
 * Adds unique request ID for tracing
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.requestId = req.headers["x-request-id"] as string || `req-${randomBytes(8).toString("hex")}`;
  req.startTime = Date.now();

  res.setHeader("X-Request-ID", req.requestId);
  next();
}

/**
 * Request logging middleware
 * Logs all incoming requests with structured format
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestLogger = logger.child({
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    ip: getClientIp(req),
    userAgent: req.headers["user-agent"],
  });

  requestLogger.info(`${req.method} ${req.path}`);

  // Log response on finish
  res.on("finish", () => {
    const duration = req.startTime ? Date.now() - req.startTime : 0;
    const level = res.statusCode >= 400 ? "warn" : "info";

    requestLogger[level](`${req.method} ${req.path} ${res.statusCode}`, {
      statusCode: res.statusCode,
      duration,
    });
  });

  next();
}

/**
 * Authentication middleware
 * Validates session or API key from request headers
 */
export function authMiddleware(options?: {
  required?: boolean;
  allowApiKey?: boolean;
}): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers["x-api-key"] as string;
    const sessionHeader = req.headers["x-session-id"] as string;

    // Try session authentication
    if (sessionHeader) {
      const auth = authService.validateSession(sessionHeader);
      if (auth) {
        req.auth = auth;
        return next();
      }
    }

    // Try Bearer token (session ID)
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const auth = authService.validateSession(token);
      if (auth) {
        req.auth = auth;
        return next();
      }
    }

    // Try API key authentication
    if (options?.allowApiKey && apiKeyHeader) {
      const apiKey = authService.validateApiKey(apiKeyHeader);
      if (apiKey) {
        req.auth = {
          address: apiKey.createdBy,
          roles: [],
          permissions: apiKey.permissions,
          sessionId: apiKey.id,
          authenticatedAt: apiKey.createdAt,
          expiresAt: apiKey.expiresAt || Date.now() + 365 * 24 * 60 * 60 * 1000,
          metadata: { apiKeyId: apiKey.id },
        };
        return next();
      }
    }

    // Check if auth is required
    if (options?.required !== false) {
      auditLogger.failure(
        "auth_required",
        { type: "user", address: getClientIp(req) },
        { type: "endpoint", id: req.path },
        {},
        "No valid authentication provided",
        { requestId: req.requestId, ipAddress: getClientIp(req) }
      );

      res.status(401).json({
        success: false,
        error: "Authentication required",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    next();
  };
}

/**
 * Permission middleware
 * Checks if authenticated user has required permission
 */
export function requirePermission(
  permission: Permission
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    if (!req.auth.permissions.includes(permission)) {
      auditLogger.failure(
        "permission_denied",
        { type: "user", address: req.auth.address, sessionId: req.auth.sessionId },
        { type: "endpoint", id: req.path },
        { requiredPermission: permission, userPermissions: req.auth.permissions },
        `Missing required permission: ${permission}`,
        { requestId: req.requestId, ipAddress: getClientIp(req) }
      );

      res.status(403).json({
        success: false,
        error: `Insufficient permissions. Required: ${permission}`,
        code: "PERMISSION_DENIED",
      });
      return;
    }

    next();
  };
}

/**
 * Role middleware
 * Checks if authenticated user has at least one of the required roles
 */
export function requireRole(
  ...roles: string[]
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    const hasRole = roles.some((role) => req.auth!.roles.includes(role as any));

    if (!hasRole) {
      res.status(403).json({
        success: false,
        error: `Insufficient role. Required one of: ${roles.join(", ")}`,
        code: "ROLE_REQUIRED",
      });
      return;
    }

    next();
  };
}

/**
 * Rate limiting middleware
 * Applies rate limits based on authentication status
 */
export function rateLimitMiddleware(options?: {
  tier?: RateLimitTier;
  keyGenerator?: (req: Request) => string;
}): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    let result: RateLimitResult;

    if (req.auth) {
      // Use user-based rate limiting for authenticated requests
      const tier = options?.tier || "authenticated";
      result = userRateLimiter.checkUser(req.auth.address, tier);
    } else {
      // Use IP-based rate limiting for anonymous requests
      const tier = options?.tier || "anonymous";
      result = ipRateLimiter.checkIp(ip, tier);
    }

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", result.tier);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      res.setHeader("Retry-After", result.retryAfter || 60);

      auditLogger.failure(
        "rate_limit_exceeded",
        { type: "user", address: req.auth?.address || ip },
        { type: "endpoint", id: req.path },
        { tier: result.tier, remaining: result.remaining },
        "Rate limit exceeded",
        { requestId: req.requestId, ipAddress: ip }
      );

      res.status(429).json({
        success: false,
        error: "Too many requests. Please try again later.",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter: result.retryAfter,
      });
      return;
    }

    next();
  };
}

/**
 * CORS middleware
 * Configures Cross-Origin Resource Sharing
 */
export function corsMiddleware(options?: {
  origins?: string[];
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}): (req: Request, res: Response, next: NextFunction) => void {
  const config = {
    origins: options?.origins || ["*"],
    methods: options?.methods || ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: options?.allowedHeaders || [
      "Content-Type",
      "Authorization",
      "X-Request-ID",
      "X-Session-ID",
      "X-API-Key",
      "X-Wallet-Address",
    ],
    exposedHeaders: options?.exposedHeaders || [
      "X-Request-ID",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
    ],
    credentials: options?.credentials ?? true,
    maxAge: options?.maxAge || 86400,
  };

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    // Check if origin is allowed
    if (origin) {
      if (config.origins.includes("*")) {
        res.setHeader("Access-Control-Allow-Origin", origin);
      } else if (config.origins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
      }
    }

    res.setHeader("Access-Control-Allow-Methods", config.methods.join(", "));
    res.setHeader("Access-Control-Allow-Headers", config.allowedHeaders.join(", "));
    res.setHeader("Access-Control-Expose-Headers", config.exposedHeaders.join(", "));
    res.setHeader("Access-Control-Max-Age", config.maxAge.toString());

    if (config.credentials) {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}

/**
 * Security headers middleware
 * Adds security-related HTTP headers
 */
export function securityHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Enable XSS filter
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Content Security Policy
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'"
  );

  // Strict Transport Security (HSTS)
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  next();
}

/**
 * Input validation middleware
 * Validates request body against schema
 */
export function validateInput(
  schema: Record<string, ValidationSchema>,
  source: "body" | "query" | "params" = "body"
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const data = source === "body" ? req.body : source === "query" ? req.query : req.params;
    const errors: string[] = [];

    for (const [field, fieldSchema] of Object.entries(schema)) {
      const value = data[field];

      // Check required
      if (fieldSchema.required && (value === undefined || value === null || value === "")) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      switch (fieldSchema.type) {
        case "string":
          if (typeof value !== "string") {
            errors.push(`${field} must be a string`);
          } else {
            if (fieldSchema.min !== undefined && value.length < fieldSchema.min) {
              errors.push(`${field} must be at least ${fieldSchema.min} characters`);
            }
            if (fieldSchema.max !== undefined && value.length > fieldSchema.max) {
              errors.push(`${field} must be at most ${fieldSchema.max} characters`);
            }
            if (fieldSchema.pattern && !fieldSchema.pattern.test(value)) {
              errors.push(`${field} has invalid format`);
            }
          }
          break;

        case "number":
          const numValue = Number(value);
          if (isNaN(numValue)) {
            errors.push(`${field} must be a number`);
          } else {
            if (fieldSchema.min !== undefined && numValue < fieldSchema.min) {
              errors.push(`${field} must be at least ${fieldSchema.min}`);
            }
            if (fieldSchema.max !== undefined && numValue > fieldSchema.max) {
              errors.push(`${field} must be at most ${fieldSchema.max}`);
            }
          }
          break;

        case "boolean":
          if (typeof value !== "boolean" && value !== "true" && value !== "false") {
            errors.push(`${field} must be a boolean`);
          }
          break;

        case "address":
          if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
            errors.push(`${field} must be a valid Ethereum address`);
          }
          break;

        case "hash":
          if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
            errors.push(`${field} must be a valid hash`);
          }
          break;

        case "url":
          try {
            new URL(value);
          } catch {
            errors.push(`${field} must be a valid URL`);
          }
          break;

        case "array":
          if (!Array.isArray(value)) {
            errors.push(`${field} must be an array`);
          } else {
            if (fieldSchema.min !== undefined && value.length < fieldSchema.min) {
              errors.push(`${field} must have at least ${fieldSchema.min} items`);
            }
            if (fieldSchema.max !== undefined && value.length > fieldSchema.max) {
              errors.push(`${field} must have at most ${fieldSchema.max} items`);
            }
          }
          break;
      }

      // Enum validation
      if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
        errors.push(`${field} must be one of: ${fieldSchema.enum.join(", ")}`);
      }

      // Sanitize strings if requested
      if (fieldSchema.sanitize && typeof value === "string") {
        data[field] = sanitizeString(value);
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: errors,
      });
      return;
    }

    next();
  };
}

/**
 * Error handling middleware
 * Catches all errors and returns structured response
 */
export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId;

  logger.error(`Unhandled error: ${err.message}`, err, {
    requestId,
    path: req.path,
    method: req.method,
  });

  auditLogger.error(
    "unhandled_error",
    {
      type: req.auth ? "user" : "system",
      address: req.auth?.address,
      sessionId: req.auth?.sessionId,
    },
    { type: "endpoint", id: req.path },
    err,
    { requestId, ipAddress: getClientIp(req) }
  );

  // Don't leak error details in production
  const message =
    process.env.NODE_ENV === "production"
      ? "An unexpected error occurred"
      : err.message;

  res.status(500).json({
    success: false,
    error: message,
    code: "INTERNAL_ERROR",
    requestId,
  });
}

/**
 * Not found middleware
 * Returns 404 for unmatched routes
 */
export function notFoundMiddleware(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    code: "NOT_FOUND",
    path: req.path,
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

/**
 * Sanitize string to prevent XSS
 */
function sanitizeString(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}
