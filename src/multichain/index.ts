/**
 * Multi-Chain Module Exports
 * Phase 8: Ecosystem Expansion
 */

// Configuration
export {
  ChainId,
  NetworkType,
  ChainConfig,
  CHAIN_CONFIGS,
  getChainConfig,
  getEnabledChains,
  getChainsByType,
  getMainnets,
  getTestnets,
  isChainSupported,
  getTransactionUrl,
  getAddressUrl,
  DEFAULT_CHAIN_ID,
  PRODUCTION_CHAINS,
  TESTNET_CHAINS,
} from "./config";

// Registry
export {
  ContractType,
  ContractDeployment,
  CampaignDeployment,
  CrossChainCampaign,
  MultiChainRegistry,
  multiChainRegistry,
} from "./registry";

// Deployment Service
export {
  DeploymentRequest,
  DeploymentResult,
  GasEstimate,
  DeploymentService,
  deploymentService,
} from "./deployment-service";
