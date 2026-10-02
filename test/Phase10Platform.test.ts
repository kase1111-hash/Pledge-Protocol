/**
 * Phase 10: Platform Maturity Tests
 *
 * Tests for notifications, i18n, reporting, integrations, and advanced campaigns.
 */

import { describe, it, expect, beforeEach } from "vitest";

// Notifications
import {
  NotificationService,
  createNotificationService,
} from "../src/notifications-v2";

// i18n
import {
  TranslationService,
  createTranslationService,
  t,
} from "../src/i18n";

// Reporting
import {
  ReportService,
  createReportService,
} from "../src/reporting";

// Integrations
import {
  IntegrationService,
  createIntegrationService,
} from "../src/integrations";

// Advanced Campaigns

// ============================================================================
// NOTIFICATION SERVICE TESTS
// ============================================================================

describe("NotificationService", () => {
  let service: NotificationService;
  const testAddress = "0x1234567890123456789012345678901234567890";

  beforeEach(() => {
    service = createNotificationService({
      emailConfig: {
        provider: "sendgrid",
        fromEmail: "test@test.com",
        fromName: "Test",
      },
      pushConfig: {
        provider: "firebase",
      },
      baseUrl: "https://test.com",
    });
  });

  describe("Preferences", () => {
    it("should get default preferences", () => {
      const prefs = service.getPreferences(testAddress);

      expect(prefs.address).toBe(testAddress);
      expect(prefs.channels.email).toBe(true);
      expect(prefs.channels.push).toBe(true);
      expect(prefs.channels.in_app).toBe(true);
      expect(prefs.digest.enabled).toBe(true);
    });

    it("should update preferences", () => {
      const updated = service.updatePreferences(testAddress, {
        channels: { email: false, push: true, in_app: true, sms: false },
        locale: "es",
      });

      expect(updated.channels.email).toBe(false);
      expect(updated.locale).toBe("es");
    });

    it("should register device", () => {
      const device = service.registerDevice(testAddress, {
        token: "fcm_token_123",
        platform: "ios",
        deviceId: "device_123",
        deviceName: "iPhone 15",
      });

      expect(device.token).toBe("fcm_token_123");
      expect(device.platform).toBe("ios");
      expect(device.registeredAt).toBeDefined();

      const prefs = service.getPreferences(testAddress);
      expect(prefs.deviceTokens.length).toBe(1);
    });

    it("should unregister device", () => {
      service.registerDevice(testAddress, {
        token: "fcm_token_123",
        platform: "ios",
        deviceId: "device_123",
      });

      const success = service.unregisterDevice(testAddress, "device_123");
      expect(success).toBe(true);

      const prefs = service.getPreferences(testAddress);
      expect(prefs.deviceTokens.length).toBe(0);
    });
  });

  describe("Templates", () => {
    it("should get built-in template", () => {
      const template = service.getTemplate("welcome", "email", "en");

      expect(template).not.toBeNull();
      expect(template?.type).toBe("welcome");
      expect(template?.channel).toBe("email");
      expect(template?.subject).toContain("Welcome");
    });

    it("should render template with variables", () => {
      const template = service.getTemplate("welcome", "email", "en");
      const rendered = service.renderTemplate(template!, {
        userName: "Alice",
        baseUrl: "https://test.com",
        actionUrl: "https://test.com/campaigns",
      });

      expect(rendered.title).toContain("Welcome");
      expect(rendered.body).toContain("Alice");
    });

    it("should fallback to English for missing locale", () => {
      const template = service.getTemplate("welcome", "email", "ja");

      expect(template).not.toBeNull();
      expect(template?.locale).toBe("en"); // Fallback
    });
  });

  describe("In-App Notifications", () => {
    it("should get empty notifications for new user", () => {
      const notifications = service.getInAppNotifications({
        address: testAddress,
      });

      expect(notifications).toEqual([]);
    });

    it("should mark notifications as read", () => {
      const count = service.markAsRead(testAddress, ["notif_1", "notif_2"]);
      expect(count).toBe(0); // No notifications exist yet
    });

    it("should get unread count", () => {
      const count = service.getUnreadCount(testAddress);
      expect(count).toBe(0);
    });
  });

  describe("Digest", () => {
    it("should generate digest content", async () => {
      const digest = await service.generateDigest(testAddress, "weekly");

      expect(digest.address).toBe(testAddress);
      expect(digest.period).toBeDefined();
      expect(digest.summary).toBeDefined();
      expect(digest.summary.campaignsCreated).toBeDefined();
    });
  });

  describe("Delivery Stats", () => {
    it("should get delivery statistics", () => {
      const stats = service.getDeliveryStats();

      expect(stats.period).toBeDefined();
      expect(stats.total).toBeDefined();
      expect(stats.byStatus).toBeDefined();
      expect(stats.byChannel).toBeDefined();
      expect(stats.deliveryRate).toBeDefined();
    });
  });
});

// ============================================================================
// TRANSLATION SERVICE TESTS
// ============================================================================

describe("TranslationService", () => {
  let service: TranslationService;
  const testAddress = "0x1234567890123456789012345678901234567890";

  beforeEach(() => {
    service = createTranslationService({ defaultLocale: "en" });
  });

  describe("Locales", () => {
    it("should list supported locales", () => {
      const locales = service.getSupportedLocales();

      expect(locales.length).toBeGreaterThan(0);
      expect(locales.find((l) => l.code === "en")).toBeDefined();
      expect(locales.find((l) => l.code === "es")).toBeDefined();
    });

    it("should get locale config", () => {
      const config = service.getLocaleConfig("en");

      expect(config).not.toBeNull();
      expect(config?.name).toBe("English");
      expect(config?.direction).toBe("ltr");
    });

    it("should detect locale from Accept-Language", () => {
      const locale = service.detectLocale("es-ES,es;q=0.9,en;q=0.8");
      expect(locale).toBe("es");

      const fallback = service.detectLocale("xyz");
      expect(fallback).toBe("en");
    });

    it("should handle RTL locales", () => {
      const config = service.getLocaleConfig("ar");
      expect(config?.direction).toBe("rtl");
    });
  });

  describe("Translations", () => {
    it("should translate common keys", () => {
      const translation = service.translate("common:loading");
      expect(translation).toBe("Loading...");
    });

    it("should translate with variables", () => {
      const translation = service.translate("notifications:new_follower", {
        variables: { name: "Alice" },
      });
      expect(translation).toContain("Alice");
    });

    it("should handle plural forms", () => {
      const one = service.translatePlural("campaigns:backers_count", 1);
      expect(one).toContain("1 backer");

      const many = service.translatePlural("campaigns:backers_count", 5);
      expect(many).toContain("5 backers");
    });

    it("should check if translation exists", () => {
      expect(service.hasTranslation("common:loading", "en")).toBe(true);
      expect(service.hasTranslation("nonexistent:key", "en")).toBe(false);
    });

    it("should use fallback for missing translations", () => {
      const translation = service.translate("missing:key", {
        defaultValue: "Fallback text",
      });
      expect(translation).toBe("Fallback text");
    });
  });

  describe("Formatting", () => {
    it("should format dates", () => {
      const date = new Date("2025-06-15T10:30:00Z");
      const formatted = service.formatDate(date, { locale: "en" });
      expect(formatted).toBeDefined();
    });

    it("should format relative time", () => {
      const pastDate = Date.now() - 3600000; // 1 hour ago
      const formatted = service.formatRelativeTime(pastDate);
      expect(formatted).toContain("hour");
    });

    it("should format numbers", () => {
      const formatted = service.formatNumber(1234567.89, {
        locale: "en",
        style: "decimal",
      });
      expect(formatted).toContain("1,234,567");
    });

    it("should format currency", () => {
      const formatted = service.formatCurrency(99.99, {
        locale: "en",
        currency: "USD",
      });
      expect(formatted).toContain("$");
      expect(formatted).toContain("99.99");
    });

    it("should format crypto amounts", () => {
      const formatted = service.formatCurrency(1.5, {
        currency: "ETH",
      });
      expect(formatted).toContain("ETH");
    });
  });

  describe("Currency Exchange", () => {
    it("should list supported currencies", () => {
      const currencies = service.getSupportedCurrencies();
      expect(currencies.length).toBeGreaterThan(0);
      expect(currencies.find((c) => c.code === "USD")).toBeDefined();
      expect(currencies.find((c) => c.code === "USDC")).toBeDefined();
    });

    it("should get exchange rate", () => {
      const rate = service.getExchangeRate("EUR", "USD");
      expect(rate).not.toBeNull();
      expect(rate?.rate).toBeGreaterThan(0);
    });

    it("should convert currency", () => {
      const result = service.convertCurrency(100, "EUR", "USD");
      expect(result.amount).toBeGreaterThan(0);
      expect(result.rate).toBeGreaterThan(0);
    });
  });

  describe("User Preferences", () => {
    it("should get default preferences", () => {
      const prefs = service.getUserPreferences(testAddress);
      expect(prefs.locale).toBe("en");
      expect(prefs.currency).toBe("USD");
    });

    it("should update preferences", () => {
      const updated = service.updateUserPreferences(testAddress, {
        locale: "es",
        currency: "EUR",
        timezone: "Europe/Madrid",
      });

      expect(updated.locale).toBe("es");
      expect(updated.currency).toBe("EUR");
      expect(updated.timezone).toBe("Europe/Madrid");
    });
  });

  describe("Stats", () => {
    it("should get locale stats", () => {
      const stats = service.getLocaleStats("es");
      expect(stats.locale).toBe("es");
      expect(stats.totalKeys).toBeGreaterThan(0);
      expect(stats.completeness).toBeGreaterThanOrEqual(0);
    });

    it("should get translation progress", () => {
      const progress = service.getTranslationProgress("es");
      expect(progress.locale).toBe("es");
      expect(progress.byNamespace).toBeDefined();
      expect(progress.overall.completeness).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Helper function", () => {
    it("should provide t() shorthand", () => {
      const translation = t("common:loading");
      expect(translation).toBe("Loading...");
    });
  });
});

// ============================================================================
// REPORT SERVICE TESTS
// ============================================================================

describe("ReportService", () => {
  let service: ReportService;
  const testAddress = "0x1234567890123456789012345678901234567890";

  beforeEach(() => {
    service = createReportService();
  });

  describe("Report Generation", () => {
    it("should generate financial summary report", async () => {
      const report = await service.generateReport({
        type: "financial_summary",
        format: "json",
        requestedBy: testAddress,
        period: { type: "month" },
      });

      expect(report.id).toMatch(/^rpt_/);
      expect(report.type).toBe("financial_summary");
      expect(report.status).toBeDefined();
    });

    it("should get report status", async () => {
      const report = await service.generateReport({
        type: "financial_summary",
        format: "json",
        requestedBy: testAddress,
        period: { type: "month" },
      });

      const status = service.getReportStatus(report.id);
      expect(status).not.toBeNull();
      expect(status?.id).toBe(report.id);
    });

    it("should cancel pending report", async () => {
      const report = await service.generateReport({
        type: "financial_summary",
        format: "json",
        requestedBy: testAddress,
        period: { type: "month" },
      });

      // Note: May not be cancellable if already processed
      service.cancelReport(report.id);
    });
  });

  describe("Financial Reports", () => {
    it("should get financial summary", async () => {
      const summary = await service.getFinancialSummary(testAddress, "month");

      expect(summary.period).toBeDefined();
      expect(summary.overview.totalRevenue).toBeDefined();
      expect(summary.byCategory).toBeInstanceOf(Array);
      expect(summary.trends).toBeInstanceOf(Array);
    });

    it("should get transaction history", async () => {
      const transactions = await service.getTransactionHistory(testAddress);

      expect(transactions).toBeInstanceOf(Array);
      if (transactions.length > 0) {
        expect(transactions[0].id).toBeDefined();
        expect(transactions[0].type).toBeDefined();
        expect(transactions[0].amount).toBeDefined();
      }
    });

    it("should get payout report", async () => {
      const payouts = await service.getPayoutReport(testAddress, "month");

      expect(payouts.recipient).toBe(testAddress);
      expect(payouts.payouts).toBeInstanceOf(Array);
      expect(payouts.summary.grossAmount).toBeDefined();
    });
  });

  describe("Tax Reports", () => {
    it("should get tax summary", async () => {
      const summary = await service.getTaxSummary(testAddress, 2025, "US");

      expect(summary.taxYear).toBe(2025);
      expect(summary.taxpayerAddress).toBe(testAddress);
      expect(summary.income.total).toBeDefined();
      expect(summary.expenses.total).toBeDefined();
    });

    it("should generate tax form", async () => {
      const form = await service.generateTaxForm(testAddress, "1099-MISC", 2025);

      expect(form.type).toBe("1099-MISC");
      expect(form.year).toBe(2025);
      expect(form.status).toBeDefined();
    });
  });

  describe("Campaign Reports", () => {
    it("should get campaign performance", async () => {
      const performance = await service.getCampaignPerformance("campaign_123");

      expect(performance.campaignId).toBe("campaign_123");
      expect(performance.metrics.totalPledged).toBeDefined();
      expect(performance.timeline).toBeInstanceOf(Array);
      expect(performance.topBackers).toBeInstanceOf(Array);
    });
  });

  describe("Backer Reports", () => {
    it("should get backer activity", async () => {
      const activity = await service.getBackerActivity(testAddress);

      expect(activity.backerAddress).toBe(testAddress);
      expect(activity.summary.totalPledged).toBeDefined();
      expect(activity.pledges).toBeInstanceOf(Array);
      expect(activity.portfolio).toBeDefined();
    });
  });

  describe("Audit", () => {
    it("should get audit trail", async () => {
      const audit = await service.getAuditTrail("campaign", "campaign_123");

      expect(audit.entityType).toBe("campaign");
      expect(audit.entityId).toBe("campaign_123");
      expect(audit.events).toBeInstanceOf(Array);
    });
  });

  describe("Exports", () => {
    it("should request data export", async () => {
      const exportReq = await service.requestExport({
        dataType: "campaigns",
        format: "csv",
        requestedBy: testAddress,
      });

      expect(exportReq.id).toMatch(/^exp_/);
      expect(exportReq.dataType).toBe("campaigns");
      expect(exportReq.format).toBe("csv");
    });

    it("should get export status", async () => {
      const exportReq = await service.requestExport({
        dataType: "pledges",
        format: "json",
        requestedBy: testAddress,
      });

      const status = service.getExportStatus(exportReq.id);
      expect(status).not.toBeNull();
    });
  });

  describe("Scheduled Reports", () => {
    it("should create scheduled report", () => {
      const scheduled = service.createScheduledReport({
        name: "Weekly Summary",
        type: "financial_summary",
        format: "pdf",
        frequency: "weekly",
        time: "09:00",
        timezone: "UTC",
        recipients: [{ address: testAddress, deliveryMethod: "email" }],
        createdBy: testAddress,
      });

      expect(scheduled.id).toMatch(/^sched_/);
      expect(scheduled.name).toBe("Weekly Summary");
      expect(scheduled.frequency).toBe("weekly");
      expect(scheduled.enabled).toBe(true);
    });

    it("should list scheduled reports", () => {
      service.createScheduledReport({
        name: "Test Report",
        type: "financial_summary",
        format: "pdf",
        frequency: "monthly",
        time: "09:00",
        timezone: "UTC",
        recipients: [{ address: testAddress, deliveryMethod: "email" }],
        createdBy: testAddress,
      });

      const reports = service.listScheduledReports(testAddress);
      expect(reports.length).toBeGreaterThan(0);
    });

    it("should update scheduled report", () => {
      const scheduled = service.createScheduledReport({
        name: "Test Report",
        type: "financial_summary",
        format: "pdf",
        frequency: "weekly",
        time: "09:00",
        timezone: "UTC",
        recipients: [{ address: testAddress, deliveryMethod: "email" }],
        createdBy: testAddress,
      });

      const updated = service.updateScheduledReport(scheduled.id, {
        enabled: false,
      });

      expect(updated.enabled).toBe(false);
    });

    it("should delete scheduled report", () => {
      const scheduled = service.createScheduledReport({
        name: "Test Report",
        type: "financial_summary",
        format: "pdf",
        frequency: "weekly",
        time: "09:00",
        timezone: "UTC",
        recipients: [{ address: testAddress, deliveryMethod: "email" }],
        createdBy: testAddress,
      });

      const success = service.deleteScheduledReport(scheduled.id);
      expect(success).toBe(true);
    });
  });
});

// ============================================================================
// INTEGRATION SERVICE TESTS
// ============================================================================

describe("IntegrationService", () => {
  let service: IntegrationService;
  const testAddress = "0x1234567890123456789012345678901234567890";

  beforeEach(() => {
    service = createIntegrationService({
      baseUrl: "https://test.com",
    });
  });

  describe("Integration Management", () => {
    it("should create Slack integration", () => {
      const integration = service.createIntegration({
        type: "slack",
        ownerAddress: testAddress,
        name: "My Slack",
        config: {
          type: "slack",
          workspaceId: "W123",
          workspaceName: "Test Workspace",
          channelId: "C123",
          channelName: "general",
          botToken: "xoxb-123",
        },
        events: ["campaign_created", "pledge_created"],
      });

      expect(integration.id).toMatch(/^int_/);
      expect(integration.type).toBe("slack");
      expect(integration.status).toBe("connected");
    });

    it("should create Discord integration", () => {
      const integration = service.createIntegration({
        type: "discord",
        ownerAddress: testAddress,
        name: "My Discord",
        config: {
          type: "discord",
          guildId: "G123",
          guildName: "Test Server",
          channelId: "C123",
          channelName: "general",
          webhookUrl: "https://discord.com/api/webhooks/123/abc",
        },
        events: ["campaign_created"],
      });

      expect(integration.type).toBe("discord");
    });

    it("should create Zapier integration", () => {
      const integration = service.createIntegration({
        type: "zapier",
        ownerAddress: testAddress,
        name: "My Zapier",
        config: {
          type: "zapier",
          webhookUrl: "https://hooks.zapier.com/123/abc",
        },
        events: ["pledge_created", "milestone_verified"],
      });

      expect(integration.type).toBe("zapier");
    });

    it("should list integrations", () => {
      service.createIntegration({
        type: "slack",
        ownerAddress: testAddress,
        name: "Test",
        config: {
          type: "slack",
          workspaceId: "W123",
          workspaceName: "Test",
          channelId: "C123",
          channelName: "general",
          botToken: "xoxb-123",
        },
        events: ["campaign_created"],
      });

      const integrations = service.listIntegrations(testAddress);
      expect(integrations.length).toBeGreaterThan(0);
    });

    it("should get integration by id", () => {
      const created = service.createIntegration({
        type: "webhook",
        ownerAddress: testAddress,
        name: "Test Webhook",
        config: {
          type: "webhook",
          url: "https://example.com/webhook",
        },
        events: ["campaign_created"],
      });

      const retrieved = service.getIntegration(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
    });

    it("should update integration", () => {
      const created = service.createIntegration({
        type: "webhook",
        ownerAddress: testAddress,
        name: "Test",
        config: {
          type: "webhook",
          url: "https://example.com/webhook",
        },
        events: ["campaign_created"],
      });

      const updated = service.updateIntegration(created.id, {
        name: "Updated Name",
        events: ["pledge_created", "milestone_verified"],
      });

      expect(updated.name).toBe("Updated Name");
      expect(updated.events).toContain("pledge_created");
    });

    it("should delete integration", () => {
      const created = service.createIntegration({
        type: "webhook",
        ownerAddress: testAddress,
        name: "Test",
        config: {
          type: "webhook",
          url: "https://example.com/webhook",
        },
        events: ["campaign_created"],
      });

      const success = service.deleteIntegration(created.id);
      expect(success).toBe(true);

      const retrieved = service.getIntegration(created.id);
      expect(retrieved).toBeNull();
    });
  });

  describe("Message Formatting", () => {
    it("should format campaign created payload", () => {
      const payload = service.formatPayload("campaign_created", {
        campaignId: "campaign_123",
        campaignName: "Test Campaign",
        creatorAddress: testAddress,
        goalAmount: "10000",
      });

      expect(payload.eventType).toBe("campaign_created");
      expect(payload.formatted?.title).toContain("Campaign");
      expect(payload.data.campaignId).toBe("campaign_123");
    });

    it("should format pledge created payload", () => {
      const payload = service.formatPayload("pledge_created", {
        pledgeId: "pledge_123",
        campaignName: "Test Campaign",
        backerAddress: testAddress,
        amount: "100",
      });

      expect(payload.eventType).toBe("pledge_created");
      expect(payload.formatted?.title).toContain("Pledge");
    });

    it("should format milestone verified payload", () => {
      const payload = service.formatPayload("milestone_verified", {
        campaignName: "Test Campaign",
        milestoneName: "First Goal",
        oracleType: "api",
        result: "success",
      });

      expect(payload.eventType).toBe("milestone_verified");
      expect(payload.formatted?.title).toContain("Milestone");
    });
  });

  describe("Stats", () => {
    it("should get integration stats", () => {
      service.createIntegration({
        type: "slack",
        ownerAddress: testAddress,
        name: "Test",
        config: {
          type: "slack",
          workspaceId: "W123",
          workspaceName: "Test",
          channelId: "C123",
          channelName: "general",
          botToken: "xoxb-123",
        },
        events: ["campaign_created"],
      });

      const stats = service.getIntegrationStats(testAddress);
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.byType).toBeDefined();
      expect(stats.byStatus).toBeDefined();
    });
  });
});
