/**
 * Phase 9: Payment API Routes
 *
 * Fiat payment integration endpoints.
 */

import { Router, Request, Response } from "express";
import {
  PaymentProcessor,
  createPaymentProcessor,
  DEFAULT_PAYMENT_CONFIG,
} from "../../payments";

const router = Router();

// Initialize payment processor (in production: use config from env)
const paymentProcessor = createPaymentProcessor({
  ...DEFAULT_PAYMENT_CONFIG,
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "sk_test_xxx",
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "pk_test_xxx",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "whsec_xxx",
  },
  circle: {
    apiKey: process.env.CIRCLE_API_KEY || "circle_xxx",
    entityId: process.env.CIRCLE_ENTITY_ID || "entity_xxx",
    walletId: process.env.CIRCLE_WALLET_ID || "wallet_xxx",
    webhookSecret: process.env.CIRCLE_WEBHOOK_SECRET || "circle_whsec_xxx",
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
    const {
      campaignId,
      backerAddress,
      amount,
      currency = "USD",
      method,
      provider,
      returnUrl,
      cancelUrl,
      metadata,
    } = req.body;

    if (!campaignId || !backerAddress || !amount || !returnUrl) {
      return res.status(400).json({
        error: "Missing required fields: campaignId, backerAddress, amount, returnUrl",
      });
    }

    const result = await paymentProcessor.createCheckout({
      campaignId,
      backerAddress,
      amount,
      currency,
      method,
      provider,
      returnUrl,
      cancelUrl,
      metadata,
    });

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Checkout creation failed",
    });
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
    res.status(404).json({
      error: error instanceof Error ? error.message : "Session not found",
    });
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
    const { sessionId, pledgeId, amount, reason, description } = req.body;

    if (!reason) {
      return res.status(400).json({ error: "Refund reason is required" });
    }

    const refund = await paymentProcessor.createRefund({
      sessionId,
      pledgeId,
      amount,
      reason,
      description,
    });

    res.status(201).json(refund);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Refund creation failed",
    });
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
    const { campaignId, backerAddress, amount, currency, interval, metadata } =
      req.body;

    if (!campaignId || !backerAddress || !amount || !interval) {
      return res.status(400).json({
        error: "Missing required fields: campaignId, backerAddress, amount, interval",
      });
    }

    const subscription = await paymentProcessor.createSubscription({
      campaignId,
      backerAddress,
      amount,
      currency: currency || "USD",
      interval,
      metadata,
    });

    res.status(201).json(subscription);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Subscription creation failed",
    });
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
    const { userAddress, provider, level, returnUrl } = req.body;

    if (!userAddress || !returnUrl) {
      return res.status(400).json({
        error: "Missing required fields: userAddress, returnUrl",
      });
    }

    const result = await paymentProcessor.initiateKyc({
      userAddress,
      provider,
      level,
      returnUrl,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "KYC initiation failed",
    });
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
