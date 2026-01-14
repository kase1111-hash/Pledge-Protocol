/**
 * Phase 10 Unit Tests - Standalone Runner
 *
 * Tests core functionality of Phase 10 services.
 */

import { notificationService } from "../src/notifications-v2";
import { translationService } from "../src/i18n";
import { reportService } from "../src/reporting";
import { integrationService } from "../src/integrations";
import { advancedCampaignService } from "../src/campaigns-advanced";

// Test utilities
let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passCount++;
  } else {
    console.log(`  ✗ ${message}`);
    failCount++;
  }
}

function describe(name: string, fn: () => void | Promise<void>): void {
  console.log(`\n${name}`);
  const result = fn();
  if (result instanceof Promise) {
    result.catch((e) => console.error(`Error in ${name}:`, e));
  }
}

// ============================================================================
// NOTIFICATION SERVICE TESTS
// ============================================================================

describe("NotificationService", () => {
  describe("Preferences", () => {
    const address = "0xtest_prefs_1";

    // Get default preferences
    const prefs = notificationService.getPreferences(address);
    assert(prefs.address === address, "Preferences address matches");
    assert(prefs.channels.email === true, "Email channel enabled by default");
    assert(prefs.channels.sms === false, "SMS channel disabled by default");

    // Update preferences
    const updated = notificationService.updatePreferences(address, {
      quietHours: {
        enabled: true,
        start: "22:00",
        end: "08:00",
        timezone: "America/Los_Angeles",
      },
    });
    assert(updated.quietHours.enabled === true, "Quiet hours enabled after update");
  });

  describe("Device Registration", () => {
    const address = "0xtest_device_1";

    // Register device
    const device = notificationService.registerDevice(address, {
      deviceId: "device_001",
      platform: "ios",
      token: "test_token_12345",
      deviceName: "iPhone 15",
    });

    assert(device.deviceId === "device_001", "Device ID matches");
    assert(device.platform === "ios", "Platform is iOS");
    assert(device.token === "test_token_12345", "Token matches");

    // Verify device was added to preferences
    const prefs = notificationService.getPreferences(address);
    assert(prefs.deviceTokens.length > 0, "Device token was registered");
  });

  describe("In-App Notifications", () => {
    const address = "0xtest_inapp_1";

    // Get unread count (should be 0 initially)
    const initialCount = notificationService.getUnreadCount(address);
    assert(initialCount === 0, "Initial unread count is 0");

    // Get notifications (empty initially)
    const notifications = notificationService.getInAppNotifications({ address });
    assert(Array.isArray(notifications), "Returns array of notifications");
  });

  describe("Digest Generation", () => {
    const address = "0xtest_digest_1";

    // Generate daily digest
    const digest = notificationService.generateDigest(address, "daily");

    assert(digest.address === address, "Digest address matches");
    assert(digest.period.start < digest.period.end, "Period has valid range");
    assert(typeof digest.summary.pledgesReceived === "number", "Digest has summary stats");
  });

  describe("Delivery Stats", () => {
    const stats = notificationService.getDeliveryStats();

    assert(typeof stats.total === "number", "Stats has total");
    assert(typeof stats.byChannel === "object", "Stats has byChannel");
    assert(typeof stats.deliveryRate === "number", "Stats has deliveryRate");
  });

  describe("Template Retrieval", () => {
    const template = notificationService.getTemplate("welcome", "email", "en");
    assert(template !== null, "Can retrieve welcome email template");
    assert(template?.type === "welcome", "Template type is welcome");
    assert(template?.channel === "email", "Template channel is email");
  });
});

// ============================================================================
// TRANSLATION SERVICE TESTS
// ============================================================================

describe("TranslationService", () => {
  describe("Supported Locales", () => {
    const locales = translationService.getSupportedLocales();

    assert(locales.length === 12, "Has 12 supported locales");
    assert(locales.some(l => l.code === "en"), "Includes English");
    assert(locales.some(l => l.code === "es"), "Includes Spanish");
    assert(locales.some(l => l.code === "ar"), "Includes Arabic (RTL)");
  });

  describe("Locale Configuration", () => {
    const enConfig = translationService.getLocaleConfig("en");
    const arConfig = translationService.getLocaleConfig("ar");

    assert(enConfig !== null, "English config exists");
    assert(enConfig?.direction === "ltr", "English is LTR");
    assert(arConfig?.direction === "rtl", "Arabic is RTL");
    assert(enConfig?.name === "English", "English name is correct");
  });

  describe("Translation", () => {
    // English
    const enCancel = translationService.translate("common:cancel");
    assert(enCancel === "Cancel", "English cancel translation");

    // Set locale to Spanish
    translationService.setLocale("es");
    const esCancel = translationService.translate("common:cancel");
    assert(esCancel === "Cancelar", "Spanish cancel translation");

    // Reset to English
    translationService.setLocale("en");

    // With explicit locale option
    const esLoading = translationService.translate("common:loading", { locale: "es" });
    assert(esLoading === "Cargando...", "Spanish loading translation with option");
  });

  describe("Plural Forms", () => {
    // English singular
    const oneItem = translationService.translatePlural("campaigns:backers_count", 1);
    assert(oneItem.includes("1") && oneItem.includes("backer"), "English singular");

    // English plural
    const manyItems = translationService.translatePlural("campaigns:backers_count", 5);
    assert(manyItems.includes("5") && manyItems.includes("backers"), "English plural");
  });

  describe("Date Formatting", () => {
    const date = new Date("2026-04-06T10:30:00Z");

    const enDate = translationService.formatDate(date, { format: "long" });
    assert(typeof enDate === "string" && enDate.length > 0, "English date formatted");

    const jaDate = translationService.formatDate(date, { locale: "ja", format: "long" });
    assert(typeof jaDate === "string" && jaDate.length > 0, "Japanese date formatted");
  });

  describe("Number Formatting", () => {
    const num = 1234567.89;

    const enNum = translationService.formatNumber(num);
    assert(enNum.includes("1,234,567"), "English number has comma separators");

    const deNum = translationService.formatNumber(num, { locale: "de" });
    assert(deNum.includes("1.234.567"), "German number has period separators");
  });

  describe("Currency Formatting", () => {
    const amount = 1234.56;

    const enUsd = translationService.formatCurrency(amount, { currency: "USD" });
    assert(enUsd.includes("$"), "USD formatted with symbol");

    const frEur = translationService.formatCurrency(amount, { currency: "EUR", locale: "fr" });
    assert(frEur.includes("€"), "EUR formatted for French");
  });

  describe("Currency Exchange", () => {
    const result = translationService.convertCurrency(100, "USD", "EUR");

    assert(typeof result.amount === "number", "Has converted amount");
    assert(typeof result.rate === "number", "Has exchange rate");
    assert(result.amount < 100, "EUR amount less than USD (typical rate)");
  });

  describe("User Preferences", () => {
    const address = "0xuser_i18n_1";

    const prefs = translationService.getUserPreferences(address);
    assert(prefs.address === address, "User prefs address matches");
    assert(prefs.locale === "en", "Default locale is English");

    const updated = translationService.updateUserPreferences(address, {
      locale: "es",
      currency: "EUR",
    });
    assert(updated.locale === "es", "User locale updated to Spanish");
    assert(updated.currency === "EUR", "User currency updated to EUR");
  });

  describe("Locale Detection", () => {
    const detected = translationService.detectLocale("es-ES,en-US;q=0.9,en;q=0.8");
    assert(detected === "es", "Detects Spanish from Accept-Language");

    const fallback = translationService.detectLocale("xyz-ZZ");
    assert(fallback === "en", "Falls back to English for unknown locale");
  });
});

// ============================================================================
// SERVICE INSTANTIATION TESTS
// ============================================================================

describe("Service Instantiation", () => {
  // Report service
  assert(typeof reportService.generateReport === "function", "ReportService has generateReport method");
  assert(typeof reportService.getReportStatus === "function", "ReportService has getReportStatus method");

  // Integration service
  assert(typeof integrationService.createIntegration === "function", "IntegrationService has createIntegration");
  assert(typeof integrationService.getIntegration === "function", "IntegrationService has getIntegration");
  assert(typeof integrationService.listIntegrations === "function", "IntegrationService has listIntegrations");

  // Advanced campaign service
  assert(typeof advancedCampaignService.createRecurringCampaign === "function", "AdvancedCampaignService has createRecurringCampaign");
  assert(typeof advancedCampaignService.addStretchGoal === "function", "AdvancedCampaignService has addStretchGoal");
  assert(typeof advancedCampaignService.createSeries === "function", "AdvancedCampaignService has createSeries");
});

// ============================================================================
// INTEGRATION SERVICE BASIC TESTS
// ============================================================================

describe("IntegrationService Basic", () => {
  const integration = integrationService.createIntegration({
    ownerAddress: "0xuser_int_1",
    type: "slack",
    name: "Team Notifications",
    config: {
      type: "slack",
      workspaceId: "T12345678",
      workspaceName: "Test Workspace",
      channelId: "C12345678",
      channelName: "general",
      botToken: "xoxb-test-token",
      accessToken: "xoxp-test-access",
    },
    events: ["campaign_created", "milestone_verified"],
  });

  assert(integration.id.startsWith("int_"), "Integration has proper ID format");
  assert(integration.ownerAddress === "0xuser_int_1", "Integration owner matches");
  assert(integration.type === "slack", "Integration type is slack");
  assert(integration.status === "connected", "Integration is connected");
  assert(integration.events.includes("campaign_created"), "Has campaign_created event");

  // Get integration
  const retrieved = integrationService.getIntegration(integration.id);
  assert(retrieved !== null, "Can retrieve integration");
  assert(retrieved?.name === "Team Notifications", "Name matches");

  // Update integration
  const updated = integrationService.updateIntegration(integration.id, {
    events: ["pledge_released"],
  });
  assert(updated.events.includes("pledge_released"), "Events updated");

  // List integrations
  const list = integrationService.listIntegrations("0xuser_int_1");
  assert(list.length > 0, "User has integrations");
});

// ============================================================================
// ADVANCED CAMPAIGN SERVICE BASIC TESTS
// ============================================================================

describe("AdvancedCampaignService Basic", () => {
  // Recurring campaign
  const recurring = advancedCampaignService.createRecurringCampaign({
    templateCampaignId: "base_camp_1",
    ownerAddress: "0xcreator_1",
    name: "Monthly Marathon",
    description: "Monthly fundraiser",
    frequency: "monthly",
    schedule: {
      startDate: Date.now() + 86400000, // Tomorrow
      dayOfMonth: 1,
    },
    settings: {
      autoCreateInstances: false,
    },
  });

  assert(recurring.id.startsWith("rec_"), "Recurring campaign has proper ID");
  assert(recurring.ownerAddress === "0xcreator_1", "Owner matches");
  assert(recurring.frequency === "monthly", "Frequency is monthly");
  assert(["active", "scheduled", "draft"].includes(recurring.status), "Has valid status");

  // Get recurring campaign
  const retrieved = advancedCampaignService.getRecurringCampaign(recurring.id);
  assert(retrieved !== null, "Can retrieve recurring campaign");

  // List recurring campaigns
  const list = advancedCampaignService.listRecurringCampaigns("0xcreator_1");
  assert(list.length > 0, "Creator has recurring campaigns");

  // Series
  const series = advancedCampaignService.createSeries({
    name: "Annual Marathon Series",
    description: "Yearly Portland Marathon campaigns",
    ownerAddress: "0xcreator_series_1",
  });

  assert(series.id.startsWith("ser_"), "Series has proper ID");
  assert(series.name === "Annual Marathon Series", "Series name matches");
  assert(Array.isArray(series.campaigns), "Has campaigns array");

  const retrievedSeries = advancedCampaignService.getSeries(series.id);
  assert(retrievedSeries !== null, "Can retrieve series");
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log("\n" + "=".repeat(60));
console.log("TEST SUMMARY");
console.log("=".repeat(60));
console.log(`  Passed: ${passCount}`);
console.log(`  Failed: ${failCount}`);
console.log(`  Total:  ${passCount + failCount}`);
console.log("=".repeat(60));

if (failCount > 0) {
  console.log("\nSome tests failed!");
  process.exit(1);
} else {
  console.log("\nAll tests passed!");
  process.exit(0);
}
