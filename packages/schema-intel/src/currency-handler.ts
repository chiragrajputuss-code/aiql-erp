import type { RawSchemaData } from "@aiql/erp-connectors";
import type { CurrencyConfig } from "./types";

const LOCALE_MAP: Record<string, string> = {
  INR: "en-IN", USD: "en-US", EUR: "de-DE", GBP: "en-GB",
  AUD: "en-AU", CAD: "en-CA", SGD: "en-SG", AED: "ar-AE",
};

const AMOUNT_COLUMN_HINTS = /balance|amount|total|price|cost|revenue|expense|debit|credit|outstanding|value/i;
const CURRENCY_COLUMN_HINTS = /currency|curr_code|currency_code/i;

/**
 * Inspect the raw schema to determine currency settings:
 * - Base currency (from metadata or default INR)
 * - Whether multi-currency is enabled
 * - Which columns hold monetary amounts
 * - The display locale for formatting
 */
export function detectCurrencyConfig(schema: RawSchemaData): CurrencyConfig {
  // 1. Base currency from schema metadata
  const metaCurrency = schema.metadata?.currency as string | undefined;
  const baseCurrency = (metaCurrency ?? "INR").toUpperCase();

  // 2. Collect all amount columns across all tables
  const amountColumns: string[] = [];
  let currencyColumn: string | undefined;
  let isMultiCurrency = false;

  for (const table of schema.tables) {
    for (const col of table.columns) {
      if (col.dataType === "currency" || AMOUNT_COLUMN_HINTS.test(col.name)) {
        amountColumns.push(`${table.name}.${col.name}`);
      }
      if (CURRENCY_COLUMN_HINTS.test(col.name)) {
        currencyColumn = col.name;
        isMultiCurrency = true;
      }
    }
  }

  // 3. Check metadata for explicit multi-currency flag
  if (schema.metadata?.multiCurrency === true) isMultiCurrency = true;

  return {
    baseCurrency,
    isMultiCurrency,
    currencyColumn,
    amountColumns,
    locale: LOCALE_MAP[baseCurrency] ?? "en-US",
  };
}
