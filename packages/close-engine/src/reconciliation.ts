import { prisma } from "@aiql/db";
import { updateTaskStatus, resolveDependencies, recalculateProgress } from "./checklist";
import { buildColMap as sharedBuildColMap, applyColMap as sharedApplyColMap, getTableColumns, makeSqlDefensive } from "./utils/column-mapping";
import { safeLlmCall } from "@aiql/tokeniser";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReconDetail {
  id:            string;
  name:          string;
  taskId:        string;
  status:        string;
  sourceBalance: number | null;
  targetBalance: number | null;
  variance:      number | null;
  aiExplanation: string | null;
  lastRunAt:     Date | null;
  varianceItems: Record<string, unknown>[];
  sourceQuery:   string;
  targetQuery:   string;
  detailQuery:   string | null;
}

// ─── Account type map ─────────────────────────────────────────────────────────

type AccountType = string; // mirrors schema-intel AccountType

interface AccountTypeIndex {
  bank:      string[];   // BANK + CASH
  payable:   string[];   // PAYABLE + CURRENT_LIABILITY
  receivable: string[];  // RECEIVABLE + CURRENT_ASSET (debtors)
  tax:       string[];   // TAX
  inventory: string[];   // INVENTORY
}

async function loadAccountTypeIndex(connectionId: string): Promise<AccountTypeIndex> {
  const connection = await prisma.erpConnection.findUnique({
    where: { id: connectionId },
    select: { schemaCacheJson: true },
  });

  const idx: AccountTypeIndex = { bank: [], payable: [], receivable: [], tax: [], inventory: [] };
  if (!connection?.schemaCacheJson) return idx;

  try {
    const schema = JSON.parse(connection.schemaCacheJson) as {
      accountTypeMap?: Record<string, AccountType>;
    };
    const map = schema.accountTypeMap ?? {};

    for (const [name, type] of Object.entries(map)) {
      if (type === "BANK" || type === "CASH")             idx.bank.push(name);
      else if (type === "PAYABLE" || type === "CURRENT_LIABILITY") idx.payable.push(name);
      else if (type === "RECEIVABLE")                     idx.receivable.push(name);
      else if (type === "TAX")                            idx.tax.push(name);
      else if (type === "INVENTORY")                      idx.inventory.push(name);
    }
  } catch { /* malformed JSON — return empty index */ }

  return idx;
}

/** Build SQL IN clause from account names, falling back to LIKE pattern if empty */
function accountFilter(
  colName: string,
  accounts: string[],
  fallbackLike: string
): string {
  if (accounts.length > 0) {
    const list = accounts.map((n) => `'${n.replace(/'/g, "''")}'`).join(", ");
    return `${colName} IN (${list})`;
  }
  return `LOWER(${colName}) LIKE '${fallbackLike}'`;
}

/**
 * Replace generic LIKE patterns in stored SQL with exact account name IN clauses
 * derived from the connection's accountTypeMap (computed at upload time — no manual setup).
 *
 * Handles the 5 standard recon account categories. Falls back to the original
 * LIKE pattern if no accounts of that type were classified.
 */
function applyAccountTypeIndex(sql: string, idx: AccountTypeIndex): string {
  type Rule = { pattern: RegExp; accounts: string[]; fallback: string };

  const col = "account_name"; // already replaced by applyColMap if needed

  const rules: Rule[] = [
    // Bank / Cash
    {
      pattern: /\(LOWER\(account_name\) LIKE '%bank%'\s*\n?\s*OR LOWER\(account_name\) LIKE '%cash%'\)/gi,
      accounts: idx.bank,
      fallback: "%bank%",
    },
    // AP control (payable)
    {
      pattern: /\(LOWER\(account_name\) LIKE '%sundry creditor%'[\s\S]*?LOWER\(account_name\) LIKE '%payable%'\)/gi,
      accounts: idx.payable,
      fallback: "%payable%",
    },
    // AR control (receivable)
    {
      pattern: /\(LOWER\(account_name\) LIKE '%sundry debtor%'[\s\S]*?LOWER\(account_name\) LIKE '%receivable%'\)/gi,
      accounts: idx.receivable,
      fallback: "%receivable%",
    },
    // GST / Tax
    {
      pattern: /\(LOWER\(account_name\) LIKE '%cgst%'[\s\S]*?LOWER\(account_name\) LIKE '%gst%'\)/gi,
      accounts: idx.tax,
      fallback: "%gst%",
    },
    // Inventory
    {
      pattern: /\(LOWER\(account_name\) LIKE '%stock%'\s*\n?\s*OR LOWER\(account_name\) LIKE '%inventory%'\)/gi,
      accounts: idx.inventory,
      fallback: "%stock%",
    },
  ];

  let result = sql;
  for (const rule of rules) {
    result = result.replace(rule.pattern, accountFilter(col, rule.accounts, rule.fallback));
  }
  return result;
}

// ─── Column mapping (delegated to shared utility) ─────────────────────────────

const buildColMap = sharedBuildColMap;
const applyColMap = sharedApplyColMap;

// ─── Query execution ──────────────────────────────────────────────────────────

const WRITE_PATTERNS = [/\bINSERT\b/i, /\bUPDATE\b/i, /\bDELETE\b/i, /\bDROP\b/i, /\bTRUNCATE\b/i];

async function runSql(sql: string, params: string[] = []): Promise<Record<string, unknown>[]> {
  for (const re of WRITE_PATTERNS) {
    if (re.test(sql)) throw new Error("Write operations are not permitted in reconciliation queries");
  }
  // $queryRawUnsafe binds positional values to $1, $2, ... in the SQL.
  // Bound values cannot escape their literal slot, so user-supplied content
  // in `params` is safe even if the value contains quotes or SQL keywords.
  const rows = params.length > 0
    ? await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql.trim(), ...params)
    : await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql.trim());
  // Coerce BigInt → Number (PostgreSQL COUNT → JS BigInt via Prisma)
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === "bigint" ? Number(v) : v;
    }
    return out;
  });
}

function parseParams(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
    return [];
  } catch { return []; }
}

function extractBalance(rows: Record<string, unknown>[]): number {
  const row = rows[0];
  if (!row) return 0;
  const val = Object.values(row)[0];
  return typeof val === "number" ? val : Number(val ?? 0);
}

// ─── AI analysis (structured) ─────────────────────────────────────────────────

export type FindingType = "timing" | "missing" | "misclassification" | "duplicate" | "rounding" | "other";
export type VariancePattern = "normal_in_transit" | "expected_timing" | "data_error" | "anomaly" | "unknown";

export interface ReconFinding {
  type:        FindingType;
  description: string;
  amount?:     number;
  items?:      string[]; // related transaction references
}

export interface ReconAnalysis {
  summary:    string;
  findings:   ReconFinding[];
  actions:    string[];
  pattern:    VariancePattern;
  confidence: number; // 0-1
}

const ANALYZER_SYSTEM = `You are a financial reconciliation analyst for Indian SME accounting (Tally/Zoho/Excel-based GL data).

You analyze GL reconciliation variances and produce structured, actionable analysis.

Common Indian SME variance causes you must recognize:
- TIMING: cheques in transit (issued but not cleared), deposits in clearing, post-dated cheques
- MISSING: forgotten depreciation entry, missing month-end accruals, unposted invoices
- MISCLASSIFICATION: vendor advance posted to expense account, wrong CGST/SGST split, party type mismatch
- DUPLICATE: same invoice booked twice, voucher entered against multiple parties
- ROUNDING: paise-level differences, conversion errors, partial payments
- OTHER: anything that doesn't fit above categories

Output JSON ONLY. No prose. No markdown. Pure JSON.

Format:
{
  "summary": "1-2 sentence plain English summary specific to the data shown",
  "findings": [
    {
      "type": "timing" | "missing" | "misclassification" | "duplicate" | "rounding" | "other",
      "description": "specific finding referencing actual data",
      "amount": <number, optional>,
      "items": ["VCH-1234", "VCH-5678"]
    }
  ],
  "actions": [
    "specific actionable next step 1",
    "specific actionable next step 2"
  ],
  "pattern": "normal_in_transit" | "expected_timing" | "data_error" | "anomaly" | "unknown",
  "confidence": 0.85
}

Rules:
- Reference SPECIFIC voucher numbers, dates, amounts from the data — never use generic statements
- "actions" should be concrete things a finance person can do today
- "confidence" reflects how certain you are about the diagnosis (0.5 = unsure, 0.9 = very confident)
- If data is insufficient, say so in summary and set confidence < 0.5
- "pattern" should reflect whether this is benign (normal_in_transit, expected_timing) or concerning (data_error, anomaly)`;

async function analyzeVariance(
  reconName:        string,
  sourceBalance:    number,
  targetBalance:    number,
  variance:         number,
  threshold:        number,
  items:            Record<string, unknown>[],
  startDate:        Date,
  endDate:          Date
): Promise<ReconAnalysis | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const sourceMag = Math.abs(sourceBalance) || 1;
  const variancePct = ((Math.abs(variance) / sourceMag) * 100).toFixed(2);

  const itemsBlock = items.length > 0
    ? `Top variance items (up to 10):\n${items.slice(0, 10).map((r, i) => `${i + 1}. ${JSON.stringify(r)}`).join("\n")}`
    : "No variance items available (detail query empty or not configured).";

  const userPrompt =
    `Reconciliation: "${reconName}"\n` +
    `Period: ${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}\n` +
    `Source balance: ₹${sourceBalance.toLocaleString("en-IN")}\n` +
    `Target balance: ₹${targetBalance.toLocaleString("en-IN")}\n` +
    `Variance: ₹${Math.abs(variance).toLocaleString("en-IN")} (${variancePct}% of source)\n` +
    `Threshold: ₹${threshold.toLocaleString("en-IN")}\n\n` +
    itemsBlock +
    `\n\nAnalyze the variance. Output JSON only.`;

  // PII-safe wrapper — variance items often contain vendor/customer names + amounts.
  const result = await safeLlmCall({
    endpoint:     "https://api.groq.com/openai/v1/chat/completions",
    apiKey,
    model:        "llama-3.1-8b-instant",
    systemPrompt: ANALYZER_SYSTEM,
    userContent:  userPrompt,
    temperature:  0.2,
    maxTokens:    800,
    jsonMode:     true,
    timeoutMs:    10_000,
  });
  if (!result || !result.content) return null;

  try {
    const parsed = JSON.parse(result.content) as Partial<ReconAnalysis>;

    // Validate + sanitize
    if (!parsed.summary || !Array.isArray(parsed.findings) || !Array.isArray(parsed.actions)) {
      return null;
    }

    return {
      summary:    parsed.summary,
      findings:   parsed.findings.filter((f): f is ReconFinding => !!f && typeof f.type === "string" && typeof f.description === "string"),
      actions:    parsed.actions.filter((a): a is string => typeof a === "string"),
      pattern:    parsed.pattern ?? "unknown",
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    };
  } catch {
    return null;
  }
}

// ─── Core runner ──────────────────────────────────────────────────────────────

export async function runReconciliation(reconId: string): Promise<ReconDetail> {
  // 1. Load recon + task + period (to get connectionId for column mapping)
  const recon = await prisma.reconciliation.findUniqueOrThrow({
    where:   { id: reconId },
    include: { task: { include: { period: true } } },
  });

  // Mark running
  await prisma.reconciliation.update({
    where: { id: reconId },
    data:  { status: "RUNNING", lastRunAt: new Date() },
  });

  // 2. Load column map + account type index — both from already-computed schema
  // Also fetch the actual table columns so SQL can be made defensive
  // (e.g. vendor_name might not exist in a Tally classic export with no party column)
  const file = await prisma.uploadedFile.findUnique({
    where:  { connectionId: recon.task.period.connectionId },
    select: { tableName: true },
  });
  const tableName = file?.tableName ?? "";

  const [colMap, accountIdx, presentColumns] = await Promise.all([
    buildColMap(recon.task.period.connectionId),
    loadAccountTypeIndex(recon.task.period.connectionId),
    tableName ? getTableColumns(tableName) : Promise.resolve(new Set<string>()),
  ]);

  const applyMap = (sql: string) => {
    let s = applyColMap(sql, colMap);
    s = applyAccountTypeIndex(s, accountIdx);
    s = makeSqlDefensive(s, presentColumns);
    return s;
  };

  let sourceBalance = 0;
  let targetBalance = 0;
  let varianceItems: Record<string, unknown>[] = [];
  let aiExplanation: string | null = null;

  const params = parseParams(recon.paramsJson);

  try {
    // 3. Execute source and target queries in parallel (with column name substitution)
    const [sourceRows, targetRows] = await Promise.all([
      runSql(applyMap(recon.sourceQuery), params),
      runSql(applyMap(recon.targetQuery), params),
    ]);

    sourceBalance = extractBalance(sourceRows);
    targetBalance = extractBalance(targetRows);
    const variance = Math.abs(sourceBalance - targetBalance);

    // 3. Compare to threshold
    const passed = variance <= recon.varianceThreshold;

    if (!passed) {
      // 4a. Run detail query for variance items (if defined)
      if (recon.detailQuery) {
        try {
          varianceItems = await runSql(applyMap(recon.detailQuery), params);
        } catch {
          varianceItems = [];
        }
      }

      // 4b. AI structured analysis (non-blocking — fails gracefully)
      const analysis = await analyzeVariance(
        recon.name,
        sourceBalance,
        targetBalance,
        variance,
        recon.varianceThreshold,
        varianceItems,
        recon.task.period.startDate,
        recon.task.period.endDate
      );

      // Store as JSON string in aiExplanation (backwards compatible — UI parses it)
      aiExplanation = analysis ? JSON.stringify(analysis) : null;
    }

    // 5. Persist result
    await prisma.reconciliation.update({
      where: { id: reconId },
      data: {
        status:        passed ? "PASSED" : "FAILED",
        sourceBalance,
        targetBalance,
        variance,
        aiExplanation: passed ? null : aiExplanation,
        lastRunAt:     new Date(),
      },
    });

    // 6. Auto-complete task or mark failed, then cascade deps
    if (passed && recon.task.autoComplete) {
      await updateTaskStatus(recon.taskId, "COMPLETED");
    } else if (!passed) {
      await updateTaskStatus(recon.taskId, "FAILED");
    }

    await resolveDependencies(recon.task.period.id);
    await recalculateProgress(recon.task.period.id);

    return getReconciliationDetail(reconId, varianceItems);

  } catch (err) {
    // Query execution failed — mark recon and task as failed
    const message = (err as Error).message;
    await prisma.reconciliation.update({
      where: { id: reconId },
      data:  { status: "FAILED", aiExplanation: `Query error: ${message}`, lastRunAt: new Date() },
    });
    await updateTaskStatus(recon.taskId, "FAILED");
    await recalculateProgress(recon.task.period.id);
    throw err;
  }
}

// ─── Run all pending reconciliations for a period ─────────────────────────────

export async function runAllReconciliations(periodId: string): Promise<ReconDetail[]> {
  const tasks = await prisma.closeTask.findMany({
    where:   { periodId },
    include: { reconciliations: { where: { status: { in: ["PENDING", "FAILED"] } } } },
    orderBy: { sortOrder: "asc" },
  });

  const results: ReconDetail[] = [];

  for (const task of tasks) {
    // Only run recons for tasks that are not blocked
    if (task.status === "BLOCKED" || task.status === "COMPLETED") continue;

    for (const recon of task.reconciliations) {
      try {
        const detail = await runReconciliation(recon.id);
        results.push(detail);
      } catch {
        // continue — runReconciliation already marked it failed
      }
    }
  }

  return results;
}

// ─── Detail query ─────────────────────────────────────────────────────────────

export async function getReconciliationDetail(
  reconId:      string,
  cachedItems?: Record<string, unknown>[]
): Promise<ReconDetail> {
  const recon = await prisma.reconciliation.findUniqueOrThrow({
    where: { id: reconId },
  });

  let varianceItems = cachedItems ?? [];

  // If failed and has a detail query, re-fetch items on demand
  if (!cachedItems && recon.status === "FAILED" && recon.detailQuery) {
    try {
      varianceItems = await runSql(recon.detailQuery, parseParams(recon.paramsJson));
    } catch {
      varianceItems = [];
    }
  }

  return {
    id:            recon.id,
    name:          recon.name,
    taskId:        recon.taskId,
    status:        recon.status,
    sourceBalance: recon.sourceBalance,
    targetBalance: recon.targetBalance,
    variance:      recon.variance,
    aiExplanation: recon.aiExplanation,
    lastRunAt:     recon.lastRunAt,
    varianceItems,
    sourceQuery:   recon.sourceQuery,
    targetQuery:   recon.targetQuery,
    detailQuery:   recon.detailQuery,
  };
}
