/**
 * Phase 9: Payment Infrastructure
 *
 * Fiat payment integration with Stripe, Circle, and stablecoin settlement.
 */

// Types
export * from "./types";

// Providers
export { StripeProvider, createStripeProvider } from "./stripe-provider";
export { CircleProvider, createCircleProvider } from "./circle-provider";

// Settlement
export {
  SettlementService,
  SettlementConfig,
  SettlementBatch,
  ExchangeRate,
  createSettlementService,
  DEFAULT_SETTLEMENT_CONFIG,
} from "./settlement-service";

// Payment Processor
export {
  PaymentProcessor,
  PaymentProcessorConfig,
  CheckoutWithSettlement,
  createPaymentProcessor,
  DEFAULT_PAYMENT_CONFIG,
} from "./payment-processor";
