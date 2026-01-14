/**
 * Phase 10: Internationalization Types
 *
 * Multi-language support and locale configuration.
 */

// ============================================================================
// LOCALE TYPES
// ============================================================================

export type SupportedLocale =
  | "en"      // English
  | "es"      // Spanish
  | "fr"      // French
  | "de"      // German
  | "pt"      // Portuguese
  | "ja"      // Japanese
  | "zh"      // Chinese (Simplified)
  | "zh-TW"   // Chinese (Traditional)
  | "ko"      // Korean
  | "ar"      // Arabic
  | "ru"      // Russian
  | "it"      // Italian;

export type LocaleDirection = "ltr" | "rtl";

export interface LocaleConfig {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  direction: LocaleDirection;
  dateFormat: string;
  timeFormat: string;
  numberFormat: {
    decimal: string;
    thousand: string;
    precision: number;
  };
  currency: {
    code: string;
    symbol: string;
    position: "before" | "after";
  };
  enabled: boolean;
  completeness: number; // Percentage of translations complete
}

// ============================================================================
// TRANSLATION TYPES
// ============================================================================

export type TranslationNamespace =
  | "common"
  | "campaigns"
  | "pledges"
  | "oracles"
  | "disputes"
  | "social"
  | "payments"
  | "enterprise"
  | "errors"
  | "emails"
  | "notifications";

export interface TranslationKey {
  namespace: TranslationNamespace;
  key: string;
  defaultValue: string;
  description?: string;
  placeholders?: string[];
}

export interface Translation {
  id: string;
  locale: SupportedLocale;
  namespace: TranslationNamespace;
  key: string;
  value: string;
  pluralForms?: {
    zero?: string;
    one?: string;
    two?: string;
    few?: string;
    many?: string;
    other: string;
  };
  metadata: {
    createdAt: number;
    updatedAt: number;
    createdBy?: string;
    verified: boolean;
    machineTranslated: boolean;
  };
}

export interface TranslationBundle {
  locale: SupportedLocale;
  namespace: TranslationNamespace;
  translations: Record<string, string | PluralTranslation>;
  version: number;
  updatedAt: number;
}

export interface PluralTranslation {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

// ============================================================================
// CURRENCY TYPES
// ============================================================================

export type SupportedCurrency =
  | "USD"   // US Dollar
  | "EUR"   // Euro
  | "GBP"   // British Pound
  | "JPY"   // Japanese Yen
  | "CNY"   // Chinese Yuan
  | "KRW"   // South Korean Won
  | "BRL"   // Brazilian Real
  | "CAD"   // Canadian Dollar
  | "AUD"   // Australian Dollar
  | "CHF"   // Swiss Franc
  | "INR"   // Indian Rupee
  | "MXN"   // Mexican Peso
  | "USDC"  // Stablecoin
  | "ETH";  // Ethereum

export interface CurrencyConfig {
  code: SupportedCurrency;
  name: string;
  symbol: string;
  decimals: number;
  isCrypto: boolean;
  exchangeRates: Record<string, number>; // Rates to USD
}

export interface ExchangeRate {
  from: SupportedCurrency;
  to: SupportedCurrency;
  rate: number;
  source: string;
  timestamp: number;
}

// ============================================================================
// FORMATTING TYPES
// ============================================================================

export interface FormatOptions {
  locale?: SupportedLocale;
  currency?: SupportedCurrency;
  timezone?: string;
}

export interface DateFormatOptions extends FormatOptions {
  format?: "short" | "medium" | "long" | "full" | string;
  includeTime?: boolean;
  relative?: boolean;
}

export interface NumberFormatOptions extends FormatOptions {
  style?: "decimal" | "currency" | "percent";
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  notation?: "standard" | "compact" | "scientific";
}

export interface CurrencyFormatOptions extends FormatOptions {
  showSymbol?: boolean;
  showCode?: boolean;
  hideZeroDecimals?: boolean;
}

// ============================================================================
// USER LOCALE PREFERENCES
// ============================================================================

export interface UserLocalePreferences {
  address: string;
  locale: SupportedLocale;
  currency: SupportedCurrency;
  timezone: string;
  dateFormat: "mdy" | "dmy" | "ymd";
  timeFormat: "12h" | "24h";
  numberFormat: "comma_decimal" | "decimal_comma" | "space_comma";
  updatedAt: number;
}

// ============================================================================
// TRANSLATION SERVICE INTERFACE
// ============================================================================

export interface TranslationServiceInterface {
  // Locales
  getSupportedLocales(): LocaleConfig[];
  getLocaleConfig(locale: SupportedLocale): LocaleConfig | null;
  detectLocale(acceptLanguage: string): SupportedLocale;

  // Translations
  translate(
    key: string,
    options?: TranslateOptions
  ): string;
  translatePlural(
    key: string,
    count: number,
    options?: TranslateOptions
  ): string;
  hasTranslation(key: string, locale: SupportedLocale): boolean;

  // Bundles
  getBundle(locale: SupportedLocale, namespace: TranslationNamespace): TranslationBundle | null;
  loadBundle(bundle: TranslationBundle): void;
  exportBundle(locale: SupportedLocale, namespace: TranslationNamespace): TranslationBundle;

  // Formatting
  formatDate(date: Date | number, options?: DateFormatOptions): string;
  formatNumber(value: number, options?: NumberFormatOptions): string;
  formatCurrency(amount: number | string, options?: CurrencyFormatOptions): string;
  formatRelativeTime(date: Date | number, options?: FormatOptions): string;

  // Currency
  getSupportedCurrencies(): CurrencyConfig[];
  getExchangeRate(from: SupportedCurrency, to: SupportedCurrency): ExchangeRate | null;
  convertCurrency(
    amount: number,
    from: SupportedCurrency,
    to: SupportedCurrency
  ): { amount: number; rate: number };

  // User preferences
  getUserPreferences(address: string): UserLocalePreferences;
  updateUserPreferences(
    address: string,
    updates: Partial<UserLocalePreferences>
  ): UserLocalePreferences;
}

export interface TranslateOptions {
  locale?: SupportedLocale;
  namespace?: TranslationNamespace;
  defaultValue?: string;
  variables?: Record<string, string | number>;
  count?: number;
}

// ============================================================================
// LOCALE METADATA
// ============================================================================

export interface LocaleStats {
  locale: SupportedLocale;
  totalKeys: number;
  translatedKeys: number;
  verifiedKeys: number;
  machineTranslatedKeys: number;
  completeness: number;
  lastUpdated: number;
}

export interface TranslationProgress {
  locale: SupportedLocale;
  byNamespace: Record<TranslationNamespace, {
    total: number;
    translated: number;
    verified: number;
  }>;
  overall: {
    total: number;
    translated: number;
    verified: number;
    completeness: number;
  };
}
