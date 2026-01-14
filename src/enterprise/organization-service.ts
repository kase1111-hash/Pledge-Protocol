/**
 * Phase 9: Organization Service
 *
 * Enterprise organization management, teams, SSO, and bulk operations.
 */

import { randomUUID } from "crypto";
import {
  Organization,
  OrganizationType,
  OrganizationStatus,
  OrganizationSettings,
  OrganizationStats,
  TeamMember,
  TeamRole,
  TeamPermission,
  TeamInvite,
  InviteStatus,
  ROLE_PERMISSIONS,
  SsoConfiguration,
  SsoProvider,
  SsoSession,
  BillingInfo,
  BillingPlan,
  BillingCycle,
  BillingUsage,
  PLAN_LIMITS,
  Invoice,
  BulkOperation,
  BulkOperationType,
  BulkOperationStatus,
  BulkOperationError,
  OrganizationApiKey,
  OrganizationAuditLog,
} from "./types";

// ============================================================================
// ORGANIZATION SERVICE
// ============================================================================

export class OrganizationService {
  private organizations: Map<string, Organization> = new Map();
  private members: Map<string, TeamMember[]> = new Map(); // orgId -> members
  private invites: Map<string, TeamInvite> = new Map();
  private ssoConfigs: Map<string, SsoConfiguration> = new Map();
  private billingInfo: Map<string, BillingInfo> = new Map();
  private bulkOperations: Map<string, BulkOperation> = new Map();
  private apiKeys: Map<string, OrganizationApiKey[]> = new Map();
  private auditLogs: Map<string, OrganizationAuditLog[]> = new Map();

  // User to org mapping
  private userOrgs: Map<string, string[]> = new Map(); // userAddress -> orgIds

  // ==========================================================================
  // ORGANIZATION CRUD
  // ==========================================================================

  createOrganization(params: {
    name: string;
    type: OrganizationType;
    ownerAddress: string;
    contactEmail: string;
    contactName?: string;
    description?: string;
    website?: string;
  }): Organization {
    const orgId = `org_${randomUUID().replace(/-/g, "")}`;
    const now = Date.now();

    // Generate slug from name
    const slug = params.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const org: Organization = {
      id: orgId,
      name: params.name,
      slug,
      type: params.type,
      status: "active",
      description: params.description,
      website: params.website,
      contactEmail: params.contactEmail,
      contactName: params.contactName,
      verified: false,
      ownerAddress: params.ownerAddress,
      billingPlan: "free",
      settings: this.getDefaultSettings(),
      stats: {
        totalCampaigns: 0,
        activeCampaigns: 0,
        totalPledged: "0",
        totalReleased: "0",
        totalBackers: 0,
        teamMembers: 1,
      },
      createdAt: now,
      updatedAt: now,
    };

    this.organizations.set(orgId, org);

    // Add owner as team member
    this.addMember(orgId, {
      userAddress: params.ownerAddress,
      role: "owner",
      displayName: params.contactName,
      email: params.contactEmail,
    });

    // Initialize billing
    this.initializeBilling(orgId, "free");

    // Track user's orgs
    const userOrgList = this.userOrgs.get(params.ownerAddress) || [];
    userOrgList.push(orgId);
    this.userOrgs.set(params.ownerAddress, userOrgList);

    // Audit log
    this.logAudit(orgId, {
      actorAddress: params.ownerAddress,
      action: "organization.created",
      resource: "organization",
      resourceId: orgId,
    });

    return org;
  }

  getOrganization(orgId: string): Organization | undefined {
    return this.organizations.get(orgId);
  }

  getOrganizationBySlug(slug: string): Organization | undefined {
    for (const org of this.organizations.values()) {
      if (org.slug === slug) {
        return org;
      }
    }
    return undefined;
  }

  getUserOrganizations(userAddress: string): Organization[] {
    const orgIds = this.userOrgs.get(userAddress) || [];
    return orgIds
      .map((id) => this.organizations.get(id))
      .filter((org): org is Organization => !!org);
  }

  updateOrganization(
    orgId: string,
    updates: Partial<
      Pick<
        Organization,
        | "name"
        | "description"
        | "website"
        | "logoUrl"
        | "primaryColor"
        | "contactEmail"
        | "contactName"
        | "contactPhone"
        | "address"
        | "billingEmail"
      >
    >,
    actorAddress: string
  ): Organization {
    const org = this.organizations.get(orgId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const before = { ...org };

    Object.assign(org, updates, { updatedAt: Date.now() });

    this.logAudit(orgId, {
      actorAddress,
      action: "organization.updated",
      resource: "organization",
      resourceId: orgId,
      changes: { before, after: org },
    });

    return org;
  }

  updateOrganizationSettings(
    orgId: string,
    settings: Partial<OrganizationSettings>,
    actorAddress: string
  ): Organization {
    const org = this.organizations.get(orgId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const before = { ...org.settings };
    org.settings = { ...org.settings, ...settings };
    org.updatedAt = Date.now();

    this.logAudit(orgId, {
      actorAddress,
      action: "organization.settings_updated",
      resource: "organization",
      resourceId: orgId,
      changes: { before, after: org.settings },
    });

    return org;
  }

  private getDefaultSettings(): OrganizationSettings {
    return {
      whiteLabel: false,
      brandingEnabled: false,
      ssoEnabled: false,
      apiAccessEnabled: true,
      webhooksEnabled: true,
      bulkOperationsEnabled: false,
      maxCampaigns: PLAN_LIMITS.free.campaigns,
      maxTeamMembers: PLAN_LIMITS.free.teamMembers,
      maxApiKeys: 3,
    };
  }

  // ==========================================================================
  // TEAM MEMBERS
  // ==========================================================================

  addMember(
    orgId: string,
    params: {
      userAddress: string;
      role: TeamRole;
      displayName?: string;
      email?: string;
      invitedBy?: string;
    }
  ): TeamMember {
    const memberId = `mem_${randomUUID().replace(/-/g, "")}`;
    const now = Date.now();

    const member: TeamMember = {
      id: memberId,
      organizationId: orgId,
      userAddress: params.userAddress,
      role: params.role,
      permissions: ROLE_PERMISSIONS[params.role],
      displayName: params.displayName,
      email: params.email,
      status: "active",
      joinedAt: now,
      lastActiveAt: now,
      invitedBy: params.invitedBy,
    };

    const orgMembers = this.members.get(orgId) || [];
    orgMembers.push(member);
    this.members.set(orgId, orgMembers);

    // Track user's orgs
    const userOrgList = this.userOrgs.get(params.userAddress) || [];
    if (!userOrgList.includes(orgId)) {
      userOrgList.push(orgId);
      this.userOrgs.set(params.userAddress, userOrgList);
    }

    // Update org stats
    const org = this.organizations.get(orgId);
    if (org) {
      org.stats.teamMembers = orgMembers.length;
    }

    return member;
  }

  getMembers(orgId: string): TeamMember[] {
    return this.members.get(orgId) || [];
  }

  getMember(orgId: string, userAddress: string): TeamMember | undefined {
    const members = this.members.get(orgId) || [];
    return members.find((m) => m.userAddress === userAddress);
  }

  updateMemberRole(
    orgId: string,
    userAddress: string,
    newRole: TeamRole,
    actorAddress: string
  ): TeamMember {
    const member = this.getMember(orgId, userAddress);
    if (!member) {
      throw new Error("Member not found");
    }

    // Can't change owner role
    if (member.role === "owner") {
      throw new Error("Cannot change owner role");
    }

    const oldRole = member.role;
    member.role = newRole;
    member.permissions = ROLE_PERMISSIONS[newRole];

    this.logAudit(orgId, {
      actorAddress,
      action: "member.role_changed",
      resource: "team_member",
      resourceId: member.id,
      changes: { before: { role: oldRole }, after: { role: newRole } },
    });

    return member;
  }

  removeMember(
    orgId: string,
    userAddress: string,
    actorAddress: string
  ): void {
    const members = this.members.get(orgId) || [];
    const member = members.find((m) => m.userAddress === userAddress);

    if (!member) {
      throw new Error("Member not found");
    }

    if (member.role === "owner") {
      throw new Error("Cannot remove organization owner");
    }

    member.status = "removed";

    // Remove from user's orgs
    const userOrgList = this.userOrgs.get(userAddress) || [];
    const idx = userOrgList.indexOf(orgId);
    if (idx !== -1) {
      userOrgList.splice(idx, 1);
      this.userOrgs.set(userAddress, userOrgList);
    }

    this.logAudit(orgId, {
      actorAddress,
      action: "member.removed",
      resource: "team_member",
      resourceId: member.id,
    });
  }

  hasPermission(
    orgId: string,
    userAddress: string,
    permission: TeamPermission
  ): boolean {
    const member = this.getMember(orgId, userAddress);
    if (!member || member.status !== "active") {
      return false;
    }
    return member.permissions.includes(permission);
  }

  // ==========================================================================
  // INVITATIONS
  // ==========================================================================

  createInvite(
    orgId: string,
    params: {
      email: string;
      role: TeamRole;
      invitedBy: string;
    }
  ): TeamInvite {
    const inviteId = `inv_${randomUUID().replace(/-/g, "")}`;
    const now = Date.now();

    const invite: TeamInvite = {
      id: inviteId,
      organizationId: orgId,
      email: params.email,
      role: params.role,
      status: "pending",
      inviteToken: randomUUID().replace(/-/g, ""),
      invitedBy: params.invitedBy,
      createdAt: now,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    this.invites.set(inviteId, invite);

    this.logAudit(orgId, {
      actorAddress: params.invitedBy,
      action: "invite.created",
      resource: "team_invite",
      resourceId: inviteId,
      metadata: { email: params.email, role: params.role },
    });

    return invite;
  }

  acceptInvite(inviteToken: string, userAddress: string): TeamMember {
    let invite: TeamInvite | undefined;

    for (const inv of this.invites.values()) {
      if (inv.inviteToken === inviteToken) {
        invite = inv;
        break;
      }
    }

    if (!invite) {
      throw new Error("Invalid invite token");
    }

    if (invite.status !== "pending") {
      throw new Error("Invite already used");
    }

    if (invite.expiresAt < Date.now()) {
      invite.status = "expired";
      throw new Error("Invite expired");
    }

    invite.status = "accepted";
    invite.acceptedAt = Date.now();
    invite.acceptedBy = userAddress;

    // Add member
    return this.addMember(invite.organizationId, {
      userAddress,
      role: invite.role,
      email: invite.email,
      invitedBy: invite.invitedBy,
    });
  }

  getInvite(inviteId: string): TeamInvite | undefined {
    return this.invites.get(inviteId);
  }

  getPendingInvites(orgId: string): TeamInvite[] {
    const results: TeamInvite[] = [];
    for (const invite of this.invites.values()) {
      if (invite.organizationId === orgId && invite.status === "pending") {
        results.push(invite);
      }
    }
    return results;
  }

  // ==========================================================================
  // SSO CONFIGURATION
  // ==========================================================================

  configureSso(
    orgId: string,
    config: Omit<SsoConfiguration, "id" | "organizationId" | "createdAt" | "updatedAt">
  ): SsoConfiguration {
    const configId = `sso_${randomUUID().replace(/-/g, "")}`;
    const now = Date.now();

    const ssoConfig: SsoConfiguration = {
      ...config,
      id: configId,
      organizationId: orgId,
      createdAt: now,
      updatedAt: now,
    };

    this.ssoConfigs.set(orgId, ssoConfig);

    // Update org settings
    const org = this.organizations.get(orgId);
    if (org) {
      org.settings.ssoEnabled = config.enabled;
    }

    return ssoConfig;
  }

  getSsoConfig(orgId: string): SsoConfiguration | undefined {
    return this.ssoConfigs.get(orgId);
  }

  validateSsoSession(
    orgId: string,
    externalUserId: string,
    email: string
  ): SsoSession {
    const config = this.ssoConfigs.get(orgId);
    if (!config || !config.enabled) {
      throw new Error("SSO not configured");
    }

    // Validate email domain
    if (config.emailDomains.length > 0) {
      const domain = email.split("@")[1];
      if (!config.emailDomains.includes(domain)) {
        throw new Error("Email domain not allowed");
      }
    }

    const sessionId = `sso_sess_${randomUUID().replace(/-/g, "")}`;
    const userAddress = `0x${externalUserId.slice(0, 40).padStart(40, "0")}`;

    // Auto-provision user if enabled
    if (config.autoProvision) {
      const existingMember = this.getMember(orgId, userAddress);
      if (!existingMember) {
        this.addMember(orgId, {
          userAddress,
          role: config.defaultRole,
          email,
        });
      }
    }

    return {
      id: sessionId,
      organizationId: orgId,
      userAddress,
      provider: config.provider,
      externalUserId,
      email,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };
  }

  // ==========================================================================
  // BILLING
  // ==========================================================================

  private initializeBilling(orgId: string, plan: BillingPlan): void {
    const now = Date.now();

    const billing: BillingInfo = {
      organizationId: orgId,
      plan,
      cycle: "monthly",
      status: "active",
      basePrice: "0",
      additionalFees: "0",
      totalPrice: "0",
      currency: "USD",
      currentUsage: {
        campaigns: 0,
        teamMembers: 1,
        apiCalls: 0,
        webhookDeliveries: 0,
        storageBytes: 0,
      },
      usageLimits: PLAN_LIMITS[plan],
      startedAt: now,
    };

    this.billingInfo.set(orgId, billing);
  }

  getBilling(orgId: string): BillingInfo | undefined {
    return this.billingInfo.get(orgId);
  }

  upgradePlan(
    orgId: string,
    newPlan: BillingPlan,
    cycle: BillingCycle,
    actorAddress: string
  ): BillingInfo {
    const billing = this.billingInfo.get(orgId);
    if (!billing) {
      throw new Error("Billing not found");
    }

    const oldPlan = billing.plan;
    billing.plan = newPlan;
    billing.cycle = cycle;
    billing.usageLimits = PLAN_LIMITS[newPlan];

    // Update org settings
    const org = this.organizations.get(orgId);
    if (org) {
      org.billingPlan = newPlan;
      org.settings.maxCampaigns = PLAN_LIMITS[newPlan].campaigns;
      org.settings.maxTeamMembers = PLAN_LIMITS[newPlan].teamMembers;

      // Enable features for paid plans
      if (newPlan !== "free") {
        org.settings.bulkOperationsEnabled = true;
        org.settings.brandingEnabled = true;
      }
      if (newPlan === "enterprise") {
        org.settings.whiteLabel = true;
        org.settings.ssoEnabled = true;
      }
    }

    this.logAudit(orgId, {
      actorAddress,
      action: "billing.plan_upgraded",
      resource: "billing",
      changes: { before: { plan: oldPlan }, after: { plan: newPlan } },
    });

    return billing;
  }

  // ==========================================================================
  // BULK OPERATIONS
  // ==========================================================================

  createBulkOperation(
    orgId: string,
    params: {
      type: BulkOperationType;
      inputData: any[];
      createdBy: string;
    }
  ): BulkOperation {
    const operationId = `bulk_${randomUUID().replace(/-/g, "")}`;
    const now = Date.now();

    const operation: BulkOperation = {
      id: operationId,
      organizationId: orgId,
      type: params.type,
      status: "pending",
      inputData: params.inputData,
      totalItems: params.inputData.length,
      processedItems: 0,
      successCount: 0,
      failureCount: 0,
      errors: [],
      createdAt: now,
      createdBy: params.createdBy,
    };

    this.bulkOperations.set(operationId, operation);

    // Process asynchronously
    this.processBulkOperation(operationId);

    return operation;
  }

  private async processBulkOperation(operationId: string): Promise<void> {
    const operation = this.bulkOperations.get(operationId);
    if (!operation) return;

    operation.status = "processing";
    operation.startedAt = Date.now();

    for (let i = 0; i < operation.inputData!.length; i++) {
      const item = operation.inputData![i];

      try {
        // Process based on type
        switch (operation.type) {
          case "campaign_create":
            // In production: create campaign
            break;
          case "member_invite":
            if (item.email && item.role) {
              this.createInvite(operation.organizationId, {
                email: item.email,
                role: item.role,
                invitedBy: operation.createdBy,
              });
            }
            break;
          // ... other types
        }

        operation.successCount++;
      } catch (error) {
        operation.failureCount++;
        operation.errors.push({
          itemIndex: i,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }

      operation.processedItems++;
    }

    operation.status =
      operation.failureCount === 0
        ? "completed"
        : operation.successCount === 0
          ? "failed"
          : "partial";
    operation.completedAt = Date.now();
  }

  getBulkOperation(operationId: string): BulkOperation | undefined {
    return this.bulkOperations.get(operationId);
  }

  getOrgBulkOperations(orgId: string): BulkOperation[] {
    const results: BulkOperation[] = [];
    for (const op of this.bulkOperations.values()) {
      if (op.organizationId === orgId) {
        results.push(op);
      }
    }
    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  // ==========================================================================
  // API KEYS
  // ==========================================================================

  createApiKey(
    orgId: string,
    params: {
      name: string;
      permissions: TeamPermission[];
      createdBy: string;
      expiresAt?: number;
    }
  ): { apiKey: OrganizationApiKey; plainKey: string } {
    const keyId = `key_${randomUUID().replace(/-/g, "")}`;
    const plainKey = `pk_${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`;
    const keyPrefix = plainKey.slice(0, 11);

    // In production: hash the key properly
    const keyHash = Buffer.from(plainKey).toString("base64");

    const apiKey: OrganizationApiKey = {
      id: keyId,
      organizationId: orgId,
      name: params.name,
      keyHash,
      keyPrefix,
      permissions: params.permissions,
      scopes: [],
      rateLimit: 100,
      rateLimitTier: "standard",
      usageCount: 0,
      status: "active",
      expiresAt: params.expiresAt,
      createdAt: Date.now(),
      createdBy: params.createdBy,
    };

    const orgKeys = this.apiKeys.get(orgId) || [];
    orgKeys.push(apiKey);
    this.apiKeys.set(orgId, orgKeys);

    return { apiKey, plainKey };
  }

  getApiKeys(orgId: string): OrganizationApiKey[] {
    return this.apiKeys.get(orgId) || [];
  }

  revokeApiKey(
    orgId: string,
    keyId: string,
    actorAddress: string
  ): OrganizationApiKey {
    const keys = this.apiKeys.get(orgId) || [];
    const key = keys.find((k) => k.id === keyId);

    if (!key) {
      throw new Error("API key not found");
    }

    key.status = "revoked";
    key.revokedAt = Date.now();
    key.revokedBy = actorAddress;

    return key;
  }

  // ==========================================================================
  // AUDIT LOG
  // ==========================================================================

  private logAudit(
    orgId: string,
    params: Omit<OrganizationAuditLog, "id" | "organizationId" | "timestamp" | "actorType">
  ): void {
    const logId = `audit_${randomUUID().replace(/-/g, "")}`;

    const entry: OrganizationAuditLog = {
      id: logId,
      organizationId: orgId,
      actorType: "user",
      timestamp: Date.now(),
      ...params,
    };

    const orgLogs = this.auditLogs.get(orgId) || [];
    orgLogs.push(entry);

    // Keep last 1000 entries
    if (orgLogs.length > 1000) {
      orgLogs.shift();
    }

    this.auditLogs.set(orgId, orgLogs);
  }

  getAuditLogs(
    orgId: string,
    options?: {
      limit?: number;
      offset?: number;
      action?: string;
      resource?: string;
    }
  ): { logs: OrganizationAuditLog[]; total: number } {
    let logs = this.auditLogs.get(orgId) || [];

    if (options?.action) {
      logs = logs.filter((l) => l.action === options.action);
    }
    if (options?.resource) {
      logs = logs.filter((l) => l.resource === options.resource);
    }

    const total = logs.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 50;

    logs = logs
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(offset, offset + limit);

    return { logs, total };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createOrganizationService(): OrganizationService {
  return new OrganizationService();
}
