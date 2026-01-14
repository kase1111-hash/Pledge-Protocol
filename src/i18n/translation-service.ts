/**
 * Phase 10: Translation Service
 *
 * Multi-language support with formatting utilities.
 */

import {
  SupportedLocale,
  LocaleConfig,
  TranslationNamespace,
  Translation,
  TranslationBundle,
  PluralTranslation,
  SupportedCurrency,
  CurrencyConfig,
  ExchangeRate,
  UserLocalePreferences,
  TranslateOptions,
  DateFormatOptions,
  NumberFormatOptions,
  CurrencyFormatOptions,
  LocaleStats,
  TranslationProgress,
} from "./types";

// ============================================================================
// LOCALE CONFIGURATIONS
// ============================================================================

const LOCALE_CONFIGS: Record<SupportedLocale, LocaleConfig> = {
  en: {
    code: "en",
    name: "English",
    nativeName: "English",
    direction: "ltr",
    dateFormat: "MM/DD/YYYY",
    timeFormat: "h:mm A",
    numberFormat: { decimal: ".", thousand: ",", precision: 2 },
    currency: { code: "USD", symbol: "$", position: "before" },
    enabled: true,
    completeness: 100,
  },
  es: {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    direction: "ltr",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "HH:mm",
    numberFormat: { decimal: ",", thousand: ".", precision: 2 },
    currency: { code: "EUR", symbol: "€", position: "after" },
    enabled: true,
    completeness: 85,
  },
  fr: {
    code: "fr",
    name: "French",
    nativeName: "Français",
    direction: "ltr",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "HH:mm",
    numberFormat: { decimal: ",", thousand: " ", precision: 2 },
    currency: { code: "EUR", symbol: "€", position: "after" },
    enabled: true,
    completeness: 80,
  },
  de: {
    code: "de",
    name: "German",
    nativeName: "Deutsch",
    direction: "ltr",
    dateFormat: "DD.MM.YYYY",
    timeFormat: "HH:mm",
    numberFormat: { decimal: ",", thousand: ".", precision: 2 },
    currency: { code: "EUR", symbol: "€", position: "after" },
    enabled: true,
    completeness: 75,
  },
  pt: {
    code: "pt",
    name: "Portuguese",
    nativeName: "Português",
    direction: "ltr",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "HH:mm",
    numberFormat: { decimal: ",", thousand: ".", precision: 2 },
    currency: { code: "BRL", symbol: "R$", position: "before" },
    enabled: true,
    completeness: 70,
  },
  ja: {
    code: "ja",
    name: "Japanese",
    nativeName: "日本語",
    direction: "ltr",
    dateFormat: "YYYY/MM/DD",
    timeFormat: "HH:mm",
    numberFormat: { decimal: ".", thousand: ",", precision: 0 },
    currency: { code: "JPY", symbol: "¥", position: "before" },
    enabled: true,
    completeness: 65,
  },
  zh: {
    code: "zh",
    name: "Chinese (Simplified)",
    nativeName: "简体中文",
    direction: "ltr",
    dateFormat: "YYYY/MM/DD",
    timeFormat: "HH:mm",
    numberFormat: { decimal: ".", thousand: ",", precision: 2 },
    currency: { code: "CNY", symbol: "¥", position: "before" },
    enabled: true,
    completeness: 60,
  },
  "zh-TW": {
    code: "zh-TW",
    name: "Chinese (Traditional)",
    nativeName: "繁體中文",
    direction: "ltr",
    dateFormat: "YYYY/MM/DD",
    timeFormat: "HH:mm",
    numberFormat: { decimal: ".", thousand: ",", precision: 2 },
    currency: { code: "CNY", symbol: "¥", position: "before" },
    enabled: true,
    completeness: 55,
  },
  ko: {
    code: "ko",
    name: "Korean",
    nativeName: "한국어",
    direction: "ltr",
    dateFormat: "YYYY.MM.DD",
    timeFormat: "HH:mm",
    numberFormat: { decimal: ".", thousand: ",", precision: 0 },
    currency: { code: "KRW", symbol: "₩", position: "before" },
    enabled: true,
    completeness: 50,
  },
  ar: {
    code: "ar",
    name: "Arabic",
    nativeName: "العربية",
    direction: "rtl",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "HH:mm",
    numberFormat: { decimal: "٫", thousand: "٬", precision: 2 },
    currency: { code: "USD", symbol: "$", position: "after" },
    enabled: true,
    completeness: 40,
  },
  ru: {
    code: "ru",
    name: "Russian",
    nativeName: "Русский",
    direction: "ltr",
    dateFormat: "DD.MM.YYYY",
    timeFormat: "HH:mm",
    numberFormat: { decimal: ",", thousand: " ", precision: 2 },
    currency: { code: "USD", symbol: "$", position: "before" },
    enabled: true,
    completeness: 45,
  },
  it: {
    code: "it",
    name: "Italian",
    nativeName: "Italiano",
    direction: "ltr",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "HH:mm",
    numberFormat: { decimal: ",", thousand: ".", precision: 2 },
    currency: { code: "EUR", symbol: "€", position: "after" },
    enabled: true,
    completeness: 50,
  },
};

// ============================================================================
// CURRENCY CONFIGURATIONS
// ============================================================================

const CURRENCY_CONFIGS: Record<SupportedCurrency, CurrencyConfig> = {
  USD: { code: "USD", name: "US Dollar", symbol: "$", decimals: 2, isCrypto: false, exchangeRates: { USD: 1 } },
  EUR: { code: "EUR", name: "Euro", symbol: "€", decimals: 2, isCrypto: false, exchangeRates: { USD: 1.08 } },
  GBP: { code: "GBP", name: "British Pound", symbol: "£", decimals: 2, isCrypto: false, exchangeRates: { USD: 1.27 } },
  JPY: { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0, isCrypto: false, exchangeRates: { USD: 0.0067 } },
  CNY: { code: "CNY", name: "Chinese Yuan", symbol: "¥", decimals: 2, isCrypto: false, exchangeRates: { USD: 0.14 } },
  KRW: { code: "KRW", name: "South Korean Won", symbol: "₩", decimals: 0, isCrypto: false, exchangeRates: { USD: 0.00075 } },
  BRL: { code: "BRL", name: "Brazilian Real", symbol: "R$", decimals: 2, isCrypto: false, exchangeRates: { USD: 0.20 } },
  CAD: { code: "CAD", name: "Canadian Dollar", symbol: "C$", decimals: 2, isCrypto: false, exchangeRates: { USD: 0.74 } },
  AUD: { code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2, isCrypto: false, exchangeRates: { USD: 0.65 } },
  CHF: { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimals: 2, isCrypto: false, exchangeRates: { USD: 1.12 } },
  INR: { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2, isCrypto: false, exchangeRates: { USD: 0.012 } },
  MXN: { code: "MXN", name: "Mexican Peso", symbol: "MX$", decimals: 2, isCrypto: false, exchangeRates: { USD: 0.058 } },
  USDC: { code: "USDC", name: "USD Coin", symbol: "USDC", decimals: 6, isCrypto: true, exchangeRates: { USD: 1 } },
  ETH: { code: "ETH", name: "Ethereum", symbol: "Ξ", decimals: 18, isCrypto: true, exchangeRates: { USD: 3200 } },
};

// ============================================================================
// BUILT-IN TRANSLATIONS
// ============================================================================

const TRANSLATIONS: Record<string, Record<TranslationNamespace, Record<string, string | PluralTranslation>>> = {
  en: {
    common: {
      "loading": "Loading...",
      "error": "An error occurred",
      "success": "Success",
      "cancel": "Cancel",
      "confirm": "Confirm",
      "save": "Save",
      "delete": "Delete",
      "edit": "Edit",
      "view": "View",
      "search": "Search",
      "filter": "Filter",
      "sort": "Sort",
      "back": "Back",
      "next": "Next",
      "previous": "Previous",
      "submit": "Submit",
      "close": "Close",
      "yes": "Yes",
      "no": "No",
      "more": "More",
      "less": "Less",
      "all": "All",
      "none": "None",
    },
    campaigns: {
      "campaign": "Campaign",
      "campaigns": "Campaigns",
      "create_campaign": "Create Campaign",
      "campaign_name": "Campaign Name",
      "campaign_description": "Description",
      "beneficiary": "Beneficiary",
      "deadline": "Deadline",
      "milestone": "Milestone",
      "milestones": "Milestones",
      "status_active": "Active",
      "status_resolved": "Resolved",
      "status_cancelled": "Cancelled",
      "total_pledged": "Total Pledged",
      "backers_count": { one: "{{count}} backer", other: "{{count}} backers" },
      "days_remaining": { one: "{{count}} day remaining", other: "{{count}} days remaining" },
      "campaign_created": "Campaign created successfully",
      "campaign_resolved": "Campaign has been resolved",
    },
    pledges: {
      "pledge": "Pledge",
      "pledges": "Pledges",
      "create_pledge": "Create Pledge",
      "pledge_amount": "Amount",
      "pledge_type": "Pledge Type",
      "flat": "Flat Amount",
      "per_unit": "Per Unit",
      "tiered": "Tiered",
      "conditional": "Conditional",
      "escrowed": "Escrowed",
      "released": "Released",
      "refunded": "Refunded",
      "your_pledges": "Your Pledges",
      "pledge_confirmed": "Your pledge has been confirmed",
    },
    oracles: {
      "oracle": "Oracle",
      "oracles": "Oracles",
      "verification": "Verification",
      "data_source": "Data Source",
      "verified": "Verified",
      "pending": "Pending",
      "failed": "Failed",
    },
    disputes: {
      "dispute": "Dispute",
      "disputes": "Disputes",
      "file_dispute": "File Dispute",
      "dispute_category": "Category",
      "evidence": "Evidence",
      "resolution": "Resolution",
      "vote": "Vote",
      "voting": "Voting",
      "appeal": "Appeal",
      "resolved": "Resolved",
    },
    social: {
      "profile": "Profile",
      "followers": "Followers",
      "following": "Following",
      "follow": "Follow",
      "unfollow": "Unfollow",
      "comment": "Comment",
      "comments": "Comments",
      "like": "Like",
      "share": "Share",
      "activity": "Activity",
      "leaderboard": "Leaderboard",
    },
    payments: {
      "payment": "Payment",
      "payments": "Payments",
      "checkout": "Checkout",
      "pay_now": "Pay Now",
      "payment_method": "Payment Method",
      "credit_card": "Credit Card",
      "bank_transfer": "Bank Transfer",
      "crypto": "Cryptocurrency",
      "total": "Total",
      "fee": "Fee",
      "processing": "Processing...",
      "payment_successful": "Payment successful",
      "payment_failed": "Payment failed",
    },
    enterprise: {
      "organization": "Organization",
      "organizations": "Organizations",
      "team": "Team",
      "members": "Members",
      "invite": "Invite",
      "role": "Role",
      "owner": "Owner",
      "admin": "Admin",
      "creator": "Creator",
      "viewer": "Viewer",
      "settings": "Settings",
      "billing": "Billing",
    },
    errors: {
      "not_found": "Not found",
      "unauthorized": "Unauthorized",
      "forbidden": "Access denied",
      "validation_error": "Validation error",
      "server_error": "Server error",
      "network_error": "Network error",
      "timeout": "Request timed out",
      "try_again": "Please try again",
    },
    emails: {
      "welcome_subject": "Welcome to Pledge Protocol!",
      "welcome_body": "Welcome to Pledge Protocol! Get started by exploring campaigns.",
      "pledge_confirmed_subject": "Your pledge has been confirmed",
      "milestone_verified_subject": "Milestone verified",
    },
    notifications: {
      "new_pledge": "New pledge received",
      "milestone_verified": "Milestone has been verified",
      "campaign_funded": "Campaign fully funded!",
      "new_follower": "{{name}} started following you",
      "new_comment": "New comment on your campaign",
    },
  },
  es: {
    common: {
      "loading": "Cargando...",
      "error": "Ocurrió un error",
      "success": "Éxito",
      "cancel": "Cancelar",
      "confirm": "Confirmar",
      "save": "Guardar",
      "delete": "Eliminar",
      "edit": "Editar",
      "view": "Ver",
      "search": "Buscar",
      "filter": "Filtrar",
      "sort": "Ordenar",
      "back": "Atrás",
      "next": "Siguiente",
      "previous": "Anterior",
      "submit": "Enviar",
      "close": "Cerrar",
      "yes": "Sí",
      "no": "No",
      "more": "Más",
      "less": "Menos",
      "all": "Todo",
      "none": "Ninguno",
    },
    campaigns: {
      "campaign": "Campaña",
      "campaigns": "Campañas",
      "create_campaign": "Crear Campaña",
      "campaign_name": "Nombre de la Campaña",
      "campaign_description": "Descripción",
      "beneficiary": "Beneficiario",
      "deadline": "Fecha límite",
      "milestone": "Hito",
      "milestones": "Hitos",
      "status_active": "Activa",
      "status_resolved": "Resuelta",
      "status_cancelled": "Cancelada",
      "total_pledged": "Total Comprometido",
      "backers_count": { one: "{{count}} patrocinador", other: "{{count}} patrocinadores" },
      "days_remaining": { one: "{{count}} día restante", other: "{{count}} días restantes" },
      "campaign_created": "Campaña creada exitosamente",
      "campaign_resolved": "La campaña ha sido resuelta",
    },
    pledges: {
      "pledge": "Compromiso",
      "pledges": "Compromisos",
      "create_pledge": "Crear Compromiso",
      "pledge_amount": "Monto",
      "pledge_type": "Tipo de Compromiso",
      "flat": "Monto Fijo",
      "per_unit": "Por Unidad",
      "tiered": "Escalonado",
      "conditional": "Condicional",
      "escrowed": "En Custodia",
      "released": "Liberado",
      "refunded": "Reembolsado",
      "your_pledges": "Tus Compromisos",
      "pledge_confirmed": "Tu compromiso ha sido confirmado",
    },
    oracles: {
      "oracle": "Oráculo",
      "oracles": "Oráculos",
      "verification": "Verificación",
      "data_source": "Fuente de Datos",
      "verified": "Verificado",
      "pending": "Pendiente",
      "failed": "Fallido",
    },
    disputes: {
      "dispute": "Disputa",
      "disputes": "Disputas",
      "file_dispute": "Presentar Disputa",
      "dispute_category": "Categoría",
      "evidence": "Evidencia",
      "resolution": "Resolución",
      "vote": "Votar",
      "voting": "Votación",
      "appeal": "Apelar",
      "resolved": "Resuelto",
    },
    social: {
      "profile": "Perfil",
      "followers": "Seguidores",
      "following": "Siguiendo",
      "follow": "Seguir",
      "unfollow": "Dejar de Seguir",
      "comment": "Comentario",
      "comments": "Comentarios",
      "like": "Me gusta",
      "share": "Compartir",
      "activity": "Actividad",
      "leaderboard": "Clasificación",
    },
    payments: {
      "payment": "Pago",
      "payments": "Pagos",
      "checkout": "Pagar",
      "pay_now": "Pagar Ahora",
      "payment_method": "Método de Pago",
      "credit_card": "Tarjeta de Crédito",
      "bank_transfer": "Transferencia Bancaria",
      "crypto": "Criptomoneda",
      "total": "Total",
      "fee": "Comisión",
      "processing": "Procesando...",
      "payment_successful": "Pago exitoso",
      "payment_failed": "Pago fallido",
    },
    enterprise: {
      "organization": "Organización",
      "organizations": "Organizaciones",
      "team": "Equipo",
      "members": "Miembros",
      "invite": "Invitar",
      "role": "Rol",
      "owner": "Propietario",
      "admin": "Administrador",
      "creator": "Creador",
      "viewer": "Visualizador",
      "settings": "Configuración",
      "billing": "Facturación",
    },
    errors: {
      "not_found": "No encontrado",
      "unauthorized": "No autorizado",
      "forbidden": "Acceso denegado",
      "validation_error": "Error de validación",
      "server_error": "Error del servidor",
      "network_error": "Error de red",
      "timeout": "Tiempo de espera agotado",
      "try_again": "Por favor, inténtelo de nuevo",
    },
    emails: {
      "welcome_subject": "¡Bienvenido a Pledge Protocol!",
      "welcome_body": "¡Bienvenido a Pledge Protocol! Comienza explorando campañas.",
      "pledge_confirmed_subject": "Tu compromiso ha sido confirmado",
      "milestone_verified_subject": "Hito verificado",
    },
    notifications: {
      "new_pledge": "Nuevo compromiso recibido",
      "milestone_verified": "El hito ha sido verificado",
      "campaign_funded": "¡Campaña financiada completamente!",
      "new_follower": "{{name}} comenzó a seguirte",
      "new_comment": "Nuevo comentario en tu campaña",
    },
  },
};

// Add empty translations for other locales
for (const locale of Object.keys(LOCALE_CONFIGS) as SupportedLocale[]) {
  if (!TRANSLATIONS[locale]) {
    TRANSLATIONS[locale] = {} as Record<TranslationNamespace, Record<string, string | PluralTranslation>>;
    for (const ns of ["common", "campaigns", "pledges", "oracles", "disputes", "social", "payments", "enterprise", "errors", "emails", "notifications"] as TranslationNamespace[]) {
      TRANSLATIONS[locale][ns] = {};
    }
  }
}

// ============================================================================
// TRANSLATION SERVICE
// ============================================================================

export class TranslationService {
  private defaultLocale: SupportedLocale = "en";
  private currentLocale: SupportedLocale = "en";
  private bundles: Map<string, TranslationBundle> = new Map();
  private userPreferences: Map<string, UserLocalePreferences> = new Map();
  private exchangeRates: Map<string, ExchangeRate> = new Map();

  constructor(options?: { defaultLocale?: SupportedLocale }) {
    if (options?.defaultLocale) {
      this.defaultLocale = options.defaultLocale;
      this.currentLocale = options.defaultLocale;
    }

    // Load built-in translations
    this.loadBuiltInTranslations();
  }

  private loadBuiltInTranslations(): void {
    for (const [locale, namespaces] of Object.entries(TRANSLATIONS)) {
      for (const [namespace, translations] of Object.entries(namespaces)) {
        const bundle: TranslationBundle = {
          locale: locale as SupportedLocale,
          namespace: namespace as TranslationNamespace,
          translations,
          version: 1,
          updatedAt: Date.now(),
        };
        this.bundles.set(`${locale}:${namespace}`, bundle);
      }
    }
  }

  // ==========================================================================
  // LOCALES
  // ==========================================================================

  getSupportedLocales(): LocaleConfig[] {
    return Object.values(LOCALE_CONFIGS).filter((c) => c.enabled);
  }

  getLocaleConfig(locale: SupportedLocale): LocaleConfig | null {
    return LOCALE_CONFIGS[locale] || null;
  }

  detectLocale(acceptLanguage: string): SupportedLocale {
    // Parse Accept-Language header
    const locales = acceptLanguage
      .split(",")
      .map((l) => {
        const [code, q] = l.trim().split(";q=");
        return { code: code.toLowerCase(), quality: parseFloat(q) || 1 };
      })
      .sort((a, b) => b.quality - a.quality);

    // Find first supported locale
    for (const { code } of locales) {
      // Exact match
      if (LOCALE_CONFIGS[code as SupportedLocale]?.enabled) {
        return code as SupportedLocale;
      }

      // Language-only match (e.g., "en-US" -> "en")
      const lang = code.split("-")[0];
      if (LOCALE_CONFIGS[lang as SupportedLocale]?.enabled) {
        return lang as SupportedLocale;
      }
    }

    return this.defaultLocale;
  }

  setLocale(locale: SupportedLocale): void {
    if (LOCALE_CONFIGS[locale]) {
      this.currentLocale = locale;
    }
  }

  getLocale(): SupportedLocale {
    return this.currentLocale;
  }

  // ==========================================================================
  // TRANSLATIONS
  // ==========================================================================

  translate(key: string, options?: TranslateOptions): string {
    const locale = options?.locale || this.currentLocale;
    const [namespace, translationKey] = this.parseKey(key, options?.namespace);

    // Get translation
    const bundle = this.bundles.get(`${locale}:${namespace}`);
    let translation = bundle?.translations[translationKey];

    // Fall back to default locale
    if (!translation && locale !== this.defaultLocale) {
      const fallbackBundle = this.bundles.get(`${this.defaultLocale}:${namespace}`);
      translation = fallbackBundle?.translations[translationKey];
    }

    // Return default value or key
    if (!translation) {
      return options?.defaultValue || key;
    }

    // Handle plural form
    if (typeof translation === "object" && options?.count !== undefined) {
      translation = this.selectPluralForm(translation, options.count, locale);
    }

    // Interpolate variables
    let result = typeof translation === "string" ? translation : translation.other;
    if (options?.variables) {
      result = this.interpolate(result, options.variables);
    }

    // Handle count variable
    if (options?.count !== undefined) {
      result = result.replace(/\{\{count\}\}/g, String(options.count));
    }

    return result;
  }

  translatePlural(key: string, count: number, options?: TranslateOptions): string {
    return this.translate(key, { ...options, count });
  }

  hasTranslation(key: string, locale: SupportedLocale): boolean {
    const [namespace, translationKey] = this.parseKey(key);
    const bundle = this.bundles.get(`${locale}:${namespace}`);
    return bundle?.translations[translationKey] !== undefined;
  }

  private parseKey(
    key: string,
    defaultNamespace: TranslationNamespace = "common"
  ): [TranslationNamespace, string] {
    const parts = key.split(":");
    if (parts.length === 2) {
      return [parts[0] as TranslationNamespace, parts[1]];
    }
    return [defaultNamespace, key];
  }

  private selectPluralForm(
    translation: PluralTranslation,
    count: number,
    locale: SupportedLocale
  ): string {
    // Get plural rule for locale
    const rule = this.getPluralRule(count, locale);

    // Select appropriate form
    if (rule === "zero" && translation.zero) return translation.zero;
    if (rule === "one" && translation.one) return translation.one;
    if (rule === "two" && translation.two) return translation.two;
    if (rule === "few" && translation.few) return translation.few;
    if (rule === "many" && translation.many) return translation.many;

    return translation.other;
  }

  private getPluralRule(
    count: number,
    locale: SupportedLocale
  ): "zero" | "one" | "two" | "few" | "many" | "other" {
    const absCount = Math.abs(count);

    // Simplified plural rules (use Intl.PluralRules in production)
    switch (locale) {
      case "ar":
        if (count === 0) return "zero";
        if (count === 1) return "one";
        if (count === 2) return "two";
        if (count % 100 >= 3 && count % 100 <= 10) return "few";
        if (count % 100 >= 11) return "many";
        return "other";

      case "ru":
        if (absCount % 10 === 1 && absCount % 100 !== 11) return "one";
        if (
          absCount % 10 >= 2 &&
          absCount % 10 <= 4 &&
          (absCount % 100 < 10 || absCount % 100 >= 20)
        )
          return "few";
        return "many";

      case "ja":
      case "zh":
      case "zh-TW":
      case "ko":
        return "other"; // No plural forms

      default:
        return count === 1 ? "one" : "other";
    }
  }

  private interpolate(
    template: string,
    variables: Record<string, string | number>
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return String(variables[key] ?? `{{${key}}}`);
    });
  }

  // ==========================================================================
  // BUNDLES
  // ==========================================================================

  getBundle(
    locale: SupportedLocale,
    namespace: TranslationNamespace
  ): TranslationBundle | null {
    return this.bundles.get(`${locale}:${namespace}`) || null;
  }

  loadBundle(bundle: TranslationBundle): void {
    this.bundles.set(`${bundle.locale}:${bundle.namespace}`, bundle);
  }

  exportBundle(
    locale: SupportedLocale,
    namespace: TranslationNamespace
  ): TranslationBundle {
    const existing = this.bundles.get(`${locale}:${namespace}`);
    if (existing) {
      return existing;
    }

    return {
      locale,
      namespace,
      translations: {},
      version: 1,
      updatedAt: Date.now(),
    };
  }

  // ==========================================================================
  // FORMATTING
  // ==========================================================================

  formatDate(date: Date | number, options?: DateFormatOptions): string {
    const d = typeof date === "number" ? new Date(date) : date;
    const locale = options?.locale || this.currentLocale;
    const config = LOCALE_CONFIGS[locale];

    if (options?.relative) {
      return this.formatRelativeTime(d, options);
    }

    // Use Intl.DateTimeFormat for proper localization
    const formatOptions: Intl.DateTimeFormatOptions = {};

    switch (options?.format) {
      case "short":
        formatOptions.dateStyle = "short";
        break;
      case "medium":
        formatOptions.dateStyle = "medium";
        break;
      case "long":
        formatOptions.dateStyle = "long";
        break;
      case "full":
        formatOptions.dateStyle = "full";
        break;
      default:
        formatOptions.dateStyle = "medium";
    }

    if (options?.includeTime) {
      formatOptions.timeStyle = "short";
    }

    try {
      return new Intl.DateTimeFormat(locale, formatOptions).format(d);
    } catch {
      // Fallback to simple formatting
      return d.toLocaleDateString(locale);
    }
  }

  formatNumber(value: number, options?: NumberFormatOptions): string {
    const locale = options?.locale || this.currentLocale;

    const formatOptions: Intl.NumberFormatOptions = {
      style: options?.style || "decimal",
      minimumFractionDigits: options?.minimumFractionDigits,
      maximumFractionDigits: options?.maximumFractionDigits,
      notation: options?.notation,
    };

    if (options?.style === "currency") {
      formatOptions.currency = options?.currency || "USD";
    }

    try {
      return new Intl.NumberFormat(locale, formatOptions).format(value);
    } catch {
      return value.toLocaleString(locale);
    }
  }

  formatCurrency(
    amount: number | string,
    options?: CurrencyFormatOptions
  ): string {
    const value = typeof amount === "string" ? parseFloat(amount) : amount;
    const locale = options?.locale || this.currentLocale;
    const currency = options?.currency || "USD";
    const config = CURRENCY_CONFIGS[currency];

    if (!config) {
      return `${currency} ${value.toFixed(2)}`;
    }

    // Handle crypto with many decimals
    if (config.isCrypto && config.decimals > 2) {
      const formatted = value.toFixed(Math.min(config.decimals, 6));
      if (options?.showCode !== false) {
        return `${formatted} ${currency}`;
      }
      return formatted;
    }

    // Use Intl.NumberFormat for fiat
    const formatOptions: Intl.NumberFormatOptions = {
      style: "currency",
      currency,
      currencyDisplay: options?.showSymbol === false ? "code" : "symbol",
    };

    if (options?.hideZeroDecimals && value % 1 === 0) {
      formatOptions.minimumFractionDigits = 0;
      formatOptions.maximumFractionDigits = 0;
    }

    try {
      return new Intl.NumberFormat(locale, formatOptions).format(value);
    } catch {
      return `${config.symbol}${value.toFixed(config.decimals)}`;
    }
  }

  formatRelativeTime(date: Date | number, options?: DateFormatOptions): string {
    const d = typeof date === "number" ? new Date(date) : date;
    const now = Date.now();
    const diff = now - d.getTime();
    const locale = options?.locale || this.currentLocale;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    try {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

      if (years > 0) return rtf.format(-years, "year");
      if (months > 0) return rtf.format(-months, "month");
      if (weeks > 0) return rtf.format(-weeks, "week");
      if (days > 0) return rtf.format(-days, "day");
      if (hours > 0) return rtf.format(-hours, "hour");
      if (minutes > 0) return rtf.format(-minutes, "minute");
      return rtf.format(-seconds, "second");
    } catch {
      // Fallback
      if (years > 0) return `${years}y ago`;
      if (months > 0) return `${months}mo ago`;
      if (weeks > 0) return `${weeks}w ago`;
      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      if (minutes > 0) return `${minutes}m ago`;
      return "just now";
    }
  }

  // ==========================================================================
  // CURRENCY EXCHANGE
  // ==========================================================================

  getSupportedCurrencies(): CurrencyConfig[] {
    return Object.values(CURRENCY_CONFIGS);
  }

  getExchangeRate(
    from: SupportedCurrency,
    to: SupportedCurrency
  ): ExchangeRate | null {
    if (from === to) {
      return { from, to, rate: 1, source: "identity", timestamp: Date.now() };
    }

    const cached = this.exchangeRates.get(`${from}:${to}`);
    if (cached && Date.now() - cached.timestamp < 60 * 60 * 1000) {
      return cached;
    }

    // Calculate rate via USD
    const fromConfig = CURRENCY_CONFIGS[from];
    const toConfig = CURRENCY_CONFIGS[to];

    if (!fromConfig || !toConfig) {
      return null;
    }

    const fromToUsd = fromConfig.exchangeRates.USD;
    const usdToTo = 1 / toConfig.exchangeRates.USD;
    const rate = fromToUsd * usdToTo;

    const exchangeRate: ExchangeRate = {
      from,
      to,
      rate,
      source: "calculated",
      timestamp: Date.now(),
    };

    this.exchangeRates.set(`${from}:${to}`, exchangeRate);
    return exchangeRate;
  }

  convertCurrency(
    amount: number,
    from: SupportedCurrency,
    to: SupportedCurrency
  ): { amount: number; rate: number } {
    const exchangeRate = this.getExchangeRate(from, to);
    if (!exchangeRate) {
      throw new Error(`Cannot convert ${from} to ${to}`);
    }

    return {
      amount: amount * exchangeRate.rate,
      rate: exchangeRate.rate,
    };
  }

  // ==========================================================================
  // USER PREFERENCES
  // ==========================================================================

  getUserPreferences(address: string): UserLocalePreferences {
    let prefs = this.userPreferences.get(address);
    if (!prefs) {
      prefs = {
        address,
        locale: this.defaultLocale,
        currency: "USD",
        timezone: "UTC",
        dateFormat: "mdy",
        timeFormat: "12h",
        numberFormat: "comma_decimal",
        updatedAt: Date.now(),
      };
      this.userPreferences.set(address, prefs);
    }
    return prefs;
  }

  updateUserPreferences(
    address: string,
    updates: Partial<UserLocalePreferences>
  ): UserLocalePreferences {
    const current = this.getUserPreferences(address);
    const updated: UserLocalePreferences = {
      ...current,
      ...updates,
      address,
      updatedAt: Date.now(),
    };
    this.userPreferences.set(address, updated);
    return updated;
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  getLocaleStats(locale: SupportedLocale): LocaleStats {
    const englishKeys = new Set<string>();
    const translatedKeys = new Set<string>();

    // Count English keys
    for (const [key, bundle] of this.bundles) {
      if (key.startsWith("en:")) {
        for (const k of Object.keys(bundle.translations)) {
          englishKeys.add(`${bundle.namespace}:${k}`);
        }
      }
    }

    // Count translated keys for locale
    for (const [key, bundle] of this.bundles) {
      if (key.startsWith(`${locale}:`)) {
        for (const k of Object.keys(bundle.translations)) {
          if (bundle.translations[k]) {
            translatedKeys.add(`${bundle.namespace}:${k}`);
          }
        }
      }
    }

    return {
      locale,
      totalKeys: englishKeys.size,
      translatedKeys: translatedKeys.size,
      verifiedKeys: 0, // Would require metadata
      machineTranslatedKeys: 0,
      completeness:
        englishKeys.size > 0
          ? (translatedKeys.size / englishKeys.size) * 100
          : 0,
      lastUpdated: Date.now(),
    };
  }

  getTranslationProgress(locale: SupportedLocale): TranslationProgress {
    const byNamespace: TranslationProgress["byNamespace"] = {} as TranslationProgress["byNamespace"];
    let totalTotal = 0;
    let totalTranslated = 0;

    const namespaces: TranslationNamespace[] = [
      "common", "campaigns", "pledges", "oracles", "disputes",
      "social", "payments", "enterprise", "errors", "emails", "notifications"
    ];

    for (const ns of namespaces) {
      const enBundle = this.bundles.get(`en:${ns}`);
      const localeBundle = this.bundles.get(`${locale}:${ns}`);

      const total = enBundle ? Object.keys(enBundle.translations).length : 0;
      const translated = localeBundle
        ? Object.keys(localeBundle.translations).filter(
            (k) => localeBundle.translations[k]
          ).length
        : 0;

      byNamespace[ns] = { total, translated, verified: 0 };
      totalTotal += total;
      totalTranslated += translated;
    }

    return {
      locale,
      byNamespace,
      overall: {
        total: totalTotal,
        translated: totalTranslated,
        verified: 0,
        completeness: totalTotal > 0 ? (totalTranslated / totalTotal) * 100 : 0,
      },
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createTranslationService(options?: {
  defaultLocale?: SupportedLocale;
}): TranslationService {
  return new TranslationService(options);
}

// Default instance
export const translationService = new TranslationService();

// Helper function for quick translations
export function t(key: string, options?: TranslateOptions): string {
  return translationService.translate(key, options);
}
