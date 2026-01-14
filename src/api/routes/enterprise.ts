/**
 * Phase 9: Enterprise API Routes
 *
 * Organization management, teams, SSO, and bulk operations.
 */

import { Router, Request, Response } from "express";
import { OrganizationService, createOrganizationService } from "../../enterprise";

const router = Router();

// Initialize organization service
const orgService = createOrganizationService();

// ============================================================================
// ORGANIZATIONS
// ============================================================================

/**
 * Create organization
 * POST /v1/enterprise/orgs
 */
router.post("/orgs", async (req: Request, res: Response) => {
  try {
    const {
      name,
      type,
      ownerAddress,
      contactEmail,
      contactName,
      description,
      website,
    } = req.body;

    if (!name || !type || !ownerAddress || !contactEmail) {
      return res.status(400).json({
        error: "Missing required fields: name, type, ownerAddress, contactEmail",
      });
    }

    const org = orgService.createOrganization({
      name,
      type,
      ownerAddress,
      contactEmail,
      contactName,
      description,
      website,
    });

    res.status(201).json(org);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Organization creation failed",
    });
  }
});

/**
 * Get organization by ID
 * GET /v1/enterprise/orgs/:orgId
 */
router.get("/orgs/:orgId", async (req: Request, res: Response) => {
  try {
    const org = orgService.getOrganization(req.params.orgId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }
    res.json(org);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get organization",
    });
  }
});

/**
 * Get organization by slug
 * GET /v1/enterprise/orgs/slug/:slug
 */
router.get("/orgs/slug/:slug", async (req: Request, res: Response) => {
  try {
    const org = orgService.getOrganizationBySlug(req.params.slug);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }
    res.json(org);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get organization",
    });
  }
});

/**
 * Get user's organizations
 * GET /v1/enterprise/orgs/user/:address
 */
router.get("/orgs/user/:address", async (req: Request, res: Response) => {
  try {
    const orgs = orgService.getUserOrganizations(req.params.address);
    res.json(orgs);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get organizations",
    });
  }
});

/**
 * Update organization
 * PUT /v1/enterprise/orgs/:orgId
 */
router.put("/orgs/:orgId", async (req: Request, res: Response) => {
  try {
    const actorAddress = req.body.actorAddress || req.headers["x-user-address"];
    if (!actorAddress) {
      return res.status(400).json({ error: "actorAddress is required" });
    }

    const org = orgService.updateOrganization(
      req.params.orgId,
      req.body,
      actorAddress as string
    );

    res.json(org);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Update failed",
    });
  }
});

/**
 * Update organization settings
 * PUT /v1/enterprise/orgs/:orgId/settings
 */
router.put("/orgs/:orgId/settings", async (req: Request, res: Response) => {
  try {
    const actorAddress = req.body.actorAddress || req.headers["x-user-address"];
    if (!actorAddress) {
      return res.status(400).json({ error: "actorAddress is required" });
    }

    const org = orgService.updateOrganizationSettings(
      req.params.orgId,
      req.body.settings,
      actorAddress as string
    );

    res.json(org);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Settings update failed",
    });
  }
});

// ============================================================================
// TEAM MEMBERS
// ============================================================================

/**
 * Get organization members
 * GET /v1/enterprise/orgs/:orgId/members
 */
router.get("/orgs/:orgId/members", async (req: Request, res: Response) => {
  try {
    const members = orgService.getMembers(req.params.orgId);
    res.json(members);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get members",
    });
  }
});

/**
 * Add team member
 * POST /v1/enterprise/orgs/:orgId/members
 */
router.post("/orgs/:orgId/members", async (req: Request, res: Response) => {
  try {
    const { userAddress, role, displayName, email, invitedBy } = req.body;

    if (!userAddress || !role) {
      return res.status(400).json({
        error: "userAddress and role are required",
      });
    }

    const member = orgService.addMember(req.params.orgId, {
      userAddress,
      role,
      displayName,
      email,
      invitedBy,
    });

    res.status(201).json(member);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to add member",
    });
  }
});

/**
 * Update member role
 * PUT /v1/enterprise/orgs/:orgId/members/:address/role
 */
router.put(
  "/orgs/:orgId/members/:address/role",
  async (req: Request, res: Response) => {
    try {
      const { role, actorAddress } = req.body;

      if (!role || !actorAddress) {
        return res.status(400).json({
          error: "role and actorAddress are required",
        });
      }

      const member = orgService.updateMemberRole(
        req.params.orgId,
        req.params.address,
        role,
        actorAddress
      );

      res.json(member);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to update role",
      });
    }
  }
);

/**
 * Remove team member
 * DELETE /v1/enterprise/orgs/:orgId/members/:address
 */
router.delete(
  "/orgs/:orgId/members/:address",
  async (req: Request, res: Response) => {
    try {
      const actorAddress =
        (req.query.actorAddress as string) ||
        req.headers["x-user-address"];

      if (!actorAddress) {
        return res.status(400).json({ error: "actorAddress is required" });
      }

      orgService.removeMember(
        req.params.orgId,
        req.params.address,
        actorAddress as string
      );

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to remove member",
      });
    }
  }
);

// ============================================================================
// INVITATIONS
// ============================================================================

/**
 * Create team invite
 * POST /v1/enterprise/orgs/:orgId/invites
 */
router.post("/orgs/:orgId/invites", async (req: Request, res: Response) => {
  try {
    const { email, role, invitedBy } = req.body;

    if (!email || !role || !invitedBy) {
      return res.status(400).json({
        error: "email, role, and invitedBy are required",
      });
    }

    const invite = orgService.createInvite(req.params.orgId, {
      email,
      role,
      invitedBy,
    });

    res.status(201).json(invite);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to create invite",
    });
  }
});

/**
 * Accept invite
 * POST /v1/enterprise/invites/:token/accept
 */
router.post("/invites/:token/accept", async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.body;

    if (!userAddress) {
      return res.status(400).json({ error: "userAddress is required" });
    }

    const member = orgService.acceptInvite(req.params.token, userAddress);
    res.json(member);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to accept invite",
    });
  }
});

/**
 * Get pending invites
 * GET /v1/enterprise/orgs/:orgId/invites
 */
router.get("/orgs/:orgId/invites", async (req: Request, res: Response) => {
  try {
    const invites = orgService.getPendingInvites(req.params.orgId);
    res.json(invites);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get invites",
    });
  }
});

// ============================================================================
// SSO
// ============================================================================

/**
 * Configure SSO
 * POST /v1/enterprise/orgs/:orgId/sso
 */
router.post("/orgs/:orgId/sso", async (req: Request, res: Response) => {
  try {
    const config = orgService.configureSso(req.params.orgId, req.body);
    res.status(201).json(config);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "SSO configuration failed",
    });
  }
});

/**
 * Get SSO configuration
 * GET /v1/enterprise/orgs/:orgId/sso
 */
router.get("/orgs/:orgId/sso", async (req: Request, res: Response) => {
  try {
    const config = orgService.getSsoConfig(req.params.orgId);
    if (!config) {
      return res.status(404).json({ error: "SSO not configured" });
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get SSO config",
    });
  }
});

/**
 * Validate SSO session
 * POST /v1/enterprise/orgs/:orgId/sso/validate
 */
router.post("/orgs/:orgId/sso/validate", async (req: Request, res: Response) => {
  try {
    const { externalUserId, email } = req.body;

    if (!externalUserId || !email) {
      return res.status(400).json({
        error: "externalUserId and email are required",
      });
    }

    const session = orgService.validateSsoSession(
      req.params.orgId,
      externalUserId,
      email
    );

    res.json(session);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "SSO validation failed",
    });
  }
});

// ============================================================================
// BILLING
// ============================================================================

/**
 * Get billing info
 * GET /v1/enterprise/orgs/:orgId/billing
 */
router.get("/orgs/:orgId/billing", async (req: Request, res: Response) => {
  try {
    const billing = orgService.getBilling(req.params.orgId);
    if (!billing) {
      return res.status(404).json({ error: "Billing not found" });
    }
    res.json(billing);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get billing",
    });
  }
});

/**
 * Upgrade plan
 * POST /v1/enterprise/orgs/:orgId/billing/upgrade
 */
router.post("/orgs/:orgId/billing/upgrade", async (req: Request, res: Response) => {
  try {
    const { plan, cycle, actorAddress } = req.body;

    if (!plan || !cycle || !actorAddress) {
      return res.status(400).json({
        error: "plan, cycle, and actorAddress are required",
      });
    }

    const billing = orgService.upgradePlan(
      req.params.orgId,
      plan,
      cycle,
      actorAddress
    );

    res.json(billing);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Upgrade failed",
    });
  }
});

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Create bulk operation
 * POST /v1/enterprise/orgs/:orgId/bulk
 */
router.post("/orgs/:orgId/bulk", async (req: Request, res: Response) => {
  try {
    const { type, inputData, createdBy } = req.body;

    if (!type || !inputData || !createdBy) {
      return res.status(400).json({
        error: "type, inputData, and createdBy are required",
      });
    }

    const operation = orgService.createBulkOperation(req.params.orgId, {
      type,
      inputData,
      createdBy,
    });

    res.status(202).json(operation);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Bulk operation failed",
    });
  }
});

/**
 * Get bulk operation status
 * GET /v1/enterprise/orgs/:orgId/bulk/:operationId
 */
router.get(
  "/orgs/:orgId/bulk/:operationId",
  async (req: Request, res: Response) => {
    try {
      const operation = orgService.getBulkOperation(req.params.operationId);
      if (!operation) {
        return res.status(404).json({ error: "Operation not found" });
      }
      res.json(operation);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get operation",
      });
    }
  }
);

/**
 * List organization bulk operations
 * GET /v1/enterprise/orgs/:orgId/bulk
 */
router.get("/orgs/:orgId/bulk", async (req: Request, res: Response) => {
  try {
    const operations = orgService.getOrgBulkOperations(req.params.orgId);
    res.json(operations);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to list operations",
    });
  }
});

// ============================================================================
// API KEYS
// ============================================================================

/**
 * Create API key
 * POST /v1/enterprise/orgs/:orgId/api-keys
 */
router.post("/orgs/:orgId/api-keys", async (req: Request, res: Response) => {
  try {
    const { name, permissions, createdBy, expiresAt } = req.body;

    if (!name || !permissions || !createdBy) {
      return res.status(400).json({
        error: "name, permissions, and createdBy are required",
      });
    }

    const result = orgService.createApiKey(req.params.orgId, {
      name,
      permissions,
      createdBy,
      expiresAt,
    });

    res.status(201).json({
      apiKey: result.apiKey,
      plainKey: result.plainKey,
      warning: "Store this key securely. It will not be shown again.",
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to create API key",
    });
  }
});

/**
 * List API keys
 * GET /v1/enterprise/orgs/:orgId/api-keys
 */
router.get("/orgs/:orgId/api-keys", async (req: Request, res: Response) => {
  try {
    const keys = orgService.getApiKeys(req.params.orgId);
    // Don't expose key hashes
    const safeKeys = keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      permissions: k.permissions,
      status: k.status,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
    }));
    res.json(safeKeys);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to list API keys",
    });
  }
});

/**
 * Revoke API key
 * POST /v1/enterprise/orgs/:orgId/api-keys/:keyId/revoke
 */
router.post(
  "/orgs/:orgId/api-keys/:keyId/revoke",
  async (req: Request, res: Response) => {
    try {
      const actorAddress =
        req.body.actorAddress || req.headers["x-user-address"];

      if (!actorAddress) {
        return res.status(400).json({ error: "actorAddress is required" });
      }

      const key = orgService.revokeApiKey(
        req.params.orgId,
        req.params.keyId,
        actorAddress as string
      );

      res.json({ id: key.id, status: key.status });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to revoke key",
      });
    }
  }
);

// ============================================================================
// AUDIT LOGS
// ============================================================================

/**
 * Get organization audit logs
 * GET /v1/enterprise/orgs/:orgId/audit
 */
router.get("/orgs/:orgId/audit", async (req: Request, res: Response) => {
  try {
    const { limit, offset, action, resource } = req.query;

    const result = orgService.getAuditLogs(req.params.orgId, {
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      action: action as string,
      resource: resource as string,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get audit logs",
    });
  }
});

export default router;
