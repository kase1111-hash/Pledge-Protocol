/**
 * Phase 9: Payment Infrastructure Types
 *
 * Fiat payment integration with support for multiple providers
 * (Stripe, Circle, Moonpay) and stablecoin settlement.
 */

// ============================================================================
// PAYMENT PROVIDERS
// ============================================================================

export type PaymentProvider = "stripe" | "circle" | "moonpay" | "coinbase";

export type PaymentMethod =
  | "card" // Credit/debit card via Stripe
  | "ach" // ACH bank transfer via Circle
  | "wire" // Wire transfer via Circle
  | "crypto" // Direct crypto payment
  | "apple_pay" // Apple Pay via Stripe
  | "google_pay"; // Google Pay via Stripe

export type PaymentCurrency =
  | "USD"
  | "EUR"
  | "GBP"
  | "CAD"
  | "AUD"
  | "USDC"
  | "USDT"
  | "ETH";

export type PaymentStatus =
  | "pending" // Awaiting payment
  | "processing" // Payment being processed
  | "requires_action" // 3D Secure or additional verification
  | "succeeded" // Payment completed
  | "failed" // Payment failed
  | "cancelled" // User cancelled
  | "refunded" // Full refund issued
  | "partially_refunded"; // Partial refund issued

export type SettlementStatus =
  | "pending" // Awaiting settlement
  | "converting" // Converting to stablecoin
  | "settled" // Settled to escrow
  | "failed" // Settlement failed
  | "reversed"; // Settlement reversed

// ============================================================================
// CHECKOUT & SESSIONS
// ============================================================================

export interface CheckoutSession {
  id: string;
  campaignId: string;
  pledgeId?: string;
  backerAddress: string;

  // Payment details
  provider: PaymentProvider;
  method?: PaymentMethod;
  currency: PaymentCurrency;
  amount: string; // In smallest unit (cents for USD)
  amountDecimal: string; // Human-readable amount
  fees: PaymentFees;

  // Status
  status: PaymentStatus;
  errorCode?: string;
  errorMessage?: string;

  // Provider-specific
  providerSessionId?: string;
  providerPaymentIntentId?: string;
  checkoutUrl?: string;

  // Settlement
  settlementStatus?: SettlementStatus;
  settlementTxHash?: string;
  settledAmount?: string;

  // Metadata
  metadata: Record<string, any>;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface PaymentFees {
  processingFee: string; // Provider fee (e.g., Stripe 2.9%)
  platformFee: string; // Platform fee
  networkFee?: string; // Blockchain gas fee
  totalFees: string;
  netAmount: string; // Amount after fees
}

export interface CreateCheckoutRequest {
  campaignId: string;
  backerAddress: string;
  amount: string;
  currency: PaymentCurrency;
  method?: PaymentMethod;
  provider?: PaymentProvider;
  returnUrl: string;
  cancelUrl?: string;
  metadata?: Record<string, any>;
}

export interface CheckoutResult {
  session: CheckoutSession;
  checkoutUrl: string;
  expiresAt: number;
}

// ============================================================================
// PAYMENT INTENTS
// ============================================================================

export interface PaymentIntent {
  id: string;
  sessionId: string;
  provider: PaymentProvider;
  providerIntentId: string;

  amount: string;
  currency: PaymentCurrency;
  status: PaymentStatus;

  // Card details (if applicable)
  cardBrand?: string;
  cardLast4?: string;
  cardExpMonth?: number;
  cardExpYear?: number;

  // Bank details (if applicable)
  bankName?: string;
  accountLast4?: string;

  // 3D Secure
  requiresAction: boolean;
  actionUrl?: string;

  createdAt: number;
  confirmedAt?: number;
}

// ============================================================================
// SETTLEMENTS
// ============================================================================

export interface Settlement {
  id: string;
  sessionId: string;
  campaignId: string;
  pledgeId: string;

  // Source (fiat)
  sourceCurrency: PaymentCurrency;
  sourceAmount: string;

  // Destination (crypto)
  destinationCurrency: "USDC" | "USDT" | "ETH";
  destinationAmount: string;
  destinationAddress: string;
  destinationChainId: number;

  // Conversion
  exchangeRate?: string;
  conversionProvider?: string;

  // Status
  status: SettlementStatus;
  txHash?: string;
  blockNumber?: number;

  // Timing
  createdAt: number;
  convertedAt?: number;
  settledAt?: number;
}

export interface SettlementRequest {
  sessionId: string;
  destinationCurrency?: "USDC" | "USDT" | "ETH";
  destinationChainId?: number;
}

// ============================================================================
// REFUNDS
// ============================================================================

export type RefundReason =
  | "requested_by_customer"
  | "duplicate"
  | "fraudulent"
  | "campaign_cancelled"
  | "milestone_failed"
  | "dispute_resolved";

export interface Refund {
  id: string;
  sessionId: string;
  paymentIntentId: string;
  pledgeId: string;

  amount: string;
  currency: PaymentCurrency;
  reason: RefundReason;
  description?: string;

  status: "pending" | "processing" | "succeeded" | "failed";
  providerRefundId?: string;

  // If from escrow
  escrowRefund: boolean;
  escrowTxHash?: string;

  createdAt: number;
  processedAt?: number;
  requestedBy: string;
}

export interface RefundRequest {
  sessionId?: string;
  pledgeId?: string;
  amount?: string; // Partial refund amount
  reason: RefundReason;
  description?: string;
}

// ============================================================================
// SUBSCRIPTIONS (Recurring Pledges)
// ============================================================================

export type SubscriptionInterval = "weekly" | "monthly" | "quarterly" | "yearly";

export type SubscriptionStatus =
  | "active"
  | "paused"
  | "cancelled"
  | "past_due"
  | "unpaid";

export interface Subscription {
  id: string;
  campaignId: string;
  backerAddress: string;

  // Payment
  amount: string;
  currency: PaymentCurrency;
  interval: SubscriptionInterval;
  provider: PaymentProvider;
  providerSubscriptionId?: string;

  // Status
  status: SubscriptionStatus;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;

  // History
  totalPaid: string;
  paymentsCount: number;
  lastPaymentAt?: number;
  nextPaymentAt?: number;

  // Metadata
  metadata: Record<string, any>;
  createdAt: number;
  cancelledAt?: number;
}

export interface CreateSubscriptionRequest {
  campaignId: string;
  backerAddress: string;
  amount: string;
  currency: PaymentCurrency;
  interval: SubscriptionInterval;
  provider?: PaymentProvider;
  metadata?: Record<string, any>;
}

// ============================================================================
// PAYMENT METHODS (Saved)
// ============================================================================

export interface SavedPaymentMethod {
  id: string;
  userAddress: string;
  provider: PaymentProvider;
  providerMethodId: string;

  type: "card" | "bank_account";

  // Card details
  cardBrand?: string;
  cardLast4?: string;
  cardExpMonth?: number;
  cardExpYear?: number;

  // Bank details
  bankName?: string;
  accountLast4?: string;
  accountType?: "checking" | "savings";

  isDefault: boolean;
  createdAt: number;
}

// ============================================================================
// KYC (Know Your Customer)
// ============================================================================

export type KycStatus =
  | "not_started"
  | "pending"
  | "in_review"
  | "approved"
  | "rejected"
  | "expired";

export type KycLevel = "basic" | "standard" | "enhanced";

export interface KycVerification {
  id: string;
  userAddress: string;
  provider: "moonpay" | "circle" | "jumio";
  providerUserId?: string;

  // Status
  status: KycStatus;
  level: KycLevel;
  rejectionReason?: string;

  // Verified info
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  country?: string;
  documentType?: "passport" | "drivers_license" | "national_id";

  // Limits
  dailyLimit?: string;
  monthlyLimit?: string;
  lifetimeLimit?: string;

  // Timing
  createdAt: number;
  submittedAt?: number;
  verifiedAt?: number;
  expiresAt?: number;
}

export interface KycInitRequest {
  userAddress: string;
  provider?: "moonpay" | "circle";
  level?: KycLevel;
  returnUrl: string;
}

// ============================================================================
// WEBHOOKS
// ============================================================================

export type PaymentWebhookEvent =
  | "checkout.completed"
  | "checkout.failed"
  | "checkout.expired"
  | "payment.succeeded"
  | "payment.failed"
  | "payment.requires_action"
  | "settlement.completed"
  | "settlement.failed"
  | "refund.succeeded"
  | "refund.failed"
  | "subscription.created"
  | "subscription.updated"
  | "subscription.cancelled"
  | "subscription.payment_succeeded"
  | "subscription.payment_failed"
  | "kyc.approved"
  | "kyc.rejected";

export interface PaymentWebhook {
  id: string;
  event: PaymentWebhookEvent;
  provider: PaymentProvider;
  providerEventId: string;

  data: {
    sessionId?: string;
    paymentIntentId?: string;
    settlementId?: string;
    refundId?: string;
    subscriptionId?: string;
    kycId?: string;
  };

  raw: Record<string, any>;
  processedAt?: number;
  createdAt: number;
}

// ============================================================================
// PROVIDER CONFIGURATION
// ============================================================================

export interface StripeConfig {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  accountId?: string; // Connected account
}

export interface CircleConfig {
  apiKey: string;
  entityId: string;
  walletId: string;
  webhookSecret: string;
}

export interface MoonpayConfig {
  apiKey: string;
  secretKey: string;
  webhookSecret: string;
  publishableKey: string;
}

export interface PaymentConfig {
  stripe?: StripeConfig;
  circle?: CircleConfig;
  moonpay?: MoonpayConfig;

  // Default settings
  defaultProvider: PaymentProvider;
  defaultCurrency: PaymentCurrency;
  defaultSettlementCurrency: "USDC" | "USDT";
  defaultSettlementChainId: number;

  // Fee settings
  platformFeePercent: number; // e.g., 2.5 for 2.5%
  minPlatformFee: string; // Minimum fee amount

  // Limits
  minPaymentAmount: string;
  maxPaymentAmount: string;
  maxDailyVolume: string;
}

// ============================================================================
// ANALYTICS
// ============================================================================

export interface PaymentAnalytics {
  // Volume
  totalVolume: string;
  totalTransactions: number;
  averageTransaction: string;

  // By provider
  volumeByProvider: Record<PaymentProvider, string>;
  transactionsByProvider: Record<PaymentProvider, number>;

  // By method
  volumeByMethod: Record<PaymentMethod, string>;
  transactionsByMethod: Record<PaymentMethod, number>;

  // By currency
  volumeByCurrency: Record<PaymentCurrency, string>;

  // Success rates
  successRate: number;
  failureRate: number;
  refundRate: number;

  // Fees
  totalFeesCollected: string;
  totalPlatformFees: string;
  totalProcessingFees: string;

  // Time period
  periodStart: number;
  periodEnd: number;
}

// ============================================================================
// ERRORS
// ============================================================================

export type PaymentErrorCode =
  | "card_declined"
  | "insufficient_funds"
  | "expired_card"
  | "invalid_card"
  | "processing_error"
  | "authentication_required"
  | "rate_limited"
  | "amount_too_small"
  | "amount_too_large"
  | "currency_not_supported"
  | "provider_error"
  | "settlement_failed"
  | "kyc_required"
  | "kyc_rejected"
  | "blocked_country"
  | "suspicious_activity";

export interface PaymentError {
  code: PaymentErrorCode;
  message: string;
  provider?: PaymentProvider;
  providerCode?: string;
  retryable: boolean;
  suggestedAction?: string;
}

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

export interface PaymentProviderInterface {
  name: PaymentProvider;

  // Checkout
  createCheckout(request: CreateCheckoutRequest): Promise<CheckoutResult>;
  getCheckout(sessionId: string): Promise<CheckoutSession>;
  expireCheckout(sessionId: string): Promise<void>;

  // Payments
  confirmPayment(paymentIntentId: string): Promise<PaymentIntent>;
  cancelPayment(paymentIntentId: string): Promise<void>;

  // Refunds
  createRefund(request: RefundRequest): Promise<Refund>;
  getRefund(refundId: string): Promise<Refund>;

  // Subscriptions
  createSubscription(
    request: CreateSubscriptionRequest
  ): Promise<Subscription>;
  cancelSubscription(subscriptionId: string): Promise<Subscription>;
  pauseSubscription(subscriptionId: string): Promise<Subscription>;
  resumeSubscription(subscriptionId: string): Promise<Subscription>;

  // Payment methods
  savePaymentMethod(
    userAddress: string,
    providerMethodId: string
  ): Promise<SavedPaymentMethod>;
  deletePaymentMethod(methodId: string): Promise<void>;
  listPaymentMethods(userAddress: string): Promise<SavedPaymentMethod[]>;

  // Webhooks
  verifyWebhook(payload: string, signature: string): boolean;
  parseWebhook(payload: string): PaymentWebhook;

  // KYC (if supported)
  initiateKyc?(request: KycInitRequest): Promise<{ url: string; id: string }>;
  getKycStatus?(kycId: string): Promise<KycVerification>;
}
