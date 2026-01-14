/**
 * Authentication API Routes
 * Phase 7: Production Infrastructure - Authentication and session management
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { authService } from "../../security";
import { auditLogger } from "../../security/audit-logger";
import { authMiddleware, requirePermission } from "../../security/middleware";

const router = Router();

/**
 * Auth challenge schema
 */
const ChallengeSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
});

/**
 * Auth verify schema
 */
const VerifySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  message: z.string().min(1),
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, "Invalid signature format"),
  chainId: z.number().optional(),
});

/**
 * API key creation schema
 */
const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()),
  expiresAt: z.number().optional(),
});

// ============================================================================
// WALLET AUTHENTICATION
// ============================================================================

/**
 * POST /auth/challenge
 * Request authentication challenge for wallet signing
 */
router.post("/challenge", (req: Request, res: Response) => {
  try {
    const parsed = ChallengeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid request",
        details: parsed.error.errors,
      });
      return;
    }

    const challenge = authService.generateChallenge(parsed.data.address);

    res.json({
      success: true,
      data: {
        message: challenge.message,
        nonce: challenge.nonce,
        expiresAt: challenge.expiresAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /auth/verify
 * Verify wallet signature and create session
 */
router.post("/verify", async (req: Request, res: Response) => {
  try {
    const parsed = VerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: "Invalid request",
        details: parsed.error.errors,
      });
      return;
    }

    const authContext = await authService.authenticate(parsed.data);

    auditLogger.success(
      "auth_login",
      { type: "user", address: authContext.address },
      { type: "session", id: authContext.sessionId },
      { roles: authContext.roles },
      { ipAddress: req.ip }
    );

    res.json({
      success: true,
      data: {
        sessionId: authContext.sessionId,
        address: authContext.address,
        roles: authContext.roles,
        permissions: authContext.permissions,
        expiresAt: authContext.expiresAt,
      },
    });
  } catch (error) {
    const address = req.body?.address || "unknown";

    auditLogger.failure(
      "auth_login",
      { type: "user", address },
      { type: "auth", id: "verify" },
      {},
      (error as Error).message,
      { ipAddress: req.ip }
    );

    res.status(401).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /auth/session
 * Get current session info
 */
router.get("/session", authMiddleware(), (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      address: req.auth!.address,
      roles: req.auth!.roles,
      permissions: req.auth!.permissions,
      sessionId: req.auth!.sessionId,
      authenticatedAt: req.auth!.authenticatedAt,
      expiresAt: req.auth!.expiresAt,
    },
  });
});

/**
 * POST /auth/logout
 * Revoke current session
 */
router.post("/logout", authMiddleware(), (req: Request, res: Response) => {
  try {
    const revoked = authService.revokeSession(req.auth!.sessionId);

    if (revoked) {
      auditLogger.success(
        "auth_logout",
        { type: "user", address: req.auth!.address, sessionId: req.auth!.sessionId },
        { type: "session", id: req.auth!.sessionId },
        {}
      );
    }

    res.json({
      success: true,
      message: "Session revoked",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /auth/logout/all
 * Revoke all sessions for current user
 */
router.post("/logout/all", authMiddleware(), (req: Request, res: Response) => {
  try {
    const count = authService.revokeAllSessions(req.auth!.address);

    auditLogger.success(
      "auth_logout_all",
      { type: "user", address: req.auth!.address },
      { type: "user", id: req.auth!.address },
      { sessionsRevoked: count }
    );

    res.json({
      success: true,
      message: `Revoked ${count} sessions`,
      count,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ============================================================================
// API KEYS
// ============================================================================

/**
 * POST /auth/api-keys
 * Create a new API key
 */
router.post(
  "/api-keys",
  authMiddleware(),
  requirePermission("admin:system"),
  (req: Request, res: Response) => {
    try {
      const parsed = CreateApiKeySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: "Invalid request",
          details: parsed.error.errors,
        });
        return;
      }

      const apiKey = authService.createApiKey(
        parsed.data.name,
        req.auth!.address,
        parsed.data.permissions as any,
        { expiresAt: parsed.data.expiresAt }
      );

      res.status(201).json({
        success: true,
        data: {
          id: apiKey.id,
          key: apiKey.key, // Only shown once!
          name: apiKey.name,
          permissions: apiKey.permissions,
          createdAt: apiKey.createdAt,
          expiresAt: apiKey.expiresAt,
        },
        warning: "Save this key securely. It will not be shown again.",
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

/**
 * GET /auth/api-keys
 * List API keys for current user
 */
router.get("/api-keys", authMiddleware(), (req: Request, res: Response) => {
  try {
    const keys = authService.listApiKeys(req.auth!.address);

    res.json({
      success: true,
      data: keys,
      count: keys.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * DELETE /auth/api-keys/:keyId
 * Revoke an API key
 */
router.delete("/api-keys/:keyId", authMiddleware(), (req: Request, res: Response) => {
  try {
    const { keyId } = req.params;
    const apiKey = authService.getApiKey(keyId);

    if (!apiKey) {
      res.status(404).json({
        success: false,
        error: "API key not found",
      });
      return;
    }

    // Only creator or admin can revoke
    if (
      apiKey.createdBy !== req.auth!.address &&
      !req.auth!.permissions.includes("admin:system")
    ) {
      res.status(403).json({
        success: false,
        error: "Not authorized to revoke this key",
      });
      return;
    }

    authService.revokeApiKey(keyId);

    res.json({
      success: true,
      message: "API key revoked",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ============================================================================
// ROLE MANAGEMENT (Admin only)
// ============================================================================

/**
 * POST /auth/roles/:address
 * Assign role to user
 */
router.post(
  "/roles/:address",
  authMiddleware(),
  requirePermission("admin:users"),
  (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const { role } = req.body;

      if (!role) {
        res.status(400).json({
          success: false,
          error: "Role is required",
        });
        return;
      }

      authService.assignRole(address, role);

      auditLogger.success(
        "role_assigned",
        { type: "user", address: req.auth!.address },
        { type: "user", id: address },
        { role }
      );

      res.json({
        success: true,
        message: `Role "${role}" assigned to ${address}`,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  }
);

/**
 * DELETE /auth/roles/:address/:role
 * Remove role from user
 */
router.delete(
  "/roles/:address/:role",
  authMiddleware(),
  requirePermission("admin:users"),
  (req: Request, res: Response) => {
    try {
      const { address, role } = req.params;

      const removed = authService.removeRole(address, role as any);

      if (removed) {
        auditLogger.success(
          "role_removed",
          { type: "user", address: req.auth!.address },
          { type: "user", id: address },
          { role }
        );
      }

      res.json({
        success: true,
        message: removed ? `Role "${role}" removed from ${address}` : "Role was not assigned",
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
 * GET /auth/roles/:address
 * Get roles for an address
 */
router.get(
  "/roles/:address",
  authMiddleware(),
  requirePermission("admin:users"),
  (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const roles = authService.getUserRoles(address);

      res.json({
        success: true,
        data: {
          address,
          roles,
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
