/**
 * Phase 9: Enterprise API Routes
 *
 * Organization management, teams, SSO, and bulk operations.
 */

import { Router, Request, Response, NextFunction } from "express";
import { createOrganizationService } from "../../enterprise";
import { TeamPermission } from "../../enterprise/types";
import { cancelCampaignAs, createCampaignFrom } from "./campaigns";
import { authMiddleware, hasRole, requireSelfOrAdmin } from "../../security/middleware";

const router = Router();

// Organization data is private to its members
router.use(authMiddleware());

/**
 * Requires the caller to hold `permission` in the route's organization (or to
 * be a platform admin). Non-members get a 404 so organizations cannot be
 * probed.
 */
function orgPermission(permission: TeamPermission) {
  return (req: Request, res: Response, next: NextFunction) => {
    const orgId = req.params.orgId;
    if (hasRole(req, "admin") || orgService.hasPermission(orgId, req.auth!.address, permission)) {
      return next();
    }
    if (orgService.getMember(orgId, req.auth!.address)?.status === "active") {
      return res.status(403).json({ error: `Requires the ${permission} permission` });
    }
    res.status(404).json({ error: "Organization not found" });
  };
}

/** Members can be given any role except owner, which is never transferable here */
function assignableRole(role: unknown): boolean {
  return typeof role === "string" && role !== "owner";
}
// Initialize organization service
export const orgService = createOrganizationService();

// Campaign items in bulk operations go through the same validation, escrow
// refunds and events as the campaign routes; the requesting member is the
// campaign creator
orgService.setBulkHandlers({
  campaign_create: async (item, createdBy) => ({ id: (await createCampaignFrom(item, createdBy)).id }),
  campaign_cancel: async (item, createdBy) => {
    if (typeof item?.campaignId !== "string") {
      throw new Error("campaignId is required");
    }
    await cancelCampaignAs(item.campaignId, createdBy);
    return { id: item.campaignId };
  },
});

/** Permission each kind of bulk operation needs */
const BULK_PERMISSIONS: Record<string, TeamPermission> = {
  campaign_create: "campaigns:create",
  campaign_update: "campaigns:manage",
  campaign_cancel: "campaigns:manage",
  pledge_refund: "pledges:refund",
  member_invite: "org:members",
  member_remove: "org:members",
};

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
      contactEmail,
      contactName,
      description,
      website,
    } = req.body;
    // The creator owns the organization
    const ownerAddress = req.auth!.address;

    if (!name || !type || !contactEmail) {
      return res.status(400).json({
        error: "Missing required fields: name, type, contactEmail",
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
router.get("/orgs/:orgId", orgPermission("campaigns:view"), async (req: Request, res: Response) => {
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
    const member = org ? orgService.getMember(org.id, req.auth!.address) : undefined;
    if (!org || (member?.status !== "active" && !hasRole(req, "admin"))) {
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
router.get("/orgs/user/:address", requireSelfOrAdmin(), async (req: Request, res: Response) => {
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
router.put("/orgs/:orgId", orgPermission("org:manage"), async (req: Request, res: Response) => {
  try {
    const actorAddress = req.auth!.address;
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
router.put("/orgs/:orgId/settings", orgPermission("org:manage"), async (req: Request, res: Response) => {
  try {
    const actorAddress = req.auth!.address;
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
router.get("/orgs/:orgId/members", orgPermission("campaigns:view"), async (req: Request, res: Response) => {
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
router.post("/orgs/:orgId/members", orgPermission("org:members"), async (req: Request, res: Response) => {
  try {
    const { userAddress, role, displayName, email } = req.body;
    const invitedBy = req.auth!.address;

    if (!userAddress || !role) {
      return res.status(400).json({
        error: "userAddress and role are required",
      });
    }
    if (!assignableRole(role)) {
      return res.status(400).json({ error: "The owner role cannot be assigned" });
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
  orgPermission("org:members"),
  async (req: Request, res: Response) => {
    try {
      const { role } = req.body;
      const actorAddress = req.auth!.address;

      if (!role) {
        return res.status(400).json({
          error: "role is required",
        });
      }
      if (!assignableRole(role)) {
        return res.status(400).json({ error: "The owner role cannot be assigned" });
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
  orgPermission("org:members"),
  async (req: Request, res: Response) => {
    try {
      const actorAddress = req.auth!.address;
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
router.post("/orgs/:orgId/invites", orgPermission("org:members"), async (req: Request, res: Response) => {
  try {
    const { email, role } = req.body;
    const invitedBy = req.auth!.address;

    if (!email || !role) {
      return res.status(400).json({
        error: "email and role are required",
      });
    }
    if (!assignableRole(role)) {
      return res.status(400).json({ error: "The owner role cannot be assigned" });
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
    // The invite is accepted by, and for, the signed-in account
    const userAddress = req.auth!.address;
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
router.get("/orgs/:orgId/invites", orgPermission("org:members"), async (req: Request, res: Response) => {
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
router.post("/orgs/:orgId/sso", orgPermission("org:manage"), async (req: Request, res: Response) => {
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
router.get("/orgs/:orgId/sso", orgPermission("org:manage"), async (req: Request, res: Response) => {
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
router.post("/orgs/:orgId/sso/validate", orgPermission("org:manage"), async (req: Request, res: Response) => {
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
router.get("/orgs/:orgId/billing", orgPermission("org:billing"), async (req: Request, res: Response) => {
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
router.post("/orgs/:orgId/billing/upgrade", orgPermission("org:billing"), async (req: Request, res: Response) => {
  try {
    const { plan, cycle } = req.body;
    const actorAddress = req.auth!.address;

    if (!plan || !cycle) {
      return res.status(400).json({
        error: "plan and cycle are required",
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
router.post("/orgs/:orgId/bulk", orgPermission("campaigns:view"), async (req: Request, res: Response) => {
  const { type, inputData } = req.body;
  const createdBy = req.auth!.address;

  if (!type || !inputData) {
    return res.status(400).json({
      error: "type and inputData are required",
    });
  }

  const permission = BULK_PERMISSIONS[type];
  if (
    permission &&
    !hasRole(req, "admin") &&
    !orgService.hasPermission(req.params.orgId, createdBy, permission)
  ) {
    return res.status(403).json({ error: `Requires the ${permission} permission` });
  }

  try {
    const operation = orgService.createBulkOperation(req.params.orgId, {
      type,
      inputData,
      createdBy,
    });

    res.status(202).json(operation);
  } catch (error) {
    res.status(400).json({
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
  orgPermission("campaigns:view"),
  async (req: Request, res: Response) => {
    try {
      const operation = orgService.getBulkOperation(req.params.operationId);

      // Operations are looked up by ID alone; only show this org's
      if (!operation || operation.organizationId !== req.params.orgId) {
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
router.get("/orgs/:orgId/bulk", orgPermission("campaigns:view"), async (req: Request, res: Response) => {
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
router.post("/orgs/:orgId/api-keys", orgPermission("api:manage"), async (req: Request, res: Response) => {
  try {
    const { name, permissions, expiresAt } = req.body;
    const createdBy = req.auth!.address;

    if (!name || !permissions) {
      return res.status(400).json({
        error: "name and permissions are required",
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
router.get("/orgs/:orgId/api-keys", orgPermission("api:manage"), async (req: Request, res: Response) => {
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
  orgPermission("api:manage"),
  async (req: Request, res: Response) => {
    try {
      const actorAddress = req.auth!.address;
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
router.get("/orgs/:orgId/audit", orgPermission("org:manage"), async (req: Request, res: Response) => {
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
