/**
 * Phase 9: Enterprise Types
 *
 * Organization management, teams, SSO, and bulk operations.
 */

// ============================================================================
// ORGANIZATIONS
// ============================================================================

export type OrganizationType = "nonprofit" | "corporate" | "educational" | "individual";

export type OrganizationStatus = "active" | "suspended" | "pending" | "cancelled";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  type: OrganizationType;
  status: OrganizationStatus;

  // Details
  description?: string;
  website?: string;
  logoUrl?: string;
  primaryColor?: string;

  // Contact
  contactEmail: string;
  contactName?: string;
  contactPhone?: string;

  // Address
  address?: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };

  // Verification
  verified: boolean;
  verifiedAt?: number;
  taxId?: string;

  // Settings
  settings: OrganizationSettings;

  // Ownership
  ownerAddress: string;

  // Billing
  billingPlan: BillingPlan;
  billingEmail?: string;

  // Statistics
  stats: OrganizationStats;

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

export interface OrganizationSettings {
  // Branding
  customDomain?: string;
  whiteLabel: boolean;
  brandingEnabled: boolean;

  // Features
  ssoEnabled: boolean;
  apiAccessEnabled: boolean;
  webhooksEnabled: boolean;
  bulkOperationsEnabled: boolean;

  // Limits
  maxCampaigns: number;
  maxTeamMembers: number;
  maxApiKeys: number;

  // Defaults
  defaultChainId?: number;
  defaultCurrency?: string;
}

export interface OrganizationStats {
  totalCampaigns: number;
  activeCampaigns: number;
  totalPledged: string;
  totalReleased: string;
  totalBackers: number;
  teamMembers: number;
}

// ============================================================================
// TEAM MEMBERS
// ============================================================================

export type TeamRole = "owner" | "admin" | "creator" | "moderator" | "viewer";

export type InviteStatus = "pending" | "accepted" | "declined" | "expired";

export interface TeamMember {
  id: string;
  organizationId: string;
  userAddress: string;

  // Role & Permissions
  role: TeamRole;
  permissions: TeamPermission[];
  customPermissions?: string[];

  // Profile
  displayName?: string;
  email?: string;
  avatar?: string;

  // Status
  status: "active" | "suspended" | "removed";

  // Timestamps
  joinedAt: number;
  lastActiveAt: number;
  invitedBy?: string;
}

export type TeamPermission =
  | "org:manage" // Manage organization settings
  | "org:billing" // Manage billing
  | "org:members" // Manage team members
  | "campaigns:create" // Create campaigns
  | "campaigns:manage" // Edit/delete campaigns
  | "campaigns:view" // View campaigns
  | "pledges:view" // View pledge details
  | "pledges:refund" // Process refunds
  | "disputes:manage" // Handle disputes
  | "analytics:view" // View analytics
  | "api:manage" // Manage API keys
  | "webhooks:manage"; // Manage webhooks

export const ROLE_PERMISSIONS: Record<TeamRole, TeamPermission[]> = {
  owner: [
    "org:manage",
    "org:billing",
    "org:members",
    "campaigns:create",
    "campaigns:manage",
    "campaigns:view",
    "pledges:view",
    "pledges:refund",
    "disputes:manage",
    "analytics:view",
    "api:manage",
    "webhooks:manage",
  ],
  admin: [
    "org:members",
    "campaigns:create",
    "campaigns:manage",
    "campaigns:view",
    "pledges:view",
    "pledges:refund",
    "disputes:manage",
    "analytics:view",
    "api:manage",
    "webhooks:manage",
  ],
  creator: [
    "campaigns:create",
    "campaigns:manage",
    "campaigns:view",
    "pledges:view",
    "analytics:view",
  ],
  moderator: [
    "campaigns:view",
    "pledges:view",
    "disputes:manage",
    "analytics:view",
  ],
  viewer: ["campaigns:view", "pledges:view", "analytics:view"],
};

export interface TeamInvite {
  id: string;
  organizationId: string;
  email: string;
  role: TeamRole;
  status: InviteStatus;
  inviteToken: string;
  invitedBy: string;
  createdAt: number;
  expiresAt: number;
  acceptedAt?: number;
  acceptedBy?: string;
}

// ============================================================================
// SSO (Single Sign-On)
// ============================================================================

export type SsoProvider = "saml" | "oidc" | "google" | "github" | "microsoft";

export interface SsoConfiguration {
  id: string;
  organizationId: string;
  provider: SsoProvider;
  enabled: boolean;

  // SAML Config
  saml?: {
    entityId: string;
    ssoUrl: string;
    certificate: string;
    signAuthnRequest: boolean;
    allowUnencryptedAssertion: boolean;
  };

  // OIDC Config
  oidc?: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    authorizationUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    scopes: string[];
  };

  // Settings
  autoProvision: boolean; // Auto-create users on first login
  defaultRole: TeamRole;
  emailDomains: string[]; // Allowed email domains

  createdAt: number;
  updatedAt: number;
}

export interface SsoSession {
  id: string;
  organizationId: string;
  userAddress: string;
  provider: SsoProvider;
  externalUserId: string;
  email: string;
  name?: string;
  groups?: string[];
  createdAt: number;
  expiresAt: number;
}

// ============================================================================
// BILLING
// ============================================================================

export type BillingPlan = "free" | "starter" | "professional" | "enterprise";

export type BillingCycle = "monthly" | "yearly";

export interface BillingInfo {
  organizationId: string;
  plan: BillingPlan;
  cycle: BillingCycle;
  status: "active" | "past_due" | "cancelled" | "trialing";

  // Pricing
  basePrice: string;
  additionalFees: string;
  totalPrice: string;
  currency: string;

  // Payment
  paymentMethodId?: string;
  lastPaymentAt?: number;
  nextPaymentAt?: number;

  // Usage
  currentUsage: BillingUsage;
  usageLimits: BillingLimits;

  // Trial
  trialEndsAt?: number;

  // Timestamps
  startedAt: number;
  renewsAt?: number;
  cancelledAt?: number;
}

export interface BillingUsage {
  campaigns: number;
  teamMembers: number;
  apiCalls: number;
  webhookDeliveries: number;
  storageBytes: number;
}

export interface BillingLimits {
  campaigns: number;
  teamMembers: number;
  apiCalls: number;
  webhookDeliveries: number;
  storageBytes: number;
}

export const PLAN_LIMITS: Record<BillingPlan, BillingLimits> = {
  free: {
    campaigns: 3,
    teamMembers: 2,
    apiCalls: 1000,
    webhookDeliveries: 100,
    storageBytes: 100 * 1024 * 1024, // 100MB
  },
  starter: {
    campaigns: 10,
    teamMembers: 5,
    apiCalls: 10000,
    webhookDeliveries: 1000,
    storageBytes: 1024 * 1024 * 1024, // 1GB
  },
  professional: {
    campaigns: 50,
    teamMembers: 20,
    apiCalls: 100000,
    webhookDeliveries: 10000,
    storageBytes: 10 * 1024 * 1024 * 1024, // 10GB
  },
  enterprise: {
    campaigns: -1, // Unlimited
    teamMembers: -1,
    apiCalls: -1,
    webhookDeliveries: -1,
    storageBytes: -1,
  },
};

export interface Invoice {
  id: string;
  organizationId: string;
  number: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible";

  // Amount
  subtotal: string;
  tax: string;
  total: string;
  currency: string;

  // Line items
  lineItems: InvoiceLineItem[];

  // Dates
  periodStart: number;
  periodEnd: number;
  dueAt: number;
  paidAt?: number;

  // Payment
  paymentIntentId?: string;

  // PDF
  pdfUrl?: string;

  createdAt: number;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: string;
  amount: string;
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

export type BulkOperationType =
  | "campaign_create"
  | "campaign_update"
  | "campaign_cancel"
  | "pledge_refund"
  | "member_invite"
  | "member_remove";

export type BulkOperationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "partial";

export interface BulkOperation {
  id: string;
  organizationId: string;
  type: BulkOperationType;
  status: BulkOperationStatus;

  // Input
  inputFile?: string;
  inputData?: any[];
  totalItems: number;

  // Progress
  processedItems: number;
  successCount: number;
  failureCount: number;
  errors: BulkOperationError[];

  // Results
  resultFile?: string;

  // Timing
  createdAt: number;
  startedAt?: number;
  completedAt?: number;

  createdBy: string;
}

export interface BulkOperationError {
  itemIndex: number;
  itemId?: string;
  error: string;
  details?: Record<string, any>;
}

// ============================================================================
// API KEYS (Organization-level)
// ============================================================================

export interface OrganizationApiKey {
  id: string;
  organizationId: string;
  name: string;
  keyHash: string; // Hashed key (never store plain)
  keyPrefix: string; // First 8 chars for identification

  // Permissions
  permissions: TeamPermission[];
  scopes: string[];

  // Rate limiting
  rateLimit: number; // Requests per minute
  rateLimitTier: "standard" | "elevated" | "unlimited";

  // Usage
  lastUsedAt?: number;
  usageCount: number;

  // Status
  status: "active" | "revoked" | "expired";
  expiresAt?: number;

  createdAt: number;
  createdBy: string;
  revokedAt?: number;
  revokedBy?: string;
}

// ============================================================================
// AUDIT LOG
// ============================================================================

export interface OrganizationAuditLog {
  id: string;
  organizationId: string;
  actorAddress: string;
  actorType: "user" | "api_key" | "system";

  // Action
  action: string;
  resource: string;
  resourceId?: string;

  // Details
  changes?: {
    before: Record<string, any>;
    after: Record<string, any>;
  };
  metadata?: Record<string, any>;

  // Context
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;

  timestamp: number;
}
