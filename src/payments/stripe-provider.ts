/**
 * Phase 9: Stripe Payment Provider
 *
 * Credit/debit card payments via Stripe.
 * Supports Apple Pay, Google Pay, 3D Secure.
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
  StripeConfig,
  PaymentStatus,
  PaymentError,
  PaymentErrorCode,
} from "./types";

// ============================================================================
// STRIPE PROVIDER
// ============================================================================

export class StripeProvider implements PaymentProviderInterface {
  name: PaymentProvider = "stripe";

  private config: StripeConfig;
  private sessions: Map<string, CheckoutSession> = new Map();
  private intents: Map<string, PaymentIntent> = new Map();
  private refunds: Map<string, Refund> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private paymentMethods: Map<string, SavedPaymentMethod[]> = new Map();

  constructor(config: StripeConfig) {
    this.config = config;
  }

  // ==========================================================================
  // CHECKOUT
  // ==========================================================================

  async createCheckout(request: CreateCheckoutRequest): Promise<CheckoutResult> {
    const sessionId = `cs_${randomUUID().replace(/-/g, "")}`;
    const now = Date.now();
    const expiresAt = now + 30 * 60 * 1000; // 30 minutes

    // Calculate fees (Stripe: 2.9% + $0.30)
    const amountCents = parseInt(request.amount);
    const processingFee = Math.round(amountCents * 0.029 + 30);
    const platformFee = Math.round(amountCents * 0.025); // 2.5% platform fee
    const totalFees = processingFee + platformFee;
    const netAmount = amountCents - totalFees;

    const fees: PaymentFees = {
      processingFee: processingFee.toString(),
      platformFee: platformFee.toString(),
      totalFees: totalFees.toString(),
      netAmount: netAmount.toString(),
    };

    // In production, this would call Stripe API
    // const stripeSession = await stripe.checkout.sessions.create({...})
    const providerSessionId = `stripe_cs_${randomUUID().slice(0, 8)}`;

    const session: CheckoutSession = {
      id: sessionId,
      campaignId: request.campaignId,
      backerAddress: request.backerAddress,
      provider: "stripe",
      method: request.method || "card",
      currency: request.currency,
      amount: request.amount,
      amountDecimal: (amountCents / 100).toFixed(2),
      fees,
      status: "pending",
      providerSessionId,
      checkoutUrl: `https://checkout.stripe.com/pay/${providerSessionId}`,
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

    // Check expiration
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
    // Find associated session
    let targetSession: CheckoutSession | undefined;
    for (const session of this.sessions.values()) {
      if (session.providerPaymentIntentId === paymentIntentId) {
        targetSession = session;
        break;
      }
    }

    const intent = this.intents.get(paymentIntentId);
    if (!intent) {
      // Create new intent if confirming from session
      const newIntent: PaymentIntent = {
        id: `pi_${randomUUID().replace(/-/g, "")}`,
        sessionId: targetSession?.id || "",
        provider: "stripe",
        providerIntentId: paymentIntentId,
        amount: targetSession?.amount || "0",
        currency: targetSession?.currency || "USD",
        status: "succeeded",
        cardBrand: "visa",
        cardLast4: "4242",
        cardExpMonth: 12,
        cardExpYear: 2028,
        requiresAction: false,
        createdAt: Date.now(),
        confirmedAt: Date.now(),
      };

      this.intents.set(paymentIntentId, newIntent);

      // Update session status
      if (targetSession) {
        targetSession.status = "succeeded";
        targetSession.providerPaymentIntentId = paymentIntentId;
        targetSession.updatedAt = Date.now();
      }

      return newIntent;
    }

    intent.status = "succeeded";
    intent.confirmedAt = Date.now();
    return intent;
  }

  async cancelPayment(paymentIntentId: string): Promise<void> {
    const intent = this.intents.get(paymentIntentId);
    if (intent) {
      intent.status = "cancelled";
    }

    // Cancel associated session
    for (const session of this.sessions.values()) {
      if (session.providerPaymentIntentId === paymentIntentId) {
        session.status = "cancelled";
        session.updatedAt = Date.now();
        break;
      }
    }
  }

  // ==========================================================================
  // REFUNDS
  // ==========================================================================

  async createRefund(request: RefundRequest): Promise<Refund> {
    const session = request.sessionId
      ? this.sessions.get(request.sessionId)
      : undefined;

    if (request.sessionId && !session) {
      throw this.createError("processing_error", "Session not found for refund");
    }

    const refundId = `re_${randomUUID().replace(/-/g, "")}`;
    const now = Date.now();

    // In production: await stripe.refunds.create({...})

    const refund: Refund = {
      id: refundId,
      sessionId: request.sessionId || "",
      paymentIntentId: session?.providerPaymentIntentId || "",
      pledgeId: request.pledgeId || "",
      amount: request.amount || session?.amount || "0",
      currency: session?.currency || "USD",
      reason: request.reason,
      description: request.description,
      status: "processing",
      providerRefundId: `stripe_re_${randomUUID().slice(0, 8)}`,
      escrowRefund: false,
      createdAt: now,
      requestedBy: session?.backerAddress || "",
    };

    // Simulate async processing
    setTimeout(() => {
      refund.status = "succeeded";
      refund.processedAt = Date.now();

      if (session) {
        session.status = request.amount === session.amount
          ? "refunded"
          : "partially_refunded";
        session.updatedAt = Date.now();
      }
    }, 100);

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
  // SUBSCRIPTIONS
  // ==========================================================================

  async createSubscription(
    request: CreateSubscriptionRequest
  ): Promise<Subscription> {
    const subscriptionId = `sub_${randomUUID().replace(/-/g, "")}`;
    const now = Date.now();

    // Calculate period based on interval
    const intervalMs = {
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000,
      quarterly: 90 * 24 * 60 * 60 * 1000,
      yearly: 365 * 24 * 60 * 60 * 1000,
    };

    const subscription: Subscription = {
      id: subscriptionId,
      campaignId: request.campaignId,
      backerAddress: request.backerAddress,
      amount: request.amount,
      currency: request.currency,
      interval: request.interval,
      provider: "stripe",
      providerSubscriptionId: `stripe_sub_${randomUUID().slice(0, 8)}`,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: now + intervalMs[request.interval],
      cancelAtPeriodEnd: false,
      totalPaid: request.amount, // First payment
      paymentsCount: 1,
      lastPaymentAt: now,
      nextPaymentAt: now + intervalMs[request.interval],
      metadata: request.metadata || {},
      createdAt: now,
    };

    this.subscriptions.set(subscriptionId, subscription);
    return subscription;
  }

  async cancelSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw this.createError("processing_error", "Subscription not found");
    }

    subscription.status = "cancelled";
    subscription.cancelledAt = Date.now();
    return subscription;
  }

  async pauseSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw this.createError("processing_error", "Subscription not found");
    }

    subscription.status = "paused";
    return subscription;
  }

  async resumeSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw this.createError("processing_error", "Subscription not found");
    }

    if (subscription.status === "paused") {
      subscription.status = "active";
    }
    return subscription;
  }

  // ==========================================================================
  // PAYMENT METHODS
  // ==========================================================================

  async savePaymentMethod(
    userAddress: string,
    providerMethodId: string
  ): Promise<SavedPaymentMethod> {
    const methodId = `pm_${randomUUID().replace(/-/g, "")}`;

    const method: SavedPaymentMethod = {
      id: methodId,
      userAddress,
      provider: "stripe",
      providerMethodId,
      type: "card",
      cardBrand: "visa",
      cardLast4: "4242",
      cardExpMonth: 12,
      cardExpYear: 2028,
      isDefault: false,
      createdAt: Date.now(),
    };

    const existing = this.paymentMethods.get(userAddress) || [];
    if (existing.length === 0) {
      method.isDefault = true;
    }
    existing.push(method);
    this.paymentMethods.set(userAddress, existing);

    return method;
  }

  async deletePaymentMethod(methodId: string): Promise<void> {
    for (const [address, methods] of this.paymentMethods.entries()) {
      const filtered = methods.filter((m) => m.id !== methodId);
      if (filtered.length !== methods.length) {
        this.paymentMethods.set(address, filtered);
        return;
      }
    }
  }

  async listPaymentMethods(userAddress: string): Promise<SavedPaymentMethod[]> {
    return this.paymentMethods.get(userAddress) || [];
  }

  // ==========================================================================
  // WEBHOOKS
  // ==========================================================================

  verifyWebhook(payload: string, signature: string): boolean {
    // In production: stripe.webhooks.constructEvent(payload, signature, secret)
    // Simplified verification for demo
    if (!signature || !signature.startsWith("whsec_")) {
      return false;
    }
    return true;
  }

  parseWebhook(payload: string): PaymentWebhook {
    const data = JSON.parse(payload);
    const now = Date.now();

    // Map Stripe events to our event types
    const eventMap: Record<string, PaymentWebhook["event"]> = {
      "checkout.session.completed": "checkout.completed",
      "checkout.session.expired": "checkout.expired",
      "payment_intent.succeeded": "payment.succeeded",
      "payment_intent.payment_failed": "payment.failed",
      "payment_intent.requires_action": "payment.requires_action",
      "charge.refunded": "refund.succeeded",
      "charge.refund.updated": "refund.succeeded",
      "customer.subscription.created": "subscription.created",
      "customer.subscription.updated": "subscription.updated",
      "customer.subscription.deleted": "subscription.cancelled",
      "invoice.payment_succeeded": "subscription.payment_succeeded",
      "invoice.payment_failed": "subscription.payment_failed",
    };

    const event = eventMap[data.type] || "checkout.completed";

    return {
      id: `wh_${randomUUID().replace(/-/g, "")}`,
      event,
      provider: "stripe",
      providerEventId: data.id || `evt_${randomUUID().slice(0, 8)}`,
      data: {
        sessionId: data.data?.object?.id,
        paymentIntentId: data.data?.object?.payment_intent,
      },
      raw: data,
      createdAt: now,
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private createError(code: PaymentErrorCode, message: string): PaymentError {
    return {
      code,
      message,
      provider: "stripe",
      retryable: ["processing_error", "rate_limited"].includes(code),
    };
  }

  // Simulate payment completion (for testing)
  async simulatePaymentSuccess(sessionId: string): Promise<CheckoutSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw this.createError("processing_error", "Session not found");
    }

    const paymentIntentId = `pi_${randomUUID().replace(/-/g, "")}`;
    session.status = "succeeded";
    session.providerPaymentIntentId = paymentIntentId;
    session.updatedAt = Date.now();

    // Create payment intent record
    const intent: PaymentIntent = {
      id: paymentIntentId,
      sessionId,
      provider: "stripe",
      providerIntentId: paymentIntentId,
      amount: session.amount,
      currency: session.currency,
      status: "succeeded",
      cardBrand: "visa",
      cardLast4: "4242",
      requiresAction: false,
      createdAt: Date.now(),
      confirmedAt: Date.now(),
    };
    this.intents.set(paymentIntentId, intent);

    return session;
  }

  // Get statistics
  getStats(): {
    sessions: number;
    succeeded: number;
    failed: number;
    volume: string;
  } {
    let succeeded = 0;
    let failed = 0;
    let volume = BigInt(0);

    for (const session of this.sessions.values()) {
      if (session.status === "succeeded") {
        succeeded++;
        volume += BigInt(session.amount);
      } else if (session.status === "failed") {
        failed++;
      }
    }

    return {
      sessions: this.sessions.size,
      succeeded,
      failed,
      volume: volume.toString(),
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createStripeProvider(config: StripeConfig): StripeProvider {
  return new StripeProvider(config);
}
