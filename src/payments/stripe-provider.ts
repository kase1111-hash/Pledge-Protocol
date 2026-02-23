/**
 * Phase 9: Stripe Payment Provider
 *
 * Credit/debit card payments via Stripe.
 * Supports Apple Pay, Google Pay, 3D Secure.
 */

import Stripe from "stripe";
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
  private stripe: Stripe;

  // Local index for mapping our session IDs to Stripe session IDs
  private sessionIndex: Map<string, { stripeSessionId: string; session: CheckoutSession }> =
    new Map();

  constructor(config: StripeConfig) {
    this.config = config;
    this.stripe = new Stripe(config.secretKey);
  }

  // ==========================================================================
  // CHECKOUT
  // ==========================================================================

  async createCheckout(request: CreateCheckoutRequest): Promise<CheckoutResult> {
    const sessionId = `cs_${randomUUID().replace(/-/g, "")}`;
    const now = Date.now();
    const amountCents = parseInt(request.amount);

    // Calculate fees (Stripe: 2.9% + $0.30)
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

    // Create a real Stripe Checkout Session
    const stripeSession = await this.stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: this.getPaymentMethodTypes(request.method),
      line_items: [
        {
          price_data: {
            currency: request.currency.toLowerCase(),
            product_data: {
              name: `Pledge to campaign ${request.campaignId}`,
              metadata: {
                campaignId: request.campaignId,
                backerAddress: request.backerAddress,
                internalSessionId: sessionId,
              },
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        campaignId: request.campaignId,
        backerAddress: request.backerAddress,
        internalSessionId: sessionId,
        ...request.metadata,
      },
      success_url: request.returnUrl,
      cancel_url: request.cancelUrl || request.returnUrl,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 minutes
    });

    const expiresAt = now + 30 * 60 * 1000;

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
      providerSessionId: stripeSession.id,
      checkoutUrl: stripeSession.url || undefined,
      metadata: request.metadata || {},
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };

    this.sessionIndex.set(sessionId, {
      stripeSessionId: stripeSession.id,
      session,
    });

    return {
      session,
      checkoutUrl: stripeSession.url!,
      expiresAt,
    };
  }

  async getCheckout(sessionId: string): Promise<CheckoutSession> {
    const entry = this.sessionIndex.get(sessionId);
    if (!entry) {
      throw this.createError("processing_error", "Checkout session not found");
    }

    // Fetch latest status from Stripe
    const stripeSession = await this.stripe.checkout.sessions.retrieve(entry.stripeSessionId);
    entry.session.status = this.mapStripeSessionStatus(stripeSession.status);
    entry.session.updatedAt = Date.now();

    if (stripeSession.payment_intent && typeof stripeSession.payment_intent === "string") {
      entry.session.providerPaymentIntentId = stripeSession.payment_intent;
    }

    return entry.session;
  }

  async expireCheckout(sessionId: string): Promise<void> {
    const entry = this.sessionIndex.get(sessionId);
    if (!entry) return;

    await this.stripe.checkout.sessions.expire(entry.stripeSessionId);
    entry.session.status = "cancelled";
    entry.session.updatedAt = Date.now();
  }

  // ==========================================================================
  // PAYMENTS
  // ==========================================================================

  async confirmPayment(paymentIntentId: string): Promise<PaymentIntent> {
    const stripeIntent = await this.stripe.paymentIntents.confirm(paymentIntentId);
    return this.mapStripePaymentIntent(stripeIntent);
  }

  async cancelPayment(paymentIntentId: string): Promise<void> {
    await this.stripe.paymentIntents.cancel(paymentIntentId);

    // Update any associated session
    for (const entry of this.sessionIndex.values()) {
      if (entry.session.providerPaymentIntentId === paymentIntentId) {
        entry.session.status = "cancelled";
        entry.session.updatedAt = Date.now();
        break;
      }
    }
  }

  // ==========================================================================
  // REFUNDS
  // ==========================================================================

  async createRefund(request: RefundRequest): Promise<Refund> {
    let paymentIntentId: string | undefined;
    let session: CheckoutSession | undefined;

    if (request.sessionId) {
      const entry = this.sessionIndex.get(request.sessionId);
      if (!entry) {
        throw this.createError("processing_error", "Session not found for refund");
      }
      session = entry.session;
      paymentIntentId = session.providerPaymentIntentId;
    }

    if (!paymentIntentId) {
      throw this.createError("processing_error", "No payment intent to refund");
    }

    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: paymentIntentId,
      reason: this.mapRefundReason(request.reason),
    };

    if (request.amount) {
      refundParams.amount = parseInt(request.amount);
    }

    const stripeRefund = await this.stripe.refunds.create(refundParams);

    const refund: Refund = {
      id: `re_${randomUUID().replace(/-/g, "")}`,
      sessionId: request.sessionId || "",
      paymentIntentId: paymentIntentId,
      pledgeId: request.pledgeId || "",
      amount: (stripeRefund.amount ?? 0).toString(),
      currency: (stripeRefund.currency ?? "usd").toUpperCase() as any,
      reason: request.reason,
      description: request.description,
      status: stripeRefund.status === "succeeded" ? "succeeded" : "processing",
      providerRefundId: stripeRefund.id,
      escrowRefund: false,
      createdAt: Date.now(),
      requestedBy: session?.backerAddress || "",
    };

    if (session) {
      const isFullRefund = !request.amount || request.amount === session.amount;
      session.status = isFullRefund ? "refunded" : "partially_refunded";
      session.updatedAt = Date.now();
    }

    return refund;
  }

  async getRefund(refundId: string): Promise<Refund> {
    throw this.createError(
      "processing_error",
      "Use webhook events to track refund status"
    );
  }

  // ==========================================================================
  // SUBSCRIPTIONS
  // ==========================================================================

  async createSubscription(
    request: CreateSubscriptionRequest
  ): Promise<Subscription> {
    // Create or retrieve Stripe customer
    const customer = await this.stripe.customers.create({
      metadata: {
        backerAddress: request.backerAddress,
        campaignId: request.campaignId,
      },
    });

    // Create a price for this subscription
    const price = await this.stripe.prices.create({
      currency: request.currency.toLowerCase(),
      unit_amount: parseInt(request.amount),
      recurring: {
        interval: this.mapSubscriptionInterval(request.interval),
        interval_count: request.interval === "quarterly" ? 3 : 1,
      },
      product_data: {
        name: `Recurring pledge to campaign ${request.campaignId}`,
        metadata: {
          campaignId: request.campaignId,
          backerAddress: request.backerAddress,
        },
      },
    });

    const stripeSubscription = await this.stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price.id }],
      metadata: {
        campaignId: request.campaignId,
        backerAddress: request.backerAddress,
        ...request.metadata,
      },
    });

    const now = Date.now();
    // Access subscription item period data (Stripe API v2023+)
    const firstItem = stripeSubscription.items?.data?.[0];
    const periodStart = firstItem?.current_period_start ?? Math.floor(now / 1000);
    const periodEnd = firstItem?.current_period_end ?? Math.floor(now / 1000) + 30 * 86400;

    const subscription: Subscription = {
      id: `sub_${randomUUID().replace(/-/g, "")}`,
      campaignId: request.campaignId,
      backerAddress: request.backerAddress,
      amount: request.amount,
      currency: request.currency,
      interval: request.interval,
      provider: "stripe",
      providerSubscriptionId: stripeSubscription.id,
      status: "active",
      currentPeriodStart: periodStart * 1000,
      currentPeriodEnd: periodEnd * 1000,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      totalPaid: request.amount,
      paymentsCount: 1,
      lastPaymentAt: now,
      nextPaymentAt: periodEnd * 1000,
      metadata: request.metadata || {},
      createdAt: now,
    };

    return subscription;
  }

  async cancelSubscription(subscriptionId: string): Promise<Subscription> {
    throw this.createError(
      "processing_error",
      "Cancel via provider subscription ID using webhook handler"
    );
  }

  async pauseSubscription(subscriptionId: string): Promise<Subscription> {
    throw this.createError(
      "processing_error",
      "Pause via provider subscription ID using webhook handler"
    );
  }

  async resumeSubscription(subscriptionId: string): Promise<Subscription> {
    throw this.createError(
      "processing_error",
      "Resume via provider subscription ID using webhook handler"
    );
  }

  // ==========================================================================
  // PAYMENT METHODS
  // ==========================================================================

  async savePaymentMethod(
    userAddress: string,
    providerMethodId: string
  ): Promise<SavedPaymentMethod> {
    const stripeMethod = await this.stripe.paymentMethods.retrieve(providerMethodId);

    const method: SavedPaymentMethod = {
      id: `pm_${randomUUID().replace(/-/g, "")}`,
      userAddress,
      provider: "stripe",
      providerMethodId,
      type: stripeMethod.type === "card" ? "card" : "bank_account",
      cardBrand: stripeMethod.card?.brand,
      cardLast4: stripeMethod.card?.last4,
      cardExpMonth: stripeMethod.card?.exp_month,
      cardExpYear: stripeMethod.card?.exp_year,
      isDefault: false,
      createdAt: Date.now(),
    };

    return method;
  }

  async deletePaymentMethod(methodId: string): Promise<void> {
    await this.stripe.paymentMethods.detach(methodId);
  }

  async listPaymentMethods(userAddress: string): Promise<SavedPaymentMethod[]> {
    // Requires a Stripe customer ID — look up by userAddress in production
    return [];
  }

  // ==========================================================================
  // WEBHOOKS
  // ==========================================================================

  verifyWebhook(payload: string, signature: string): boolean {
    try {
      this.stripe.webhooks.constructEvent(payload, signature, this.config.webhookSecret);
      return true;
    } catch {
      return false;
    }
  }

  parseWebhook(payload: string): PaymentWebhook {
    const data = JSON.parse(payload);
    const now = Date.now();

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
        sessionId: data.data?.object?.metadata?.internalSessionId,
        paymentIntentId: data.data?.object?.payment_intent,
      },
      raw: data,
      createdAt: now,
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private getPaymentMethodTypes(
    method?: string
  ): Stripe.Checkout.SessionCreateParams.PaymentMethodType[] {
    switch (method) {
      case "apple_pay":
      case "google_pay":
      case "card":
        return ["card"];
      default:
        return ["card"];
    }
  }

  private mapStripeSessionStatus(
    status: Stripe.Checkout.Session.Status | null
  ): PaymentStatus {
    switch (status) {
      case "complete":
        return "succeeded";
      case "expired":
        return "cancelled";
      case "open":
      default:
        return "pending";
    }
  }

  private mapStripePaymentIntent(intent: Stripe.PaymentIntent): PaymentIntent {
    const statusMap: Record<string, PaymentStatus> = {
      succeeded: "succeeded",
      canceled: "cancelled",
      processing: "processing",
      requires_action: "requires_action",
      requires_payment_method: "pending",
      requires_confirmation: "pending",
      requires_capture: "processing",
    };

    return {
      id: intent.id,
      sessionId: (intent.metadata?.internalSessionId) || "",
      provider: "stripe",
      providerIntentId: intent.id,
      amount: intent.amount.toString(),
      currency: intent.currency.toUpperCase() as any,
      status: statusMap[intent.status] || "pending",
      requiresAction: intent.status === "requires_action",
      actionUrl: intent.next_action?.redirect_to_url?.url || undefined,
      createdAt: intent.created * 1000,
      confirmedAt: intent.status === "succeeded" ? Date.now() : undefined,
    };
  }

  private mapRefundReason(
    reason: string
  ): Stripe.RefundCreateParams.Reason | undefined {
    switch (reason) {
      case "duplicate":
        return "duplicate";
      case "fraudulent":
        return "fraudulent";
      case "requested_by_customer":
        return "requested_by_customer";
      default:
        return undefined;
    }
  }

  private mapSubscriptionInterval(
    interval: string
  ): Stripe.PriceCreateParams.Recurring.Interval {
    switch (interval) {
      case "weekly":
        return "week";
      case "monthly":
      case "quarterly":
        return "month";
      case "yearly":
        return "year";
      default:
        return "month";
    }
  }

  private createError(code: PaymentErrorCode, message: string): PaymentError {
    return {
      code,
      message,
      provider: "stripe",
      retryable: ["processing_error", "rate_limited"].includes(code),
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createStripeProvider(config: StripeConfig): StripeProvider {
  return new StripeProvider(config);
}
