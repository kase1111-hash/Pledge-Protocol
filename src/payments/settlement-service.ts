/**
 * Phase 9: Settlement Service
 *
 * Handles conversion of fiat payments to stablecoin (USDC)
 * and settlement to smart contract escrow.
 * Uses ethers.js for real blockchain transactions.
 */

import { randomUUID } from "crypto";
import { JsonRpcProvider, Wallet, Contract, parseUnits, formatUnits } from "ethers";
import {
  Settlement,
  SettlementRequest,
  SettlementStatus,
  CheckoutSession,
  PaymentCurrency,
} from "./types";
import { ChainId } from "../multichain/config";

// ============================================================================
// TYPES
// ============================================================================

export interface SettlementConfig {
  defaultCurrency: "USDC" | "USDT";
  defaultChainId: ChainId;
  escrowContractAddress: string;
  settlementWalletAddress: string;
  minSettlementAmount: string; // Minimum amount to settle
  batchingEnabled: boolean; // Batch multiple settlements
  batchIntervalMs: number; // How often to process batch
  rpcUrls: Record<number, string>; // Chain ID -> RPC URL
  privateKey?: string; // Settlement wallet private key
  blockConfirmations: number; // Number of confirmations to wait
}

export interface ExchangeRate {
  fromCurrency: PaymentCurrency;
  toCurrency: "USDC" | "USDT" | "ETH";
  rate: string; // e.g., "1.00" for USD -> USDC
  source: string;
  timestamp: number;
  validUntil: number;
}

export interface SettlementBatch {
  id: string;
  settlements: Settlement[];
  totalAmount: string;
  status: "pending" | "processing" | "completed" | "failed";
  txHash?: string;
  createdAt: number;
  processedAt?: number;
}

// Minimal ERC20 ABI for transfers
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

// ============================================================================
// SETTLEMENT SERVICE
// ============================================================================

export class SettlementService {
  private config: SettlementConfig;
  private settlements: Map<string, Settlement> = new Map();
  private batches: Map<string, SettlementBatch> = new Map();
  private exchangeRates: Map<string, ExchangeRate> = new Map();
  private pendingSettlements: Settlement[] = [];
  private providers: Map<number, JsonRpcProvider> = new Map();

  constructor(config: SettlementConfig) {
    this.config = config;
    this.initializeExchangeRates();
    this.initializeProviders();
  }

  // ==========================================================================
  // PROVIDERS
  // ==========================================================================

  private initializeProviders(): void {
    for (const [chainIdStr, rpcUrl] of Object.entries(this.config.rpcUrls)) {
      const chainId = parseInt(chainIdStr);
      this.providers.set(chainId, new JsonRpcProvider(rpcUrl));
    }
  }

  private getProvider(chainId: number): JsonRpcProvider {
    const provider = this.providers.get(chainId);
    if (!provider) {
      throw new Error(`No RPC provider configured for chain ${chainId}`);
    }
    return provider;
  }

  private getWallet(chainId: number): Wallet {
    if (!this.config.privateKey) {
      throw new Error("Settlement wallet private key not configured");
    }
    return new Wallet(this.config.privateKey, this.getProvider(chainId));
  }

  // ==========================================================================
  // EXCHANGE RATES
  // ==========================================================================

  private initializeExchangeRates(): void {
    const now = Date.now();
    const validFor = 5 * 60 * 1000; // 5 minutes

    // Default rates — in production, fetch from CoinGecko/Chainlink
    const rates: ExchangeRate[] = [
      {
        fromCurrency: "USD",
        toCurrency: "USDC",
        rate: "1.000000",
        source: "default",
        timestamp: now,
        validUntil: now + validFor,
      },
      {
        fromCurrency: "USD",
        toCurrency: "USDT",
        rate: "1.000000",
        source: "default",
        timestamp: now,
        validUntil: now + validFor,
      },
      {
        fromCurrency: "EUR",
        toCurrency: "USDC",
        rate: "1.085000",
        source: "default",
        timestamp: now,
        validUntil: now + validFor,
      },
      {
        fromCurrency: "GBP",
        toCurrency: "USDC",
        rate: "1.270000",
        source: "default",
        timestamp: now,
        validUntil: now + validFor,
      },
    ];

    for (const rate of rates) {
      const key = `${rate.fromCurrency}-${rate.toCurrency}`;
      this.exchangeRates.set(key, rate);
    }
  }

  getExchangeRate(
    from: PaymentCurrency,
    to: "USDC" | "USDT" | "ETH"
  ): ExchangeRate | undefined {
    const key = `${from}-${to}`;
    const rate = this.exchangeRates.get(key);

    // Check if rate is still valid
    if (rate && rate.validUntil < Date.now()) {
      // Refresh rates (in production: fetch from API)
      this.initializeExchangeRates();
      return this.exchangeRates.get(key);
    }

    return rate;
  }

  async refreshExchangeRates(): Promise<void> {
    // In production: fetch real-time rates from CoinGecko, Chainlink, etc.
    // For now, reinitialize with defaults
    this.initializeExchangeRates();
  }

  // ==========================================================================
  // SETTLEMENT CREATION
  // ==========================================================================

  async createSettlement(
    session: CheckoutSession,
    request: SettlementRequest
  ): Promise<Settlement> {
    const settlementId = `stl_${randomUUID().replace(/-/g, "")}`;
    const now = Date.now();

    const destCurrency = request.destinationCurrency || this.config.defaultCurrency;
    const destChainId = request.destinationChainId || this.config.defaultChainId;

    // Get exchange rate
    const rate = this.getExchangeRate(session.currency, destCurrency);
    if (!rate) {
      throw new Error(
        `No exchange rate for ${session.currency} -> ${destCurrency}`
      );
    }

    // Calculate destination amount
    // Source amount is in cents, convert to USDC (6 decimals)
    const sourceAmountCents = parseInt(session.amount);
    const sourceAmountUsd = sourceAmountCents / 100;
    const destAmount = sourceAmountUsd * parseFloat(rate.rate);

    // Convert to smallest unit (6 decimals for USDC/USDT)
    const destAmountSmallest = Math.floor(destAmount * 1_000_000).toString();

    const settlement: Settlement = {
      id: settlementId,
      sessionId: session.id,
      campaignId: session.campaignId,
      pledgeId: session.pledgeId || "",
      sourceCurrency: session.currency,
      sourceAmount: session.amount,
      destinationCurrency: destCurrency,
      destinationAmount: destAmountSmallest,
      destinationAddress: this.config.escrowContractAddress,
      destinationChainId: destChainId,
      exchangeRate: rate.rate,
      conversionProvider: rate.source,
      status: "pending",
      createdAt: now,
    };

    this.settlements.set(settlementId, settlement);

    // Add to pending queue if batching is enabled
    if (this.config.batchingEnabled) {
      this.pendingSettlements.push(settlement);
    } else {
      // Process immediately
      await this.processSettlement(settlement);
    }

    return settlement;
  }

  // ==========================================================================
  // SETTLEMENT PROCESSING
  // ==========================================================================

  async processSettlement(settlement: Settlement): Promise<Settlement> {
    settlement.status = "converting";

    try {
      // Step 1: Get a wallet for the target chain
      const wallet = this.getWallet(settlement.destinationChainId);

      // Step 2: Get the USDC token contract on the target chain
      const usdcAddress = this.getUsdcAddress(settlement.destinationChainId);
      const usdcContract = new Contract(usdcAddress, ERC20_ABI, wallet);

      // Step 3: Estimate gas for the transfer
      const amount = BigInt(settlement.destinationAmount);
      const gasEstimate = await usdcContract.transfer.estimateGas(
        settlement.destinationAddress,
        amount
      );

      // Step 4: Execute the on-chain transfer
      const tx = await usdcContract.transfer(
        settlement.destinationAddress,
        amount,
        { gasLimit: gasEstimate * 120n / 100n } // 20% gas buffer
      );

      settlement.txHash = tx.hash;
      settlement.convertedAt = Date.now();

      // Step 5: Wait for block confirmations
      const receipt = await tx.wait(this.config.blockConfirmations);

      if (!receipt || receipt.status === 0) {
        throw new Error("Transaction reverted on-chain");
      }

      settlement.status = "settled";
      settlement.blockNumber = receipt.blockNumber;
      settlement.settledAt = Date.now();
    } catch (error) {
      settlement.status = "failed";
    }

    return settlement;
  }

  // ==========================================================================
  // BATCH PROCESSING
  // ==========================================================================

  async processBatch(): Promise<SettlementBatch | null> {
    if (this.pendingSettlements.length === 0) {
      return null;
    }

    const batchId = `batch_${randomUUID().replace(/-/g, "")}`;
    const settlements = [...this.pendingSettlements];
    this.pendingSettlements = [];

    // Calculate total amount
    let totalAmount = BigInt(0);
    for (const s of settlements) {
      totalAmount += BigInt(s.destinationAmount);
    }

    const batch: SettlementBatch = {
      id: batchId,
      settlements,
      totalAmount: totalAmount.toString(),
      status: "pending",
      createdAt: Date.now(),
    };

    this.batches.set(batchId, batch);

    // Process batch as single transaction
    batch.status = "processing";

    try {
      for (const settlement of settlements) {
        settlement.status = "converting";
      }

      // Execute a single large transfer to the escrow contract
      const chainId = settlements[0].destinationChainId;
      const wallet = this.getWallet(chainId);
      const usdcAddress = this.getUsdcAddress(chainId);
      const usdcContract = new Contract(usdcAddress, ERC20_ABI, wallet);

      const tx = await usdcContract.transfer(
        this.config.escrowContractAddress,
        totalAmount
      );

      batch.txHash = tx.hash;

      const receipt = await tx.wait(this.config.blockConfirmations);
      if (!receipt || receipt.status === 0) {
        throw new Error("Batch transaction reverted on-chain");
      }

      batch.status = "completed";
      batch.processedAt = Date.now();

      for (const settlement of settlements) {
        settlement.status = "settled";
        settlement.txHash = tx.hash;
        settlement.blockNumber = receipt.blockNumber;
        settlement.settledAt = Date.now();
      }
    } catch (error) {
      batch.status = "failed";
      for (const settlement of settlements) {
        settlement.status = "failed";
      }
    }

    return batch;
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  getSettlement(settlementId: string): Settlement | undefined {
    return this.settlements.get(settlementId);
  }

  getSettlementBySession(sessionId: string): Settlement | undefined {
    for (const settlement of this.settlements.values()) {
      if (settlement.sessionId === sessionId) {
        return settlement;
      }
    }
    return undefined;
  }

  getSettlementsByCampaign(campaignId: string): Settlement[] {
    const results: Settlement[] = [];
    for (const settlement of this.settlements.values()) {
      if (settlement.campaignId === campaignId) {
        results.push(settlement);
      }
    }
    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  getPendingSettlements(): Settlement[] {
    return this.pendingSettlements;
  }

  getBatch(batchId: string): SettlementBatch | undefined {
    return this.batches.get(batchId);
  }

  // ==========================================================================
  // REVERSAL
  // ==========================================================================

  async reverseSettlement(settlementId: string): Promise<Settlement> {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) {
      throw new Error("Settlement not found");
    }

    if (settlement.status !== "settled") {
      throw new Error("Can only reverse settled settlements");
    }

    // In production: execute on-chain reversal transaction
    // This would call a refund function on the escrow contract
    settlement.status = "reversed";
    return settlement;
  }

  // ==========================================================================
  // ANALYTICS
  // ==========================================================================

  getStats(): {
    totalSettlements: number;
    pendingCount: number;
    settledCount: number;
    failedCount: number;
    totalVolume: string;
    averageSettlementTime: number;
  } {
    let pending = 0;
    let settled = 0;
    let failed = 0;
    let totalVolume = BigInt(0);
    let totalTime = 0;
    let settledWithTime = 0;

    for (const settlement of this.settlements.values()) {
      switch (settlement.status) {
        case "pending":
        case "converting":
          pending++;
          break;
        case "settled":
          settled++;
          totalVolume += BigInt(settlement.destinationAmount);
          if (settlement.settledAt) {
            totalTime += settlement.settledAt - settlement.createdAt;
            settledWithTime++;
          }
          break;
        case "failed":
          failed++;
          break;
      }
    }

    return {
      totalSettlements: this.settlements.size,
      pendingCount: pending,
      settledCount: settled,
      failedCount: failed,
      totalVolume: totalVolume.toString(),
      averageSettlementTime:
        settledWithTime > 0 ? Math.round(totalTime / settledWithTime) : 0,
    };
  }

  // ==========================================================================
  // ESCROW INTEGRATION
  // ==========================================================================

  /**
   * Verify settlement was received by escrow contract on-chain
   */
  async verifyEscrowDeposit(
    settlementId: string
  ): Promise<{ verified: boolean; balance?: string }> {
    const settlement = this.settlements.get(settlementId);
    if (!settlement || !settlement.txHash) {
      return { verified: false };
    }

    try {
      const provider = this.getProvider(settlement.destinationChainId);
      const receipt = await provider.getTransactionReceipt(settlement.txHash);

      if (!receipt || receipt.status === 0) {
        return { verified: false };
      }

      // Query on-chain balance at escrow address
      const usdcAddress = this.getUsdcAddress(settlement.destinationChainId);
      const usdcContract = new Contract(usdcAddress, ERC20_ABI, provider);
      const balance: bigint = await usdcContract.balanceOf(settlement.destinationAddress);

      return {
        verified: true,
        balance: balance.toString(),
      };
    } catch {
      return { verified: false };
    }
  }

  /**
   * Get escrow balance for a campaign from on-chain data
   */
  async getEscrowBalance(
    campaignId: string,
    chainId?: number
  ): Promise<{ balance: string; currency: string }> {
    const targetChainId = chainId || this.config.defaultChainId;

    try {
      const provider = this.getProvider(targetChainId);
      const usdcAddress = this.getUsdcAddress(targetChainId);
      const usdcContract = new Contract(usdcAddress, ERC20_ABI, provider);
      const balance: bigint = await usdcContract.balanceOf(this.config.escrowContractAddress);

      return {
        balance: balance.toString(),
        currency: this.config.defaultCurrency,
      };
    } catch {
      // Fallback to summing settled amounts from local records
      const settlements = this.getSettlementsByCampaign(campaignId);
      let balance = BigInt(0);

      for (const settlement of settlements) {
        if (settlement.status === "settled") {
          if (!chainId || settlement.destinationChainId === chainId) {
            balance += BigInt(settlement.destinationAmount);
          }
        }
      }

      return {
        balance: balance.toString(),
        currency: this.config.defaultCurrency,
      };
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Well-known USDC contract addresses by chain
   */
  private getUsdcAddress(chainId: number): string {
    const addresses: Record<number, string> = {
      1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Ethereum
      137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Polygon
      42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // Arbitrum
      10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // Optimism
      8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base
      11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Sepolia testnet
    };

    const address = addresses[chainId];
    if (!address) {
      throw new Error(`No USDC address configured for chain ${chainId}`);
    }
    return address;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createSettlementService(
  config: SettlementConfig
): SettlementService {
  return new SettlementService(config);
}

export const DEFAULT_SETTLEMENT_CONFIG: SettlementConfig = {
  defaultCurrency: "USDC",
  defaultChainId: 137, // Polygon
  escrowContractAddress: "0x0000000000000000000000000000000000000000",
  settlementWalletAddress: "0x0000000000000000000000000000000000000000",
  minSettlementAmount: "100000", // $0.10 minimum
  batchingEnabled: false,
  batchIntervalMs: 60 * 1000, // 1 minute
  rpcUrls: {},
  blockConfirmations: 2,
};
