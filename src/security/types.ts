/**
 * Security System Types
 * Phase 7: Production Infrastructure - Authentication, Authorization, and Security
 */

/**
 * User roles in the system
 */
export type UserRole = "backer" | "creator" | "arbitrator" | "admin" | "system";

/**
 * Permission types for RBAC
 */
export type Permission =
  // Campaign permissions
  | "campaign:create"
  | "campaign:read"
  | "campaign:update"
  | "campaign:delete"
  | "campaign:activate"
  | "campaign:cancel"
  | "campaign:feature"
  // Pledge permissions
  | "pledge:create"
  | "pledge:read"
  | "pledge:cancel"
  | "pledge:release"
  | "pledge:refund"
  // Oracle permissions
  | "oracle:register"
  | "oracle:read"
  | "oracle:trigger"
  | "oracle:configure"
  // Dispute permissions
  | "dispute:create"
  | "dispute:read"
  | "dispute:vote"
  | "dispute:escalate"
  | "dispute:resolve"
  | "dispute:appeal"
  // Webhook permissions
  | "webhook:create"
  | "webhook:read"
  | "webhook:update"
  | "webhook:delete"
  // Admin permissions
  | "admin:users"
  | "admin:system"
  | "admin:audit"
  | "admin:metrics";

/**
 * Role permission mappings
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  backer: [
    "campaign:read",
    "pledge:create",
    "pledge:read",
    "pledge:cancel",
    "oracle:read",
    "dispute:create",
    "dispute:read",
    "dispute:vote",
    "dispute:appeal",
    "webhook:create",
    "webhook:read",
    "webhook:update",
    "webhook:delete",
  ],
  creator: [
    "campaign:create",
    "campaign:read",
    "campaign:update",
    "campaign:activate",
    "campaign:cancel",
    "pledge:read",
    "pledge:release",
    "pledge:refund",
    "oracle:register",
    "oracle:read",
    "oracle:trigger",
    "dispute:read",
    "dispute:vote",
    "webhook:create",
    "webhook:read",
    "webhook:update",
    "webhook:delete",
  ],
  arbitrator: [
    "campaign:read",
    "pledge:read",
    "oracle:read",
    "dispute:read",
    "dispute:vote",
    "dispute:escalate",
    "dispute:resolve",
  ],
  admin: [
    "campaign:create",
    "campaign:read",
    "campaign:update",
    "campaign:delete",
    "campaign:activate",
    "campaign:cancel",
    "campaign:feature",
    "pledge:create",
    "pledge:read",
    "pledge:cancel",
    "pledge:release",
    "pledge:refund",
    "oracle:register",
    "oracle:read",
    "oracle:trigger",
    "oracle:configure",
    "dispute:create",
    "dispute:read",
    "dispute:vote",
    "dispute:escalate",
    "dispute:resolve",
    "dispute:appeal",
    "webhook:create",
    "webhook:read",
    "webhook:update",
    "webhook:delete",
    "admin:users",
    "admin:system",
    "admin:audit",
    "admin:metrics",
  ],
  system: [
    "campaign:read",
    "campaign:update",
    "pledge:read",
    "pledge:release",
    "pledge:refund",
    "oracle:read",
    "oracle:trigger",
    "dispute:read",
    "dispute:resolve",
    "webhook:read",
  ],
};

/**
 * Authenticated user context
 */
export interface AuthContext {
  address: string;
  roles: UserRole[];
  permissions: Permission[];
  sessionId: string;
  authenticatedAt: number;
  expiresAt: number;
  metadata?: {
    nonce?: string;
    chainId?: number;
    userAgent?: string;
    ipAddress?: string;
  };
}

/**
 * Authentication request for wallet signature
 */
export interface AuthRequest {
  address: string;
  message: string;
  signature: string;
  chainId?: number;
}

/**
 * Authentication challenge for wallet signing
 */
export interface AuthChallenge {
  nonce: string;
  message: string;
  expiresAt: number;
  address: string;
}

/**
 * Session data stored in cache
 */
export interface Session {
  id: string;
  address: string;
  roles: UserRole[];
  createdAt: number;
  expiresAt: number;
  lastActivityAt: number;
  metadata: {
    userAgent?: string;
    ipAddress?: string;
    chainId?: number;
  };
}

/**
 * API key for service integrations
 */
export interface ApiKey {
  id: string;
  key: string;
  name: string;
  createdBy: string;
  permissions: Permission[];
  rateLimit: {
    requests: number;
    windowMs: number;
  };
  active: boolean;
  createdAt: number;
  expiresAt?: number;
  lastUsedAt?: number;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
}

/**
 * Rate limit tiers
 */
export type RateLimitTier = "anonymous" | "authenticated" | "premium" | "api" | "internal";

export const RATE_LIMIT_TIERS: Record<RateLimitTier, RateLimitConfig> = {
  anonymous: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    message: "Too many requests from this IP, please try again later",
  },
  authenticated: {
    windowMs: 60 * 1000,
    maxRequests: 100,
    message: "Rate limit exceeded, please slow down",
  },
  premium: {
    windowMs: 60 * 1000,
    maxRequests: 500,
    message: "Premium rate limit exceeded",
  },
  api: {
    windowMs: 60 * 1000,
    maxRequests: 1000,
    message: "API rate limit exceeded",
  },
  internal: {
    windowMs: 60 * 1000,
    maxRequests: 10000,
  },
};

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: string;
  timestamp: number;
  action: string;
  actor: {
    address?: string;
    sessionId?: string;
    apiKeyId?: string;
    type: "user" | "api" | "system";
  };
  resource: {
    type: string;
    id: string;
  };
  details: Record<string, any>;
  result: "success" | "failure" | "error";
  error?: string;
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    duration?: number;
  };
}

/**
 * Security event types for monitoring
 */
export type SecurityEventType =
  | "auth_success"
  | "auth_failure"
  | "auth_challenge"
  | "session_created"
  | "session_expired"
  | "session_revoked"
  | "permission_denied"
  | "rate_limit_exceeded"
  | "suspicious_activity"
  | "api_key_created"
  | "api_key_revoked";

/**
 * Security event for alerting
 */
export interface SecurityEvent {
  type: SecurityEventType;
  timestamp: number;
  severity: "low" | "medium" | "high" | "critical";
  actor?: {
    address?: string;
    ipAddress?: string;
  };
  details: Record<string, any>;
}

/**
 * Input validation schema
 */
export interface ValidationSchema {
  type: "string" | "number" | "boolean" | "array" | "object" | "address" | "hash" | "url";
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
  items?: ValidationSchema;
  properties?: Record<string, ValidationSchema>;
  sanitize?: boolean;
}

/**
 * CORS configuration
 */
export interface CorsConfig {
  origins: string[];
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  jwt: {
    secret: string;
    expiresIn: string;
    issuer: string;
  };
  session: {
    ttlSeconds: number;
    maxConcurrent: number;
  };
  rateLimit: {
    enabled: boolean;
    defaultTier: RateLimitTier;
  };
  cors: CorsConfig;
  audit: {
    enabled: boolean;
    retentionDays: number;
  };
}
