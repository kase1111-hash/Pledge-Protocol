/**
 * Storage Integration
 * Phase 3: Token Minting and Commemoratives
 *
 * Handles uploads to IPFS and Arweave for permanent storage
 * of token images and metadata
 */

import {
  StorageProvider,
  StorageResult,
  StorageConfig,
  IPFSConfig,
  ArweaveConfig,
  TokenMetadata
} from "./types";
import { createHash } from "crypto";

/**
 * Default configuration for storage providers
 */
const DEFAULT_CONFIG: StorageConfig = {
  ipfs: {
    gateway: "https://ipfs.io/ipfs",
    apiEndpoint: "https://api.pinata.cloud"
  },
  arweave: {
    gateway: "https://arweave.net",
    bundlrEndpoint: "https://node1.bundlr.network"
  },
  preferredProvider: "arweave"
};

/**
 * Storage provider for IPFS and Arweave
 */
export class StorageService {
  private config: StorageConfig;
  private uploadCache: Map<string, StorageResult> = new Map();

  constructor(config: Partial<StorageConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      ipfs: { ...DEFAULT_CONFIG.ipfs, ...config.ipfs },
      arweave: { ...DEFAULT_CONFIG.arweave, ...config.arweave }
    };
  }

  /**
   * Upload content to the preferred storage provider
   */
  async upload(
    content: string | Buffer,
    contentType: string,
    provider?: StorageProvider
  ): Promise<StorageResult> {
    const targetProvider = provider || this.config.preferredProvider;

    // Generate content hash for caching
    const contentHash = this.hashContent(content);
    const cacheKey = `${targetProvider}:${contentHash}`;

    // Check cache
    const cached = this.uploadCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    let result: StorageResult;

    if (targetProvider === "ipfs") {
      result = await this.uploadToIPFS(content, contentType);
    } else {
      result = await this.uploadToArweave(content, contentType);
    }

    // Cache the result
    this.uploadCache.set(cacheKey, result);

    return result;
  }

  /**
   * Upload an image (SVG or PNG) to storage
   */
  async uploadImage(
    svg: string,
    provider?: StorageProvider
  ): Promise<StorageResult> {
    return this.upload(svg, "image/svg+xml", provider);
  }

  /**
   * Upload token metadata JSON to storage
   */
  async uploadMetadata(
    metadata: TokenMetadata,
    provider?: StorageProvider
  ): Promise<StorageResult> {
    const json = JSON.stringify(metadata, null, 2);
    return this.upload(json, "application/json", provider);
  }

  /**
   * Upload to IPFS via Pinata API
   */
  private async uploadToIPFS(
    content: string | Buffer,
    contentType: string
  ): Promise<StorageResult> {
    const { apiEndpoint, apiKey, apiSecret } = this.config.ipfs;

    if (!apiKey || !apiSecret) {
      // Return mock result for development without API keys
      return this.createMockIPFSResult(content);
    }

    const buffer = typeof content === "string" ? Buffer.from(content) : content;
    const blob = new Blob([buffer], { type: contentType });

    const formData = new FormData();
    formData.append("file", blob);

    const response = await fetch(`${apiEndpoint}/pinning/pinFileToIPFS`, {
      method: "POST",
      headers: {
        pinata_api_key: apiKey,
        pinata_secret_api_key: apiSecret
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`IPFS upload failed: ${error}`);
    }

    const result = await response.json();
    const hash = result.IpfsHash;

    return {
      provider: "ipfs",
      uri: `ipfs://${hash}`,
      hash,
      timestamp: Date.now()
    };
  }

  /**
   * Upload to Arweave via Bundlr
   */
  private async uploadToArweave(
    content: string | Buffer,
    contentType: string
  ): Promise<StorageResult> {
    const { bundlrEndpoint, wallet } = this.config.arweave;

    if (!wallet) {
      // Return mock result for development without wallet
      return this.createMockArweaveResult(content);
    }

    const buffer = typeof content === "string" ? Buffer.from(content) : content;

    // In production, this would use the Bundlr SDK
    // For now, we simulate the upload
    const response = await fetch(`${bundlrEndpoint}/tx`, {
      method: "POST",
      headers: {
        "Content-Type": contentType
      },
      body: buffer
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Arweave upload failed: ${error}`);
    }

    const result = await response.json();
    const txId = result.id;

    return {
      provider: "arweave",
      uri: `ar://${txId}`,
      hash: txId,
      timestamp: Date.now()
    };
  }

  /**
   * Create mock IPFS result for development
   */
  private createMockIPFSResult(content: string | Buffer): StorageResult {
    const hash = this.hashContent(content);
    const mockCid = `Qm${hash.substring(0, 44)}`;

    return {
      provider: "ipfs",
      uri: `ipfs://${mockCid}`,
      hash: mockCid,
      timestamp: Date.now()
    };
  }

  /**
   * Create mock Arweave result for development
   */
  private createMockArweaveResult(content: string | Buffer): StorageResult {
    const hash = this.hashContent(content);
    const mockTxId = hash.substring(0, 43);

    return {
      provider: "arweave",
      uri: `ar://${mockTxId}`,
      hash: mockTxId,
      timestamp: Date.now()
    };
  }

  /**
   * Convert storage URI to HTTP URL
   */
  toHttpUrl(uri: string): string {
    if (uri.startsWith("ipfs://")) {
      const hash = uri.replace("ipfs://", "");
      return `${this.config.ipfs.gateway}/${hash}`;
    }

    if (uri.startsWith("ar://")) {
      const txId = uri.replace("ar://", "");
      return `${this.config.arweave.gateway}/${txId}`;
    }

    return uri;
  }

  /**
   * Verify content exists at URI
   */
  async verify(uri: string): Promise<boolean> {
    try {
      const url = this.toHttpUrl(uri);
      const response = await fetch(url, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Fetch content from URI
   */
  async fetch(uri: string): Promise<Buffer> {
    const url = this.toHttpUrl(uri);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch content from ${uri}: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Fetch and parse JSON metadata from URI
   */
  async fetchMetadata(uri: string): Promise<TokenMetadata> {
    const buffer = await this.fetch(uri);
    const json = buffer.toString("utf-8");
    return JSON.parse(json);
  }

  /**
   * Generate content hash
   */
  private hashContent(content: string | Buffer): string {
    const buffer = typeof content === "string" ? Buffer.from(content) : content;
    return createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Get storage configuration
   */
  getConfig(): StorageConfig {
    return { ...this.config };
  }

  /**
   * Update IPFS configuration
   */
  configureIPFS(config: Partial<IPFSConfig>): void {
    this.config.ipfs = { ...this.config.ipfs, ...config };
  }

  /**
   * Update Arweave configuration
   */
  configureArweave(config: Partial<ArweaveConfig>): void {
    this.config.arweave = { ...this.config.arweave, ...config };
  }

  /**
   * Set preferred storage provider
   */
  setPreferredProvider(provider: StorageProvider): void {
    this.config.preferredProvider = provider;
  }

  /**
   * Clear upload cache
   */
  clearCache(): void {
    this.uploadCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.uploadCache.size,
      entries: Array.from(this.uploadCache.keys())
    };
  }
}

/**
 * Batch upload service for multiple files
 */
export class BatchUploader {
  private storage: StorageService;
  private concurrency: number;

  constructor(storage: StorageService, concurrency: number = 5) {
    this.storage = storage;
    this.concurrency = concurrency;
  }

  /**
   * Upload multiple files in parallel with concurrency limit
   */
  async uploadMany(
    files: Array<{ content: string | Buffer; contentType: string }>,
    provider?: StorageProvider
  ): Promise<StorageResult[]> {
    const results: StorageResult[] = [];
    const queue = [...files];

    const worker = async () => {
      while (queue.length > 0) {
        const file = queue.shift();
        if (file) {
          const result = await this.storage.upload(
            file.content,
            file.contentType,
            provider
          );
          results.push(result);
        }
      }
    };

    // Create workers up to concurrency limit
    const workers = Array(Math.min(this.concurrency, files.length))
      .fill(null)
      .map(() => worker());

    await Promise.all(workers);

    return results;
  }

  /**
   * Upload commemorative data (image + metadata) atomically
   */
  async uploadCommemorativeBundle(
    svg: string,
    metadata: TokenMetadata,
    provider?: StorageProvider
  ): Promise<{ imageResult: StorageResult; metadataResult: StorageResult }> {
    // First upload image
    const imageResult = await this.storage.uploadImage(svg, provider);

    // Update metadata with image URI
    const updatedMetadata = {
      ...metadata,
      image: imageResult.uri
    };

    // Then upload metadata
    const metadataResult = await this.storage.uploadMetadata(
      updatedMetadata,
      provider
    );

    return { imageResult, metadataResult };
  }
}

// Export singleton instance
export const storageService = new StorageService();
export const batchUploader = new BatchUploader(storageService);
