/**
 * Phase 10: Internationalization API Routes
 *
 * Translations, locales, and formatting.
 */

import { Router, Request, Response } from "express";
import { translationService } from "../../i18n";

const router = Router();

// ============================================================================
// LOCALES
// ============================================================================

/**
 * GET /i18n/locales
 * List supported locales
 */
router.get("/locales", (_req: Request, res: Response) => {
  const locales = translationService.getSupportedLocales();
  res.json({ locales });
});

/**
 * GET /i18n/locales/:locale
 * Get locale configuration
 */
router.get("/locales/:locale", (req: Request, res: Response) => {
  const config = translationService.getLocaleConfig(req.params.locale as any);

  if (!config) {
    return res.status(404).json({ error: "Locale not found" });
  }

  res.json(config);
});

/**
 * GET /i18n/locales/:locale/stats
 * Get locale translation stats
 */
router.get("/locales/:locale/stats", (req: Request, res: Response) => {
  const stats = translationService.getLocaleStats(req.params.locale as any);
  res.json(stats);
});

/**
 * GET /i18n/locales/:locale/progress
 * Get translation progress by namespace
 */
router.get("/locales/:locale/progress", (req: Request, res: Response) => {
  const progress = translationService.getTranslationProgress(req.params.locale as any);
  res.json(progress);
});

// ============================================================================
// DETECT LOCALE
// ============================================================================

/**
 * GET /i18n/detect
 * Detect locale from Accept-Language header
 */
router.get("/detect", (req: Request, res: Response) => {
  const acceptLanguage = req.headers["accept-language"] || "en";
  const locale = translationService.detectLocale(acceptLanguage);
  const config = translationService.getLocaleConfig(locale);

  res.json({
    detected: locale,
    config,
  });
});

// ============================================================================
// TRANSLATIONS
// ============================================================================

/**
 * GET /i18n/translate
 * Translate a key
 */
router.get("/translate", (req: Request, res: Response) => {
  const { key, locale, namespace, variables, count } = req.query;

  let parsedVariables: Record<string, string | number> | undefined;
  if (variables) {
    try {
      parsedVariables = JSON.parse(String(variables));
    } catch {
      parsedVariables = undefined;
    }
  }

  const translation = translationService.translate(key as string, {
    locale: locale as any,
    namespace: namespace as any,
    variables: parsedVariables,
    count: count ? parseInt(String(count)) : undefined,
  });

  res.json({
    key,
    translation,
    locale: locale || translationService.getLocale(),
  });
});

/**
 * POST /i18n/translate/batch
 * Translate multiple keys
 */
router.post("/translate/batch", (req: Request, res: Response) => {
  const { keys, locale, namespace } = req.body;

  const translations: Record<string, string> = {};

  for (const key of keys || []) {
    translations[key] = translationService.translate(key, {
      locale,
      namespace,
    });
  }

  res.json({
    translations,
    locale: locale || translationService.getLocale(),
    count: Object.keys(translations).length,
  });
});

// ============================================================================
// BUNDLES
// ============================================================================

/**
 * GET /i18n/bundles/:locale/:namespace
 * Get translation bundle
 */
router.get("/bundles/:locale/:namespace", (req: Request, res: Response) => {
  const bundle = translationService.getBundle(
    req.params.locale as any,
    req.params.namespace as any
  );

  if (!bundle) {
    return res.status(404).json({ error: "Bundle not found" });
  }

  res.json(bundle);
});

/**
 * PUT /i18n/bundles/:locale/:namespace
 * Load/update translation bundle
 */
router.put("/bundles/:locale/:namespace", (req: Request, res: Response) => {
  try {
    const bundle = {
      locale: req.params.locale as any,
      namespace: req.params.namespace as any,
      translations: req.body.translations || {},
      version: req.body.version || 1,
      updatedAt: Date.now(),
    };

    translationService.loadBundle(bundle);
    res.json({ success: true, bundle });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to load bundle",
    });
  }
});

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * POST /i18n/format/date
 * Format a date
 */
router.post("/format/date", (req: Request, res: Response) => {
  const { date, locale, format, includeTime, relative } = req.body;

  const formatted = translationService.formatDate(
    typeof date === "number" ? date : new Date(date),
    { locale, format, includeTime, relative }
  );

  res.json({ formatted, locale: locale || translationService.getLocale() });
});

/**
 * POST /i18n/format/number
 * Format a number
 */
router.post("/format/number", (req: Request, res: Response) => {
  const { value, locale, style, minimumFractionDigits, maximumFractionDigits, notation } = req.body;

  const formatted = translationService.formatNumber(value, {
    locale,
    style,
    minimumFractionDigits,
    maximumFractionDigits,
    notation,
  });

  res.json({ formatted, locale: locale || translationService.getLocale() });
});

/**
 * POST /i18n/format/currency
 * Format a currency amount
 */
router.post("/format/currency", (req: Request, res: Response) => {
  const { amount, locale, currency, showSymbol, showCode, hideZeroDecimals } = req.body;

  const formatted = translationService.formatCurrency(amount, {
    locale,
    currency,
    showSymbol,
    showCode,
    hideZeroDecimals,
  });

  res.json({ formatted, currency: currency || "USD" });
});

/**
 * POST /i18n/format/relative
 * Format relative time
 */
router.post("/format/relative", (req: Request, res: Response) => {
  const { date, locale } = req.body;

  const formatted = translationService.formatRelativeTime(
    typeof date === "number" ? date : new Date(date),
    { locale }
  );

  res.json({ formatted, locale: locale || translationService.getLocale() });
});

// ============================================================================
// CURRENCIES
// ============================================================================

/**
 * GET /i18n/currencies
 * List supported currencies
 */
router.get("/currencies", (_req: Request, res: Response) => {
  const currencies = translationService.getSupportedCurrencies();
  res.json({ currencies });
});

/**
 * GET /i18n/currencies/rates
 * Get exchange rates
 */
router.get("/currencies/rates", (req: Request, res: Response) => {
  const { from, to } = req.query;

  if (from && to) {
    const rate = translationService.getExchangeRate(from as any, to as any);
    return res.json(rate || { error: "Rate not available" });
  }

  // Return all rates to USD
  const currencies = translationService.getSupportedCurrencies();
  const rates: Record<string, number> = {};

  for (const currency of currencies) {
    const rate = translationService.getExchangeRate(currency.code, "USD");
    if (rate) {
      rates[currency.code] = rate.rate;
    }
  }

  res.json({ baseCurrency: "USD", rates });
});

/**
 * POST /i18n/currencies/convert
 * Convert between currencies
 */
router.post("/currencies/convert", (req: Request, res: Response) => {
  try {
    const { amount, from, to } = req.body;

    const result = translationService.convertCurrency(amount, from, to);
    res.json({
      from: { currency: from, amount },
      to: { currency: to, amount: result.amount },
      rate: result.rate,
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Conversion failed",
    });
  }
});

// ============================================================================
// USER PREFERENCES
// ============================================================================

/**
 * GET /i18n/preferences/:address
 * Get user locale preferences
 */
router.get("/preferences/:address", (req: Request, res: Response) => {
  const preferences = translationService.getUserPreferences(req.params.address);
  res.json(preferences);
});

/**
 * PUT /i18n/preferences/:address
 * Update user locale preferences
 */
router.put("/preferences/:address", (req: Request, res: Response) => {
  try {
    const updated = translationService.updateUserPreferences(
      req.params.address,
      req.body
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to update preferences",
    });
  }
});

export default router;
