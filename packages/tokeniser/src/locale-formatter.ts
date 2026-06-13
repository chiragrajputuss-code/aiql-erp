// ─── Locale map ───────────────────────────────────────────────────────────────

const LOCALE_MAP: Record<string, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
};

export function detectLocale(currency: string): string {
  return LOCALE_MAP[currency.toUpperCase()] ?? "en-US";
}

/**
 * Format a monetary amount using the correct locale for the currency.
 *
 * INR → en-IN → ₹12,45,000  (Indian lakhs/crore grouping — NOT ₹1,245,000)
 * USD → en-US → $1,245,000
 * EUR → de-DE → 1.245.000 €
 * GBP → en-GB → £1,245,000
 */
export function formatCurrency(amount: number, currency: string): string {
  const locale = detectLocale(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a plain number with locale-appropriate grouping separators.
 */
export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}
