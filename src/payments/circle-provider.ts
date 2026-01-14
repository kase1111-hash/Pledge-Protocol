/**
 * Phase 9: Circle Payment Provider
 *
 * ACH bank transfers, wire transfers, and USDC settlement.
 */

import { randomUUID } from "crypto";
import {
  PaymentProviderInterface,
  PaymentProvider,
  CheckoutSession,
  CheckoutResult,
  CreateCheckoutRequest,
  PaymentIntent,
  Refund,
  RefundRequest,
  Subscription,
  CreateSubscriptionRequest,
  SavedPaymentMethod,
  PaymentWebhook,
  PaymentFees,
  CircleConfig,
  PaymentError,
  PaymentErrorCode,
  KycVerification,
  KycInitRequest,
} from "./types";

// ============================================================================
// CIRCLE PROVIDER
// ============================================================================

export class CircleProvider implements PaymentProviderInterface {
  name: PaymentProvider = "circle";

  private config: CircleConfig;
  private sessions: Map<string, CheckoutSession> = new Map();
  private intents: Map<string, PaymentIntent> = new Map();
  private refunds: Map<string, Refund> = new Map();
  private bankAccounts: Map<string, SavedPaymentMethod[]> = new Map();
  private kycRecords: Map<string, KycVerification> = new Map();

  constructor(config: CircleConfig) {
    this.config = config;
  }

  // ==========================================================================
  // CHECKOUT
  // ==========================================================================

  async createCheckout(request: CreateCheckoutRequest): Promise<CheckoutResult> {
    const sessionId = `circle_cs_${randomUUID().replace(/-/g, "")}`;
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours for bank transfers

    // Calculate fees (ACH: 1% capped at $10, Wire: $25 flat)
    const amountCents = parseInt(request.amount);
    const isWire = request.method === "wire";
    const processingFee = isWire
      ? 2500 // $25 flat
      : Math.min(Math.round(amountCents * 0.01), 1000); // 1% capped at $10
    const platformFee = Math.round(amountCents * 0.025);
    const totalFees = processingFee + platformFee;
    const netAmount = amountCents - totalFees;

    const fees: PaymentFees = {
      processingFee: processingFee.toString(),
      platformFee: platformFee.toString(),
      totalFees: totalFees.toString(),
      netAmount: netAmount.toString(),
    };

    const session: CheckoutSession = {
      id: sessionId,
      campaignId: request.campaignId,
      backerAddress: request.backerAddress,
      provider: "circle",
      method: request.method || "ach",
      currency: request.currency,
      amount: request.amount,
      amountDecimal: (amountCents / 100).toFixed(2),
      fees,
      status: "pending",
      providerSessionId: `circle_pay_${randomUUID().slice(0, 8)}`,
      checkoutUrl: `https://my.circle.com/pay/${sessionId}`,
      metadata: request.metadata || {},
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };

    this.sessions.set(sessionId, session);

    return {
      session,
      checkoutUrl: session.checkoutUrl!,
      expiresAt,
    };
  }

  async getCheckout(sessionId: string): Promise<CheckoutSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw this.createError("processing_error", "Checkout session not found");
    }

    if (session.expiresAt < Date.now() && session.status === "pending") {
      session.status = "cancelled";
      session.updatedAt = Date.now();
    }

    return session;
  }

  async expireCheckout(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session && session.status === "pending") {
      session.status = "cancelled";
      session.updatedAt = Date.now();
    }
  }

  // ==========================================================================
  // PAYMENTS
  // ==========================================================================

  async confirmPayment(paymentIntentId: string): Promise<PaymentIntent> {
    let targetSession: CheckoutSession | undefined;
    for (const session of this.sessions.values()) {
      if (session.providerPaymentIntentId === paymentIntentId) {
        targetSession = session;
        break;
      }
    }

    const newIntent: PaymentIntent = {
      id: `circle_pi_${randomUUID().replace(/-/g, "")}`,
      sessionId: targetSession?.id || "",
      provider: "circle",
      providerIntentId: paymentIntentId,
      amount: targetSession?.amount || "0",
      currency: targetSession?.currency || "USD",
      status: "processing", // ACH takes 3-5 days
      bankName: "Chase Bank",
      accountLast4: "6789",
      requiresAction: false,
      createdAt: Date.now(),
    };

    this.intents.set(paymentIntentId, newIntent);

    if (targetSession) {
      targetSession.status = "processing";
      targetSession.providerPaymentIntentId = paymentIntentId;
      targetSession.updatedAt = Date.now();
    }

    return newIntent;
  }

  async cancelPayment(paymentIntentId: string): Promise<void> {
    const intent = this.intents.get(paymentIntentId);
    if (intent && intent.status === "processing") {
      intent.status = "cancelled";
    }
  }

  // ==========================================================================
  // REFUNDS
  // ==========================================================================

  async createRefund(request: RefundRequest): Promise<Refund> {
    const session = request.sessionId
      ? this.sessions.get(request.sessionId)
      : undefined;

    const refundId = `circle_re_${randomUUID().replace(/-/g, "")}`;
    const now = Date.now();

    const refund: Refund = {
      id: refundId,
      sessionId: request.sessionId || "",
      paymentIntentId: session?.providerPaymentIntentId || "",
      pledgeId: request.pledgeId || "",
      amount: request.amount || session?.amount || "0",
      currency: session?.currency || "USD",
      reason: request.reason,
      description: request.description,
      status: "processing", // ACH refunds take longer
      providerRefundId: `circle_ref_${randomUUID().slice(0, 8)}`,
      escrowRefund: false,
      createdAt: now,
      requestedBy: session?.backerAddress || "",
    };

    this.refunds.set(refundId, refund);
    return refund;
  }

  async getRefund(refundId: string): Promise<Refund> {
    const refund = this.refunds.get(refundId);
    if (!refund) {
      throw this.createError("processing_error", "Refund not found");
    }
    return refund;
  }

  // ==========================================================================
  // SUBSCRIPTIONS (Not supported for ACH)
  // ==========================================================================

  async createSubscription(
    _request: CreateSubscriptionRequest
  ): Promise<Subscription> {
    throw this.createError(
      "processing_error",
      "Subscriptions not supported for bank transfers"
    );
  }

  async cancelSubscription(_subscriptionId: string): Promise<Subscription> {
    throw this.createError("processing_error", "Subscriptions not supported");
  }

  async pauseSubscription(_subscriptionId: string): Promise<Subscription> {
    throw this.createError("processing_error", "Subscriptions not supported");
  }

  async resumeSubscription(_subscriptionId: string): Promise<Subscription> {
    throw this.createError("processing_error", "Subscriptions not supported");
  }

  // ==========================================================================
  // PAYMENT METHODS (Bank Accounts)
  // ==========================================================================

  async savePaymentMethod(
    userAddress: string,
    providerMethodId: string
  ): Promise<SavedPaymentMethod> {
    const methodId = `ba_${randomUUID().replace(/-/g, "")}`;

    const method: SavedPaymentMethod = {
      id: methodId,
      userAddress,
      provider: "circle",
      providerMethodId,
      type: "bank_account",
      bankName: "Chase Bank",
      accountLast4: "6789",
      accountType: "checking",
      isDefault: false,
      createdAt: Date.now(),
    };

    const existing = this.bankAccounts.get(userAddress) || [];
    if (existing.length === 0) {
      method.isDefault = true;
    }
    existing.push(method);
    this.bankAccounts.set(userAddress, existing);

    return method;
  }

  async deletePaymentMethod(methodId: string): Promise<void> {
    for (const [address, methods] of this.bankAccounts.entries()) {
      const filtered = methods.filter((m) => m.id !== methodId);
      if (filtered.length !== methods.length) {
        this.bankAccounts.set(address, filtered);
        return;
      }
    }
  }

  async listPaymentMethods(userAddress: string): Promise<SavedPaymentMethod[]> {
    return this.bankAccounts.get(userAddress) || [];
  }

  // ==========================================================================
  // WEBHOOKS
  // ==========================================================================

  verifyWebhook(payload: string, signature: string): boolean {
    // Circle uses HMAC-SHA256
    if (!signature) return false;
    // In production: verify HMAC signature
    return true;
  }

  parseWebhook(payload: string): PaymentWebhook {
    const data = JSON.parse(payload);
    const now = Date.now();

    const eventMap: Record<string, PaymentWebhook["event"]> = {
      payment_completed: "payment.succeeded",
      payment_failed: "payment.failed",
      payout_completed: "settlement.completed",
      payout_failed: "settlement.failed",
      refund_completed: "refund.succeeded",
      refund_failed: "refund.failed",
    };

    const event = eventMap[data.type] || "payment.succeeded";

    return {
      id: `circle_wh_${randomUUID().replace(/-/g, "")}`,
      event,
      provider: "circle",
      providerEventId: data.id || `evt_${randomUUID().slice(0, 8)}`,
      data: {
        sessionId: data.paymentId,
        paymentIntentId: data.paymentId,
      },
      raw: data,
      createdAt: now,
    };
  }

  // ==========================================================================
  // KYC
  // ==========================================================================

  async initiateKyc(
    request: KycInitRequest
  ): Promise<{ url: string; id: string }> {
    const kycId = `kyc_${randomUUID().replace(/-/g, "")}`;
    const now = Date.now();

    const kyc: KycVerification = {
      id: kycId,
      userAddress: request.userAddress,
      provider: "circle",
      status: "pending",
      level: request.level || "standard",
      dailyLimit: "10000", // $10,000
      monthlyLimit: "50000", // $50,000
      createdAt: now,
    };

    this.kycRecords.set(kycId, kyc);

    return {
      id: kycId,
      url: `https://my.circle.com/verify/${kycId}?return=${encodeURIComponent(
        request.returnUrl
      )}`,
    };
  }

  async getKycStatus(kycId: string): Promise<KycVerification> {
    const kyc = this.kycRecords.get(kycId);
    if (!kyc) {
      throw this.createError("processing_error", "KYC record not found");
    }
    return kyc;
  }

  // ==========================================================================
  // USDC OPERATIONS
  // ==========================================================================

  /**
   * Get USDC balance in Circle wallet
   */
  async getUsdcBalance(): Promise<{ available: string; pending: string }> {
    // In production: call Circle API
    return {
      available: "100000000000", // 100,000 USDC (6 decimals)
      pending: "5000000000", // 5,000 USDC
    };
  }

  /**
   * Transfer USDC to blockchain address
   */
  async transferUsdc(params: {
    amount: string;
    destinationAddress: string;
    chainId: number;
  }): Promise<{ transferId: string; txHash?: string }> {
    const transferId = `transfer_${randomUUID().replace(/-/g, "")}`;

    // In production: Circle Cross-Chain Transfer Protocol (CCTP)
    // await circle.transfers.create({
    //   idempotencyKey: transferId,
    //   destination: { type: 'blockchain', address: params.destinationAddress, chain: 'ETH' },
    //   amount: { amount: params.amount, currency: 'USD' }
    // })

    return {
      transferId,
      txHash: `0x${randomUUID().replace(/-/g, "")}`,
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private createError(code: PaymentErrorCode, message: string): PaymentError {
    return {
      code,
      message,
      provider: "circle",
      retryable: code === "processing_error",
    };
  }

  // Simulate ACH completion (for testing)
  async simulateAchCompletion(sessionId: string): Promise<CheckoutSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw this.createError("processing_error", "Session not found");
    }

    session.status = "succeeded";
    session.updatedAt = Date.now();

    // Update associated intent
    if (session.providerPaymentIntentId) {
      const intent = this.intents.get(session.providerPaymentIntentId);
      if (intent) {
        intent.status = "succeeded";
        intent.confirmedAt = Date.now();
      }
    }

    return session;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createCircleProvider(config: CircleConfig): CircleProvider {
  return new CircleProvider(config);
}
