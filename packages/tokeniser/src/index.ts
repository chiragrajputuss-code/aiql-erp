// ─── Individual module re-exports (for consumers who need low-level access) ───
export * from "./types";
export { TokenMap, VALID_CATEGORIES } from "./token-map";
export { detokenise, detokeniseFromMap } from "./detokeniser";
export { detectEntities } from "./entity-detector";
export type { EntityDetectorOptions } from "./entity-detector";
export { detectAmounts } from "./amount-normaliser";
export { detectAccounts, maskAccounts } from "./account-masker";
export { formatCurrency, formatNumber, detectLocale } from "./locale-formatter";
export { preprocessHinglish, HINDI_KEYWORD_MAP } from "./hindi-keywords";
export { stripPII } from "./pii-stripper";
export type { StripResult } from "./pii-stripper";
export { safeLlmCall } from "./safe-llm";
export type { SafeLlmRequest, SafeLlmResponse, SafeLlmAuditEntry } from "./safe-llm";

// ─── Imports for the main pipeline ───────────────────────────────────────────
import { TokenMap } from "./token-map";
import { stripPII } from "./pii-stripper";
import { detectEntities } from "./entity-detector";
import { detectAmounts } from "./amount-normaliser";
import { maskAccounts } from "./account-masker";
import type {
  TokenisationConfig,
  EntityDictionary,
  TokeniseResult,
  PreviewResult,
  PreviewToken,
  AuditEntry,
  TokenCategory,
} from "./types";
import { DEFAULT_CONFIG } from "./types";

// ─── tokenise() ───────────────────────────────────────────────────────────────

/**
 * Main tokenisation pipeline. Run order:
 *  1. PII stripping (irreversible)
 *  2. Entity detection (dictionary → NLP → context)
 *  3. Amount normalisation  (if config.tokeniseAmounts)
 *  4. Account masking       (if config.tokeniseAccounts)
 *  5. Custom entity list + custom strip list
 */
export function tokenise(
  text: string,
  config: Partial<TokenisationConfig> = {},
  dictionary?: EntityDictionary
): TokeniseResult {
  const t0 = Date.now();
  const cfg: TokenisationConfig = { ...DEFAULT_CONFIG, ...config };
  const map = new TokenMap();
  const auditLog: AuditEntry[] = [];

  // ── 1. PII stripping ──────────────────────────────────────────────────────
  const { text: piiClean, strippedItems } = stripPII(text);
  for (const _item of strippedItems) {
    auditLog.push({ original: "[STRIPPED]", token: "", category: "PII" });
  }

  let working = piiClean;

  // ── 2. Entity detection ───────────────────────────────────────────────────
  const entities = detectEntities(working, { dictionary });

  const allowed: Record<TokenCategory, boolean> = {
    VENDOR:   cfg.tokeniseVendors,
    CUSTOMER: cfg.tokeniseCustomers,
    EMPLOYEE: cfg.tokeniseEmployees,
    PROJECT:  cfg.tokeniseProjects,
    AMOUNT:   cfg.tokeniseAmounts,
    ACCT:     cfg.tokeniseAccounts,
    ENTITY:   true,
  };

  const toTokenise = entities.filter((e) => allowed[e.category] !== false);
  const sorted = [...toTokenise].sort((a, b) => b.value.length - a.value.length);

  for (const entity of sorted) {
    const token = map.addToken(entity.category, entity.value);
    working = working.split(entity.value).join(token);
    auditLog.push({
      original: entity.value,
      token,
      category: entity.category,
      confidence: entity.confidence,
      method: entity.method,
    });
  }

  // ── 3. Amount normalisation ───────────────────────────────────────────────
  if (cfg.tokeniseAmounts) {
    const amounts = detectAmounts(working);
    const amountsSorted = [...amounts].sort((a, b) => b.originalText.length - a.originalText.length);
    for (const amt of amountsSorted) {
      if (map.getToken(amt.originalText)) continue;
      const token = map.addToken("AMOUNT", amt.originalText);
      working = working.split(amt.originalText).join(token);
      auditLog.push({ original: amt.originalText, token, category: "AMOUNT" });
    }
  }

  // ── 4. Account masking ────────────────────────────────────────────────────
  if (cfg.tokeniseAccounts) {
    working = maskAccounts(working, map, cfg.accountPattern);
    for (const [token, original] of Array.from(map.getMap().entries())) {
      if (token.startsWith("ACCT_T") && !auditLog.some((e) => e.token === token)) {
        auditLog.push({ original, token, category: "ACCT" });
      }
    }
  }

  // ── 5. Custom rules ───────────────────────────────────────────────────────
  for (const entity of cfg.customEntities ?? []) {
    if (!entity.trim()) continue;
    const token = map.addToken("ENTITY", entity.trim());
    working = working.split(entity.trim()).join(token);
    if (!auditLog.some((e) => e.token === token)) {
      auditLog.push({ original: entity.trim(), token, category: "ENTITY" });
    }
  }

  for (const term of cfg.customStripList ?? []) {
    if (term.trim()) working = working.split(term.trim()).join("");
  }

  return {
    original: text,
    tokenised: working,
    tokenMap: map.getMap(),
    auditLog,
    stats: {
      entitiesFound:   toTokenise.length,
      amountsFound:    auditLog.filter((e) => e.category === "AMOUNT").length,
      accountsFound:   auditLog.filter((e) => e.category === "ACCT").length,
      piiStripped:     strippedItems.length,
      totalTokens:     map.size,
      processingTimeMs: Date.now() - t0,
    },
  };
}

// ─── previewTokenisation() ────────────────────────────────────────────────────

export function previewTokenisation(
  text: string,
  config: Partial<TokenisationConfig> = {},
  dictionary?: EntityDictionary
): PreviewResult {
  const result = tokenise(text, config, dictionary);

  const tokens: PreviewToken[] = [];
  for (const [token, original] of Array.from(result.tokenMap.entries())) {
    const category = token.split("_T")[0] as TokenCategory;
    const idx = text.indexOf(original);
    if (idx !== -1) {
      tokens.push({ original, token, category, startIndex: idx, endIndex: idx + original.length });
    }
  }

  return {
    original:  text,
    tokenised: result.tokenised,
    tokens:    tokens.sort((a, b) => a.startIndex - b.startIndex),
    stats:     result.stats,
  };
}
