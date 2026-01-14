/**
 * Multi-Chain Configuration
 * Phase 8: Ecosystem Expansion - Support for multiple blockchain networks
 */

/**
 * Supported blockchain networks
 */
export type ChainId =
  | 1 // Ethereum Mainnet
  | 5 // Goerli (deprecated)
  | 11155111 // Sepolia
  | 137 // Polygon Mainnet
  | 80001 // Polygon Mumbai
  | 42161 // Arbitrum One
  | 421614 // Arbitrum Sepolia
  | 10 // Optimism
  | 11155420 // Optimism Sepolia
  | 8453 // Base
  | 84532 // Base Sepolia
  | 31337; // Hardhat/Localhost

/**
 * Network type classification
 */
export type NetworkType = "mainnet" | "testnet" | "local";

/**
 * Chain configuration
 */
export interface ChainConfig {
  chainId: ChainId;
  name: string;
  shortName: string;
  networkType: NetworkType;
  rpcUrls: string[];
  blockExplorer?: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  contracts?: {
    campaignRegistry?: string;
    escrowVault?: string;
    pledgeManager?: string;
    oracleRegistry?: string;
    pledgeToken?: string;
    commemorativeToken?: string;
  };
  gasSettings?: {
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    gasLimit?: bigint;
  };
  features: {
    supportsEIP1559: boolean;
    supportsMulticall: boolean;
    avgBlockTime: number; // seconds
  };
  enabled: boolean;
}

/**
 * All supported chains configuration
 */
export const CHAIN_CONFIGS: Record<ChainId, ChainConfig> = {
  // Ethereum Mainnet
  1: {
    chainId: 1,
    name: "Ethereum Mainnet",
    shortName: "eth",
    networkType: "mainnet",
    rpcUrls: [
      "https://eth.llamarpc.com",
      "https://rpc.ankr.com/eth",
      "https://cloudflare-eth.com",
    ],
    blockExplorer: "https://etherscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    features: {
      supportsEIP1559: true,
      supportsMulticall: true,
      avgBlockTime: 12,
    },
    enabled: true,
  },

  // Goerli (deprecated)
  5: {
    chainId: 5,
    name: "Goerli",
    shortName: "goerli",
    networkType: "testnet",
    rpcUrls: ["https://rpc.ankr.com/eth_goerli"],
    blockExplorer: "https://goerli.etherscan.io",
    nativeCurrency: { name: "Goerli Ether", symbol: "ETH", decimals: 18 },
    features: {
      supportsEIP1559: true,
      supportsMulticall: true,
      avgBlockTime: 12,
    },
    enabled: false, // Deprecated
  },

  // Sepolia
  11155111: {
    chainId: 11155111,
    name: "Sepolia",
    shortName: "sepolia",
    networkType: "testnet",
    rpcUrls: [
      "https://rpc.sepolia.org",
      "https://rpc.ankr.com/eth_sepolia",
      "https://sepolia.infura.io/v3/",
    ],
    blockExplorer: "https://sepolia.etherscan.io",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    features: {
      supportsEIP1559: true,
      supportsMulticall: true,
      avgBlockTime: 12,
    },
    enabled: true,
  },

  // Polygon Mainnet
  137: {
    chainId: 137,
    name: "Polygon",
    shortName: "polygon",
    networkType: "mainnet",
    rpcUrls: [
      "https://polygon-rpc.com",
      "https://rpc.ankr.com/polygon",
      "https://polygon.llamarpc.com",
    ],
    blockExplorer: "https://polygonscan.com",
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
    features: {
      supportsEIP1559: true,
      supportsMulticall: true,
      avgBlockTime: 2,
    },
    enabled: true,
  },

  // Polygon Mumbai
  80001: {
    chainId: 80001,
    name: "Polygon Mumbai",
    shortName: "mumbai",
    networkType: "testnet",
    rpcUrls: [
      "https://rpc-mumbai.maticvigil.com",
      "https://rpc.ankr.com/polygon_mumbai",
    ],
    blockExplorer: "https://mumbai.polygonscan.com",
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
    features: {
      supportsEIP1559: true,
      supportsMulticall: true,
      avgBlockTime: 2,
    },
    enabled: true,
  },

  // Arbitrum One
  42161: {
    chainId: 42161,
    name: "Arbitrum One",
    shortName: "arbitrum",
    networkType: "mainnet",
    rpcUrls: [
      "https://arb1.arbitrum.io/rpc",
      "https://rpc.ankr.com/arbitrum",
      "https://arbitrum.llamarpc.com",
    ],
    blockExplorer: "https://arbiscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    features: {
      supportsEIP1559: true,
      supportsMulticall: true,
      avgBlockTime: 0.25,
    },
    enabled: true,
  },

  // Arbitrum Sepolia
  421614: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    shortName: "arb-sepolia",
    networkType: "testnet",
    rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
    blockExplorer: "https://sepolia.arbiscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    features: {
      supportsEIP1559: true,
      supportsMulticall: true,
      avgBlockTime: 0.25,
    },
    enabled: true,
  },

  // Optimism
  10: {
    chainId: 10,
    name: "Optimism",
    shortName: "optimism",
    networkType: "mainnet",
    rpcUrls: [
      "https://mainnet.optimism.io",
      "https://rpc.ankr.com/optimism",
      "https://optimism.llamarpc.com",
    ],
    blockExplorer: "https://optimistic.etherscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    features: {
      supportsEIP1559: true,
      supportsMulticall: true,
      avgBlockTime: 2,
    },
    enabled: true,
  },

  // Optimism Sepolia
  11155420: {
    chainId: 11155420,
    name: "Optimism Sepolia",
    shortName: "op-sepolia",
    networkType: "testnet",
    rpcUrls: ["https://sepolia.optimism.io"],
    blockExplorer: "https://sepolia-optimism.etherscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    features: {
      supportsEIP1559: true,
      supportsMulticall: true,
      avgBlockTime: 2,
    },
    enabled: true,
  },

  // Base
  8453: {
    chainId: 8453,
    name: "Base",
    shortName: "base",
    networkType: "mainnet",
    rpcUrls: [
      "https://mainnet.base.org",
      "https://base.llamarpc.com",
      "https://rpc.ankr.com/base",
    ],
    blockExplorer: "https://basescan.org",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    features: {
      supportsEIP1559: true,
      supportsMulticall: true,
      avgBlockTime: 2,
    },
    enabled: true,
  },

  // Base Sepolia
  84532: {
    chainId: 84532,
    name: "Base Sepolia",
    shortName: "base-sepolia",
    networkType: "testnet",
    rpcUrls: ["https://sepolia.base.org"],
    blockExplorer: "https://sepolia.basescan.org",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    features: {
      supportsEIP1559: true,
      supportsMulticall: true,
      avgBlockTime: 2,
    },
    enabled: true,
  },

  // Hardhat/Localhost
  31337: {
    chainId: 31337,
    name: "Hardhat",
    shortName: "hardhat",
    networkType: "local",
    rpcUrls: ["http://127.0.0.1:8545"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    features: {
      supportsEIP1559: true,
      supportsMulticall: true,
      avgBlockTime: 1,
    },
    enabled: true,
  },
};

/**
 * Get chain configuration by ID
 */
export function getChainConfig(chainId: ChainId): ChainConfig | undefined {
  return CHAIN_CONFIGS[chainId];
}

/**
 * Get all enabled chains
 */
export function getEnabledChains(): ChainConfig[] {
  return Object.values(CHAIN_CONFIGS).filter((c) => c.enabled);
}

/**
 * Get chains by network type
 */
export function getChainsByType(type: NetworkType): ChainConfig[] {
  return Object.values(CHAIN_CONFIGS).filter(
    (c) => c.enabled && c.networkType === type
  );
}

/**
 * Get mainnet chains
 */
export function getMainnets(): ChainConfig[] {
  return getChainsByType("mainnet");
}

/**
 * Get testnet chains
 */
export function getTestnets(): ChainConfig[] {
  return getChainsByType("testnet");
}

/**
 * Check if chain is supported
 */
export function isChainSupported(chainId: number): chainId is ChainId {
  return chainId in CHAIN_CONFIGS && CHAIN_CONFIGS[chainId as ChainId].enabled;
}

/**
 * Get block explorer URL for transaction
 */
export function getTransactionUrl(chainId: ChainId, txHash: string): string | null {
  const config = CHAIN_CONFIGS[chainId];
  if (!config?.blockExplorer) return null;
  return `${config.blockExplorer}/tx/${txHash}`;
}

/**
 * Get block explorer URL for address
 */
export function getAddressUrl(chainId: ChainId, address: string): string | null {
  const config = CHAIN_CONFIGS[chainId];
  if (!config?.blockExplorer) return null;
  return `${config.blockExplorer}/address/${address}`;
}

/**
 * Default chain for new deployments
 */
export const DEFAULT_CHAIN_ID: ChainId = 11155111; // Sepolia

/**
 * Recommended chains for production
 */
export const PRODUCTION_CHAINS: ChainId[] = [1, 137, 42161, 10, 8453];

/**
 * Recommended chains for testing
 */
export const TESTNET_CHAINS: ChainId[] = [11155111, 80001, 421614, 11155420, 84532];
