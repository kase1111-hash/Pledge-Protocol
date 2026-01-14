/**
 * Phase 9: Settlement Service
 *
 * Handles conversion of fiat payments to stablecoin (USDC)
 * and settlement to smart contract escrow.
 */

import { randomUUID } from "crypto";
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

// ============================================================================
// SETTLEMENT SERVICE
// ============================================================================

export class SettlementService {
  private config: SettlementConfig;
  private settlements: Map<string, Settlement> = new Map();
  private batches: Map<string, SettlementBatch> = new Map();
  private exchangeRates: Map<string, ExchangeRate> = new Map();
  private pendingSettlements: Settlement[] = [];

  constructor(config: SettlementConfig) {
    this.config = config;
    this.initializeExchangeRates();
  }

  // ==========================================================================
  // EXCHANGE RATES
  // ==========================================================================

  private initializeExchangeRates(): void {
    const now = Date.now();
    const validFor = 5 * 60 * 1000; // 5 minutes

    // Default rates (1:1 for stablecoins)
    const rates: ExchangeRate[] = [
      {
        fromCurrency: "USD",
        toCurrency: "USDC",
        rate: "1.000000",
        source: "circle",
        timestamp: now,
        validUntil: now + validFor,
      },
      {
        fromCurrency: "USD",
        toCurrency: "USDT",
        rate: "1.000000",
        source: "circle",
        timestamp: now,
        validUntil: now + validFor,
      },
      {
        fromCurrency: "EUR",
        toCurrency: "USDC",
        rate: "1.085000", // EUR is stronger
        source: "circle",
        timestamp: now,
        validUntil: now + validFor,
      },
      {
        fromCurrency: "GBP",
        toCurrency: "USDC",
        rate: "1.270000",
        source: "circle",
        timestamp: now,
        validUntil: now + validFor,
      },
      {
        fromCurrency: "USD",
        toCurrency: "ETH",
        rate: "0.000400", // ~$2500/ETH
        source: "chainlink",
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
      // In production: fetch fresh rate from API
      this.initializeExchangeRates();
      return this.exchangeRates.get(key);
    }

    return rate;
  }

  async refreshExchangeRates(): Promise<void> {
    // In production: fetch from Circle, Chainlink, etc.
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
      // Step 1: Convert fiat to USDC via Circle
      // In production: Circle API call
      await this.simulateConversion(settlement);

      // Step 2: Transfer USDC to escrow contract
      // In production: blockchain transaction
      const txHash = await this.simulateBlockchainTransfer(settlement);

      settlement.status = "settled";
      settlement.txHash = txHash;
      settlement.settledAt = Date.now();
    } catch (error) {
      settlement.status = "failed";
    }

    return settlement;
  }

  private async simulateConversion(settlement: Settlement): Promise<void> {
    // Simulate conversion delay
    await new Promise((resolve) => setTimeout(resolve, 100));
    settlement.convertedAt = Date.now();
  }

  private async simulateBlockchainTransfer(
    settlement: Settlement
  ): Promise<string> {
    // Simulate blockchain delay
    await new Promise((resolve) => setTimeout(resolve, 100));
    settlement.blockNumber = Math.floor(Date.now() / 1000);
    return `0x${randomUUID().replace(/-/g, "")}`;
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

    // Process batch
    batch.status = "processing";

    try {
      // Update all settlements
      for (const settlement of settlements) {
        settlement.status = "converting";
      }

      // Simulate batch conversion and transfer
      await new Promise((resolve) => setTimeout(resolve, 200));

      const txHash = `0x${randomUUID().replace(/-/g, "")}`;
      batch.txHash = txHash;
      batch.status = "completed";
      batch.processedAt = Date.now();

      // Update all settlements
      for (const settlement of settlements) {
        settlement.status = "settled";
        settlement.txHash = txHash;
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

    // In production: blockchain transaction to return funds
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
   * Verify settlement was received by escrow contract
   */
  async verifyEscrowDeposit(
    settlementId: string
  ): Promise<{ verified: boolean; balance?: string }> {
    const settlement = this.settlements.get(settlementId);
    if (!settlement || !settlement.txHash) {
      return { verified: false };
    }

    // In production: query blockchain for escrow contract balance
    return {
      verified: settlement.status === "settled",
      balance: settlement.destinationAmount,
    };
  }

  /**
   * Get escrow balance for a campaign
   */
  async getEscrowBalance(
    campaignId: string,
    chainId?: number
  ): Promise<{ balance: string; currency: string }> {
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
};
