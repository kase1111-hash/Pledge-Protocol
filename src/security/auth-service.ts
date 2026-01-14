/**
 * Authentication Service
 * Phase 7: Production Infrastructure - Wallet signature verification and session management
 */

import { createHash, randomBytes } from "crypto";
import {
  AuthContext,
  AuthRequest,
  AuthChallenge,
  Session,
  ApiKey,
  UserRole,
  Permission,
  ROLE_PERMISSIONS,
  SecurityEvent,
} from "./types";

/**
 * EIP-191 message prefix
 */
const EIP191_PREFIX = "\x19Ethereum Signed Message:\n";

/**
 * Authentication Service
 * Handles wallet-based authentication, session management, and API keys
 */
export class AuthService {
  private challenges: Map<string, AuthChallenge> = new Map();
  private sessions: Map<string, Session> = new Map();
  private apiKeys: Map<string, ApiKey> = new Map();
  private userRoles: Map<string, UserRole[]> = new Map();
  private securityEvents: SecurityEvent[] = [];

  private readonly sessionTtlMs: number;
  private readonly challengeTtlMs: number;
  private readonly maxConcurrentSessions: number;

  constructor(config?: {
    sessionTtlMs?: number;
    challengeTtlMs?: number;
    maxConcurrentSessions?: number;
  }) {
    this.sessionTtlMs = config?.sessionTtlMs || 24 * 60 * 60 * 1000; // 24 hours
    this.challengeTtlMs = config?.challengeTtlMs || 5 * 60 * 1000; // 5 minutes
    this.maxConcurrentSessions = config?.maxConcurrentSessions || 5;
  }

  /**
   * Generate authentication challenge for wallet signing
   */
  generateChallenge(address: string): AuthChallenge {
    const normalizedAddress = address.toLowerCase();
    const nonce = randomBytes(32).toString("hex");
    const timestamp = Date.now();
    const expiresAt = timestamp + this.challengeTtlMs;

    const message = this.buildSignMessage(normalizedAddress, nonce, timestamp);

    const challenge: AuthChallenge = {
      nonce,
      message,
      expiresAt,
      address: normalizedAddress,
    };

    this.challenges.set(normalizedAddress, challenge);

    this.emitSecurityEvent({
      type: "auth_challenge",
      timestamp,
      severity: "low",
      actor: { address: normalizedAddress },
      details: { nonce },
    });

    return challenge;
  }

  /**
   * Build the message to be signed
   */
  private buildSignMessage(address: string, nonce: string, timestamp: number): string {
    return [
      "Welcome to Pledge Protocol!",
      "",
      "Sign this message to authenticate.",
      "",
      `Address: ${address}`,
      `Nonce: ${nonce}`,
      `Timestamp: ${timestamp}`,
      "",
      "This request will not trigger a blockchain transaction or cost any gas fees.",
    ].join("\n");
  }

  /**
   * Verify wallet signature and create session
   */
  async authenticate(request: AuthRequest): Promise<AuthContext> {
    const normalizedAddress = request.address.toLowerCase();
    const challenge = this.challenges.get(normalizedAddress);

    // Validate challenge exists and hasn't expired
    if (!challenge) {
      this.emitSecurityEvent({
        type: "auth_failure",
        timestamp: Date.now(),
        severity: "medium",
        actor: { address: normalizedAddress },
        details: { reason: "No challenge found" },
      });
      throw new Error("Authentication challenge not found. Please request a new challenge.");
    }

    if (Date.now() > challenge.expiresAt) {
      this.challenges.delete(normalizedAddress);
      this.emitSecurityEvent({
        type: "auth_failure",
        timestamp: Date.now(),
        severity: "medium",
        actor: { address: normalizedAddress },
        details: { reason: "Challenge expired" },
      });
      throw new Error("Authentication challenge expired. Please request a new challenge.");
    }

    // Verify message matches
    if (request.message !== challenge.message) {
      this.emitSecurityEvent({
        type: "auth_failure",
        timestamp: Date.now(),
        severity: "high",
        actor: { address: normalizedAddress },
        details: { reason: "Message mismatch" },
      });
      throw new Error("Message does not match challenge");
    }

    // Verify signature
    const recoveredAddress = this.recoverAddress(request.message, request.signature);
    if (recoveredAddress.toLowerCase() !== normalizedAddress) {
      this.emitSecurityEvent({
        type: "auth_failure",
        timestamp: Date.now(),
        severity: "high",
        actor: { address: normalizedAddress },
        details: { reason: "Signature verification failed", recoveredAddress },
      });
      throw new Error("Signature verification failed");
    }

    // Clean up challenge
    this.challenges.delete(normalizedAddress);

    // Create session
    const session = await this.createSession(normalizedAddress, {
      chainId: request.chainId,
    });

    // Get user roles and permissions
    const roles = this.getUserRoles(normalizedAddress);
    const permissions = this.getPermissionsForRoles(roles);

    const authContext: AuthContext = {
      address: normalizedAddress,
      roles,
      permissions,
      sessionId: session.id,
      authenticatedAt: session.createdAt,
      expiresAt: session.expiresAt,
      metadata: {
        nonce: challenge.nonce,
        chainId: request.chainId,
      },
    };

    this.emitSecurityEvent({
      type: "auth_success",
      timestamp: Date.now(),
      severity: "low",
      actor: { address: normalizedAddress },
      details: { sessionId: session.id, roles },
    });

    return authContext;
  }

  /**
   * Recover address from signed message (EIP-191)
   * In production, use ethers.js or web3.js for proper recovery
   */
  private recoverAddress(message: string, signature: string): string {
    // This is a simplified version for testing
    // In production, use proper ECDSA recovery:
    // const { verifyMessage } = require('ethers');
    // return verifyMessage(message, signature);

    // For now, we'll simulate by checking signature format
    if (!signature.startsWith("0x") || signature.length !== 132) {
      throw new Error("Invalid signature format");
    }

    // Extract components (r, s, v)
    const r = signature.slice(0, 66);
    const s = "0x" + signature.slice(66, 130);
    const v = parseInt(signature.slice(130, 132), 16);

    if (v !== 27 && v !== 28) {
      throw new Error("Invalid signature v value");
    }

    // In production, this would do actual ECDSA recovery
    // For testing, we'll hash the message to simulate address derivation
    const messageHash = this.hashMessage(message);

    // Simulate address recovery from hash + signature
    // This is NOT cryptographically secure - just for testing
    const combinedHash = createHash("sha256")
      .update(messageHash)
      .update(Buffer.from(signature.slice(2), "hex"))
      .digest();

    // Return a deterministic address based on the hash
    // In production, this would be actual ECDSA recovery
    return "0x" + combinedHash.slice(0, 20).toString("hex");
  }

  /**
   * Hash message with EIP-191 prefix
   */
  private hashMessage(message: string): string {
    const messageBytes = Buffer.from(message);
    const prefix = Buffer.from(`${EIP191_PREFIX}${messageBytes.length}`);
    const fullMessage = Buffer.concat([prefix, messageBytes]);
    return createHash("sha256").update(fullMessage).digest("hex");
  }

  /**
   * Create a new session
   */
  private async createSession(
    address: string,
    metadata?: { userAgent?: string; ipAddress?: string; chainId?: number }
  ): Promise<Session> {
    const normalizedAddress = address.toLowerCase();

    // Enforce concurrent session limit
    const existingSessions = this.getSessionsForAddress(normalizedAddress);
    if (existingSessions.length >= this.maxConcurrentSessions) {
      // Revoke oldest session
      const oldest = existingSessions.sort((a, b) => a.createdAt - b.createdAt)[0];
      this.revokeSession(oldest.id);
    }

    const sessionId = `session-${randomBytes(16).toString("hex")}`;
    const now = Date.now();

    const session: Session = {
      id: sessionId,
      address: normalizedAddress,
      roles: this.getUserRoles(normalizedAddress),
      createdAt: now,
      expiresAt: now + this.sessionTtlMs,
      lastActivityAt: now,
      metadata: metadata || {},
    };

    this.sessions.set(sessionId, session);

    this.emitSecurityEvent({
      type: "session_created",
      timestamp: now,
      severity: "low",
      actor: { address: normalizedAddress },
      details: { sessionId },
    });

    return session;
  }

  /**
   * Get sessions for an address
   */
  private getSessionsForAddress(address: string): Session[] {
    const normalizedAddress = address.toLowerCase();
    return Array.from(this.sessions.values()).filter(
      (s) => s.address === normalizedAddress && s.expiresAt > Date.now()
    );
  }

  /**
   * Validate and refresh session
   */
  validateSession(sessionId: string): AuthContext | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      this.emitSecurityEvent({
        type: "session_expired",
        timestamp: Date.now(),
        severity: "low",
        actor: { address: session.address },
        details: { sessionId },
      });
      return null;
    }

    // Update last activity
    session.lastActivityAt = Date.now();

    const roles = this.getUserRoles(session.address);
    const permissions = this.getPermissionsForRoles(roles);

    return {
      address: session.address,
      roles,
      permissions,
      sessionId: session.id,
      authenticatedAt: session.createdAt,
      expiresAt: session.expiresAt,
      metadata: session.metadata,
    };
  }

  /**
   * Revoke a session
   */
  revokeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    this.sessions.delete(sessionId);

    this.emitSecurityEvent({
      type: "session_revoked",
      timestamp: Date.now(),
      severity: "low",
      actor: { address: session.address },
      details: { sessionId },
    });

    return true;
  }

  /**
   * Revoke all sessions for an address
   */
  revokeAllSessions(address: string): number {
    const normalizedAddress = address.toLowerCase();
    let count = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.address === normalizedAddress) {
        this.sessions.delete(sessionId);
        count++;
      }
    }

    return count;
  }

  // ============================================================================
  // ROLE MANAGEMENT
  // ============================================================================

  /**
   * Get roles for a user
   */
  getUserRoles(address: string): UserRole[] {
    const normalizedAddress = address.toLowerCase();
    const roles = this.userRoles.get(normalizedAddress) || ["backer"];
    return roles;
  }

  /**
   * Assign role to user
   */
  assignRole(address: string, role: UserRole): void {
    const normalizedAddress = address.toLowerCase();
    const roles = this.userRoles.get(normalizedAddress) || [];

    if (!roles.includes(role)) {
      roles.push(role);
      this.userRoles.set(normalizedAddress, roles);
    }
  }

  /**
   * Remove role from user
   */
  removeRole(address: string, role: UserRole): boolean {
    const normalizedAddress = address.toLowerCase();
    const roles = this.userRoles.get(normalizedAddress) || [];
    const index = roles.indexOf(role);

    if (index > -1) {
      roles.splice(index, 1);
      this.userRoles.set(normalizedAddress, roles);
      return true;
    }

    return false;
  }

  /**
   * Get permissions for a set of roles
   */
  getPermissionsForRoles(roles: UserRole[]): Permission[] {
    const permissions = new Set<Permission>();

    for (const role of roles) {
      const rolePermissions = ROLE_PERMISSIONS[role] || [];
      for (const permission of rolePermissions) {
        permissions.add(permission);
      }
    }

    return Array.from(permissions);
  }

  /**
   * Check if user has permission
   */
  hasPermission(address: string, permission: Permission): boolean {
    const roles = this.getUserRoles(address);
    const permissions = this.getPermissionsForRoles(roles);
    return permissions.includes(permission);
  }

  // ============================================================================
  // API KEY MANAGEMENT
  // ============================================================================

  /**
   * Create an API key
   */
  createApiKey(
    name: string,
    createdBy: string,
    permissions: Permission[],
    options?: {
      rateLimit?: { requests: number; windowMs: number };
      expiresAt?: number;
    }
  ): ApiKey {
    const keyId = `key-${randomBytes(8).toString("hex")}`;
    const key = `pk_${randomBytes(32).toString("hex")}`;

    const apiKey: ApiKey = {
      id: keyId,
      key,
      name,
      createdBy: createdBy.toLowerCase(),
      permissions,
      rateLimit: options?.rateLimit || { requests: 1000, windowMs: 60000 },
      active: true,
      createdAt: Date.now(),
      expiresAt: options?.expiresAt,
    };

    this.apiKeys.set(keyId, apiKey);

    this.emitSecurityEvent({
      type: "api_key_created",
      timestamp: Date.now(),
      severity: "medium",
      actor: { address: createdBy },
      details: { keyId, name, permissions },
    });

    return apiKey;
  }

  /**
   * Validate API key
   */
  validateApiKey(key: string): ApiKey | null {
    for (const apiKey of this.apiKeys.values()) {
      if (apiKey.key === key) {
        if (!apiKey.active) {
          return null;
        }

        if (apiKey.expiresAt && Date.now() > apiKey.expiresAt) {
          apiKey.active = false;
          return null;
        }

        apiKey.lastUsedAt = Date.now();
        return apiKey;
      }
    }

    return null;
  }

  /**
   * Get API key by ID
   */
  getApiKey(keyId: string): ApiKey | undefined {
    return this.apiKeys.get(keyId);
  }

  /**
   * List API keys for a user
   */
  listApiKeys(createdBy: string): Omit<ApiKey, "key">[] {
    const normalizedAddress = createdBy.toLowerCase();
    return Array.from(this.apiKeys.values())
      .filter((k) => k.createdBy === normalizedAddress)
      .map(({ key, ...rest }) => rest);
  }

  /**
   * Revoke an API key
   */
  revokeApiKey(keyId: string): boolean {
    const apiKey = this.apiKeys.get(keyId);
    if (!apiKey) {
      return false;
    }

    apiKey.active = false;

    this.emitSecurityEvent({
      type: "api_key_revoked",
      timestamp: Date.now(),
      severity: "medium",
      actor: { address: apiKey.createdBy },
      details: { keyId },
    });

    return true;
  }

  // ============================================================================
  // SECURITY EVENTS
  // ============================================================================

  /**
   * Emit a security event
   */
  private emitSecurityEvent(event: SecurityEvent): void {
    this.securityEvents.push(event);

    // Keep only last 10000 events in memory
    if (this.securityEvents.length > 10000) {
      this.securityEvents = this.securityEvents.slice(-10000);
    }
  }

  /**
   * Get recent security events
   */
  getSecurityEvents(options?: {
    type?: SecurityEvent["type"];
    severity?: SecurityEvent["severity"];
    since?: number;
    limit?: number;
  }): SecurityEvent[] {
    let events = this.securityEvents;

    if (options?.type) {
      events = events.filter((e) => e.type === options.type);
    }

    if (options?.severity) {
      events = events.filter((e) => e.severity === options.severity);
    }

    if (options?.since) {
      events = events.filter((e) => e.timestamp >= options.since);
    }

    const limit = options?.limit || 100;
    return events.slice(-limit);
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    activeSessions: number;
    activeApiKeys: number;
    totalUsers: number;
    recentAuthFailures: number;
    recentRateLimitExceeded: number;
  } {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    const recentEvents = this.securityEvents.filter((e) => e.timestamp >= oneHourAgo);

    return {
      activeSessions: Array.from(this.sessions.values()).filter((s) => s.expiresAt > now).length,
      activeApiKeys: Array.from(this.apiKeys.values()).filter((k) => k.active).length,
      totalUsers: this.userRoles.size,
      recentAuthFailures: recentEvents.filter((e) => e.type === "auth_failure").length,
      recentRateLimitExceeded: recentEvents.filter((e) => e.type === "rate_limit_exceeded").length,
    };
  }

  /**
   * Clean up expired sessions and challenges
   */
  cleanup(): { expiredSessions: number; expiredChallenges: number } {
    const now = Date.now();
    let expiredSessions = 0;
    let expiredChallenges = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(sessionId);
        expiredSessions++;
      }
    }

    for (const [address, challenge] of this.challenges.entries()) {
      if (challenge.expiresAt <= now) {
        this.challenges.delete(address);
        expiredChallenges++;
      }
    }

    return { expiredSessions, expiredChallenges };
  }
}

// Export singleton instance
export const authService = new AuthService();
