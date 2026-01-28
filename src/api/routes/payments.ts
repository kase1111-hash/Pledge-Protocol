/**
 * Phase 9: Payment API Routes
 *
 * Fiat payment integration endpoints.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  PaymentProcessor,
  createPaymentProcessor,
  DEFAULT_PAYMENT_CONFIG,
} from "../../payments";

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const CheckoutSchema = z.object({
  campaignId: z.string().min(1),
  backerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  amount: z.number().positive(),
  currency: z.enum(["USD", "EUR", "GBP"]).default("USD"),
  method: z.enum(["card", "ach", "wire", "apple_pay", "google_pay"]).optional(),
  provider: z.enum(["stripe", "circle", "moonpay"]).optional(),
  returnUrl: z.string().url(),
  cancelUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
});

const RefundSchema = z.object({
  sessionId: z.string().optional(),
  pledgeId: z.string().optional(),
  amount: z.number().positive().optional(),
  reason: z.enum(["campaign_cancelled", "milestone_failed", "backer_request", "duplicate", "fraudulent", "other"]),
  description: z.string().max(500).optional(),
});

const SubscriptionSchema = z.object({
  campaignId: z.string().min(1),
  backerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  amount: z.number().positive(),
  currency: z.enum(["USD", "EUR", "GBP"]).default("USD"),
  interval: z.enum(["daily", "weekly", "monthly", "yearly"]),
  metadata: z.record(z.any()).optional(),
});

const KycSchema = z.object({
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  provider: z.enum(["persona", "jumio", "sumsub"]).optional(),
  level: z.enum(["basic", "standard", "enhanced"]).optional(),
  returnUrl: z.string().url(),
});

// Helper for standardized error responses
function errorResponse(code: string, message: string, details?: object | unknown[]) {
  const response: { error: { code: string; message: string; details?: object | unknown[] } } = {
    error: {
      code,
      message,
    },
  };
  if (details) {
    response.error.details = details;
  }
  return response;
}

// Initialize payment processor
// SECURITY: Require payment credentials in production - no fallback test keys
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`${key} environment variable is required in production`);
  }
  return value || "";
}

const paymentProcessor = createPaymentProcessor({
  ...DEFAULT_PAYMENT_CONFIG,
  stripe: {
    secretKey: getRequiredEnv("STRIPE_SECRET_KEY"),
    publishableKey: getRequiredEnv("STRIPE_PUBLISHABLE_KEY"),
    webhookSecret: getRequiredEnv("STRIPE_WEBHOOK_SECRET"),
  },
  circle: {
    apiKey: getRequiredEnv("CIRCLE_API_KEY"),
    entityId: getRequiredEnv("CIRCLE_ENTITY_ID"),
    walletId: getRequiredEnv("CIRCLE_WALLET_ID"),
    webhookSecret: getRequiredEnv("CIRCLE_WEBHOOK_SECRET"),
  },
});

// ============================================================================
// CHECKOUT
// ============================================================================

/**
 * Create checkout session
 * POST /v1/payments/checkout
 */
router.post("/checkout", async (req: Request, res: Response) => {
  try {
    const parsed = CheckoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(
        errorResponse("INVALID_REQUEST", "Invalid request body", parsed.error.errors)
      );
    }

    const result = await paymentProcessor.createCheckout(parsed.data);

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json(
      errorResponse("CHECKOUT_FAILED", error instanceof Error ? error.message : "Checkout creation failed")
    );
  }
});

/**
 * Get checkout session
 * GET /v1/payments/checkout/:sessionId
 */
router.get("/checkout/:sessionId", async (req: Request, res: Response) => {
  try {
    const session = await paymentProcessor.getCheckout(req.params.sessionId);
    res.json(session);
  } catch (error) {
    res.status(404).json(
      errorResponse("SESSION_NOT_FOUND", error instanceof Error ? error.message : "Session not found")
    );
  }
});

/**
 * Expire checkout session
 * POST /v1/payments/checkout/:sessionId/expire
 */
router.post("/checkout/:sessionId/expire", async (req: Request, res: Response) => {
  try {
    await paymentProcessor.expireCheckout(req.params.sessionId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to expire session",
    });
  }
});

// ============================================================================
// PAYMENTS
// ============================================================================

/**
 * Confirm payment
 * POST /v1/payments/:sessionId/confirm
 */
router.post("/:sessionId/confirm", async (req: Request, res: Response) => {
  try {
    const { settle = true } = req.body;
    const session = await paymentProcessor.confirmPayment(req.params.sessionId, {
      settle,
    });
    res.json(session);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Payment confirmation failed",
    });
  }
});

// ============================================================================
// SETTLEMENTS
// ============================================================================

/**
 * Settle payment to escrow
 * POST /v1/payments/:sessionId/settle
 */
router.post("/:sessionId/settle", async (req: Request, res: Response) => {
  try {
    const result = await paymentProcessor.settlePayment(req.params.sessionId);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Settlement failed",
    });
  }
});

/**
 * Get settlement status
 * GET /v1/payments/settlements/:settlementId
 */
router.get("/settlements/:settlementId", async (req: Request, res: Response) => {
  try {
    const settlement = paymentProcessor.getSettlement(req.params.settlementId);
    if (!settlement) {
      return res.status(404).json({ error: "Settlement not found" });
    }
    res.json(settlement);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get settlement",
    });
  }
});

// ============================================================================
// REFUNDS
// ============================================================================

/**
 * Create refund
 * POST /v1/payments/refunds
 */
router.post("/refunds", async (req: Request, res: Response) => {
  try {
    const parsed = RefundSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(
        errorResponse("INVALID_REQUEST", "Invalid request body", parsed.error.errors)
      );
    }

    const refund = await paymentProcessor.createRefund(parsed.data);

    res.status(201).json(refund);
  } catch (error) {
    res.status(500).json(
      errorResponse("REFUND_FAILED", error instanceof Error ? error.message : "Refund creation failed")
    );
  }
});

/**
 * Get refund status
 * GET /v1/payments/refunds/:refundId
 */
router.get("/refunds/:refundId", async (req: Request, res: Response) => {
  try {
    const refund = await paymentProcessor.getRefund(req.params.refundId);
    res.json(refund);
  } catch (error) {
    res.status(404).json({
      error: error instanceof Error ? error.message : "Refund not found",
    });
  }
});

// ============================================================================
// SUBSCRIPTIONS
// ============================================================================

/**
 * Create subscription
 * POST /v1/payments/subscriptions
 */
router.post("/subscriptions", async (req: Request, res: Response) => {
  try {
    const parsed = SubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(
        errorResponse("INVALID_REQUEST", "Invalid request body", parsed.error.errors)
      );
    }

    const subscription = await paymentProcessor.createSubscription(parsed.data);

    res.status(201).json(subscription);
  } catch (error) {
    res.status(500).json(
      errorResponse("SUBSCRIPTION_FAILED", error instanceof Error ? error.message : "Subscription creation failed")
    );
  }
});

/**
 * Cancel subscription
 * POST /v1/payments/subscriptions/:subscriptionId/cancel
 */
router.post(
  "/subscriptions/:subscriptionId/cancel",
  async (req: Request, res: Response) => {
    try {
      const subscription = await paymentProcessor.cancelSubscription(
        req.params.subscriptionId
      );
      res.json(subscription);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Cancellation failed",
      });
    }
  }
);

// ============================================================================
// PAYMENT METHODS
// ============================================================================

/**
 * List saved payment methods
 * GET /v1/payments/methods
 */
router.get("/methods", async (req: Request, res: Response) => {
  try {
    const userAddress = req.query.userAddress as string;
    if (!userAddress) {
      return res.status(400).json({ error: "userAddress is required" });
    }

    const methods = await paymentProcessor.listPaymentMethods(userAddress);
    res.json(methods);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to list methods",
    });
  }
});

/**
 * Delete payment method
 * DELETE /v1/payments/methods/:methodId
 */
router.delete("/methods/:methodId", async (req: Request, res: Response) => {
  try {
    await paymentProcessor.deletePaymentMethod(req.params.methodId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to delete method",
    });
  }
});

// ============================================================================
// KYC
// ============================================================================

/**
 * Initiate KYC verification
 * POST /v1/payments/kyc
 */
router.post("/kyc", async (req: Request, res: Response) => {
  try {
    const parsed = KycSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(
        errorResponse("INVALID_REQUEST", "Invalid request body", parsed.error.errors)
      );
    }

    const result = await paymentProcessor.initiateKyc(parsed.data);

    res.json(result);
  } catch (error) {
    res.status(500).json(
      errorResponse("KYC_FAILED", error instanceof Error ? error.message : "KYC initiation failed")
    );
  }
});

/**
 * Get KYC status
 * GET /v1/payments/kyc/:kycId
 */
router.get("/kyc/:kycId", async (req: Request, res: Response) => {
  try {
    const kyc = await paymentProcessor.getKycStatus(req.params.kycId);
    res.json(kyc);
  } catch (error) {
    res.status(404).json({
      error: error instanceof Error ? error.message : "KYC record not found",
    });
  }
});

// ============================================================================
// WEBHOOKS
// ============================================================================

/**
 * Stripe webhook handler
 * POST /v1/payments/webhooks/stripe
 */
router.post("/webhooks/stripe", async (req: Request, res: Response) => {
  try {
    const signature = req.headers["stripe-signature"] as string;
    const webhook = await paymentProcessor.handleWebhook(
      "stripe",
      JSON.stringify(req.body),
      signature
    );
    res.json({ received: true, event: webhook.event });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Webhook handling failed",
    });
  }
});

/**
 * Circle webhook handler
 * POST /v1/payments/webhooks/circle
 */
router.post("/webhooks/circle", async (req: Request, res: Response) => {
  try {
    const signature = req.headers["x-circle-signature"] as string;
    const webhook = await paymentProcessor.handleWebhook(
      "circle",
      JSON.stringify(req.body),
      signature
    );
    res.json({ received: true, event: webhook.event });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Webhook handling failed",
    });
  }
});

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get payment analytics
 * GET /v1/payments/analytics
 */
router.get("/analytics", async (req: Request, res: Response) => {
  try {
    const periodStart = req.query.start
      ? parseInt(req.query.start as string)
      : undefined;
    const periodEnd = req.query.end
      ? parseInt(req.query.end as string)
      : undefined;

    const analytics = paymentProcessor.getAnalytics(periodStart, periodEnd);
    res.json(analytics);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get analytics",
    });
  }
});

/**
 * Get settlement statistics
 * GET /v1/payments/analytics/settlements
 */
router.get("/analytics/settlements", async (req: Request, res: Response) => {
  try {
    const stats = paymentProcessor.getSettlementStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to get settlement stats",
    });
  }
});

// ============================================================================
// INFO
// ============================================================================

/**
 * Get payment configuration
 * GET /v1/payments/config
 */
router.get("/config", async (req: Request, res: Response) => {
  res.json({
    providers: paymentProcessor.getSupportedProviders(),
    limits: paymentProcessor.getLimits(),
    currencies: ["USD", "EUR", "GBP"],
    methods: ["card", "ach", "wire", "apple_pay", "google_pay"],
  });
});

export default router;
