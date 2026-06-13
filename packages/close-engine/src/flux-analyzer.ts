/**
 * Flux Analysis — Period-over-period account variance analysis.
 *
 * For each account, compute net activity in current period vs prior period.
 * Flag material variances using configurable thresholds. Generate AI
 * explanations for material variances using actual transaction context.
 *
 * Default material thresholds:
 *   - Absolute variance > ₹50,000
 *   - AND absolute variance % > 10%
 *
 * The "AND" is important: a small ₹2K change at 200% jump is noise,
 * a ₹10L change at 5% jump is noise, but ₹50K+ at 10%+ is signal.
 */

import { prisma } from "@aiql/db";
import { buildColMap, applyColMap, getTableName, loadAccountTypeMap } from "./utils/column-mapping";
import { safeLlmCall } from "@aiql/tokeniser";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FluxPattern =
  | "seasonal"        // recurring period pattern (e.g. quarterly bonus)
  | "one_time"        // one-off event (e.g. asset purchase)
  | "trend_change"    // sustained shift (e.g. new vendor relationship)
  | "data_error"      // likely an error (missing entry, double posting)
  | "new_activity"    // account had no prior activity, now active
  | "discontinued"    // account had prior activity, now zero
  | "unknown";

export interface AccountChange {
  accountName:    string;
  accountType:    string;
  currentBalance: number;   // current period net activity (Dr - Cr)
  priorBalance:   number;   // prior period net activity (Dr - Cr)
  variance:       number;   // current - prior (signed)
  variancePct:    number;   // % change vs prior (Infinity if prior = 0)
  isMaterial:     boolean;
  /** AI-generated structured analysis for material changes */
  analysis?:      FluxAnalysisDetail | null;
}

export interface FluxAnalysisDetail {
  pattern:    FluxPattern;
  summary:    string;
  causes:     string[];
  actions:    string[];
  confidence: number;
}

export interface FluxAnalysisResult {
  connectionId:    string;
  currentPeriod:   { start: Date; end: Date };
  priorPeriod:     { start: Date; end: Date };
  totalAccounts:   number;
  materialCount:   number;
  totalAbsVariance: number;
  changes:         AccountChange[];
  scannedAt:       Date;
  durationMs:      number;
}

// ─── Material variance thresholds ─────────────────────────────────────────────

const MATERIAL_ABS_THRESHOLD = 50_000;  // ₹50K
const MATERIAL_PCT_THRESHOLD = 10;       // 10%

function isMaterial(variance: number, priorBalance: number): boolean {
  const absVar = Math.abs(variance);
  if (absVar < MATERIAL_ABS_THRESHOLD) return false;

  // If prior was 0, any current activity over ₹50K is material
  if (priorBalance === 0) return absVar >= MATERIAL_ABS_THRESHOLD;

  const pct = (absVar / Math.abs(priorBalance)) * 100;
  return pct >= MATERIAL_PCT_THRESHOLD;
}

// ─── SQL helper ───────────────────────────────────────────────────────────────

async function runSql<T = Record<string, unknown>>(
  sql: string, colMap: Map<string, string>
): Promise<T[]> {
  const mapped = applyColMap(sql, colMap);
  const rows = await prisma.$queryRawUnsafe<T[]>(mapped);
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      out[k] = typeof v === "bigint" ? Number(v) : v;
    }
    return out as T;
  });
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (v === null || v === undefined) return 0;
  return Number(v) || 0;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// ─── Compute prior period (same length, immediately before) ───────────────────

function getPriorPeriod(start: Date, end: Date): { start: Date; end: Date } {
  const ms = end.getTime() - start.getTime();
  const priorEnd   = new Date(start.getTime() - 86_400_000); // day before current start
  const priorStart = new Date(priorEnd.getTime() - ms);
  return { start: priorStart, end: priorEnd };
}

// ─── Account activity query ──────────────────────────────────────────────────

async function fetchAccountActivity(
  table: string, start: Date, end: Date, colMap: Map<string, string>
): Promise<Map<string, number>> {
  const sql = `
    SELECT account_name,
           COALESCE(SUM(debit_amount) - SUM(credit_amount), 0) AS net
    FROM "${table}"
    WHERE transaction_date BETWEEN '${isoDate(start)}' AND '${isoDate(end)}'
      AND account_name IS NOT NULL AND account_name <> ''
    GROUP BY account_name
  `;

  const rows = await runSql<{ account_name: string; net: number }>(sql, colMap);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.account_name, toNum(r.net));
  return map;
}

// ─── AI analysis for material variance ────────────────────────────────────────

const FLUX_ANALYZER_SYSTEM = `You are a financial flux analyst for Indian SME accounting.

You analyze period-over-period account variances and produce structured explanations.

Common patterns you must recognize:
- SEASONAL: recurring quarterly/annual patterns (bonus, festival expenses, year-end inventory)
- ONE_TIME: asset purchase, settlement, refund, special transaction
- TREND_CHANGE: sustained shift suggesting new vendor/customer relationship
- DATA_ERROR: missing entry, double posting, wrong period date, voucher error
- NEW_ACTIVITY: account had ₹0 prior, suddenly has activity (new vendor opened, new product)
- DISCONTINUED: account had activity prior, now ₹0 (relationship ended)
- UNKNOWN: cannot determine from data shown

Output JSON ONLY. No prose. No markdown. Pure JSON.

Format:
{
  "pattern": "seasonal|one_time|trend_change|data_error|new_activity|discontinued|unknown",
  "summary": "1-2 sentence plain English summary",
  "causes": ["likely cause 1", "likely cause 2"],
  "actions": ["recommended action 1", "recommended action 2"],
  "confidence": 0.85
}

Rules:
- Reference SPECIFIC amounts and percentages from the data
- "causes" should be plausible business explanations grounded in the variance
- "actions" should be concrete things a finance person can do
- "confidence" reflects how certain you are (0.5 = unsure, 0.9 = very confident)`;

async function analyzeFluxItem(
  accountName:    string,
  accountType:    string,
  currentBalance: number,
  priorBalance:   number,
  variance:       number,
  variancePct:    number
): Promise<FluxAnalysisDetail | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const direction = variance > 0 ? "increased" : "decreased";
  const userPrompt =
    `Account: "${accountName}"\n` +
    `Type: ${accountType}\n` +
    `Prior period activity: ₹${priorBalance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}\n` +
    `Current period activity: ₹${currentBalance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}\n` +
    `Variance: ${direction} by ₹${Math.abs(variance).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` +
    (priorBalance !== 0 ? ` (${variancePct.toFixed(1)}%)` : ` (no prior activity)`) +
    `\n\nAnalyze the variance. Output JSON only.`;

  // PII-safe: account names + amounts are tokenised before send,
  // detokenised on response. The LLM never sees real names like "Reliance Industries".
  const result = await safeLlmCall({
    endpoint:     "https://api.groq.com/openai/v1/chat/completions",
    apiKey,
    model:        "llama-3.1-8b-instant",
    systemPrompt: FLUX_ANALYZER_SYSTEM,
    userContent:  userPrompt,
    temperature:  0.2,
    maxTokens:    400,
    jsonMode:     true,
    timeoutMs:    8_000,
  });
  if (!result || !result.content) return null;

  let parsed: Partial<FluxAnalysisDetail>;
  try { parsed = JSON.parse(result.content) as Partial<FluxAnalysisDetail>; }
  catch { return null; }
  if (!parsed.summary || !Array.isArray(parsed.causes) || !Array.isArray(parsed.actions)) return null;

  return {
    pattern:    parsed.pattern ?? "unknown",
    summary:    parsed.summary,
    causes:     parsed.causes.filter((c): c is string => typeof c === "string"),
    actions:    parsed.actions.filter((a): a is string => typeof a === "string"),
    confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
  };
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function runFluxAnalysis(
  connectionId: string,
  startDate:    Date,
  endDate:      Date,
  options?:     { withAI?: boolean; maxAIAnalyses?: number }
): Promise<FluxAnalysisResult> {
  const t0 = Date.now();

  const tableName = await getTableName(connectionId);
  if (!tableName) throw new Error("No GL table found for this connection");

  const [colMap, typeMap] = await Promise.all([
    buildColMap(connectionId),
    loadAccountTypeMap(connectionId),
  ]);

  const priorPeriod = getPriorPeriod(startDate, endDate);

  // Fetch activity for both periods in parallel
  const [currentActivity, priorActivity] = await Promise.all([
    fetchAccountActivity(tableName, startDate, endDate, colMap),
    fetchAccountActivity(tableName, priorPeriod.start, priorPeriod.end, colMap),
  ]);

  // Union of all accounts seen in either period
  const allAccounts = new Set<string>([...currentActivity.keys(), ...priorActivity.keys()]);

  const changes: AccountChange[] = [];
  let totalAbsVariance = 0;

  for (const accountName of allAccounts) {
    const currentBalance = currentActivity.get(accountName) ?? 0;
    const priorBalance   = priorActivity.get(accountName) ?? 0;
    const variance       = currentBalance - priorBalance;

    // Skip accounts with negligible activity in both periods
    if (Math.abs(currentBalance) < 1 && Math.abs(priorBalance) < 1) continue;

    const variancePct = priorBalance !== 0
      ? (variance / Math.abs(priorBalance)) * 100
      : currentBalance !== 0 ? Infinity : 0;

    const material = isMaterial(variance, priorBalance);

    changes.push({
      accountName,
      accountType: typeMap.get(accountName) ?? "UNKNOWN",
      currentBalance,
      priorBalance,
      variance,
      variancePct,
      isMaterial: material,
    });

    if (material) totalAbsVariance += Math.abs(variance);
  }

  // Sort: material first, then by absolute variance descending
  changes.sort((a, b) => {
    if (a.isMaterial !== b.isMaterial) return a.isMaterial ? -1 : 1;
    return Math.abs(b.variance) - Math.abs(a.variance);
  });

  // AI analysis for top material changes (default: enabled, capped at 10)
  const withAI = options?.withAI ?? true;
  const maxAI  = options?.maxAIAnalyses ?? 10;

  if (withAI) {
    const materialChanges = changes.filter((c) => c.isMaterial).slice(0, maxAI);
    const analyses = await Promise.all(
      materialChanges.map((c) => analyzeFluxItem(
        c.accountName, c.accountType, c.currentBalance, c.priorBalance, c.variance, c.variancePct
      ))
    );
    materialChanges.forEach((c, i) => { c.analysis = analyses[i] ?? null; });
  }

  return {
    connectionId,
    currentPeriod:   { start: startDate, end: endDate },
    priorPeriod,
    totalAccounts:   changes.length,
    materialCount:   changes.filter((c) => c.isMaterial).length,
    totalAbsVariance,
    changes,
    scannedAt:       new Date(),
    durationMs:      Date.now() - t0,
  };
}

// ─── Run flux for a close task + persist ─────────────────────────────────────

export interface FluxRunPersisted {
  id:                 string;
  taskId:             string;
  currentPeriodStart: Date;
  currentPeriodEnd:   Date;
  priorPeriodStart:   Date;
  priorPeriodEnd:     Date;
  totalAccounts:      number;
  materialCount:      number;
  totalAbsVariance:   number;
  durationMs:         number;
  lastRunAt:          Date;
  result:             FluxAnalysisResult;
}

/**
 * Run flux analysis for a specific CloseTask. Uses the period's date range,
 * the period's primary connection, and persists the result so the UI can
 * show it on subsequent visits without re-running.
 */
export async function runFluxForTask(taskId: string): Promise<FluxRunPersisted> {
  const task = await prisma.closeTask.findUniqueOrThrow({
    where:   { id: taskId },
    include: { period: true },
  });

  const result = await runFluxAnalysis(
    task.period.connectionId,
    task.period.startDate,
    task.period.endDate,
    { withAI: true, maxAIAnalyses: 10 }
  );

  // Upsert the persisted run (replaces previous run for this task)
  const saved = await prisma.fluxAnalysisRun.upsert({
    where:  { taskId },
    create: {
      taskId,
      currentPeriodStart: result.currentPeriod.start,
      currentPeriodEnd:   result.currentPeriod.end,
      priorPeriodStart:   result.priorPeriod.start,
      priorPeriodEnd:     result.priorPeriod.end,
      totalAccounts:      result.totalAccounts,
      materialCount:      result.materialCount,
      totalAbsVariance:   result.totalAbsVariance,
      resultJson:         JSON.stringify(result),
      durationMs:         result.durationMs,
      lastRunAt:          result.scannedAt,
    },
    update: {
      currentPeriodStart: result.currentPeriod.start,
      currentPeriodEnd:   result.currentPeriod.end,
      priorPeriodStart:   result.priorPeriod.start,
      priorPeriodEnd:     result.priorPeriod.end,
      totalAccounts:      result.totalAccounts,
      materialCount:      result.materialCount,
      totalAbsVariance:   result.totalAbsVariance,
      resultJson:         JSON.stringify(result),
      durationMs:         result.durationMs,
      lastRunAt:          result.scannedAt,
    },
  });

  return {
    id:                 saved.id,
    taskId:             saved.taskId,
    currentPeriodStart: saved.currentPeriodStart,
    currentPeriodEnd:   saved.currentPeriodEnd,
    priorPeriodStart:   saved.priorPeriodStart,
    priorPeriodEnd:     saved.priorPeriodEnd,
    totalAccounts:      saved.totalAccounts,
    materialCount:      saved.materialCount,
    totalAbsVariance:   saved.totalAbsVariance,
    durationMs:         saved.durationMs,
    lastRunAt:          saved.lastRunAt,
    result,
  };
}

export async function getFluxRunForTask(taskId: string): Promise<FluxRunPersisted | null> {
  const saved = await prisma.fluxAnalysisRun.findUnique({ where: { taskId } });
  if (!saved) return null;

  let result: FluxAnalysisResult;
  try {
    result = JSON.parse(saved.resultJson) as FluxAnalysisResult;
  } catch {
    return null;
  }

  return {
    id:                 saved.id,
    taskId:             saved.taskId,
    currentPeriodStart: saved.currentPeriodStart,
    currentPeriodEnd:   saved.currentPeriodEnd,
    priorPeriodStart:   saved.priorPeriodStart,
    priorPeriodEnd:     saved.priorPeriodEnd,
    totalAccounts:      saved.totalAccounts,
    materialCount:      saved.materialCount,
    totalAbsVariance:   saved.totalAbsVariance,
    durationMs:         saved.durationMs,
    lastRunAt:          saved.lastRunAt,
    result,
  };
}
