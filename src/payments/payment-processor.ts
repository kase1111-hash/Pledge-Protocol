/**
 * Phase 9: Payment Processor
 *
 * Orchestrates payment providers, handles checkout flow,
 * and manages settlements.
 */

import { randomUUID } from "crypto";
import {
  PaymentProvider,
  PaymentConfig,
  PaymentProviderInterface,
  CreateCheckoutRequest,
  CheckoutResult,
  CheckoutSession,
  RefundRequest,
  Refund,
  CreateSubscriptionRequest,
  Subscription,
  SavedPaymentMethod,
  PaymentWebhook,
  PaymentAnalytics,
  PaymentError,
  PaymentErrorCode,
  KycInitRequest,
  KycVerification,
} from "./types";
import { StripeProvider } from "./stripe-provider";
import { CircleProvider } from "./circle-provider";
import {
  SettlementService,
  SettlementConfig,
  DEFAULT_SETTLEMENT_CONFIG,
} from "./settlement-service";

// ============================================================================
// TYPES
// ============================================================================

export interface PaymentProcessorConfig extends PaymentConfig {
  settlement?: SettlementConfig;
}

export interface CheckoutWithSettlement extends CheckoutResult {
  autoSettle: boolean;
}

// ============================================================================
// PAYMENT PROCESSOR
// ============================================================================

export class PaymentProcessor {
  private config: PaymentProcessorConfig;
  private providers: Map<PaymentProvider, PaymentProviderInterface> = new Map();
  private settlementService: SettlementService;

  // Analytics tracking
  private analytics: {
    transactions: number;
    volume: bigint;
    fees: bigint;
    byProvider: Map<PaymentProvider, { count: number; volume: bigint }>;
    byMethod: Map<string, { count: number; volume: bigint }>;
  };

  constructor(config: PaymentProcessorConfig) {
    this.config = config;

    // Initialize providers
    if (config.stripe) {
      this.providers.set("stripe", new StripeProvider(config.stripe));
    }
    if (config.circle) {
      this.providers.set("circle", new CircleProvider(config.circle));
    }

    // Initialize settlement service
    this.settlementService = new SettlementService(
      config.settlement || DEFAULT_SETTLEMENT_CONFIG
    );

    // Initialize analytics
    this.analytics = {
      transactions: 0,
      volume: BigInt(0),
      fees: BigInt(0),
      byProvider: new Map(),
      byMethod: new Map(),
    };
  }

  // ==========================================================================
  // PROVIDER SELECTION
  // ==========================================================================

  private getProvider(
    provider?: PaymentProvider
  ): PaymentProviderInterface {
    const providerName = provider || this.config.defaultProvider;
    const p = this.providers.get(providerName);

    if (!p) {
      throw this.createError(
        "provider_error",
        `Provider ${providerName} not configured`
      );
    }

    return p;
  }

  private selectBestProvider(
    request: CreateCheckoutRequest
  ): PaymentProvider {
    // Select provider based on payment method
    if (request.method === "ach" || request.method === "wire") {
      if (this.providers.has("circle")) {
        return "circle";
      }
    }

    // Card payments prefer Stripe
    if (
      request.method === "card" ||
      request.method === "apple_pay" ||
      request.method === "google_pay"
    ) {
      if (this.providers.has("stripe")) {
        return "stripe";
      }
    }

    // Default provider
    return request.provider || this.config.defaultProvider;
  }

  // ==========================================================================
  // CHECKOUT FLOW
  // ==========================================================================

  async createCheckout(
    request: CreateCheckoutRequest,
    options?: { autoSettle?: boolean }
  ): Promise<CheckoutWithSettlement> {
    // Validate amount
    const amountNum = parseInt(request.amount);
    if (amountNum < parseInt(this.config.minPaymentAmount)) {
      throw this.createError(
        "amount_too_small",
        `Minimum payment is ${this.config.minPaymentAmount}`
      );
    }
    if (amountNum > parseInt(this.config.maxPaymentAmount)) {
      throw this.createError(
        "amount_too_large",
        `Maximum payment is ${this.config.maxPaymentAmount}`
      );
    }

    // Select provider
    const providerName = this.selectBestProvider(request);
    const provider = this.getProvider(providerName);

    // Create checkout
    const result = await provider.createCheckout({
      ...request,
      provider: providerName,
    });

    return {
      ...result,
      autoSettle: options?.autoSettle ?? true,
    };
  }

  async getCheckout(
    sessionId: string,
    provider?: PaymentProvider
  ): Promise<CheckoutSession> {
    // Try to find in each provider
    if (provider) {
      return this.getProvider(provider).getCheckout(sessionId);
    }

    for (const p of this.providers.values()) {
      try {
        return await p.getCheckout(sessionId);
      } catch {
        // Continue to next provider
      }
    }

    throw this.createError("processing_error", "Session not found");
  }

  async expireCheckout(
    sessionId: string,
    provider?: PaymentProvider
  ): Promise<void> {
    if (provider) {
      return this.getProvider(provider).expireCheckout(sessionId);
    }

    // Try all providers
    for (const p of this.providers.values()) {
      try {
        await p.expireCheckout(sessionId);
        return;
      } catch {
        // Continue
      }
    }
  }

  // ==========================================================================
  // PAYMENT CONFIRMATION
  // ==========================================================================

  async confirmPayment(
    sessionId: string,
    options?: { settle?: boolean }
  ): Promise<CheckoutSession> {
    const session = await this.getCheckout(sessionId);
    const provider = this.getProvider(session.provider);

    if (session.providerPaymentIntentId) {
      await provider.confirmPayment(session.providerPaymentIntentId);
    }

    // Refresh session
    const updatedSession = await this.getCheckout(sessionId, session.provider);

    // Track analytics
    if (updatedSession.status === "succeeded") {
      this.trackTransaction(updatedSession);

      // Auto-settle if requested
      if (options?.settle !== false) {
        await this.settlePayment(sessionId);
      }
    }

    return updatedSession;
  }

  // ==========================================================================
  // SETTLEMENT
  // ==========================================================================

  async settlePayment(sessionId: string): Promise<{
    settlementId: string;
    status: string;
    txHash?: string;
  }> {
    const session = await this.getCheckout(sessionId);

    if (session.status !== "succeeded") {
      throw this.createError(
        "processing_error",
        "Can only settle successful payments"
      );
    }

    const settlement = await this.settlementService.createSettlement(session, {
      sessionId,
    });

    return {
      settlementId: settlement.id,
      status: settlement.status,
      txHash: settlement.txHash,
    };
  }

  getSettlement(settlementId: string) {
    return this.settlementService.getSettlement(settlementId);
  }

  getSettlementBySession(sessionId: string) {
    return this.settlementService.getSettlementBySession(sessionId);
  }

  // ==========================================================================
  // REFUNDS
  // ==========================================================================

  async createRefund(request: RefundRequest): Promise<Refund> {
    let session: CheckoutSession | undefined;

    if (request.sessionId) {
      session = await this.getCheckout(request.sessionId);
    }

    const provider = this.getProvider(session?.provider);
    return provider.createRefund(request);
  }

  async getRefund(
    refundId: string,
    provider?: PaymentProvider
  ): Promise<Refund> {
    if (provider) {
      return this.getProvider(provider).getRefund(refundId);
    }

    for (const p of this.providers.values()) {
      try {
        return await p.getRefund(refundId);
      } catch {
        continue;
      }
    }

    throw this.createError("processing_error", "Refund not found");
  }

  // ==========================================================================
  // SUBSCRIPTIONS
  // ==========================================================================

  async createSubscription(
    request: CreateSubscriptionRequest
  ): Promise<Subscription> {
    // Subscriptions are Stripe-only
    const provider = this.getProvider("stripe");
    return provider.createSubscription(request);
  }

  async cancelSubscription(
    subscriptionId: string,
    provider: PaymentProvider = "stripe"
  ): Promise<Subscription> {
    return this.getProvider(provider).cancelSubscription(subscriptionId);
  }

  async pauseSubscription(
    subscriptionId: string,
    provider: PaymentProvider = "stripe"
  ): Promise<Subscription> {
    return this.getProvider(provider).pauseSubscription(subscriptionId);
  }

  async resumeSubscription(
    subscriptionId: string,
    provider: PaymentProvider = "stripe"
  ): Promise<Subscription> {
    return this.getProvider(provider).resumeSubscription(subscriptionId);
  }

  // ==========================================================================
  // PAYMENT METHODS
  // ==========================================================================

  async savePaymentMethod(
    userAddress: string,
    providerMethodId: string,
    provider: PaymentProvider = "stripe"
  ): Promise<SavedPaymentMethod> {
    return this.getProvider(provider).savePaymentMethod(
      userAddress,
      providerMethodId
    );
  }

  async deletePaymentMethod(
    methodId: string,
    provider: PaymentProvider = "stripe"
  ): Promise<void> {
    return this.getProvider(provider).deletePaymentMethod(methodId);
  }

  async listPaymentMethods(
    userAddress: string,
    provider?: PaymentProvider
  ): Promise<SavedPaymentMethod[]> {
    if (provider) {
      return this.getProvider(provider).listPaymentMethods(userAddress);
    }

    // List from all providers
    const methods: SavedPaymentMethod[] = [];
    for (const p of this.providers.values()) {
      const providerMethods = await p.listPaymentMethods(userAddress);
      methods.push(...providerMethods);
    }
    return methods;
  }

  // ==========================================================================
  // KYC
  // ==========================================================================

  async initiateKyc(
    request: KycInitRequest
  ): Promise<{ url: string; id: string }> {
    // KYC via Circle
    const provider = this.getProvider("circle") as CircleProvider;
    if (provider.initiateKyc) {
      return provider.initiateKyc(request);
    }
    throw this.createError("processing_error", "KYC not supported");
  }

  async getKycStatus(kycId: string): Promise<KycVerification> {
    const provider = this.getProvider("circle") as CircleProvider;
    if (provider.getKycStatus) {
      return provider.getKycStatus(kycId);
    }
    throw this.createError("processing_error", "KYC not supported");
  }

  // ==========================================================================
  // WEBHOOKS
  // ==========================================================================

  async handleWebhook(
    provider: PaymentProvider,
    payload: string,
    signature: string
  ): Promise<PaymentWebhook> {
    const p = this.getProvider(provider);

    // Verify signature
    if (!p.verifyWebhook(payload, signature)) {
      throw this.createError("processing_error", "Invalid webhook signature");
    }

    // Parse webhook
    const webhook = p.parseWebhook(payload);
    webhook.processedAt = Date.now();

    // Handle specific events
    await this.processWebhookEvent(webhook);

    return webhook;
  }

  private async processWebhookEvent(webhook: PaymentWebhook): Promise<void> {
    switch (webhook.event) {
      case "payment.succeeded":
        if (webhook.data.sessionId) {
          await this.confirmPayment(webhook.data.sessionId);
        }
        break;

      case "payment.failed":
        // Mark session as failed
        if (webhook.data.sessionId) {
          const session = await this.getCheckout(
            webhook.data.sessionId,
            webhook.provider
          );
          session.status = "failed";
        }
        break;

      case "refund.succeeded":
        // Update refund status
        break;

      case "subscription.payment_succeeded":
        // Process recurring payment
        break;

      case "subscription.payment_failed":
        // Handle failed subscription payment
        break;
    }
  }

  // ==========================================================================
  // ANALYTICS
  // ==========================================================================

  private trackTransaction(session: CheckoutSession): void {
    const amount = BigInt(session.amount);
    const fees = BigInt(session.fees.totalFees);

    this.analytics.transactions++;
    this.analytics.volume += amount;
    this.analytics.fees += fees;

    // By provider
    const providerStats = this.analytics.byProvider.get(session.provider) || {
      count: 0,
      volume: BigInt(0),
    };
    providerStats.count++;
    providerStats.volume += amount;
    this.analytics.byProvider.set(session.provider, providerStats);

    // By method
    if (session.method) {
      const methodStats = this.analytics.byMethod.get(session.method) || {
        count: 0,
        volume: BigInt(0),
      };
      methodStats.count++;
      methodStats.volume += amount;
      this.analytics.byMethod.set(session.method, methodStats);
    }
  }

  getAnalytics(
    periodStart?: number,
    periodEnd?: number
  ): PaymentAnalytics {
    const volumeByProvider: Record<PaymentProvider, string> = {} as any;
    const transactionsByProvider: Record<PaymentProvider, number> = {} as any;

    for (const [provider, stats] of this.analytics.byProvider.entries()) {
      volumeByProvider[provider] = stats.volume.toString();
      transactionsByProvider[provider] = stats.count;
    }

    const volumeByMethod: Record<string, string> = {};
    const transactionsByMethod: Record<string, number> = {};

    for (const [method, stats] of this.analytics.byMethod.entries()) {
      volumeByMethod[method] = stats.volume.toString();
      transactionsByMethod[method] = stats.count;
    }

    return {
      totalVolume: this.analytics.volume.toString(),
      totalTransactions: this.analytics.transactions,
      averageTransaction:
        this.analytics.transactions > 0
          ? (this.analytics.volume / BigInt(this.analytics.transactions)).toString()
          : "0",
      volumeByProvider,
      transactionsByProvider,
      volumeByMethod,
      transactionsByMethod,
      volumeByCurrency: { USD: this.analytics.volume.toString() },
      successRate: 100, // Simplified
      failureRate: 0,
      refundRate: 0,
      totalFeesCollected: this.analytics.fees.toString(),
      totalPlatformFees: (
        (this.analytics.fees * BigInt(50)) /
        BigInt(100)
      ).toString(), // ~50% platform
      totalProcessingFees: (
        (this.analytics.fees * BigInt(50)) /
        BigInt(100)
      ).toString(),
      periodStart: periodStart || 0,
      periodEnd: periodEnd || Date.now(),
    };
  }

  getSettlementStats() {
    return this.settlementService.getStats();
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private createError(code: PaymentErrorCode, message: string): PaymentError {
    return {
      code,
      message,
      retryable: ["processing_error", "rate_limited"].includes(code),
    };
  }

  // Get supported providers
  getSupportedProviders(): PaymentProvider[] {
    return Array.from(this.providers.keys());
  }

  // Get provider limits
  getLimits(): {
    min: string;
    max: string;
    dailyMax: string;
  } {
    return {
      min: this.config.minPaymentAmount,
      max: this.config.maxPaymentAmount,
      dailyMax: this.config.maxDailyVolume,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createPaymentProcessor(
  config: PaymentProcessorConfig
): PaymentProcessor {
  return new PaymentProcessor(config);
}

// Default configuration
export const DEFAULT_PAYMENT_CONFIG: PaymentConfig = {
  defaultProvider: "stripe",
  defaultCurrency: "USD",
  defaultSettlementCurrency: "USDC",
  defaultSettlementChainId: 137,
  platformFeePercent: 2.5,
  minPlatformFee: "50", // $0.50
  minPaymentAmount: "100", // $1.00
  maxPaymentAmount: "100000000", // $1,000,000
  maxDailyVolume: "1000000000", // $10,000,000
};
