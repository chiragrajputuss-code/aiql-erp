import type { ERPSchema } from "@aiql/schema-intel";
import type { LLMResponse } from "./llm-providers/types";
import { assessComplexity } from "./llm-router";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Verdict = "execute" | "execute_with_warning" | "needs_clarification";

export interface ConfidenceComponents {
  llmSelfAssessment: number; // weight 50%
  schemaMatch:       number; // weight 20%
  complexity:        number; // weight 15%
  templateMatch:     number; // weight 15%
}

export interface ConfidenceBreakdown {
  final:          number;
  verdict:        Verdict;
  components:     ConfidenceComponents;
  hallucinations: string[]; // table/column names not found in schema
}

export interface QueryTemplate {
  id:       string;
  keywords: RegExp[];
}

// ─── Built-in template registry ───────────────────────────────────────────────

export const BUILT_IN_TEMPLATES: QueryTemplate[] = [
  // ── Original ──────────────────────────────────────────────────────────────
  { id: "ap-aging",        keywords: [/\bpayable\b/i, /\bcreditor\b/i, /\bap\s+aging\b/i, /\boutstanding\b.*\bvendor\b/i] },
  { id: "ar-aging",        keywords: [/\breceivable\b/i, /\bdebtor\b/i, /\bar\s+aging\b/i] },
  { id: "trial-balance",   keywords: [/\btrial\s+balance\b/i] },
  { id: "top-vendors",     keywords: [/\btop\b.*\bvendor\b/i, /\bvendor\b.*\bspend\b/i] },
  { id: "top-customers",   keywords: [/\btop\b.*\bcustomer\b/i, /\bcustomer\b.*\brevenue\b/i] },
  { id: "revenue-summary", keywords: [/\brevenue\b/i, /\bsales\b.*\btotal\b/i] },
  { id: "expense-summary", keywords: [/\bexpense\b/i, /\bopex\b/i, /\boverhead\b/i] },
  { id: "gl-balance",      keywords: [/\bgl\s+account\b/i, /\baccount\s+balance\b/i, /\bledger\s+balance\b/i] },
  { id: "cash-flow",       keywords: [/\bcash\s+flow\b/i, /\breceipts?\b.*\bpayments?\b/i] },
  // ── Tier 1 additions ──────────────────────────────────────────────────────
  { id: "cash-balance",              keywords: [/\bcash\s+balance\b/i, /\bbank\s+balance\b/i, /\bcash\s+in\s+hand\b/i, /\bcash\s+position\b/i, /\bpaisa\s+kitna\b/i] },
  { id: "overdue-debtors-30-60-90",  keywords: [/\boverdue\s+debtors?\b/i, /\bdebtors?\s+aging\b/i, /\breceivable\s+aging\b/i, /\baging\s+(?:report|analysis|buckets?)\b/i] },
  { id: "gst-summary",               keywords: [/\bgst\s+(?:summary|report|returns?)\b/i, /\bcgst\b/i, /\bsgst\b/i, /\bigst\b/i, /\bkar\s+vivaran\b/i] },
  { id: "vendor-ledger",             keywords: [/\bvendor\s+ledger\b/i, /\bsupplier\s+ledger\b/i, /\bvendor[\s\-]?wise\b/i, /\bvikreta\s+khata\b/i] },
  { id: "customer-ledger",           keywords: [/\bcustomer\s+ledger\b/i, /\bdebtor\s+ledger\b/i, /\bcustomer[\s\-]?wise\b/i, /\bgrahak\s+khata\b/i] },
  { id: "purchase-register",         keywords: [/\bpurchase\s+register\b/i, /\bpurchase\s+(?:list|report|log)\b/i, /\bkharid\s+(?:vivaran|register)\b/i] },
  { id: "sales-register",            keywords: [/\bsales?\s+register\b/i, /\binvoice\s+register\b/i, /\bsales?\s+(?:list|report|log)\b/i, /\bbikri\s+(?:vivaran|register)\b/i] },
  { id: "payroll-summary",           keywords: [/\bpayroll\b/i, /\bsalary\s+(?:summary|report|register)\b/i, /\bwages?\s+(?:summary|report)\b/i, /\btankhwah\b/i, /\bvetan\b/i] },
  // ── Tier 1 Day 4 ─────────────────────────────────────────────────────────
  { id: "profit-loss-summary",       keywords: [/\bprofit\s*(?:and|&|n)\s*loss\b/i, /\bp\s*[&n]\s*l\b/i, /\bincome\s+statement\b/i, /\bnet\s+profit\b/i, /\bmunaafa\b/i] },
  { id: "balance-sheet-snapshot",    keywords: [/\bbalance\s+sheet\b/i, /\bassets?\s*(?:and|&)\s*liabilit/i, /\bnet\s+(?:assets?|worth)\b/i, /\btulapat\b/i] },
  { id: "expense-by-voucher-type",   keywords: [/\bvoucher[\s\-]?(?:type|wise)\b/i, /\bexpenses?\s+by\s+type\b/i, /\btransaction[\s\-]?type\s+(?:wise|summary)\b/i] },
  { id: "tds-summary",               keywords: [/\btds\b/i, /\btax\s+deducted\s+at\s+source\b/i, /\bkar\s+katautee\b/i] },
  { id: "bank-reconciliation",       keywords: [/\bbank\s+recon/i, /\breconcil/i, /\bunmatched\s+(?:entries|transactions?)\b/i, /\bbank\s+milan\b/i] },
  { id: "advance-payments-outstanding", keywords: [/\badvance\s+(?:payments?|outstanding)\b/i, /\bprepayments?\b/i, /\bpeshgi\b/i] },
  { id: "top-customers",             keywords: [/\btop\b.*\bcustomer\b/i, /\bbest\s+customers?\b/i, /\bcustomer\b.*\brevenue\b/i, /\bsabse\s+bade\s+grahak\b/i] },
  // ── Tier 1 Day 5 ─────────────────────────────────────────────────────────
  { id: "sales-last-quarter",        keywords: [/\bsales?\s+(?:last|previous)\s+quarter\b/i, /\blast\s+quarter\b.*\bsales?\b/i, /\bpichli\s+timahi\b.*\bbikri\b/i] },
  { id: "expenses-last-quarter",     keywords: [/\bexpenses?\s+(?:last|previous)\s+quarter\b/i, /\blast\s+quarter\b.*\bexpenses?\b/i, /\bpichli\s+timahi\b.*\bkharcha\b/i] },
  { id: "cash-flow-monthly",         keywords: [/\bcash\s+flow\s+(?:monthly|by\s+month)\b/i, /\bmonthly\s+cash\s+flow\b/i, /\bcash\s+(?:inflow|outflow)\b/i] },
  { id: "cost-centre-revenue",       keywords: [/\bcost\s+centre\s+(?:revenue|income|sales?)\b/i, /\brevenue\s+by\s+(?:cost\s+centre|department)\b/i, /\bdepartment[\s\-]?wise\s+(?:revenue|income)\b/i] },
  { id: "cost-centre-expenses",      keywords: [/\bcost\s+centre\s+(?:expense|spend|cost)\b/i, /\bexpenses?\s+by\s+(?:cost\s+centre|department)\b/i, /\bdepartment[\s\-]?wise\s+(?:expense|spend)\b/i] },
  { id: "yoy-comparison-monthly",    keywords: [/\byear\s+(?:on|over)\s+year\b/i, /\byoy\b/i, /\bthis\s+year\s+vs\.?\s+last\s+year\b/i, /\bsaal\s+dar\s+saal\b/i] },
  { id: "gst-input-vs-output",       keywords: [/\bgst\s+input\s+(?:vs|and)\s+output\b/i, /\binput\s+tax\s+credit\b/i, /\bitc\b.*\bgst\b/i, /\bgst\s+payable\b/i] },
  { id: "creditors-top-10",          keywords: [/\btop\b.*\bcreditors?\b/i, /\bhighest\s+(?:payable|outstanding)\s+vendors?\b/i, /\bsabse\s+bade\s+lenadar\b/i] },
  { id: "debtors-top-10",            keywords: [/\btop\b.*\bdebtors?\b/i, /\bhighest\s+(?:receivable|outstanding)\s+customers?\b/i, /\bsabse\s+bade\s+denadaar\b/i] },
  { id: "zero-balance-accounts",     keywords: [/\bzero[\s\-]balance\b/i, /\bnil\s+balance\b/i, /\bdormant\s+accounts?\b/i, /\bshunya\s+bakaya\b/i] },
  // ── Week 2 Day 6-7 ───────────────────────────────────────────────────────
  { id: "journal-entries",           keywords: [/\bjournal\s+(?:entries|vouchers?)\b/i, /\bjv\s+(?:entries|list)\b/i, /\bmanual\s+entries\b/i, /\broznamcha\b/i] },
  { id: "contra-entries",            keywords: [/\bcontra\s+(?:entries|vouchers?)\b/i, /\bcash\s+to\s+bank\b/i, /\bbank\s+to\s+cash\b/i] },
  { id: "provisions",                keywords: [/\bprovisions?\s+(?:made|entries|summary)\b/i, /\bprovision\s+for\b/i, /\bpraavdhan\b/i] },
  { id: "write-offs",                keywords: [/\bwrite[\s\-]?offs?\b/i, /\bbad\s+debts?\b/i, /\bwritten\s+off\b/i] },
  { id: "multi-currency-summary",    keywords: [/\bmulti[\s\-]?currency\b/i, /\bforeign\s+currency\s+(?:transactions?|summary)\b/i, /\bcurrency[\s\-]?wise\b/i] },
  { id: "unrealized-gains-losses",   keywords: [/\bunrealized\s+(?:gain|loss|forex)\b/i, /\bforex\s+(?:gain|loss)\b/i, /\bexchange\s+(?:gain|loss)\b/i] },
  { id: "current-ratio",             keywords: [/\bcurrent\s+ratio\b/i, /\bliquidity\s+ratio\b/i] },
  { id: "debt-equity-ratio",         keywords: [/\bdebt[\s\-]?equity\s+ratio\b/i, /\bd\/e\s+ratio\b/i, /\bleverage\s+ratio\b/i] },
  { id: "working-capital",           keywords: [/\bworking\s+capital\b/i, /\bnet\s+current\s+assets?\b/i, /\bkarya\s+poonji\b/i] },
  { id: "budget-variance",           keywords: [/\bbudget\s+(?:variance|vs\.?\s+actual)\b/i, /\bactual\s+vs\.?\s+budget\b/i, /\bvariance\s+(?:report|analysis)\b/i] },
  { id: "forecast-vs-actual",        keywords: [/\bforecast\s+vs\.?\s+actual\b/i, /\bprojected\s+vs\.?\s+actual\b/i, /\brevenue\s+forecast\b/i] },
  { id: "fixed-asset-summary",       keywords: [/\bfixed\s+assets?\s+(?:summary|report|register)\b/i, /\bppe\b/i, /\bproperty\s+plant\b/i, /\basthir\s+sampatti\b/i] },
  { id: "depreciation-schedule",     keywords: [/\bdepreciation\s+(?:schedule|report|summary)\b/i, /\baccumulated\s+depreciation\b/i, /\bmulya\s+hrass\b/i] },
  { id: "vendor-payment-summary",    keywords: [/\bvendor\s+payments?\s+(?:summary|made)\b/i, /\bpayments?\s+to\s+vendors?\b/i, /\bsupplier\s+payments?\b/i] },
  { id: "customer-receipts-summary", keywords: [/\bcustomer\s+receipts?\b/i, /\breceipts?\s+from\s+customers?\b/i, /\bgrahak\s+se\s+prapt\b/i] },
  { id: "large-transactions",        keywords: [/\blarge\s+transactions?\b/i, /\bhigh[\s\-]?value\s+transactions?\b/i, /\bbade\s+transactions?\b/i] },
  { id: "period-close-summary",      keywords: [/\bperiod[\s\-]?close\b/i, /\bmonth[\s\-]?end\s+summary\b/i, /\bclosing\s+entries\s+summary\b/i] },
  { id: "intercompany-transactions", keywords: [/\bintercompany\b/i, /\brelated\s+party\b/i, /\bgroup\s+company\b/i, /\bsamanbandhit\s+paksh\b/i] },
  { id: "pending-bills",             keywords: [/\bpending\s+(?:bills?|invoices?)\b/i, /\bunpaid\s+bills?\b/i, /\bbaaki\s+bill\b/i, /\bbhugtan\s+baaki\b/i] },
  { id: "account-monthly-drill",     keywords: [/\baccount[\s\-]?wise\s+monthly\b/i, /\bmonthly\s+breakdown\s+by\s+account\b/i, /\bkhata\s+wise\s+mahine\b/i] },
];

// ─── SQL identifier extractor ─────────────────────────────────────────────────

const FROM_TABLE_RE  = /\bFROM\s+"?(\w+)"?/gi;
const JOIN_TABLE_RE  = /\bJOIN\s+"?(\w+)"?/gi;
const CTE_NAME_RE    = /\bWITH\s+"?(\w+)"?\s+AS\s*\(/gi;
// Qualified refs: table.column
const QUAL_COL_RE    = /\b(\w+)\.(\w+)\b/g;

function extractIdentifiers(sql: string): { tables: Set<string>; columns: Set<string>; cteNames: Set<string> } {
  const tables:   Set<string> = new Set();
  const columns:  Set<string> = new Set();
  const cteNames: Set<string> = new Set();

  // CTE aliases (should not be flagged as hallucinations)
  CTE_NAME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CTE_NAME_RE.exec(sql)) !== null) cteNames.add(m[1].toLowerCase());

  FROM_TABLE_RE.lastIndex = 0;
  while ((m = FROM_TABLE_RE.exec(sql)) !== null) tables.add(m[1].toLowerCase());

  JOIN_TABLE_RE.lastIndex = 0;
  while ((m = JOIN_TABLE_RE.exec(sql)) !== null) tables.add(m[1].toLowerCase());

  // Qualified column references (table.column → extract column)
  QUAL_COL_RE.lastIndex = 0;
  while ((m = QUAL_COL_RE.exec(sql)) !== null) {
    // Skip common SQL functions that look like qualified refs (e.g. schema.function)
    if (!["pg", "public", "dbo", "information_schema"].includes(m[1].toLowerCase())) {
      columns.add(m[2].toLowerCase());
    }
  }

  return { tables, columns, cteNames };
}

// ─── Schema match scorer ──────────────────────────────────────────────────────

function scoreSchemaMatch(sql: string, schema: ERPSchema): { score: number; hallucinations: string[] } {
  if (!sql) return { score: 0, hallucinations: [] };

  const { tables, columns, cteNames } = extractIdentifiers(sql);
  const hallucinations: string[] = [];

  // Build lookup sets from schema
  const schemaTableNames = new Set(schema.tables.map((t) => t.name.toLowerCase()));
  const schemaColNames   = new Set(
    schema.tables.flatMap((t) => t.columns.map((c) => c.name.toLowerCase()))
  );

  // Check tables (skip CTEs)
  for (const table of tables) {
    if (!cteNames.has(table) && !schemaTableNames.has(table)) {
      hallucinations.push(`table: ${table}`);
    }
  }

  // Check columns (only qualified ones we extracted)
  for (const col of columns) {
    if (!schemaColNames.has(col)) {
      hallucinations.push(`column: ${col}`);
    }
  }

  // If ANY hallucination → score = 0 (strict)
  if (hallucinations.length > 0) return { score: 0, hallucinations };

  // All identifiers verified → full score
  // If no identifiers extracted (schema too minimal to check) → give benefit of doubt
  const checked = tables.size + columns.size;
  return { score: checked > 0 ? 1.0 : 0.8, hallucinations: [] };
}

// ─── Complexity scorer ────────────────────────────────────────────────────────

function scoreComplexity(sql: string): number {
  const complexity = assessComplexity(sql);
  // Simpler queries are more reliable → higher confidence component
  return complexity === "simple" ? 1.0 : complexity === "medium" ? 0.7 : 0.5;
}

// ─── Template match scorer ────────────────────────────────────────────────────

function scoreTemplateMatch(question: string, templates: QueryTemplate[]): number {
  // Each template's keywords are ALTERNATIVES (OR logic) — any match = template hit
  for (const tpl of templates) {
    const hit = tpl.keywords.some((re) => re.test(question));
    if (hit) return 1.0; // known query pattern — high confidence
  }
  return 0.6; // novel query, slightly less certain
}

// ─── Verdict thresholds ───────────────────────────────────────────────────────

function determineVerdict(score: number): Verdict {
  if (score >= 0.85) return "execute";
  if (score >= 0.70) return "execute_with_warning";
  return "needs_clarification";
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Calculate a weighted confidence score for an LLM-generated SQL query.
 *
 * Weights:
 *  - LLM self-assessment  50%
 *  - Schema match         20%  (0 if any table/column is hallucinated)
 *  - Query complexity     15%  (simpler = more reliable)
 *  - Template match       15%  (known patterns = more reliable)
 */
export function calculateConfidence(
  response:  LLMResponse,
  schema:    ERPSchema,
  question:  string,
  templates: QueryTemplate[] = BUILT_IN_TEMPLATES
): ConfidenceBreakdown {
  const llm       = Math.min(1, Math.max(0, response.confidence));
  const { score: schemaSc, hallucinations } = scoreSchemaMatch(response.sql, schema);
  const complexity = scoreComplexity(response.sql);
  const template   = scoreTemplateMatch(question, templates);

  const components: ConfidenceComponents = {
    llmSelfAssessment: llm,
    schemaMatch:       schemaSc,
    complexity,
    templateMatch:     template,
  };

  const final =
    llm       * 0.50 +
    schemaSc  * 0.20 +
    complexity * 0.15 +
    template  * 0.15;

  return {
    final:  Math.round(final * 1000) / 1000,
    verdict: determineVerdict(final),
    components,
    hallucinations,
  };
}
