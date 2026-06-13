import type { AccountInfo, AccountType, AccountTypeMap, ERPKnowledge } from "./erp-knowledge/types";
import { safeLlmCall } from "@aiql/tokeniser";

/**
 * Map each account to its financial type using the ERP's account group knowledge.
 *
 * @param accounts  List of { name, group } pairs from the ERP's chart of accounts
 * @param knowledge The ERP-specific knowledge config (e.g. tallyKnowledge)
 * @returns         Map of account name → AccountType
 */
export function classifyAccounts(
  accounts: AccountInfo[],
  knowledge: ERPKnowledge
): AccountTypeMap {
  const result: AccountTypeMap = {};

  for (const account of accounts) {
    const groupKey = account.group.trim().toLowerCase();
    const type: AccountType = knowledge.accountGroups[groupKey] ?? "UNKNOWN";
    result[account.name] = type;
  }

  return result;
}

// ─── Name-based classifier (fallback when group info is unavailable) ─────────

/**
 * Pattern-based classifier that infers AccountType from the account name itself.
 * Works for uploaded CSVs that don't include group information.
 *
 * Returns "UNKNOWN" if no pattern matches.
 */
export function classifyByName(accountName: string): AccountType {
  const n = accountName.toLowerCase().trim();

  // ── BANK / CASH ──────────────────────────────────────────────────────────
  // Match "petty cash" (not just "petty"), "cash-in-hand", explicit cash accounts
  if (/\b(petty\s+cash|cash[- ]in[- ]hand|cash a\/?c|cash account)\b/.test(n) || /^cash$/.test(n)) {
    return "CASH";
  }
  if (/\b(bank|hdfc|icici|sbi|axis|kotak|yes bank|bob|pnb|uco|canara|union bank|idfc|indusind|bank of baroda|bank of india|punjab national|state bank|current a\/?c|savings a\/?c|cash credit|overdraft|od a\/?c)\b/.test(n)) {
    return "BANK";
  }

  // ── TAX (check before "payable" since some are *_payable) ────────────────
  if (/\b(cgst|sgst|igst|gst|tds|tcs|vat|service tax|professional tax|composition tax|duties\s*&?\s*taxes|duties and taxes)\b/.test(n)) {
    return "TAX";
  }

  // ── RECEIVABLE ───────────────────────────────────────────────────────────
  if (/\b(sundry debtor|trade receivable|accounts? receivable|debtor|receivable)s?\b/.test(n)) {
    return "RECEIVABLE";
  }

  // ── PAYABLE ──────────────────────────────────────────────────────────────
  if (/\b(sundry creditor|trade payable|accounts? payable|creditor|payable)s?\b/.test(n)) {
    return "PAYABLE";
  }

  // ── INVENTORY ────────────────────────────────────────────────────────────
  // Only match unambiguous inventory account names. "Raw Material - Steel" alone
  // is COGS (a purchase head); "Raw Material Stock" is INVENTORY.
  if (/\b(stock[- ]in[- ]hand|finished goods(?:\s+stock)?|raw material[- ]?stock|wip|work[- ]in[- ]progress|inventory)\b/.test(n)
      || /\bstock\b/.test(n) && !/\bstock\s+journal\b/.test(n) && !/\bstock\s+take\b/.test(n)) {
    return "INVENTORY";
  }

  // ── FIXED ASSET ──────────────────────────────────────────────────────────
  if (/\b(plant\s*&?\s*machinery|machinery|equipment|vehicle|trucks?|vehicles|furniture|fixtures|computers?|laptops?|building|land|premises|fixed asset|capital wip|medical equipment|restaurant equipment|looms|x[- ]ray)\b/.test(n)) {
    return "FIXED_ASSET";
  }

  // ── REVENUE (sales / income / fees-as-revenue) ───────────────────────────
  if (/^sales\b/.test(n) || /\bsales account\b/.test(n)) {
    return "REVENUE";
  }
  if (/\b(tuition fees|registration fees|service income|freight income|cargo handling|consultation fees income|diagnostic service income|restaurant sales|project revenue|export sales|domestic sales|service revenue)\b/.test(n)) {
    return "REVENUE";
  }
  if (/\b(income)\b/.test(n) && !/other income/.test(n)) {
    return "REVENUE";
  }

  // ── OTHER INCOME ─────────────────────────────────────────────────────────
  if (/\b(other income|interest received|dividend received|rent received|miscellaneous income)\b/.test(n)) {
    return "OTHER_INCOME";
  }

  // ── COGS (direct costs of producing/buying) ──────────────────────────────
  if (/^purchases?\b/.test(n) ||
      /\b(raw material|cement|steel\s*&?\s*tmt|cotton yarn|dyes|chemicals|subcontractor|site wages|factory wages|kitchen wages|driver salaries|fuel\s*-?\s*diesel|toll charges|vegetable|meat\s*&?\s*poultry|spices\s*&?\s*provisions|lab reagents|medical consumables|power\s*&?\s*fuel)\b/.test(n) ||
      /\b(mobile phones?|laptops?|tablets?|accessories|electronics)\s*-/.test(n)) {
    return "COGS";
  }

  // ── EXPENSE ──────────────────────────────────────────────────────────────
  if (/\b(rent|salary|salaries|wages|electricity|telephone|internet|charges|expense|expenses|bonus|maintenance|travelling|travel|office|admin|administrative|stationery|printing|courier|postage|audit|legal|consultancy|consulting|insurance|professional fees|repairs|advertisement|marketing|warehouse rent|building rent|software subscriptions?|aws cloud|cloud services|study material|faculty|discount allowed|discount given)\b/.test(n)) {
    return "EXPENSE";
  }

  // ── EQUITY ───────────────────────────────────────────────────────────────
  if (/\b(capital|drawings|equity|reserves|retained earnings|share capital)\b/.test(n)) {
    return "EQUITY";
  }

  // ── CURRENT LIABILITY (advances, provident fund, etc.) ───────────────────
  if (/\b(advance from customer|provident fund|employee provident|pf payable|esi payable|gratuity|bonus payable)\b/.test(n)) {
    return "CURRENT_LIABILITY";
  }

  return "UNKNOWN";
}

/**
 * Apply name-based classification to fill UNKNOWNs in an existing map.
 * Use this when group-based classification yields too many UNKNOWNs.
 */
export function fillUnknownsByName(map: AccountTypeMap): AccountTypeMap {
  const result: AccountTypeMap = { ...map };
  for (const [name, type] of Object.entries(map)) {
    if (type === "UNKNOWN") {
      const inferred = classifyByName(name);
      if (inferred !== "UNKNOWN") result[name] = inferred;
    }
  }
  return result;
}

/**
 * Classify a list of distinct account names purely by name pattern.
 * Use when group information is unavailable (typical for uploaded CSVs).
 */
export function classifyAccountNames(names: string[]): AccountTypeMap {
  const result: AccountTypeMap = {};
  for (const name of names) result[name] = classifyByName(name);
  return result;
}

// ─── LLM-based classifier (Layer 3 fallback for unusual names) ───────────────

export interface LLMClassification {
  type:       AccountType;
  confidence: number;  // 0-1
}

const LLM_CLASSIFIER_SYSTEM = `You are an Indian SME accounting account classifier.

Given a list of GL account names, classify each into ONE of these types:
BANK, CASH, RECEIVABLE, PAYABLE, TAX, INVENTORY, FIXED_ASSET, CURRENT_ASSET,
CURRENT_LIABILITY, REVENUE, OTHER_INCOME, EXPENSE, COGS, EQUITY, INVESTMENT, UNKNOWN

Indian SME context (very important):
- Tally is the most common ERP — accounts often follow Tally conventions
- "Sundry Creditor" / similar = vendors → PAYABLE
- "Sundry Debtor" / similar = customers → RECEIVABLE
- CGST, SGST, IGST, TDS, TCS, VAT, Service Tax → TAX
- Hindi/regional names are common: "उधारी" (udhari) = owed = PAYABLE; "खाता" = account
- Party-specific accounts ("Mohan Lal & Sons", "ABC Pvt Ltd") usually map to PAYABLE or RECEIVABLE based on context
- "Stock", "Inventory", "WIP", "Finished Goods" → INVENTORY
- Internal codes (AC1001, GL4520) → UNKNOWN unless context is given
- Brand names + "Sales" → REVENUE
- Brand names + "Purchase" → COGS

Output JSON ONLY. No prose. No markdown.

Format:
{
  "classifications": [
    { "name": "Account Name 1", "type": "PAYABLE", "confidence": 0.85 },
    { "name": "Account Name 2", "type": "BANK", "confidence": 0.95 }
  ]
}

Rules:
- Confidence 0.9+ for clear matches (e.g. obvious bank/GST names)
- Confidence 0.6-0.85 for inferred matches (e.g. party-specific accounts)
- Confidence below 0.5 → return UNKNOWN
- One classification per input name. Match input casing exactly in "name" field.`;

/**
 * Use Groq LLM to classify account names that didn't match patterns.
 * Batches up to 30 names per call. Fails open (returns empty map) on error.
 *
 * Call this only as a final fallback — it's slower and uses an API call.
 */
export async function classifyByLLM(
  names: string[]
): Promise<Record<string, LLMClassification>> {
  if (names.length === 0) return {};

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return {}; // fail open

  const result: Record<string, LLMClassification> = {};

  // Batch in chunks of 30
  const BATCH_SIZE = 30;
  for (let i = 0; i < names.length; i += BATCH_SIZE) {
    const batch = names.slice(i, i + BATCH_SIZE);
    const userPrompt = `Classify these ${batch.length} accounts:\n${batch.map((n, j) => `${j + 1}. ${n}`).join("\n")}`;

    // PII-safe: account names are tokenised (vendors / customers / employees → opaque
    // tokens) before being sent to the LLM. The LLM classifies the *shape* of the
    // name, not its content, so masking does not hurt accuracy for known patterns.
    const safeRes = await safeLlmCall({
      endpoint:     "https://api.groq.com/openai/v1/chat/completions",
      apiKey,
      model:        "llama-3.1-8b-instant",
      systemPrompt: LLM_CLASSIFIER_SYSTEM,
      userContent:  userPrompt,
      temperature:  0.1,
      maxTokens:    2000,
      jsonMode:     true,
      timeoutMs:    15_000,
    });
    if (!safeRes || !safeRes.content) continue;

    try {
      const parsed = JSON.parse(safeRes.content) as {
        classifications?: { name: string; type: string; confidence: number }[];
      };

      for (const c of parsed.classifications ?? []) {
        if (!c.name || !c.type) continue;
        const validType = (
          ["BANK", "CASH", "RECEIVABLE", "PAYABLE", "TAX", "INVENTORY",
           "FIXED_ASSET", "CURRENT_ASSET", "CURRENT_LIABILITY", "REVENUE",
           "OTHER_INCOME", "EXPENSE", "COGS", "EQUITY", "INVESTMENT", "UNKNOWN"]
            .includes(c.type)
        ) ? (c.type as AccountType) : "UNKNOWN";

        const conf = typeof c.confidence === "number"
          ? Math.max(0, Math.min(1, c.confidence))
          : 0.5;

        if (validType !== "UNKNOWN" && conf >= 0.5) {
          result[c.name] = { type: validType, confidence: conf };
        }
      }
    } catch {
      // Continue to next batch on any error
    }
  }

  return result;
}

/**
 * 3-layer cascading classifier.
 *
 *   Layer 1: Group-based (provided accountTypeMap from schema introspection)
 *   Layer 2: Name-pattern fallback for UNKNOWNs
 *   Layer 3: LLM fallback for whatever's still UNKNOWN (only called if API key present)
 *
 * Returns the final map plus per-account classification source for transparency.
 */
export async function cascadeClassify(
  names: string[],
  existingMap: AccountTypeMap = {}
): Promise<{
  map:     AccountTypeMap;
  sources: Record<string, "group" | "pattern" | "llm" | "unknown">;
  llmConfidences: Record<string, number>;
}> {
  const map: AccountTypeMap = {};
  const sources: Record<string, "group" | "pattern" | "llm" | "unknown"> = {};
  const llmConfidences: Record<string, number> = {};

  // Layer 1 + 2: existing map then name patterns
  const stillUnknown: string[] = [];
  for (const name of names) {
    const groupType = existingMap[name];
    if (groupType && groupType !== "UNKNOWN") {
      map[name]     = groupType;
      sources[name] = "group";
      continue;
    }
    const inferred = classifyByName(name);
    if (inferred !== "UNKNOWN") {
      map[name]     = inferred;
      sources[name] = "pattern";
      continue;
    }
    stillUnknown.push(name);
  }

  // Layer 3: LLM for the rest
  if (stillUnknown.length > 0) {
    const llmResults = await classifyByLLM(stillUnknown);
    for (const name of stillUnknown) {
      const llm = llmResults[name];
      if (llm && llm.type !== "UNKNOWN") {
        map[name]            = llm.type;
        sources[name]        = "llm";
        llmConfidences[name] = llm.confidence;
      } else {
        map[name]     = "UNKNOWN";
        sources[name] = "unknown";
      }
    }
  }

  return { map, sources, llmConfidences };
}

/**
 * Group accounts by their classified type.
 * Useful for building the account type summary shown in the query engine.
 */
export function groupByType(accountTypeMap: AccountTypeMap): Record<AccountType, string[]> {
  const grouped: Partial<Record<AccountType, string[]>> = {};

  for (const [name, type] of Object.entries(accountTypeMap)) {
    if (!grouped[type]) grouped[type] = [];
    grouped[type]!.push(name);
  }

  return grouped as Record<AccountType, string[]>;
}
