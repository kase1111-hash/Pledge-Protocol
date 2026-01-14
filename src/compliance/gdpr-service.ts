/**
 * Phase 9: GDPR Compliance Service
 *
 * Data export, deletion, and consent management
 * for GDPR and CCPA compliance.
 */

import { randomUUID } from "crypto";
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

  // Mock data stores (in production, these would be real database queries)
  private userData: Map<string, any> = new Map();
  private retentionSchedule: RetentionSchedule;
  private policyVersion = "2.0.0";

  constructor() {
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
      // Collect data for each category
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
        switch (category) {
          case "profile":
            exportedData.data.profile = await this.exportProfile(
              request.userAddress
            );
            break;
          case "campaigns":
            exportedData.data.campaigns = await this.exportCampaigns(
              request.userAddress
            );
            break;
          case "pledges":
            exportedData.data.pledges = await this.exportPledges(
              request.userAddress
            );
            break;
          case "transactions":
            exportedData.data.transactions = await this.exportTransactions(
              request.userAddress
            );
            break;
          case "commemoratives":
            exportedData.data.commemoratives = await this.exportCommemoratives(
              request.userAddress
            );
            break;
          case "social":
            exportedData.data.social = await this.exportSocial(
              request.userAddress
            );
            break;
          case "preferences":
            exportedData.data.preferences = await this.exportPreferences(
              request.userAddress
            );
            break;
          case "audit_log":
            exportedData.data.auditLog = await this.exportAuditLog(
              request.userAddress
            );
            break;
        }

        processed++;
        request.progress = 10 + Math.round((processed / categoryCount) * 80);
      }

      // Generate download file
      const content = this.formatExport(exportedData, request.format);
      const fileSizeBytes = Buffer.byteLength(content, "utf8");

      // In production: upload to secure storage (S3, etc.)
      const downloadUrl = `https://storage.pledgeprotocol.io/exports/${requestId}.${request.format}`;

      request.status = "completed";
      request.progress = 100;
      request.downloadUrl = downloadUrl;
      request.fileSizeBytes = fileSizeBytes;
      request.expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
      request.completedAt = Date.now();
    } catch (error) {
      request.status = "failed";
    }
  }

  // Export helpers
  private async exportProfile(address: string): Promise<UserProfileData> {
    return {
      address,
      displayName: "User",
      email: "user@example.com",
      bio: "Protocol user",
      createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
      lastActiveAt: Date.now(),
      roles: ["backer"],
      verificationStatus: "verified",
    };
  }

  private async exportCampaigns(address: string): Promise<CampaignData[]> {
    return [
      {
        id: "campaign_1",
        name: "Sample Campaign",
        description: "A sample campaign",
        beneficiary: "0x...",
        createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
        status: "active",
        totalPledged: "1000000000000000000",
        backerCount: 10,
      },
    ];
  }

  private async exportPledges(address: string): Promise<PledgeData[]> {
    return [
      {
        id: "pledge_1",
        campaignId: "campaign_1",
        campaignName: "Sample Campaign",
        amount: "100000000000000000",
        status: "active",
        createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
      },
    ];
  }

  private async exportTransactions(address: string): Promise<TransactionData[]> {
    return [
      {
        id: "tx_1",
        type: "payment",
        amount: "100000000000000000",
        currency: "USD",
        provider: "stripe",
        status: "succeeded",
        createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
      },
    ];
  }

  private async exportCommemoratives(
    address: string
  ): Promise<CommemorativeData[]> {
    return [];
  }

  private async exportSocial(address: string): Promise<SocialData> {
    return {
      followers: [],
      following: [],
      comments: [],
      activity: [],
    };
  }

  private async exportPreferences(address: string): Promise<PreferencesData> {
    return {
      publicProfile: true,
      showPledgeAmounts: true,
      emailNotifications: true,
      marketingEmails: false,
      language: "en",
      timezone: "UTC",
    };
  }

  private async exportAuditLog(address: string): Promise<AuditLogEntry[]> {
    return [
      {
        action: "login",
        timestamp: Date.now() - 1000,
        ipAddress: "127.0.0.1",
      },
    ];
  }

  private formatExport(data: ExportedData, format: ExportFormat): string {
    switch (format) {
      case "json":
        return JSON.stringify(data, null, 2);

      case "csv":
        // Simplified CSV for main entities
        let csv = "";

        if (data.data.pledges) {
          csv += "PLEDGES\nid,campaignId,amount,status,createdAt\n";
          for (const p of data.data.pledges) {
            csv += `${p.id},${p.campaignId},${p.amount},${p.status},${p.createdAt}\n`;
          }
        }

        if (data.data.transactions) {
          csv += "\nTRANSACTIONS\nid,type,amount,currency,status,createdAt\n";
          for (const t of data.data.transactions) {
            csv += `${t.id},${t.type},${t.amount},${t.currency},${t.status},${t.createdAt}\n`;
          }
        }

        return csv;

      case "xml":
        return `<?xml version="1.0" encoding="UTF-8"?>
<export>
  <exportId>${data.exportId}</exportId>
  <userAddress>${data.userAddress}</userAddress>
  <exportedAt>${data.exportedAt}</exportedAt>
  <data>${JSON.stringify(data.data)}</data>
</export>`;

      default:
        return JSON.stringify(data);
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

    // Process immediately or wait for scheduled time
    this.processDeletion(requestId);

    return request;
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

  private async processDeletion(requestId: string): Promise<void> {
    const request = this.deletionRequests.get(requestId);
    if (!request) return;

    request.status = "processing";

    try {
      const categoryCount = request.categories.length;
      let processed = 0;

      for (const category of request.categories) {
        if (request.type === "full_delete") {
          request.deletedRecords += await this.deleteCategory(
            request.userAddress,
            category
          );
        } else {
          request.anonymizedRecords += await this.anonymizeCategory(
            request.userAddress,
            category
          );
        }

        processed++;
        request.progress = Math.round((processed / categoryCount) * 100);
      }

      request.status = "completed";
      request.completedAt = Date.now();
    } catch (error) {
      request.status = "pending"; // Retry later
    }
  }

  private async deleteCategory(
    address: string,
    category: DataCategory
  ): Promise<number> {
    // In production: actual database deletion
    return Math.floor(Math.random() * 100);
  }

  private async anonymizeCategory(
    address: string,
    category: DataCategory
  ): Promise<number> {
    // In production: replace PII with anonymous identifiers
    return Math.floor(Math.random() * 100);
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

export function createGdprService(): GdprService {
  return new GdprService();
}
