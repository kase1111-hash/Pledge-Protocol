/**
 * Commemorative Service
 * Phase 3: Token Minting and Commemoratives
 *
 * Orchestrates the complete commemorative token workflow:
 * image generation, metadata creation, storage upload, and minting
 */

import { EventEmitter } from "events";
import { imageGenerator, ImageGenerator } from "./image-generator";
import { metadataGenerator, MetadataGenerator } from "./metadata-generator";
import { storageService, batchUploader, StorageService, BatchUploader } from "./storage";
import {
  CommemorativeData,
  CommemorativeRecord,
  StorageProvider,
  StorageResult,
  TokenMetadata,
  TemplateType,
  PledgeTokenData
} from "./types";

/**
 * Generation request for a single commemorative
 */
export interface GenerationRequest {
  pledgeId: string;
  campaignId: string;
  campaignName: string;
  subjectName: string;
  beneficiaryName: string;
  backerName: string;
  backerAddress: string;
  contributionAmount: string;
  totalCampaignRaised: string;
  pledgedAt: number;
  resolvedAt: number;
  outcomeSummary: string;
  templateType?: TemplateType;
  customData?: Record<string, any>;
}

/**
 * Campaign generation request for batch minting
 */
export interface CampaignGenerationRequest {
  campaignId: string;
  campaignName: string;
  subjectName: string;
  beneficiaryName: string;
  totalRaised: string;
  resolvedAt: number;
  outcomeSummary: string;
  templateType?: TemplateType;
  customTemplateData?: Record<string, any>;
  pledges: Array<{
    pledgeId: string;
    backerName: string;
    backerAddress: string;
    contributionAmount: string;
    pledgedAt: number;
  }>;
}

/**
 * Generation result
 */
export interface GenerationResult {
  pledgeId: string;
  success: boolean;
  record?: CommemorativeRecord;
  error?: string;
}

/**
 * Service events
 */
export interface CommemorativeServiceEvents {
  "generation:started": (pledgeId: string) => void;
  "generation:completed": (result: GenerationResult) => void;
  "generation:failed": (pledgeId: string, error: Error) => void;
  "batch:started": (campaignId: string, count: number) => void;
  "batch:progress": (campaignId: string, completed: number, total: number) => void;
  "batch:completed": (campaignId: string, results: GenerationResult[]) => void;
}

/**
 * Commemorative generation and management service
 */
export class CommemorativeService extends EventEmitter {
  private imageGen: ImageGenerator;
  private metadataGen: MetadataGenerator;
  private storage: StorageService;
  private uploader: BatchUploader;

  // In-memory storage (to be replaced with database in production)
  private records: Map<string, CommemorativeRecord> = new Map();
  private recordsByPledge: Map<string, string> = new Map();
  private recordsByCampaign: Map<string, string[]> = new Map();
  private recordsByBacker: Map<string, string[]> = new Map();

  constructor(
    options: {
      imageGenerator?: ImageGenerator;
      metadataGenerator?: MetadataGenerator;
      storageService?: StorageService;
      batchUploader?: BatchUploader;
    } = {}
  ) {
    super();
    this.imageGen = options.imageGenerator || imageGenerator;
    this.metadataGen = options.metadataGenerator || metadataGenerator;
    this.storage = options.storageService || storageService;
    this.uploader = options.batchUploader || batchUploader;
  }

  /**
   * Generate a single commemorative token
   */
  async generateCommemorative(
    request: GenerationRequest,
    storageProvider?: StorageProvider
  ): Promise<GenerationResult> {
    const { pledgeId } = request;

    try {
      this.emit("generation:started", pledgeId);

      // Check if already exists
      if (this.recordsByPledge.has(pledgeId)) {
        const existingId = this.recordsByPledge.get(pledgeId)!;
        const existing = this.records.get(existingId);
        return {
          pledgeId,
          success: true,
          record: existing
        };
      }

      // Prepare commemorative data
      const commemorativeData: CommemorativeData = {
        ...request,
        templateType: request.templateType || "generic"
      };

      // Validate template data
      const validation = this.imageGen.validateTemplateData(commemorativeData);
      if (!validation.valid) {
        throw new Error(`Invalid template data: ${validation.errors.join(", ")}`);
      }

      // Generate image
      const image = await this.imageGen.generate(commemorativeData);

      // Generate metadata (with placeholder image URI)
      const metadata = this.metadataGen.generateCommemorativeMetadata(
        commemorativeData,
        "placeholder://image"
      );

      // Upload image and metadata to storage
      const { imageResult, metadataResult } = await this.uploader.uploadCommemorativeBundle(
        image.svg,
        metadata,
        storageProvider
      );

      // Create record
      const recordId = this.generateRecordId();
      const record: CommemorativeRecord = {
        id: recordId,
        pledgeId,
        campaignId: request.campaignId,
        backerAddress: request.backerAddress,
        metadata: {
          ...metadata,
          image: imageResult.uri
        },
        imageUri: imageResult.uri,
        metadataUri: metadataResult.uri,
        storageProvider: storageProvider || this.storage.getConfig().preferredProvider,
        minted: false,
        createdAt: Date.now()
      };

      // Store record
      this.storeRecord(record);

      const result: GenerationResult = {
        pledgeId,
        success: true,
        record
      };

      this.emit("generation:completed", result);
      return result;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit("generation:failed", pledgeId, err);

      return {
        pledgeId,
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Generate commemoratives for an entire campaign
   */
  async generateForCampaign(
    request: CampaignGenerationRequest,
    storageProvider?: StorageProvider
  ): Promise<GenerationResult[]> {
    const { campaignId, pledges } = request;
    const results: GenerationResult[] = [];

    this.emit("batch:started", campaignId, pledges.length);

    for (let i = 0; i < pledges.length; i++) {
      const pledge = pledges[i];

      const genRequest: GenerationRequest = {
        pledgeId: pledge.pledgeId,
        campaignId,
        campaignName: request.campaignName,
        subjectName: request.subjectName,
        beneficiaryName: request.beneficiaryName,
        backerName: pledge.backerName,
        backerAddress: pledge.backerAddress,
        contributionAmount: pledge.contributionAmount,
        totalCampaignRaised: request.totalRaised,
        pledgedAt: pledge.pledgedAt,
        resolvedAt: request.resolvedAt,
        outcomeSummary: request.outcomeSummary,
        templateType: request.templateType,
        customData: request.customTemplateData
      };

      const result = await this.generateCommemorative(genRequest, storageProvider);
      results.push(result);

      this.emit("batch:progress", campaignId, i + 1, pledges.length);
    }

    this.emit("batch:completed", campaignId, results);
    return results;
  }

  /**
   * Get a commemorative record by ID
   */
  getRecord(recordId: string): CommemorativeRecord | undefined {
    return this.records.get(recordId);
  }

  /**
   * Get commemorative by pledge ID
   */
  getByPledgeId(pledgeId: string): CommemorativeRecord | undefined {
    const recordId = this.recordsByPledge.get(pledgeId);
    return recordId ? this.records.get(recordId) : undefined;
  }

  /**
   * Get all commemoratives for a campaign
   */
  getByCampaignId(campaignId: string): CommemorativeRecord[] {
    const recordIds = this.recordsByCampaign.get(campaignId) || [];
    return recordIds
      .map(id => this.records.get(id))
      .filter((r): r is CommemorativeRecord => r !== undefined);
  }

  /**
   * Get all commemoratives for a backer
   */
  getByBackerAddress(address: string): CommemorativeRecord[] {
    const normalizedAddress = address.toLowerCase();
    const recordIds = this.recordsByBacker.get(normalizedAddress) || [];
    return recordIds
      .map(id => this.records.get(id))
      .filter((r): r is CommemorativeRecord => r !== undefined);
  }

  /**
   * Mark a commemorative as minted
   */
  markAsMinted(pledgeId: string, tokenId: number, txHash: string): boolean {
    const recordId = this.recordsByPledge.get(pledgeId);
    if (!recordId) return false;

    const record = this.records.get(recordId);
    if (!record) return false;

    record.tokenId = tokenId;
    record.txHash = txHash;
    record.minted = true;
    record.mintedAt = Date.now();

    return true;
  }

  /**
   * Get image URL for a commemorative
   */
  getImageUrl(pledgeId: string): string | undefined {
    const record = this.getByPledgeId(pledgeId);
    if (!record) return undefined;
    return this.storage.toHttpUrl(record.imageUri);
  }

  /**
   * Get metadata URL for a commemorative
   */
  getMetadataUrl(pledgeId: string): string | undefined {
    const record = this.getByPledgeId(pledgeId);
    if (!record) return undefined;
    return this.storage.toHttpUrl(record.metadataUri);
  }

  /**
   * Verify commemorative assets exist in storage
   */
  async verifyAssets(pledgeId: string): Promise<{ imageExists: boolean; metadataExists: boolean }> {
    const record = this.getByPledgeId(pledgeId);
    if (!record) {
      return { imageExists: false, metadataExists: false };
    }

    const [imageExists, metadataExists] = await Promise.all([
      this.storage.verify(record.imageUri),
      this.storage.verify(record.metadataUri)
    ]);

    return { imageExists, metadataExists };
  }

  /**
   * Get all records (for admin/testing)
   */
  getAllRecords(): CommemorativeRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalRecords: number;
    minted: number;
    unminted: number;
    byCampaign: Map<string, number>;
  } {
    const records = this.getAllRecords();
    const minted = records.filter(r => r.minted).length;
    const byCampaign = new Map<string, number>();

    for (const record of records) {
      const count = byCampaign.get(record.campaignId) || 0;
      byCampaign.set(record.campaignId, count + 1);
    }

    return {
      totalRecords: records.length,
      minted,
      unminted: records.length - minted,
      byCampaign
    };
  }

  /**
   * Clear all records (for testing)
   */
  clearAll(): void {
    this.records.clear();
    this.recordsByPledge.clear();
    this.recordsByCampaign.clear();
    this.recordsByBacker.clear();
  }

  /**
   * Store a record with indexes
   */
  private storeRecord(record: CommemorativeRecord): void {
    this.records.set(record.id, record);
    this.recordsByPledge.set(record.pledgeId, record.id);

    // Index by campaign
    const campaignRecords = this.recordsByCampaign.get(record.campaignId) || [];
    campaignRecords.push(record.id);
    this.recordsByCampaign.set(record.campaignId, campaignRecords);

    // Index by backer
    const normalizedAddress = record.backerAddress.toLowerCase();
    const backerRecords = this.recordsByBacker.get(normalizedAddress) || [];
    backerRecords.push(record.id);
    this.recordsByBacker.set(normalizedAddress, backerRecords);
  }

  /**
   * Generate a unique record ID
   */
  private generateRecordId(): string {
    return `comm_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

/**
 * Pledge token service for ERC-721 pledge tokens
 */
export class PledgeTokenService {
  private metadataGen: MetadataGenerator;
  private storage: StorageService;

  // In-memory storage for pledge token metadata
  private pledgeMetadata: Map<string, { metadata: TokenMetadata; imageUri: string; metadataUri: string }> = new Map();

  constructor(
    options: {
      metadataGenerator?: MetadataGenerator;
      storageService?: StorageService;
    } = {}
  ) {
    this.metadataGen = options.metadataGenerator || metadataGenerator;
    this.storage = options.storageService || storageService;
  }

  /**
   * Generate and store pledge token metadata
   */
  async generatePledgeTokenMetadata(
    data: PledgeTokenData,
    storageProvider?: StorageProvider
  ): Promise<{ metadata: TokenMetadata; imageUri: string; metadataUri: string }> {
    // Check if already generated
    if (this.pledgeMetadata.has(data.pledgeId)) {
      return this.pledgeMetadata.get(data.pledgeId)!;
    }

    // Generate image
    const imageSvg = this.metadataGen.generatePledgeTokenImage(data);

    // Upload image
    const imageResult = await this.storage.uploadImage(imageSvg, storageProvider);

    // Generate metadata
    const metadata = this.metadataGen.generatePledgeTokenMetadata(data, imageResult.uri);

    // Upload metadata
    const metadataResult = await this.storage.uploadMetadata(metadata, storageProvider);

    const result = {
      metadata,
      imageUri: imageResult.uri,
      metadataUri: metadataResult.uri
    };

    // Store
    this.pledgeMetadata.set(data.pledgeId, result);

    return result;
  }

  /**
   * Get pledge token metadata
   */
  getPledgeTokenMetadata(pledgeId: string): { metadata: TokenMetadata; imageUri: string; metadataUri: string } | undefined {
    return this.pledgeMetadata.get(pledgeId);
  }

  /**
   * Get metadata URL for a pledge token
   */
  getMetadataUrl(pledgeId: string): string | undefined {
    const data = this.pledgeMetadata.get(pledgeId);
    if (!data) return undefined;
    return this.storage.toHttpUrl(data.metadataUri);
  }

  /**
   * Get image URL for a pledge token
   */
  getImageUrl(pledgeId: string): string | undefined {
    const data = this.pledgeMetadata.get(pledgeId);
    if (!data) return undefined;
    return this.storage.toHttpUrl(data.imageUri);
  }

  /**
   * Clear all stored metadata (for testing)
   */
  clearAll(): void {
    this.pledgeMetadata.clear();
  }
}

// Export singleton instances
export const commemorativeService = new CommemorativeService();
export const pledgeTokenService = new PledgeTokenService();
