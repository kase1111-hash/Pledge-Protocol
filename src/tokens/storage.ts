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
import { createHash, JsonWebKey } from "crypto";
import { readFileSync } from "fs";
import { createDataItem } from "./ans104";

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
    bundlrEndpoint: "https://node1.irys.xyz"
  },
  local: {
    publicUrl: "http://localhost:3000"
  },
  preferredProvider: "local"
};

interface LocalAsset {
  contentType: string;
  /** Base64 content */
  data: string;
  createdAt: number;
}

/**
 * Storage for token images and metadata:
 *
 *  - "ipfs": pinned through Pinata (API key and secret, or a JWT)
 *  - "arweave": signed ANS-104 data items posted to an Irys/Bundlr node with
 *    an Arweave wallet (small uploads are free; larger ones need a funded
 *    balance on the node)
 *  - "local": kept by this API (content-addressed, persisted with the rest
 *    of its state) and served from /v1/commemoratives/assets/:hash, for
 *    deployments without IPFS or Arweave credentials
 *
 * A provider that is requested but not configured is an error; uploads are
 * never faked.
 */
export class StorageService {
  private config: StorageConfig;
  private uploadCache: Map<string, StorageResult> = new Map();
  private localAssets: Map<string, LocalAsset> = new Map();

  constructor(config: Partial<StorageConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      ipfs: { ...DEFAULT_CONFIG.ipfs, ...config.ipfs },
      arweave: { ...DEFAULT_CONFIG.arweave, ...config.arweave },
      local: { ...DEFAULT_CONFIG.local, ...config.local }
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

    switch (targetProvider) {
      case "ipfs":
        result = await this.uploadToIPFS(content, contentType);
        break;
      case "arweave":
        result = await this.uploadToArweave(content, contentType);
        break;
      case "local":
        result = this.storeLocally(content, contentType);
        break;
      default:
        throw new Error(`Unknown storage provider: ${targetProvider}`);
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
    const { apiEndpoint, apiKey, apiSecret, jwt } = this.config.ipfs;

    let auth: Record<string, string>;
    if (jwt) {
      auth = { Authorization: `Bearer ${jwt}` };
    } else if (apiKey && apiSecret) {
      auth = { pinata_api_key: apiKey, pinata_secret_api_key: apiSecret };
    } else {
      throw new Error("IPFS storage is not configured (set IPFS_API_KEY and IPFS_API_SECRET, or PINATA_JWT)");
    }

    const buffer = typeof content === "string" ? Buffer.from(content) : content;
    const formData = new FormData();
    formData.append("file", new Blob([buffer], { type: contentType }), this.hashContent(buffer));

    const response = await fetch(`${apiEndpoint}/pinning/pinFileToIPFS`, {
      method: "POST",
      headers: auth,
      body: formData
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`IPFS upload failed: HTTP ${response.status} ${error.slice(0, 200)}`);
    }

    const result = (await response.json()) as { IpfsHash: string };
    const hash = result.IpfsHash;

    return {
      provider: "ipfs",
      uri: `ipfs://${hash}`,
      hash,
      timestamp: Date.now()
    };
  }

  /**
   * Upload to Arweave as a signed data item through an Irys/Bundlr node
   */
  private async uploadToArweave(
    content: string | Buffer,
    contentType: string
  ): Promise<StorageResult> {
    const { bundlrEndpoint, wallet } = this.config.arweave;

    if (!wallet) {
      throw new Error("Arweave storage is not configured (set ARWEAVE_WALLET to a JWK wallet)");
    }

    const buffer = typeof content === "string" ? Buffer.from(content) : content;
    const item = createDataItem(buffer, wallet, [
      { name: "Content-Type", value: contentType },
      { name: "App-Name", value: "Pledge Protocol" }
    ]);

    const response = await fetch(`${bundlrEndpoint}/tx/arweave`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: item.bytes
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Arweave upload failed: HTTP ${response.status} ${error.slice(0, 200)}`);
    }

    const result = (await response.json()) as { id?: string };
    const txId = result.id || item.id;

    return {
      provider: "arweave",
      uri: `ar://${txId}`,
      hash: txId,
      timestamp: Date.now()
    };
  }

  /**
   * Keep content in this API, addressed by its SHA-256
   */
  private storeLocally(content: string | Buffer, contentType: string): StorageResult {
    const buffer = typeof content === "string" ? Buffer.from(content) : content;
    const hash = this.hashContent(buffer);
    if (!this.localAssets.has(hash)) {
      this.localAssets.set(hash, { contentType, data: buffer.toString("base64"), createdAt: Date.now() });
    }

    return {
      provider: "local",
      uri: `local://${hash}`,
      hash,
      timestamp: Date.now()
    };
  }

  /**
   * Content stored with the "local" provider
   */
  getLocalAsset(hash: string): { contentType: string; content: Buffer } | null {
    const asset = this.localAssets.get(hash);
    return asset ? { contentType: asset.contentType, content: Buffer.from(asset.data, "base64") } : null;
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

    if (uri.startsWith("local://")) {
      const hash = uri.replace("local://", "");
      return `${this.config.local.publicUrl.replace(/\/$/, "")}/v1/commemoratives/assets/${hash}`;
    }

    return uri;
  }

  /**
   * Verify content exists at URI
   */
  async verify(uri: string): Promise<boolean> {
    if (uri.startsWith("local://")) {
      return this.localAssets.has(uri.replace("local://", ""));
    }
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
    if (uri.startsWith("local://")) {
      const asset = this.getLocalAsset(uri.replace("local://", ""));
      if (!asset) throw new Error(`No stored content for ${uri}`);
      return asset.content;
    }

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
 * Storage settings from the environment. The preferred provider is
 * STORAGE_PROVIDER, or the first configured of Arweave, IPFS, local.
 */
export function storageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): Partial<StorageConfig> {
  let wallet: JsonWebKey | undefined;
  const rawWallet = env.ARWEAVE_WALLET || (env.ARWEAVE_WALLET_FILE ? readFileSync(env.ARWEAVE_WALLET_FILE, "utf8") : "");
  if (rawWallet) {
    try {
      wallet = JSON.parse(rawWallet);
    } catch {
      throw new Error("ARWEAVE_WALLET must be a JWK wallet in JSON");
    }
  }

  const ipfsConfigured = !!(env.PINATA_JWT || (env.IPFS_API_KEY && env.IPFS_API_SECRET));
  const preferred = (env.STORAGE_PROVIDER as StorageProvider | undefined) ||
    (wallet ? "arweave" : ipfsConfigured ? "ipfs" : "local");

  return {
    ipfs: {
      gateway: env.IPFS_GATEWAY || DEFAULT_CONFIG.ipfs.gateway,
      apiEndpoint: env.IPFS_API_URL || DEFAULT_CONFIG.ipfs.apiEndpoint,
      apiKey: env.IPFS_API_KEY,
      apiSecret: env.IPFS_API_SECRET,
      jwt: env.PINATA_JWT
    },
    arweave: {
      gateway: env.ARWEAVE_GATEWAY || DEFAULT_CONFIG.arweave.gateway,
      bundlrEndpoint: env.BUNDLER_URL || DEFAULT_CONFIG.arweave.bundlrEndpoint,
      wallet
    },
    local: {
      publicUrl: /^https?:\/\//.test(env.BASE_URL ?? "") ? env.BASE_URL! : `http://localhost:${env.PORT || 3000}`
    },
    preferredProvider: preferred
  };
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
export const storageService = new StorageService(storageConfigFromEnv());
export const batchUploader = new BatchUploader(storageService);
