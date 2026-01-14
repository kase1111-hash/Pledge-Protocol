/**
 * Phase 9: Compliance Types
 *
 * GDPR, CCPA, and data privacy compliance types.
 */

// ============================================================================
// DATA EXPORT
// ============================================================================

export type ExportFormat = "json" | "csv" | "xml";

export type ExportStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "expired";

export interface DataExportRequest {
  id: string;
  userAddress: string;
  format: ExportFormat;
  includeCategories: DataCategory[];
  status: ExportStatus;

  // Processing
  progress: number; // 0-100
  downloadUrl?: string;
  expiresAt?: number;
  fileSizeBytes?: number;

  // Audit
  requestedAt: number;
  completedAt?: number;
  downloadedAt?: number;
  ipAddress?: string;
}

export type DataCategory =
  | "profile" // User profile information
  | "campaigns" // Created campaigns
  | "pledges" // Made pledges
  | "transactions" // Payment history
  | "commemoratives" // Earned commemoratives
  | "social" // Follows, comments, activity
  | "preferences" // Settings and preferences
  | "audit_log" // Account activity log
  | "communications"; // Emails and notifications

export interface ExportedData {
  exportId: string;
  userAddress: string;
  exportedAt: number;
  format: ExportFormat;
  categories: DataCategory[];
  data: {
    profile?: UserProfileData;
    campaigns?: CampaignData[];
    pledges?: PledgeData[];
    transactions?: TransactionData[];
    commemoratives?: CommemorativeData[];
    social?: SocialData;
    preferences?: PreferencesData;
    auditLog?: AuditLogEntry[];
    communications?: CommunicationData[];
  };
}

// Exported data structures
export interface UserProfileData {
  address: string;
  displayName?: string;
  email?: string;
  bio?: string;
  avatar?: string;
  createdAt: number;
  lastActiveAt: number;
  roles: string[];
  verificationStatus: string;
}

export interface CampaignData {
  id: string;
  name: string;
  description: string;
  beneficiary: string;
  createdAt: number;
  status: string;
  totalPledged: string;
  backerCount: number;
}

export interface PledgeData {
  id: string;
  campaignId: string;
  campaignName: string;
  amount: string;
  status: string;
  createdAt: number;
  resolvedAt?: number;
}

export interface TransactionData {
  id: string;
  type: "payment" | "refund" | "settlement";
  amount: string;
  currency: string;
  provider: string;
  status: string;
  createdAt: number;
}

export interface CommemorativeData {
  id: string;
  campaignId: string;
  campaignName: string;
  tokenId: string;
  imageUrl: string;
  mintedAt: number;
}

export interface SocialData {
  followers: string[];
  following: string[];
  comments: {
    id: string;
    campaignId: string;
    content: string;
    createdAt: number;
  }[];
  activity: {
    type: string;
    data: any;
    createdAt: number;
  }[];
}

export interface PreferencesData {
  publicProfile: boolean;
  showPledgeAmounts: boolean;
  emailNotifications: boolean;
  marketingEmails: boolean;
  language: string;
  timezone: string;
}

export interface AuditLogEntry {
  action: string;
  timestamp: number;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
}

export interface CommunicationData {
  type: "email" | "notification" | "webhook";
  subject?: string;
  content: string;
  sentAt: number;
  channel: string;
}

// ============================================================================
// DATA DELETION
// ============================================================================

export type DeletionType = "anonymize" | "full_delete";

export type DeletionStatus =
  | "pending"
  | "awaiting_confirmation"
  | "processing"
  | "completed"
  | "cancelled";

export interface DataDeletionRequest {
  id: string;
  userAddress: string;
  type: DeletionType;
  status: DeletionStatus;

  // What to delete
  categories: DataCategory[];
  retainLegalRecords: boolean; // Keep transaction records for tax/legal

  // Confirmation
  confirmationToken?: string;
  confirmedAt?: number;

  // Processing
  progress: number;
  deletedRecords: number;
  anonymizedRecords: number;

  // Timing
  requestedAt: number;
  scheduledFor?: number; // Grace period
  completedAt?: number;

  // Audit
  reason?: string;
  ipAddress?: string;
}

export interface DeletionResult {
  requestId: string;
  status: DeletionStatus;
  deletedCategories: DataCategory[];
  retainedCategories: DataCategory[];
  totalDeleted: number;
  totalAnonymized: number;
  completedAt: number;
}

// ============================================================================
// CONSENT MANAGEMENT
// ============================================================================

export type ConsentType =
  | "essential" // Required for service
  | "analytics" // Usage analytics
  | "marketing" // Marketing emails
  | "personalization" // Personalized recommendations
  | "third_party" // Third-party data sharing
  | "cookies"; // Browser cookies

export type ConsentStatus = "granted" | "denied" | "not_set";

export interface ConsentRecord {
  id: string;
  userAddress: string;
  consentType: ConsentType;
  status: ConsentStatus;
  version: string; // Privacy policy version
  grantedAt?: number;
  revokedAt?: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface ConsentPreferences {
  userAddress: string;
  consents: Record<ConsentType, ConsentStatus>;
  lastUpdated: number;
  policyVersion: string;
}

export interface ConsentUpdateRequest {
  userAddress: string;
  consents: Partial<Record<ConsentType, boolean>>;
  ipAddress?: string;
  userAgent?: string;
}

// ============================================================================
// DATA PROCESSING AGREEMENTS
// ============================================================================

export interface DataProcessingAgreement {
  id: string;
  organizationId?: string;
  version: string;
  status: "draft" | "pending" | "signed" | "expired";

  // Parties
  controllerName: string;
  controllerAddress: string;
  processorName: string;

  // Terms
  dataCategories: DataCategory[];
  purposes: string[];
  retentionPeriod: number; // Days
  subProcessors: SubProcessor[];

  // Signing
  signedAt?: number;
  signedBy?: string;
  expiresAt?: number;
}

export interface SubProcessor {
  name: string;
  service: string;
  location: string;
  dataCategories: DataCategory[];
}

// ============================================================================
// DATA RETENTION
// ============================================================================

export interface RetentionPolicy {
  id: string;
  category: DataCategory;
  retentionDays: number;
  autoDelete: boolean;
  legalBasis: string;
  description: string;
}

export interface RetentionSchedule {
  categoryPolicies: Map<DataCategory, RetentionPolicy>;
  defaultRetentionDays: number;
  minimumRetentionDays: number; // Legal minimum
}

// ============================================================================
// PRIVACY POLICY
// ============================================================================

export interface PrivacyPolicy {
  version: string;
  effectiveDate: number;
  lastUpdated: number;
  content: string; // Markdown
  sections: PrivacyPolicySection[];
  languages: string[];
}

export interface PrivacyPolicySection {
  id: string;
  title: string;
  content: string;
  order: number;
}

// ============================================================================
// COMPLIANCE REPORTS
// ============================================================================

export interface ComplianceReport {
  id: string;
  type: "gdpr" | "ccpa" | "audit";
  period: {
    start: number;
    end: number;
  };

  // Statistics
  exportRequests: number;
  deletionRequests: number;
  consentChanges: number;
  dataBreaches: number;

  // Details
  requestsByCategory: Record<string, number>;
  averageResponseTime: number;
  complianceScore: number;

  generatedAt: number;
  generatedBy: string;
}

// ============================================================================
// GDPR RIGHTS
// ============================================================================

export type GdprRight =
  | "access" // Right to access (Art. 15)
  | "rectification" // Right to rectification (Art. 16)
  | "erasure" // Right to erasure (Art. 17)
  | "restriction" // Right to restriction (Art. 18)
  | "portability" // Right to data portability (Art. 20)
  | "objection"; // Right to object (Art. 21)

export interface GdprRequest {
  id: string;
  userAddress: string;
  right: GdprRight;
  status: "pending" | "processing" | "completed" | "rejected";
  requestedAt: number;
  respondedAt?: number;
  response?: string;
  rejectionReason?: string;
}

// ============================================================================
// CCPA RIGHTS
// ============================================================================

export type CcpaRight =
  | "know" // Right to know
  | "delete" // Right to delete
  | "opt_out" // Right to opt-out of sale
  | "non_discrimination"; // Right to non-discrimination

export interface CcpaRequest {
  id: string;
  userAddress: string;
  right: CcpaRight;
  status: "pending" | "processing" | "completed" | "rejected";
  verificationMethod: string;
  requestedAt: number;
  respondedAt?: number;
}
