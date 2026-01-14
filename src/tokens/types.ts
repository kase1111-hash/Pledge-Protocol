/**
 * Token System Types
 * Phase 3: Token Minting and Commemoratives
 */

export type TemplateType = "race_finish" | "academic" | "creative" | "generic";

export type StorageProvider = "ipfs" | "arweave";

export interface CommemorativeData {
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
  templateType: TemplateType;
  customData?: Record<string, any>;
}

export interface RaceFinishData extends CommemorativeData {
  templateType: "race_finish";
  customData: {
    raceName: string;
    raceDate: string;
    finishTime: string;
    pace: string;
    distance: string;
    bibNumber: string;
    placement?: string;
    runnerName: string;
  };
}

export interface AcademicData extends CommemorativeData {
  templateType: "academic";
  customData: {
    institutionName: string;
    degreeName: string;
    graduationDate: string;
    honors?: string;
    studentName: string;
  };
}

export interface CreativeData extends CommemorativeData {
  templateType: "creative";
  customData: {
    projectTitle: string;
    creatorName: string;
    releaseDate?: string;
    genre?: string;
    description: string;
  };
}

export interface GeneratedImage {
  svg: string;
  png?: Buffer;
  width: number;
  height: number;
}

export interface StorageResult {
  provider: StorageProvider;
  uri: string;
  hash: string;
  timestamp: number;
}

export interface TokenMetadata {
  name: string;
  description: string;
  image: string;
  external_url?: string;
  attributes: TokenAttribute[];
  properties?: Record<string, any>;
}

export interface TokenAttribute {
  trait_type: string;
  value: string | number;
  display_type?: "number" | "date" | "boost_number" | "boost_percentage";
}

export interface PledgeTokenData {
  pledgeId: string;
  campaignId: string;
  campaignName: string;
  backerAddress: string;
  pledgeAmount: string;
  pledgeType: "flat" | "per_unit" | "tiered" | "conditional";
  pledgedAt: number;
  status: "active" | "resolved" | "refunded";
  milestones?: string[];
}

export interface CommemorativeRecord {
  id: string;
  pledgeId: string;
  campaignId: string;
  tokenId?: number;
  backerAddress: string;
  metadata: TokenMetadata;
  imageUri: string;
  metadataUri: string;
  storageProvider: StorageProvider;
  minted: boolean;
  mintedAt?: number;
  txHash?: string;
  createdAt: number;
}

export interface IPFSConfig {
  gateway: string;
  apiEndpoint: string;
  apiKey?: string;
  apiSecret?: string;
}

export interface ArweaveConfig {
  gateway: string;
  wallet?: any; // JWK wallet
  bundlrEndpoint?: string;
}

export interface StorageConfig {
  ipfs: IPFSConfig;
  arweave: ArweaveConfig;
  preferredProvider: StorageProvider;
}
