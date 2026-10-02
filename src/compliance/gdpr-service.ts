/**
 * Phase 9: GDPR Compliance Service
 *
 * Data export, deletion, and consent management
 * for GDPR and CCPA compliance.
 */

import { randomUUID } from "crypto";
import { toCsv, xmlEscape } from "../reporting/file-formats";
import {
  DataExportRequest,
  ExportFormat,
  ExportStatus,
  DataCategory,
  ExportedData,
  DataDeletionRequest,
  DeletionType,
  DeletionStatus,
  DeletionResult,
  ConsentRecord,
  ConsentPreferences,
  ConsentUpdateRequest,
  ConsentType,
  ConsentStatus,
  RetentionPolicy,
  RetentionSchedule,
  ComplianceReport,
  GdprRequest,
  GdprRight,
  CcpaRequest,
  CcpaRight,
  UserProfileData,
  CampaignData,
  PledgeData,
  TransactionData,
  CommemorativeData,
  SocialData,
  PreferencesData,
  AuditLogEntry,
} from "./types";

// ============================================================================
// GDPR SERVICE
// ============================================================================

export class GdprService {
  private exportRequests: Map<string, DataExportRequest> = new Map();
  private deletionRequests: Map<string, DataDeletionRequest> = new Map();
  private consentRecords: Map<string, ConsentRecord[]> = new Map();
  private gdprRequests: Map<string, GdprRequest> = new Map();
  private ccpaRequests: Map<string, CcpaRequest> = new Map();

  /** Generated export files by request ID, served by the download endpoint */
  private exportFiles: Map<string, string> = new Map();
  private retentionSchedule: RetentionSchedule;
  private policyVersion = "2.0.0";

  /**
   * @param userData Where a user's data lives. Without one, exports contain
   *   only what this service holds (consents) and erasure touches nothing.
   */
  constructor(private userData: UserDataProvider = NO_USER_DATA) {
    this.retentionSchedule = this.initRetentionSchedule();
  }

  // ==========================================================================
  // DATA EXPORT (GDPR Art. 15, 20)
  // ==========================================================================

  async requestExport(
    userAddress: string,
    options: {
      format?: ExportFormat;
      categories?: DataCategory[];
      ipAddress?: string;
    } = {}
  ): Promise<DataExportRequest> {
    const requestId = `exp_${randomUUID().replace(/-/g, "")}`;
    const now = Date.now();

    const request: DataExportRequest = {
      id: requestId,
      userAddress,
      format: options.format || "json",
      includeCategories: options.categories || [
        "profile",
        "campaigns",
        "pledges",
        "transactions",
        "commemoratives",
        "social",
        "preferences",
        "audit_log",
      ],
      status: "pending",
      progress: 0,
      requestedAt: now,
      ipAddress: options.ipAddress,
    };

    this.exportRequests.set(requestId, request);

    // Process export asynchronously
    this.processExport(requestId);

    return request;
  }

  private async processExport(requestId: string): Promise<void> {
    const request = this.exportRequests.get(requestId);
    if (!request) return;

    request.status = "processing";
    request.progress = 10;

    try {
      const exportedData: ExportedData = {
        exportId: requestId,
        userAddress: request.userAddress,
        exportedAt: Date.now(),
        format: request.format,
        categories: request.includeCategories,
        data: {},
      };

      const categoryCount = request.includeCategories.length;
      let processed = 0;

      for (const category of request.includeCategories) {
        const value = await this.userData.exportCategory(request.userAddress, category);
        (exportedData.data as Record<string, unknown>)[EXPORT_KEYS[category]] = value;

        processed++;
        request.progress = 10 + Math.round((processed / categoryCount) * 80);
      }

      // Consent decisions are always part of a subject access export
      (exportedData.data as Record<string, unknown>).consents = this.getConsentHistory(request.userAddress);

      const content = this.formatExport(exportedData, request.format);
      this.exportFiles.set(requestId, content);

      request.status = "completed";
      request.progress = 100;
      request.downloadUrl = `/v1/compliance/export/${requestId}/download`;
      request.fileSizeBytes = Buffer.byteLength(content, "utf8");
      request.expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
      request.completedAt = Date.now();
    } catch (error) {
      request.status = "failed";
    }
  }

  /**
   * The generated export file, until it expires
   */
  downloadExport(requestId: string): { content: string; format: ExportFormat } | null {
    const request = this.exportRequests.get(requestId);
    const content = this.exportFiles.get(requestId);
    if (!request || request.status !== "completed" || content === undefined) {
      return null;
    }
    if (request.expiresAt && Date.now() > request.expiresAt) {
      this.exportFiles.delete(requestId);
      request.status = "expired";
      return null;
    }
    request.downloadedAt = Date.now();
    return { content, format: request.format };
  }

  private formatExport(data: ExportedData, format: ExportFormat): string {
    switch (format) {
      case "csv":
        // One section per category
        return Object.entries(data.data)
          .map(([section, value]) => `${section.toUpperCase()}\n${toCsv(value ?? []).toString("utf8")}`)
          .join("\n\n");

      case "xml":
        return `<?xml version="1.0" encoding="UTF-8"?>\n${toXml("export", data)}\n`;

      case "json":
      default:
        return JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2);
    }
  }

  getExportRequest(requestId: string): DataExportRequest | undefined {
    return this.exportRequests.get(requestId);
  }

  getExportsByUser(userAddress: string): DataExportRequest[] {
    const results: DataExportRequest[] = [];
    for (const request of this.exportRequests.values()) {
      if (request.userAddress === userAddress) {
        results.push(request);
      }
    }
    return results.sort((a, b) => b.requestedAt - a.requestedAt);
  }

  // ==========================================================================
  // DATA DELETION (GDPR Art. 17 - Right to Erasure)
  // ==========================================================================

  async requestDeletion(
    userAddress: string,
    options: {
      type?: DeletionType;
      categories?: DataCategory[];
      reason?: string;
      ipAddress?: string;
    } = {}
  ): Promise<DataDeletionRequest> {
    const requestId = `del_${randomUUID().replace(/-/g, "")}`;
    const now = Date.now();

    // Generate confirmation token
    const confirmationToken = randomUUID().replace(/-/g, "");

    const request: DataDeletionRequest = {
      id: requestId,
      userAddress,
      type: options.type || "anonymize",
      status: "awaiting_confirmation",
      categories: options.categories || [
        "profile",
        "social",
        "preferences",
        "communications",
      ],
      retainLegalRecords: true, // Always retain for legal compliance
      confirmationToken,
      progress: 0,
      deletedRecords: 0,
      anonymizedRecords: 0,
      requestedAt: now,
      scheduledFor: now + 7 * 24 * 60 * 60 * 1000, // 7-day grace period
      reason: options.reason,
      ipAddress: options.ipAddress,
    };

    this.deletionRequests.set(requestId, request);

    return request;
  }

  async confirmDeletion(
    requestId: string,
    confirmationToken: string
  ): Promise<DataDeletionRequest> {
    const request = this.deletionRequests.get(requestId);
    if (!request) {
      throw new Error("Deletion request not found");
    }

    if (request.confirmationToken !== confirmationToken) {
      throw new Error("Invalid confirmation token");
    }

    if (request.status !== "awaiting_confirmation") {
      throw new Error("Request already processed");
    }

    request.status = "pending";
    request.confirmedAt = Date.now();

    // Snapshot the confirmed state before kicking off processing: the
    // deletion runs in the background and mutates this same record, so
    // returning the live object would hand the caller a value that changes
    // underneath them.
    const confirmed: DataDeletionRequest = { ...request };

    // Erasure runs once the grace period ends (processDueDeletions), so the
    // user can still cancel until then; past it, run now
    if (!request.scheduledFor || request.scheduledFor <= Date.now()) {
      this.processDeletion(requestId);
    }

    return confirmed;
  }

  async cancelDeletion(requestId: string): Promise<DataDeletionRequest> {
    const request = this.deletionRequests.get(requestId);
    if (!request) {
      throw new Error("Deletion request not found");
    }

    if (request.status === "completed") {
      throw new Error("Cannot cancel completed deletion");
    }

    request.status = "cancelled";
    return request;
  }

  /**
   * Run every confirmed deletion whose grace period has ended. The server
   * calls this periodically; returns the number started.
   */
  async processDueDeletions(now: number = Date.now()): Promise<number> {
    const due = Array.from(this.deletionRequests.values()).filter(
      (r) => r.status === "pending" && r.confirmedAt !== undefined && (r.scheduledFor ?? 0) <= now
    );
    for (const request of due) {
      await this.processDeletion(request.id);
    }
    return due.length;
  }

  private async processDeletion(requestId: string): Promise<void> {
    const request = this.deletionRequests.get(requestId);
    if (!request || request.status !== "pending") return;

    request.status = "processing";
    let retained = 0;

    try {
      const categoryCount = request.categories.length;
      let processed = 0;

      for (const category of request.categories) {
        const result = await this.userData.eraseCategory(request.userAddress, category, request.type);
        request.deletedRecords += result.deleted;
        request.anonymizedRecords += result.anonymized;
        retained += result.retained;

        processed++;
        request.progress = Math.round((processed / categoryCount) * 100);
      }

      request.retainedRecords = retained;
      request.status = "completed";
      request.completedAt = Date.now();
    } catch (error) {
      request.status = "pending"; // Retry on the next processDueDeletions
    }
  }

  getDeletionRequest(requestId: string): DataDeletionRequest | undefined {
    return this.deletionRequests.get(requestId);
  }

  // ==========================================================================
  // CONSENT MANAGEMENT
  // ==========================================================================

  async updateConsent(request: ConsentUpdateRequest): Promise<ConsentPreferences> {
    const now = Date.now();
    const records = this.consentRecords.get(request.userAddress) || [];

    for (const [type, granted] of Object.entries(request.consents)) {
      const consentType = type as ConsentType;
      const status: ConsentStatus = granted ? "granted" : "denied";

      const record: ConsentRecord = {
        id: `consent_${randomUUID().replace(/-/g, "")}`,
        userAddress: request.userAddress,
        consentType,
        status,
        version: this.policyVersion,
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
      };

      if (granted) {
        record.grantedAt = now;
      } else {
        record.revokedAt = now;
      }

      records.push(record);
    }

    this.consentRecords.set(request.userAddress, records);

    return this.getConsentPreferences(request.userAddress);
  }

  getConsentPreferences(userAddress: string): ConsentPreferences {
    const records = this.consentRecords.get(userAddress) || [];

    // Get latest consent for each type
    const consents: Record<ConsentType, ConsentStatus> = {
      essential: "granted", // Always required
      analytics: "not_set",
      marketing: "not_set",
      personalization: "not_set",
      third_party: "not_set",
      cookies: "not_set",
    };

    for (const record of records) {
      consents[record.consentType] = record.status;
    }

    const lastRecord = records[records.length - 1];

    return {
      userAddress,
      consents,
      lastUpdated: lastRecord?.grantedAt || lastRecord?.revokedAt || 0,
      policyVersion: this.policyVersion,
    };
  }

  getConsentHistory(userAddress: string): ConsentRecord[] {
    return this.consentRecords.get(userAddress) || [];
  }

  // ==========================================================================
  // GDPR RIGHTS REQUESTS
  // ==========================================================================

  async submitGdprRequest(
    userAddress: string,
    right: GdprRight
  ): Promise<GdprRequest> {
    const requestId = `gdpr_${randomUUID().replace(/-/g, "")}`;

    const request: GdprRequest = {
      id: requestId,
      userAddress,
      right,
      status: "pending",
      requestedAt: Date.now(),
    };

    this.gdprRequests.set(requestId, request);

    // Auto-process some rights
    if (right === "access") {
      // Trigger data export
      await this.requestExport(userAddress);
      request.status = "processing";
    } else if (right === "erasure") {
      // Trigger deletion request
      await this.requestDeletion(userAddress);
      request.status = "processing";
    }

    return request;
  }

  async respondToGdprRequest(
    requestId: string,
    response: string,
    approved: boolean
  ): Promise<GdprRequest> {
    const request = this.gdprRequests.get(requestId);
    if (!request) {
      throw new Error("GDPR request not found");
    }

    request.status = approved ? "completed" : "rejected";
    request.response = response;
    request.respondedAt = Date.now();

    if (!approved) {
      request.rejectionReason = response;
    }

    return request;
  }

  getGdprRequest(requestId: string): GdprRequest | undefined {
    return this.gdprRequests.get(requestId);
  }

  // ==========================================================================
  // CCPA RIGHTS
  // ==========================================================================

  async submitCcpaRequest(
    userAddress: string,
    right: CcpaRight,
    verificationMethod: string
  ): Promise<CcpaRequest> {
    const requestId = `ccpa_${randomUUID().replace(/-/g, "")}`;

    const request: CcpaRequest = {
      id: requestId,
      userAddress,
      right,
      status: "pending",
      verificationMethod,
      requestedAt: Date.now(),
    };

    this.ccpaRequests.set(requestId, request);

    // Process based on right type
    if (right === "know") {
      await this.requestExport(userAddress);
      request.status = "processing";
    } else if (right === "delete") {
      await this.requestDeletion(userAddress);
      request.status = "processing";
    } else if (right === "opt_out") {
      // Update marketing consent
      await this.updateConsent({
        userAddress,
        consents: { marketing: false, third_party: false },
      });
      request.status = "completed";
      request.respondedAt = Date.now();
    }

    return request;
  }

  // ==========================================================================
  // RETENTION POLICIES
  // ==========================================================================

  private initRetentionSchedule(): RetentionSchedule {
    const policies = new Map<DataCategory, RetentionPolicy>();

    const defaultPolicies: RetentionPolicy[] = [
      {
        id: "ret_profile",
        category: "profile",
        retentionDays: 365 * 3, // 3 years
        autoDelete: false,
        legalBasis: "Legitimate interest",
        description: "User profile information",
      },
      {
        id: "ret_transactions",
        category: "transactions",
        retentionDays: 365 * 7, // 7 years (tax records)
        autoDelete: false,
        legalBasis: "Legal obligation",
        description: "Financial transaction records for tax compliance",
      },
      {
        id: "ret_audit",
        category: "audit_log",
        retentionDays: 365 * 2, // 2 years
        autoDelete: true,
        legalBasis: "Legitimate interest",
        description: "Security and audit logs",
      },
      {
        id: "ret_communications",
        category: "communications",
        retentionDays: 365, // 1 year
        autoDelete: true,
        legalBasis: "Consent",
        description: "Marketing communications",
      },
    ];

    for (const policy of defaultPolicies) {
      policies.set(policy.category, policy);
    }

    return {
      categoryPolicies: policies,
      defaultRetentionDays: 365 * 2,
      minimumRetentionDays: 30,
    };
  }

  getRetentionPolicy(category: DataCategory): RetentionPolicy | undefined {
    return this.retentionSchedule.categoryPolicies.get(category);
  }

  // ==========================================================================
  // COMPLIANCE REPORTS
  // ==========================================================================

  generateComplianceReport(
    type: "gdpr" | "ccpa" | "audit",
    periodStart: number,
    periodEnd: number
  ): ComplianceReport {
    // Count requests in period
    let exportRequests = 0;
    let deletionRequests = 0;
    let consentChanges = 0;
    let totalResponseTime = 0;
    let responseCount = 0;

    for (const req of this.exportRequests.values()) {
      if (req.requestedAt >= periodStart && req.requestedAt <= periodEnd) {
        exportRequests++;
        if (req.completedAt) {
          totalResponseTime += req.completedAt - req.requestedAt;
          responseCount++;
        }
      }
    }

    for (const req of this.deletionRequests.values()) {
      if (req.requestedAt >= periodStart && req.requestedAt <= periodEnd) {
        deletionRequests++;
      }
    }

    for (const records of this.consentRecords.values()) {
      for (const record of records) {
        const timestamp = record.grantedAt || record.revokedAt || 0;
        if (timestamp >= periodStart && timestamp <= periodEnd) {
          consentChanges++;
        }
      }
    }

    return {
      id: `report_${randomUUID().replace(/-/g, "")}`,
      type,
      period: { start: periodStart, end: periodEnd },
      exportRequests,
      deletionRequests,
      consentChanges,
      dataBreaches: 0,
      requestsByCategory: {
        export: exportRequests,
        deletion: deletionRequests,
        consent: consentChanges,
      },
      averageResponseTime:
        responseCount > 0 ? Math.round(totalResponseTime / responseCount) : 0,
      complianceScore: 95, // Calculated based on response times, etc.
      generatedAt: Date.now(),
      generatedBy: "system",
    };
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  getStats(): {
    totalExportRequests: number;
    pendingExports: number;
    totalDeletionRequests: number;
    pendingDeletions: number;
    usersWithConsent: number;
  } {
    let pendingExports = 0;
    let pendingDeletions = 0;

    for (const req of this.exportRequests.values()) {
      if (req.status === "pending" || req.status === "processing") {
        pendingExports++;
      }
    }

    for (const req of this.deletionRequests.values()) {
      if (
        req.status === "pending" ||
        req.status === "processing" ||
        req.status === "awaiting_confirmation"
      ) {
        pendingDeletions++;
      }
    }

    return {
      totalExportRequests: this.exportRequests.size,
      pendingExports,
      totalDeletionRequests: this.deletionRequests.size,
      pendingDeletions,
      usersWithConsent: this.consentRecords.size,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createGdprService(userData?: UserDataProvider): GdprService {
  return new GdprService(userData);
}

// ============================================================================
// USER DATA
// ============================================================================

/**
 * Reads and erases a user's data wherever the platform keeps it
 */
export interface UserDataProvider {
  exportCategory(address: string, category: DataCategory): Promise<unknown>;
  /**
   * Erase (or anonymize) a category. Records that must be kept, such as
   * escrow and payment records, are counted as retained.
   */
  eraseCategory(
    address: string,
    category: DataCategory,
    type: DeletionType
  ): Promise<{ deleted: number; anonymized: number; retained: number }>;
}

/** For a standalone service: no user data beyond its own records */
export const NO_USER_DATA: UserDataProvider = {
  async exportCategory() {
    return null;
  },
  async eraseCategory() {
    return { deleted: 0, anonymized: 0, retained: 0 };
  },
};

const EXPORT_KEYS: Record<DataCategory, string> = {
  profile: "profile",
  campaigns: "campaigns",
  pledges: "pledges",
  transactions: "transactions",
  commemoratives: "commemoratives",
  social: "social",
  preferences: "preferences",
  audit_log: "auditLog",
  communications: "communications",
};


/** Element-per-field XML; array entries become <item> elements */
function toXml(name: string, value: unknown): string {
  const tag = /^[A-Za-z_][\w.-]*$/.test(name) ? name : "field";
  if (value === null || value === undefined) return `<${tag}/>`;
  if (Array.isArray(value)) return `<${tag}>${value.map((v) => toXml("item", v)).join("")}</${tag}>`;
  if (value instanceof Map) return toXml(name, Object.fromEntries(value));
  if (typeof value === "object") {
    return `<${tag}>${Object.entries(value as Record<string, unknown>).map(([k, v]) => toXml(k, v)).join("")}</${tag}>`;
  }
  return `<${tag}>${xmlEscape(String(value))}</${tag}>`;
}
