/**
 * Phase 9: Circle Payment Provider
 *
 * ACH bank transfers, wire transfers, and USDC settlement.
 * Uses Circle's REST API directly (no SDK dependency).
 */

import { randomUUID, createHmac } from "crypto";
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
// CIRCLE API CLIENT
// ============================================================================

class CircleApiClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = "https://api.circle.com/v1") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Circle API error ${response.status}: ${errorBody}`);
    }

    const json = await response.json() as { data: T };
    return json.data;
  }
}

// ============================================================================
// CIRCLE PROVIDER
// ============================================================================

export class CircleProvider implements PaymentProviderInterface {
  name: PaymentProvider = "circle";

  private config: CircleConfig;
  private api: CircleApiClient;

  // Local index for mapping session IDs to Circle payment IDs
  private sessionIndex: Map<string, { circlePaymentId: string; session: CheckoutSession }> =
    new Map();

  constructor(config: CircleConfig) {
    this.config = config;
    this.api = new CircleApiClient(config.apiKey);
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
      ? 2500
      : Math.min(Math.round(amountCents * 0.01), 1000);
    const platformFee = Math.round(amountCents * 0.025);
    const totalFees = processingFee + platformFee;
    const netAmount = amountCents - totalFees;

    const fees: PaymentFees = {
      processingFee: processingFee.toString(),
      platformFee: platformFee.toString(),
      totalFees: totalFees.toString(),
      netAmount: netAmount.toString(),
    };

    // Create a real Circle payment intent
    const amountUsd = (amountCents / 100).toFixed(2);
    const idempotencyKey = randomUUID();

    const circlePayment = await this.api.request<{
      id: string;
      status: string;
      redirectUrl?: string;
    }>("POST", "/payments", {
      idempotencyKey,
      amount: { amount: amountUsd, currency: "USD" },
      source: { type: isWire ? "wire" : "ach" },
      metadata: {
        campaignId: request.campaignId,
        backerAddress: request.backerAddress,
        internalSessionId: sessionId,
      },
    });

    const session: CheckoutSession = {
      id: sessionId,
      campaignId: request.campaignId,
      backerAddress: request.backerAddress,
      provider: "circle",
      method: request.method || "ach",
      currency: request.currency,
      amount: request.amount,
      amountDecimal: amountUsd,
      fees,
      status: "pending",
      providerSessionId: circlePayment.id,
      checkoutUrl: circlePayment.redirectUrl,
      metadata: request.metadata || {},
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };

    this.sessionIndex.set(sessionId, {
      circlePaymentId: circlePayment.id,
      session,
    });

    return {
      session,
      checkoutUrl: circlePayment.redirectUrl || "",
      expiresAt,
    };
  }

  async getCheckout(sessionId: string): Promise<CheckoutSession> {
    const entry = this.sessionIndex.get(sessionId);
    if (!entry) {
      throw this.createError("processing_error", "Checkout session not found");
    }

    // Fetch latest status from Circle
    const circlePayment = await this.api.request<{
      id: string;
      status: string;
    }>("GET", `/payments/${entry.circlePaymentId}`);

    entry.session.status = this.mapCircleStatus(circlePayment.status);
    entry.session.updatedAt = Date.now();

    return entry.session;
  }

  async expireCheckout(sessionId: string): Promise<void> {
    const entry = this.sessionIndex.get(sessionId);
    if (!entry) return;

    // Circle payments auto-expire; just cancel on our side
    await this.api.request("POST", `/payments/${entry.circlePaymentId}/cancel`, {});
    entry.session.status = "cancelled";
    entry.session.updatedAt = Date.now();
  }

  // ==========================================================================
  // PAYMENTS
  // ==========================================================================

  async confirmPayment(paymentIntentId: string): Promise<PaymentIntent> {
    // Fetch payment status from Circle
    const circlePayment = await this.api.request<{
      id: string;
      status: string;
      amount: { amount: string; currency: string };
      sourceDetails?: { bankName?: string; last4?: string };
    }>("GET", `/payments/${paymentIntentId}`);

    const intent: PaymentIntent = {
      id: `circle_pi_${randomUUID().replace(/-/g, "")}`,
      sessionId: "",
      provider: "circle",
      providerIntentId: paymentIntentId,
      amount: Math.round(parseFloat(circlePayment.amount.amount) * 100).toString(),
      currency: circlePayment.amount.currency as any,
      status: this.mapCircleStatus(circlePayment.status),
      bankName: circlePayment.sourceDetails?.bankName,
      accountLast4: circlePayment.sourceDetails?.last4,
      requiresAction: false,
      createdAt: Date.now(),
    };

    return intent;
  }

  async cancelPayment(paymentIntentId: string): Promise<void> {
    await this.api.request("POST", `/payments/${paymentIntentId}/cancel`, {});
  }

  // ==========================================================================
  // REFUNDS
  // ==========================================================================

  async createRefund(request: RefundRequest): Promise<Refund> {
    let circlePaymentId: string | undefined;
    let session: CheckoutSession | undefined;

    if (request.sessionId) {
      const entry = this.sessionIndex.get(request.sessionId);
      if (!entry) {
        throw this.createError("processing_error", "Session not found for refund");
      }
      session = entry.session;
      circlePaymentId = entry.circlePaymentId;
    }

    if (!circlePaymentId) {
      throw this.createError("processing_error", "No Circle payment to refund");
    }

    const amountCents = parseInt(request.amount || session?.amount || "0");
    const amountUsd = (amountCents / 100).toFixed(2);

    const circleRefund = await this.api.request<{
      id: string;
      status: string;
      amount: { amount: string; currency: string };
    }>("POST", `/payments/${circlePaymentId}/refund`, {
      idempotencyKey: randomUUID(),
      amount: { amount: amountUsd, currency: "USD" },
      reason: request.reason,
    });

    const refund: Refund = {
      id: `circle_re_${randomUUID().replace(/-/g, "")}`,
      sessionId: request.sessionId || "",
      paymentIntentId: circlePaymentId,
      pledgeId: request.pledgeId || "",
      amount: amountCents.toString(),
      currency: session?.currency || "USD",
      reason: request.reason,
      description: request.description,
      status: "processing", // ACH refunds are asynchronous
      providerRefundId: circleRefund.id,
      escrowRefund: false,
      createdAt: Date.now(),
      requestedBy: session?.backerAddress || "",
    };

    return refund;
  }

  async getRefund(refundId: string): Promise<Refund> {
    throw this.createError(
      "processing_error",
      "Use webhook events to track refund status"
    );
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
    // Fetch bank account details from Circle
    const bankAccount = await this.api.request<{
      id: string;
      bankName?: string;
      last4?: string;
      accountType?: string;
    }>("GET", `/banks/wires/${providerMethodId}`);

    const method: SavedPaymentMethod = {
      id: `ba_${randomUUID().replace(/-/g, "")}`,
      userAddress,
      provider: "circle",
      providerMethodId,
      type: "bank_account",
      bankName: bankAccount.bankName,
      accountLast4: bankAccount.last4,
      accountType: (bankAccount.accountType as "checking" | "savings") || "checking",
      isDefault: false,
      createdAt: Date.now(),
    };

    return method;
  }

  async deletePaymentMethod(methodId: string): Promise<void> {
    // Circle doesn't support deleting bank accounts via API
    // Remove from local tracking only
  }

  async listPaymentMethods(userAddress: string): Promise<SavedPaymentMethod[]> {
    // Would require mapping userAddress to Circle customer ID
    return [];
  }

  // ==========================================================================
  // WEBHOOKS
  // ==========================================================================

  verifyWebhook(payload: string, signature: string): boolean {
    if (!signature || !this.config.webhookSecret) return false;

    // Circle uses HMAC-SHA256 for webhook verification
    const expectedSignature = createHmac("sha256", this.config.webhookSecret)
      .update(payload)
      .digest("hex");

    // Constant-time comparison
    if (signature.length !== expectedSignature.length) return false;
    let mismatch = 0;
    for (let i = 0; i < signature.length; i++) {
      mismatch |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    return mismatch === 0;
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
        sessionId: data.payment?.metadata?.internalSessionId,
        paymentIntentId: data.payment?.id,
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
    // Note: KYC is typically handled through Circle's hosted flow
    // For now, flag that this requires the Circle identity verification service
    throw this.createError(
      "kyc_required",
      "KYC verification requires Circle Identity Verification API integration"
    );
  }

  async getKycStatus(kycId: string): Promise<KycVerification> {
    throw this.createError(
      "processing_error",
      "KYC status requires Circle Identity Verification API integration"
    );
  }

  // ==========================================================================
  // USDC OPERATIONS
  // ==========================================================================

  /**
   * Get USDC balance in Circle wallet
   */
  async getUsdcBalance(): Promise<{ available: string; pending: string }> {
    const balances = await this.api.request<{
      available: Array<{ amount: string; currency: string }>;
      unsettled: Array<{ amount: string; currency: string }>;
    }>("GET", "/balances");

    const usdcAvailable = balances.available.find((b) => b.currency === "USD");
    const usdcPending = balances.unsettled.find((b) => b.currency === "USD");

    // Convert to smallest unit (6 decimals for USDC)
    const availableUsdc = Math.floor(
      parseFloat(usdcAvailable?.amount || "0") * 1_000_000
    ).toString();
    const pendingUsdc = Math.floor(
      parseFloat(usdcPending?.amount || "0") * 1_000_000
    ).toString();

    return {
      available: availableUsdc,
      pending: pendingUsdc,
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
    const chain = this.mapChainIdToCircleChain(params.chainId);
    const amountUsdc = (parseInt(params.amount) / 1_000_000).toFixed(2);

    const transfer = await this.api.request<{
      id: string;
      transactionHash?: string;
    }>("POST", "/transfers", {
      idempotencyKey: randomUUID(),
      destination: {
        type: "blockchain",
        address: params.destinationAddress,
        chain,
      },
      amount: { amount: amountUsdc, currency: "USD" },
    });

    return {
      transferId: transfer.id,
      txHash: transfer.transactionHash,
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private mapCircleStatus(status: string): import("./types").PaymentStatus {
    switch (status) {
      case "confirmed":
      case "complete":
      case "paid":
        return "succeeded";
      case "failed":
        return "failed";
      case "action_required":
        return "requires_action";
      case "pending":
      default:
        return "processing";
    }
  }

  private mapChainIdToCircleChain(chainId: number): string {
    switch (chainId) {
      case 1:
        return "ETH";
      case 137:
        return "MATIC";
      case 43114:
        return "AVAX";
      case 42161:
        return "ARB";
      case 10:
        return "OP";
      case 8453:
        return "BASE";
      case 101: // Solana
        return "SOL";
      default:
        return "ETH";
    }
  }

  private createError(code: PaymentErrorCode, message: string): PaymentError {
    return {
      code,
      message,
      provider: "circle",
      retryable: code === "processing_error",
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createCircleProvider(config: CircleConfig): CircleProvider {
  return new CircleProvider(config);
}
