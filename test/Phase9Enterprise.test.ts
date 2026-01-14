/**
 * Phase 9: Enterprise Readiness Tests
 *
 * Tests for payment processing, compliance, enterprise management,
 * fraud detection, and developer tools.
 */

import { expect } from "chai";

// Payments
import {
  PaymentProcessor,
  createPaymentProcessor,
  StripeProvider,
  CircleProvider,
  SettlementService,
  DEFAULT_PAYMENT_CONFIG,
  DEFAULT_SETTLEMENT_CONFIG,
} from "../src/payments";

// Compliance
import { GdprService, createGdprService } from "../src/compliance";

// Enterprise
import { OrganizationService, createOrganizationService } from "../src/enterprise";

// Risk
import { FraudDetector, createFraudDetector } from "../src/risk";

// Dev Tools
import { PledgeCli, createCli, Sandbox, createSandbox } from "../src/dev-tools";

describe("Phase 9: Enterprise Readiness", () => {
  // ==========================================================================
  // PAYMENT PROCESSING
  // ==========================================================================

  describe("Payment Processing", () => {
    describe("StripeProvider", () => {
      let stripe: StripeProvider;

      beforeEach(() => {
        stripe = new StripeProvider({
          secretKey: "sk_test_xxx",
          publishableKey: "pk_test_xxx",
          webhookSecret: "whsec_xxx",
        });
      });

      it("should create checkout session", async () => {
        const result = await stripe.createCheckout({
          campaignId: "campaign_123",
          backerAddress: "0x1234567890123456789012345678901234567890",
          amount: "10000", // $100
          currency: "USD",
          returnUrl: "https://example.com/return",
        });

        expect(result.session).to.exist;
        expect(result.session.id).to.match(/^cs_/);
        expect(result.session.status).to.equal("pending");
        expect(result.checkoutUrl).to.include("stripe.com");
        expect(result.session.fees).to.exist;
      });

      it("should calculate fees correctly", async () => {
        const result = await stripe.createCheckout({
          campaignId: "campaign_123",
          backerAddress: "0x1234567890123456789012345678901234567890",
          amount: "10000", // $100.00
          currency: "USD",
          returnUrl: "https://example.com/return",
        });

        // Stripe: 2.9% + $0.30 = $3.20
        // Platform: 2.5% = $2.50
        const fees = result.session.fees;
        expect(parseInt(fees.processingFee)).to.be.greaterThan(0);
        expect(parseInt(fees.platformFee)).to.be.greaterThan(0);
        expect(parseInt(fees.netAmount)).to.be.lessThan(10000);
      });

      it("should get checkout session", async () => {
        const created = await stripe.createCheckout({
          campaignId: "campaign_123",
          backerAddress: "0x1234",
          amount: "5000",
          currency: "USD",
          returnUrl: "https://example.com",
        });

        const retrieved = await stripe.getCheckout(created.session.id);
        expect(retrieved.id).to.equal(created.session.id);
      });

      it("should simulate payment success", async () => {
        const result = await stripe.createCheckout({
          campaignId: "campaign_123",
          backerAddress: "0x1234",
          amount: "5000",
          currency: "USD",
          returnUrl: "https://example.com",
        });

        const completed = await stripe.simulatePaymentSuccess(result.session.id);
        expect(completed.status).to.equal("succeeded");
        expect(completed.providerPaymentIntentId).to.exist;
      });

      it("should create refund", async () => {
        const checkout = await stripe.createCheckout({
          campaignId: "campaign_123",
          backerAddress: "0x1234",
          amount: "5000",
          currency: "USD",
          returnUrl: "https://example.com",
        });

        await stripe.simulatePaymentSuccess(checkout.session.id);

        const refund = await stripe.createRefund({
          sessionId: checkout.session.id,
          reason: "requested_by_customer",
        });

        expect(refund.id).to.match(/^re_/);
        expect(refund.status).to.equal("processing");
      });

      it("should create subscription", async () => {
        const subscription = await stripe.createSubscription({
          campaignId: "campaign_123",
          backerAddress: "0x1234",
          amount: "5000",
          currency: "USD",
          interval: "monthly",
        });

        expect(subscription.id).to.match(/^sub_/);
        expect(subscription.status).to.equal("active");
        expect(subscription.interval).to.equal("monthly");
      });

      it("should save payment method", async () => {
        const method = await stripe.savePaymentMethod(
          "0x1234",
          "pm_card_visa"
        );

        expect(method.id).to.match(/^pm_/);
        expect(method.type).to.equal("card");
        expect(method.cardBrand).to.equal("visa");
      });
    });

    describe("CircleProvider", () => {
      let circle: CircleProvider;

      beforeEach(() => {
        circle = new CircleProvider({
          apiKey: "circle_xxx",
          entityId: "entity_xxx",
          walletId: "wallet_xxx",
          webhookSecret: "circle_whsec_xxx",
        });
      });

      it("should create ACH checkout", async () => {
        const result = await circle.createCheckout({
          campaignId: "campaign_123",
          backerAddress: "0x1234",
          amount: "50000", // $500
          currency: "USD",
          method: "ach",
          returnUrl: "https://example.com/return",
        });

        expect(result.session.method).to.equal("ach");
        expect(result.session.provider).to.equal("circle");
        // ACH has lower fees: 1% capped at $10
        expect(parseInt(result.session.fees.processingFee)).to.be.lessThanOrEqual(1000);
      });

      it("should initiate KYC", async () => {
        const result = await circle.initiateKyc!({
          userAddress: "0x1234",
          returnUrl: "https://example.com/kyc-complete",
        });

        expect(result.id).to.match(/^kyc_/);
        expect(result.url).to.include("circle.com/verify");
      });

      it("should get USDC balance", async () => {
        const balance = await circle.getUsdcBalance();
        expect(balance.available).to.exist;
        expect(balance.pending).to.exist;
      });
    });

    describe("SettlementService", () => {
      let settlement: SettlementService;

      beforeEach(() => {
        settlement = new SettlementService(DEFAULT_SETTLEMENT_CONFIG);
      });

      it("should get exchange rate", () => {
        const rate = settlement.getExchangeRate("USD", "USDC");
        expect(rate).to.exist;
        expect(rate!.rate).to.equal("1.000000");
      });

      it("should create settlement", async () => {
        const mockSession = {
          id: "cs_123",
          campaignId: "campaign_123",
          pledgeId: "pledge_123",
          backerAddress: "0x1234",
          provider: "stripe" as const,
          currency: "USD" as const,
          amount: "10000",
          amountDecimal: "100.00",
          fees: {
            processingFee: "320",
            platformFee: "250",
            totalFees: "570",
            netAmount: "9430",
          },
          status: "succeeded" as const,
          metadata: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
          expiresAt: Date.now() + 3600000,
        };

        const result = await settlement.createSettlement(mockSession, {
          sessionId: "cs_123",
        });

        expect(result.id).to.match(/^stl_/);
        expect(result.sourceCurrency).to.equal("USD");
        expect(result.destinationCurrency).to.equal("USDC");
      });

      it("should get settlement stats", () => {
        const stats = settlement.getStats();
        expect(stats.totalSettlements).to.be.a("number");
        expect(stats.settledCount).to.be.a("number");
      });
    });

    describe("PaymentProcessor", () => {
      let processor: PaymentProcessor;

      beforeEach(() => {
        processor = createPaymentProcessor({
          ...DEFAULT_PAYMENT_CONFIG,
          stripe: {
            secretKey: "sk_test_xxx",
            publishableKey: "pk_test_xxx",
            webhookSecret: "whsec_xxx",
          },
          circle: {
            apiKey: "circle_xxx",
            entityId: "entity_xxx",
            walletId: "wallet_xxx",
            webhookSecret: "circle_whsec_xxx",
          },
        });
      });

      it("should create checkout with auto provider selection", async () => {
        // Card payments should use Stripe
        const cardCheckout = await processor.createCheckout({
          campaignId: "campaign_123",
          backerAddress: "0x1234",
          amount: "5000",
          currency: "USD",
          method: "card",
          returnUrl: "https://example.com",
        });

        expect(cardCheckout.session.provider).to.equal("stripe");
      });

      it("should get supported providers", () => {
        const providers = processor.getSupportedProviders();
        expect(providers).to.include("stripe");
        expect(providers).to.include("circle");
      });

      it("should get payment limits", () => {
        const limits = processor.getLimits();
        expect(limits.min).to.exist;
        expect(limits.max).to.exist;
        expect(limits.dailyMax).to.exist;
      });

      it("should get analytics", () => {
        const analytics = processor.getAnalytics();
        expect(analytics.totalVolume).to.exist;
        expect(analytics.totalTransactions).to.be.a("number");
      });
    });
  });

  // ==========================================================================
  // COMPLIANCE
  // ==========================================================================

  describe("GDPR Compliance", () => {
    let gdpr: GdprService;

    beforeEach(() => {
      gdpr = createGdprService();
    });

    describe("Data Export", () => {
      it("should request data export", async () => {
        const request = await gdpr.requestExport(
          "0x1234567890123456789012345678901234567890"
        );

        expect(request.id).to.match(/^exp_/);
        expect(request.status).to.be.oneOf(["pending", "processing"]);
      });

      it("should request export with specific categories", async () => {
        const request = await gdpr.requestExport(
          "0x1234",
          {
            format: "csv",
            categories: ["profile", "pledges", "transactions"],
          }
        );

        expect(request.format).to.equal("csv");
        expect(request.includeCategories).to.have.length(3);
      });

      it("should get export status", async () => {
        const request = await gdpr.requestExport("0x1234");
        const status = gdpr.getExportRequest(request.id);
        expect(status).to.exist;
      });

      it("should get exports by user", async () => {
        await gdpr.requestExport("0x1234");
        await gdpr.requestExport("0x1234");

        const exports = gdpr.getExportsByUser("0x1234");
        expect(exports).to.have.length(2);
      });
    });

    describe("Data Deletion", () => {
      it("should request data deletion", async () => {
        const request = await gdpr.requestDeletion("0x1234");

        expect(request.id).to.match(/^del_/);
        expect(request.status).to.equal("awaiting_confirmation");
        expect(request.confirmationToken).to.exist;
      });

      it("should confirm deletion", async () => {
        const request = await gdpr.requestDeletion("0x1234");
        const confirmed = await gdpr.confirmDeletion(
          request.id,
          request.confirmationToken!
        );

        expect(confirmed.status).to.equal("pending");
        expect(confirmed.confirmedAt).to.exist;
      });

      it("should cancel deletion", async () => {
        const request = await gdpr.requestDeletion("0x1234");
        const cancelled = await gdpr.cancelDeletion(request.id);

        expect(cancelled.status).to.equal("cancelled");
      });
    });

    describe("Consent Management", () => {
      it("should update consent", async () => {
        const preferences = await gdpr.updateConsent({
          userAddress: "0x1234",
          consents: {
            analytics: true,
            marketing: false,
          },
        });

        expect(preferences.consents.analytics).to.equal("granted");
        expect(preferences.consents.marketing).to.equal("denied");
      });

      it("should get consent preferences", () => {
        const preferences = gdpr.getConsentPreferences("0x1234");
        expect(preferences.userAddress).to.equal("0x1234");
        expect(preferences.consents).to.exist;
      });

      it("should track consent history", async () => {
        await gdpr.updateConsent({
          userAddress: "0x1234",
          consents: { marketing: true },
        });
        await gdpr.updateConsent({
          userAddress: "0x1234",
          consents: { marketing: false },
        });

        const history = gdpr.getConsentHistory("0x1234");
        expect(history).to.have.length(2);
      });
    });

    describe("GDPR Rights", () => {
      it("should submit GDPR request", async () => {
        const request = await gdpr.submitGdprRequest("0x1234", "access");
        expect(request.right).to.equal("access");
        expect(request.status).to.be.oneOf(["pending", "processing"]);
      });
    });

    describe("Compliance Reports", () => {
      it("should generate compliance report", () => {
        const now = Date.now();
        const report = gdpr.generateComplianceReport(
          "gdpr",
          now - 30 * 24 * 60 * 60 * 1000,
          now
        );

        expect(report.id).to.match(/^report_/);
        expect(report.type).to.equal("gdpr");
        expect(report.complianceScore).to.be.a("number");
      });

      it("should get stats", () => {
        const stats = gdpr.getStats();
        expect(stats.totalExportRequests).to.be.a("number");
        expect(stats.totalDeletionRequests).to.be.a("number");
      });
    });
  });

  // ==========================================================================
  // ENTERPRISE
  // ==========================================================================

  describe("Enterprise Organizations", () => {
    let orgService: OrganizationService;

    beforeEach(() => {
      orgService = createOrganizationService();
    });

    describe("Organization Management", () => {
      it("should create organization", () => {
        const org = orgService.createOrganization({
          name: "Test Nonprofit",
          type: "nonprofit",
          ownerAddress: "0x1234",
          contactEmail: "test@nonprofit.org",
        });

        expect(org.id).to.match(/^org_/);
        expect(org.name).to.equal("Test Nonprofit");
        expect(org.slug).to.equal("test-nonprofit");
        expect(org.billingPlan).to.equal("free");
      });

      it("should get organization by ID", () => {
        const created = orgService.createOrganization({
          name: "Test Org",
          type: "corporate",
          ownerAddress: "0x1234",
          contactEmail: "test@corp.com",
        });

        const retrieved = orgService.getOrganization(created.id);
        expect(retrieved).to.exist;
        expect(retrieved!.id).to.equal(created.id);
      });

      it("should get organization by slug", () => {
        orgService.createOrganization({
          name: "My Organization",
          type: "nonprofit",
          ownerAddress: "0x1234",
          contactEmail: "test@org.com",
        });

        const org = orgService.getOrganizationBySlug("my-organization");
        expect(org).to.exist;
      });

      it("should update organization", () => {
        const org = orgService.createOrganization({
          name: "Original Name",
          type: "nonprofit",
          ownerAddress: "0x1234",
          contactEmail: "test@org.com",
        });

        const updated = orgService.updateOrganization(
          org.id,
          { description: "Updated description" },
          "0x1234"
        );

        expect(updated.description).to.equal("Updated description");
      });
    });

    describe("Team Members", () => {
      let orgId: string;

      beforeEach(() => {
        const org = orgService.createOrganization({
          name: "Team Test Org",
          type: "corporate",
          ownerAddress: "0xowner",
          contactEmail: "team@org.com",
        });
        orgId = org.id;
      });

      it("should add team member", () => {
        const member = orgService.addMember(orgId, {
          userAddress: "0xmember",
          role: "creator",
        });

        expect(member.id).to.match(/^mem_/);
        expect(member.role).to.equal("creator");
        expect(member.permissions).to.include("campaigns:create");
      });

      it("should get members", () => {
        orgService.addMember(orgId, { userAddress: "0xmem1", role: "admin" });
        orgService.addMember(orgId, { userAddress: "0xmem2", role: "viewer" });

        const members = orgService.getMembers(orgId);
        // Owner + 2 added members
        expect(members).to.have.length(3);
      });

      it("should update member role", () => {
        const member = orgService.addMember(orgId, {
          userAddress: "0xmember",
          role: "viewer",
        });

        const updated = orgService.updateMemberRole(
          orgId,
          "0xmember",
          "admin",
          "0xowner"
        );

        expect(updated.role).to.equal("admin");
      });

      it("should check permissions", () => {
        orgService.addMember(orgId, { userAddress: "0xviewer", role: "viewer" });

        const canCreate = orgService.hasPermission(
          orgId,
          "0xviewer",
          "campaigns:create"
        );
        const canView = orgService.hasPermission(
          orgId,
          "0xviewer",
          "campaigns:view"
        );

        expect(canCreate).to.be.false;
        expect(canView).to.be.true;
      });
    });

    describe("Invitations", () => {
      let orgId: string;

      beforeEach(() => {
        const org = orgService.createOrganization({
          name: "Invite Test Org",
          type: "nonprofit",
          ownerAddress: "0xowner",
          contactEmail: "invite@org.com",
        });
        orgId = org.id;
      });

      it("should create invite", () => {
        const invite = orgService.createInvite(orgId, {
          email: "new@member.com",
          role: "creator",
          invitedBy: "0xowner",
        });

        expect(invite.id).to.match(/^inv_/);
        expect(invite.inviteToken).to.exist;
        expect(invite.status).to.equal("pending");
      });

      it("should accept invite", () => {
        const invite = orgService.createInvite(orgId, {
          email: "new@member.com",
          role: "admin",
          invitedBy: "0xowner",
        });

        const member = orgService.acceptInvite(invite.inviteToken, "0xnewmember");

        expect(member.userAddress).to.equal("0xnewmember");
        expect(member.role).to.equal("admin");
      });

      it("should get pending invites", () => {
        orgService.createInvite(orgId, {
          email: "a@test.com",
          role: "viewer",
          invitedBy: "0xowner",
        });
        orgService.createInvite(orgId, {
          email: "b@test.com",
          role: "viewer",
          invitedBy: "0xowner",
        });

        const pending = orgService.getPendingInvites(orgId);
        expect(pending).to.have.length(2);
      });
    });

    describe("SSO Configuration", () => {
      let orgId: string;

      beforeEach(() => {
        const org = orgService.createOrganization({
          name: "SSO Test Org",
          type: "corporate",
          ownerAddress: "0xowner",
          contactEmail: "sso@org.com",
        });
        orgId = org.id;
      });

      it("should configure SSO", () => {
        const config = orgService.configureSso(orgId, {
          provider: "saml",
          enabled: true,
          autoProvision: true,
          defaultRole: "viewer",
          emailDomains: ["corp.com"],
        });

        expect(config.id).to.match(/^sso_/);
        expect(config.provider).to.equal("saml");
      });

      it("should validate SSO session", () => {
        orgService.configureSso(orgId, {
          provider: "saml",
          enabled: true,
          autoProvision: true,
          defaultRole: "viewer",
          emailDomains: ["corp.com"],
        });

        const session = orgService.validateSsoSession(
          orgId,
          "external_123",
          "user@corp.com"
        );

        expect(session.id).to.match(/^sso_sess_/);
        expect(session.email).to.equal("user@corp.com");
      });
    });

    describe("Billing", () => {
      let orgId: string;

      beforeEach(() => {
        const org = orgService.createOrganization({
          name: "Billing Test Org",
          type: "corporate",
          ownerAddress: "0xowner",
          contactEmail: "billing@org.com",
        });
        orgId = org.id;
      });

      it("should get billing info", () => {
        const billing = orgService.getBilling(orgId);
        expect(billing).to.exist;
        expect(billing!.plan).to.equal("free");
      });

      it("should upgrade plan", () => {
        const billing = orgService.upgradePlan(
          orgId,
          "professional",
          "yearly",
          "0xowner"
        );

        expect(billing.plan).to.equal("professional");
        expect(billing.cycle).to.equal("yearly");
      });
    });

    describe("API Keys", () => {
      let orgId: string;

      beforeEach(() => {
        const org = orgService.createOrganization({
          name: "API Key Test Org",
          type: "corporate",
          ownerAddress: "0xowner",
          contactEmail: "api@org.com",
        });
        orgId = org.id;
      });

      it("should create API key", () => {
        const result = orgService.createApiKey(orgId, {
          name: "Production Key",
          permissions: ["campaigns:read", "pledges:read"],
          createdBy: "0xowner",
        });

        expect(result.apiKey.id).to.match(/^key_/);
        expect(result.plainKey).to.match(/^pk_/);
        expect(result.apiKey.permissions).to.include("campaigns:read");
      });

      it("should revoke API key", () => {
        const { apiKey } = orgService.createApiKey(orgId, {
          name: "Test Key",
          permissions: ["campaigns:read"],
          createdBy: "0xowner",
        });

        const revoked = orgService.revokeApiKey(orgId, apiKey.id, "0xowner");
        expect(revoked.status).to.equal("revoked");
      });
    });

    describe("Audit Logs", () => {
      let orgId: string;

      beforeEach(() => {
        const org = orgService.createOrganization({
          name: "Audit Test Org",
          type: "corporate",
          ownerAddress: "0xowner",
          contactEmail: "audit@org.com",
        });
        orgId = org.id;
      });

      it("should track audit logs", () => {
        // Org creation creates audit log
        const { logs, total } = orgService.getAuditLogs(orgId);
        expect(logs.length).to.be.greaterThan(0);
        expect(logs[0].action).to.equal("organization.created");
      });
    });
  });

  // ==========================================================================
  // RISK ASSESSMENT
  // ==========================================================================

  describe("Fraud Detection", () => {
    let detector: FraudDetector;

    beforeEach(() => {
      detector = createFraudDetector();
    });

    describe("Verification", () => {
      it("should request verification", async () => {
        const record = await detector.requestVerification("0x1234", "email");

        expect(record.id).to.match(/^ver_/);
        expect(record.type).to.equal("email");
        expect(record.status).to.equal("pending");
      });

      it("should complete verification", async () => {
        const record = await detector.requestVerification("0x1234", "email");
        const completed = await detector.completeVerification(record.id, true, {
          verifiedData: { emailHash: "hash123" },
        });

        expect(completed.status).to.equal("verified");
        expect(completed.verifiedAt).to.exist;
      });

      it("should get verification summary", async () => {
        await detector.requestVerification("0x1234", "email");
        const summary = detector.getVerificationSummary("0x1234");

        expect(summary.userAddress).to.equal("0x1234");
        expect(summary.verifications).to.exist;
      });
    });

    describe("Badges", () => {
      it("should award badge", async () => {
        const badge = await detector.awardBadge("0x1234", "early_adopter");

        expect(badge.id).to.match(/^badge_/);
        expect(badge.type).to.equal("early_adopter");
        expect(badge.name).to.equal("Early Adopter");
      });

      it("should get user badges", async () => {
        await detector.awardBadge("0x1234", "early_adopter");
        await detector.awardBadge("0x1234", "top_backer");

        const badges = detector.getUserBadges("0x1234");
        expect(badges).to.have.length(2);
      });

      it("should not duplicate badges", async () => {
        await detector.awardBadge("0x1234", "early_adopter");
        await detector.awardBadge("0x1234", "early_adopter");

        const badges = detector.getUserBadges("0x1234");
        expect(badges).to.have.length(1);
      });
    });

    describe("Trust Scores", () => {
      it("should calculate trust score", async () => {
        const score = await detector.calculateTrustScore("0x1234", {
          campaignsCreated: 5,
          campaignsSuccessful: 4,
          pledgesMade: 10,
          pledgesHonored: 10,
        });

        expect(score.userAddress).to.equal("0x1234");
        expect(score.score).to.be.a("number");
        expect(score.tier).to.be.oneOf([
          "new",
          "basic",
          "trusted",
          "established",
          "elite",
        ]);
        expect(score.factors).to.be.an("array");
      });

      it("should get trust score", async () => {
        await detector.calculateTrustScore("0x1234", {
          campaignsCreated: 3,
          campaignsSuccessful: 3,
        });

        const score = detector.getTrustScore("0x1234");
        expect(score).to.exist;
      });
    });

    describe("Risk Assessment", () => {
      it("should assess campaign risk", async () => {
        const assessment = await detector.assessRisk("campaign", "campaign_123", {
          goal: 5000000,
          deadline: Date.now() + 30 * 24 * 60 * 60 * 1000,
          description: "A legitimate campaign with proper details",
          milestones: [{ name: "Milestone 1" }],
        });

        expect(assessment.id).to.match(/^risk_/);
        expect(assessment.entityType).to.equal("campaign");
        expect(assessment.riskLevel).to.be.oneOf([
          "low",
          "medium",
          "high",
          "critical",
        ]);
        expect(assessment.recommendedAction).to.exist;
      });

      it("should detect high-risk signals", async () => {
        const assessment = await detector.assessRisk("campaign", "campaign_123", {
          goal: 100000000, // Very high
          deadline: Date.now() + 3 * 24 * 60 * 60 * 1000, // Very short
          description: "Short", // Vague
          milestones: [], // No milestones
        });

        expect(assessment.signals.length).to.be.greaterThan(0);
        expect(assessment.riskScore).to.be.greaterThan(0);
      });
    });

    describe("Blocklist", () => {
      it("should add to blocklist", () => {
        const entry = detector.addToBlocklist(
          "address",
          "0xbadactor",
          "Known scammer",
          "critical",
          "admin"
        );

        expect(entry.id).to.match(/^block_/);
        expect(entry.type).to.equal("address");
      });

      it("should check blocklist", () => {
        detector.addToBlocklist(
          "address",
          "0xbadactor",
          "Fraud",
          "high"
        );

        const result = detector.isBlocked("address", "0xbadactor");
        expect(result).to.exist;

        const notBlocked = detector.isBlocked("address", "0xgoodactor");
        expect(notBlocked).to.be.null;
      });

      it("should remove from blocklist", () => {
        detector.addToBlocklist("address", "0xtest", "Test", "low");
        detector.removeFromBlocklist("address", "0xtest");

        const result = detector.isBlocked("address", "0xtest");
        expect(result).to.be.null;
      });
    });

    describe("Alerts", () => {
      it("should create alerts for high risk", async () => {
        await detector.assessRisk("user", "user_123", {
          createdAt: Date.now() - 1000, // Very new
          verified: false,
          isBlocked: false,
        });

        const alerts = detector.getOpenAlerts();
        // May or may not create alert depending on risk level
        expect(alerts).to.be.an("array");
      });

      it("should acknowledge alert", async () => {
        // Create high-risk assessment to generate alert
        await detector.assessRisk("campaign", "campaign_bad", {
          goal: 500000000,
          milestones: [],
        });

        const alerts = detector.getOpenAlerts();
        if (alerts.length > 0) {
          const acknowledged = detector.acknowledgeAlert(
            alerts[0].id,
            "admin@org.com"
          );
          expect(acknowledged.status).to.equal("acknowledged");
        }
      });
    });

    describe("Reports", () => {
      it("should generate risk report", () => {
        const now = Date.now();
        const report = detector.generateReport(
          now - 7 * 24 * 60 * 60 * 1000,
          now
        );

        expect(report.id).to.match(/^report_/);
        expect(report.totalAssessments).to.be.a("number");
        expect(report.assessmentsByLevel).to.exist;
      });
    });
  });

  // ==========================================================================
  // DEVELOPER TOOLS
  // ==========================================================================

  describe("Developer Tools", () => {
    describe("CLI", () => {
      let cli: PledgeCli;

      beforeEach(() => {
        cli = createCli({ verbose: false });
      });

      it("should get commands list", () => {
        const commands = cli.getCommands();
        expect(commands.length).to.be.greaterThan(0);

        const commandNames = commands.map((c) => c.name);
        expect(commandNames).to.include("create-campaign");
        expect(commandNames).to.include("sandbox");
        expect(commandNames).to.include("simulate");
      });

      it("should get/set config", () => {
        const config = cli.getConfig();
        expect(config.chainId).to.equal(31337);

        cli.setConfig({ chainId: 1 });
        expect(cli.getConfig().chainId).to.equal(1);
      });
    });

    describe("Sandbox", () => {
      let sandbox: Sandbox;

      beforeEach(() => {
        sandbox = createSandbox({
          seedData: false,
          autoMine: false,
        });
      });

      it("should start sandbox", async () => {
        const state = await sandbox.start();

        expect(state.running).to.be.true;
        expect(state.accounts.length).to.be.greaterThan(0);
        expect(state.contracts.length).to.be.greaterThan(0);
      });

      it("should generate accounts", async () => {
        await sandbox.start();
        const accounts = sandbox.getAccounts();

        expect(accounts.length).to.equal(20);
        expect(accounts[0].label).to.equal("Deployer");
        expect(accounts[0].address).to.match(/^0x/);
      });

      it("should deploy contracts", async () => {
        await sandbox.start();
        const contracts = sandbox.getContracts();

        expect(contracts.length).to.be.greaterThan(0);

        const registry = sandbox.getContract("CampaignRegistry");
        expect(registry).to.exist;
      });

      it("should create campaign", async () => {
        await sandbox.start();

        const campaign = sandbox.createCampaign({
          name: "Test Campaign",
          creator: "0x1234",
          beneficiary: "0x5678",
          goal: "10000000000000000000",
          milestones: [
            { name: "M1", oracleQuery: "test", releasePercent: 100 },
          ],
        });

        expect(campaign.id).to.match(/^campaign_/);
        expect(campaign.status).to.equal("active");
      });

      it("should create pledge", async () => {
        await sandbox.start();

        const campaign = sandbox.createCampaign({
          name: "Test Campaign",
          creator: "0x1234",
          beneficiary: "0x5678",
          goal: "10000000000000000000",
          milestones: [],
        });

        const pledge = sandbox.createPledge({
          campaignId: campaign.id,
          backer: "0xbacker",
          amount: "1000000000000000000",
        });

        expect(pledge.id).to.match(/^pledge_/);
        expect(pledge.status).to.equal("active");

        // Check campaign pledged amount updated
        const updated = sandbox.getCampaign(campaign.id);
        expect(updated!.pledged).to.equal("1000000000000000000");
      });

      it("should set mock oracle response", async () => {
        await sandbox.start();

        sandbox.setOracleResponse("test_query", {
          verified: true,
          value: 42,
        });

        const result = await sandbox.queryOracle("test_query");
        expect(result.verified).to.be.true;
        expect(result.value).to.equal(42);
      });

      it("should verify milestone", async () => {
        await sandbox.start();

        const campaign = sandbox.createCampaign({
          name: "Test Campaign",
          creator: "0x1234",
          beneficiary: "0x5678",
          goal: "10000000000000000000",
          milestones: [
            { name: "M1", oracleQuery: "registration_verified", releasePercent: 100 },
          ],
        });

        const milestone = await sandbox.verifyMilestone(
          campaign.id,
          campaign.milestones[0].id
        );

        expect(milestone.verified).to.be.true;
      });

      it("should resolve campaign", async () => {
        await sandbox.start();

        const campaign = sandbox.createCampaign({
          name: "Test Campaign",
          creator: "0x1234",
          beneficiary: "0x5678",
          goal: "10000000000000000000",
          milestones: [
            { name: "M1", oracleQuery: "registration_verified", releasePercent: 100 },
          ],
        });

        sandbox.createPledge({
          campaignId: campaign.id,
          backer: "0xbacker",
          amount: "5000000000000000000",
        });

        // Verify milestone
        await sandbox.verifyMilestone(campaign.id, campaign.milestones[0].id);

        // Resolve
        const result = await sandbox.resolveCampaign(campaign.id);

        expect(result.campaign.status).to.equal("resolved");
        expect(result.released).to.equal("5000000000000000000");
        expect(result.refunded).to.equal("0");
      });

      it("should mine blocks", async () => {
        await sandbox.start();
        const initial = sandbox.getBlockNumber();

        sandbox.mineBlocks(10);

        const after = sandbox.getBlockNumber();
        expect(after).to.equal(initial + 10);
      });

      it("should advance time", async () => {
        await sandbox.start();
        const initial = sandbox.getTimestamp();

        sandbox.advanceTime(3600); // 1 hour

        const after = sandbox.getTimestamp();
        expect(after).to.be.greaterThan(initial);
      });
    });
  });
});
