/**
 * Agent Runtime — controls agent execution with hard guardrails.
 *
 * Features:
 *   - Iteration limit (default 8)
 *   - Cost cap per run (default ₹5)
 *   - Time budget (default 30s)
 *   - Token tracking
 *   - Tool call logging (audit trail)
 *   - Graceful degradation on limit hit
 *
 * Built to prevent the predictable failure modes of LLM agents:
 *   - Infinite reasoning loops
 *   - Cost runaway
 *   - Slow/hung agents blocking UI
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentLimits {
  maxIterations:  number;   // default 8
  maxCostInr:     number;   // default ₹5
  maxDurationMs:  number;   // default 30,000
  maxToolCalls:   number;   // default 12
}

export const DEFAULT_LIMITS: AgentLimits = {
  maxIterations: 8,
  maxCostInr:    5,
  maxDurationMs: 30_000,
  maxToolCalls:  12,
};

export interface AgentTool {
  name:        string;
  description: string;
  /** JSON schema-like description for LLM prompt */
  parameters:  Record<string, { type: string; description: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute:     (args: any) => Promise<any>;
}

export interface ToolCallLog {
  iteration:   number;
  toolName:    string;
  args:        unknown;
  result:      unknown;
  durationMs:  number;
  success:     boolean;
  error?:      string;
}

export type StopReason =
  | "completed"            // agent decided it was done
  | "max_iterations"       // hit iteration limit
  | "max_cost"             // hit cost cap
  | "max_duration"         // timeout
  | "max_tool_calls"       // too many tool calls
  | "tool_error"           // unrecoverable tool failure
  | "llm_error";           // LLM call failed

export interface AgentRunResult<TOutput> {
  output:        TOutput | null;
  stopReason:    StopReason;
  iterations:    number;
  toolCalls:     ToolCallLog[];
  totalCostInr:  number;
  totalTokens:   { input: number; output: number };
  durationMs:    number;
  /** Reasoning trail — LLM's internal thoughts at each step */
  reasoning:     string[];
}

// ─── Cost calculation ────────────────────────────────────────────────────────
// Groq llama-3.1-8b-instant: free
// Groq llama-3.3-70b-versatile: $0.59/M input, $0.79/M output  (~₹0.05/1K tokens)
// Anthropic Haiku 4.5: $0.80/M input, $4/M output  (~₹0.07/1K input, ₹0.33/1K output)

const PROVIDER_RATES: Record<string, { inputPerM: number; outputPerM: number }> = {
  "groq:llama-3.1-8b-instant":   { inputPerM: 0,    outputPerM: 0    },
  "groq:llama-3.3-70b-versatile":{ inputPerM: 0.59, outputPerM: 0.79 },
  "anthropic:claude-haiku-4-5":  { inputPerM: 0.80, outputPerM: 4.00 },
  "anthropic:claude-sonnet-4-6": { inputPerM: 3.00, outputPerM: 15.0 },
};

const USD_TO_INR = 83;

export function estimateCostInr(
  providerKey: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rate = PROVIDER_RATES[providerKey] ?? PROVIDER_RATES["groq:llama-3.3-70b-versatile"]!;
  const usd = (inputTokens / 1_000_000) * rate.inputPerM + (outputTokens / 1_000_000) * rate.outputPerM;
  return usd * USD_TO_INR;
}

// ─── Agent Session State ─────────────────────────────────────────────────────

export interface AgentSession<TOutput> {
  iteration:    number;
  toolCalls:    ToolCallLog[];
  totalTokens:  { input: number; output: number };
  totalCostInr: number;
  startedAt:    number;
  reasoning:    string[];
  output?:      TOutput;
  stopReason?:  StopReason;
}

export function createSession<TOutput>(): AgentSession<TOutput> {
  return {
    iteration:    0,
    toolCalls:    [],
    totalTokens:  { input: 0, output: 0 },
    totalCostInr: 0,
    startedAt:    Date.now(),
    reasoning:    [],
  };
}

// ─── Limit checks ────────────────────────────────────────────────────────────

export function checkLimits<T>(
  session: AgentSession<T>,
  limits:  AgentLimits
): StopReason | null {
  if (session.iteration >= limits.maxIterations)  return "max_iterations";
  if (session.totalCostInr >= limits.maxCostInr)  return "max_cost";
  if (session.toolCalls.length >= limits.maxToolCalls) return "max_tool_calls";
  if (Date.now() - session.startedAt >= limits.maxDurationMs) return "max_duration";
  return null;
}

// ─── Tool execution with logging ─────────────────────────────────────────────

export async function executeTool(
  session:  AgentSession<unknown>,
  tool:     AgentTool,
  args:     unknown
): Promise<{ success: boolean; result: unknown; error?: string }> {
  const t0 = Date.now();
  let success = false;
  let result: unknown = null;
  let error: string | undefined;

  try {
    result = await tool.execute(args);
    success = true;
  } catch (e) {
    error = (e as Error).message;
  }

  session.toolCalls.push({
    iteration:  session.iteration,
    toolName:   tool.name,
    args,
    result,
    durationMs: Date.now() - t0,
    success,
    error,
  });

  return { success, result, error };
}

// ─── Token tracking ──────────────────────────────────────────────────────────

export function trackUsage(
  session:      AgentSession<unknown>,
  providerKey:  string,
  inputTokens:  number,
  outputTokens: number
): void {
  session.totalTokens.input  += inputTokens;
  session.totalTokens.output += outputTokens;
  session.totalCostInr       += estimateCostInr(providerKey, inputTokens, outputTokens);
}

// ─── Build standard tools registry for GL data ───────────────────────────────

import { prisma } from "@aiql/db";
import { buildColMap, applyColMap, getTableName } from "../utils/column-mapping";

interface ToolContext {
  connectionId: string;
  startDate:    Date;
  endDate:      Date;
}

export async function buildGlTools(ctx: ToolContext): Promise<AgentTool[]> {
  const tableName = await getTableName(ctx.connectionId);
  if (!tableName) throw new Error("No GL table for connection");
  const colMap = await buildColMap(ctx.connectionId);

  const startIso = ctx.startDate.toISOString().slice(0, 10);
  const endIso   = ctx.endDate.toISOString().slice(0, 10);

  const runSql = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
    const mapped = applyColMap(sql, colMap);
    const rows = await prisma.$queryRawUnsafe<T[]>(mapped);
    return rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
        out[k] = typeof v === "bigint" ? Number(v) : v;
      }
      return out as T;
    });
  };

  return [
    {
      name: "getAccountSummary",
      description: "Get total debits, credits, and net balance for an account in the period",
      parameters: { accountName: { type: "string", description: "Exact account name" } },
      async execute({ accountName }: { accountName: string }) {
        const sql = `
          SELECT account_name,
                 COALESCE(SUM(debit_amount), 0) AS total_debit,
                 COALESCE(SUM(credit_amount), 0) AS total_credit,
                 COALESCE(SUM(debit_amount - credit_amount), 0) AS net_dr_cr,
                 COUNT(*) AS entry_count
          FROM "${tableName}"
          WHERE account_name = '${accountName.replace(/'/g, "''")}'
            AND transaction_date BETWEEN '${startIso}' AND '${endIso}'
          GROUP BY account_name
        `;
        const rows = await runSql(sql);
        return rows[0] ?? { entry_count: 0 };
      },
    },
    {
      name: "comparePeriods",
      description: "Compare an account's net activity vs the prior equal-length period",
      parameters: { accountName: { type: "string", description: "Account name" } },
      async execute({ accountName }: { accountName: string }) {
        const periodMs = ctx.endDate.getTime() - ctx.startDate.getTime();
        const priorEnd = new Date(ctx.startDate.getTime() - 86_400_000);
        const priorStart = new Date(priorEnd.getTime() - periodMs);
        const piso = (d: Date) => d.toISOString().slice(0, 10);

        const sql = `
          SELECT
            (SELECT COALESCE(SUM(debit_amount - credit_amount), 0)
             FROM "${tableName}"
             WHERE account_name = '${accountName.replace(/'/g, "''")}'
               AND transaction_date BETWEEN '${piso(priorStart)}' AND '${piso(priorEnd)}'
            ) AS prior_net,
            (SELECT COALESCE(SUM(debit_amount - credit_amount), 0)
             FROM "${tableName}"
             WHERE account_name = '${accountName.replace(/'/g, "''")}'
               AND transaction_date BETWEEN '${startIso}' AND '${endIso}'
            ) AS current_net
        `;
        const rows = await runSql<{ prior_net: number; current_net: number }>(sql);
        const r = rows[0] ?? { prior_net: 0, current_net: 0 };
        return {
          ...r,
          variance:    r.current_net - r.prior_net,
          variancePct: r.prior_net !== 0 ? ((r.current_net - r.prior_net) / Math.abs(r.prior_net)) * 100 : null,
        };
      },
    },
    {
      name: "getTopEntriesForAccount",
      description: "Get the largest transactions in an account",
      parameters: {
        accountName: { type: "string", description: "Account name" },
        limit:       { type: "number", description: "Max rows (default 5)" },
      },
      async execute({ accountName, limit = 5 }: { accountName: string; limit?: number }) {
        const sql = `
          SELECT transaction_date, reference_number, voucher_type,
                 GREATEST(debit_amount, credit_amount) AS amount,
                 description
          FROM "${tableName}"
          WHERE account_name = '${accountName.replace(/'/g, "''")}'
            AND transaction_date BETWEEN '${startIso}' AND '${endIso}'
          ORDER BY GREATEST(debit_amount, credit_amount) DESC
          LIMIT ${Math.min(20, Math.max(1, limit))}
        `;
        return runSql(sql);
      },
    },
    {
      name: "groupByVoucherType",
      description: "Break down account activity by voucher type",
      parameters: { accountName: { type: "string", description: "Account name" } },
      async execute({ accountName }: { accountName: string }) {
        const sql = `
          SELECT voucher_type, COUNT(*) AS count,
                 COALESCE(SUM(debit_amount), 0) AS total_debit,
                 COALESCE(SUM(credit_amount), 0) AS total_credit
          FROM "${tableName}"
          WHERE account_name = '${accountName.replace(/'/g, "''")}'
            AND transaction_date BETWEEN '${startIso}' AND '${endIso}'
          GROUP BY voucher_type
          ORDER BY count DESC
        `;
        return runSql(sql);
      },
    },
    {
      name: "checkAccountExists",
      description: "Check if an account name exists in the GL and how many entries it has in the period",
      parameters: { accountNamePattern: { type: "string", description: "LIKE pattern to search account names" } },
      async execute({ accountNamePattern }: { accountNamePattern: string }) {
        const sql = `
          SELECT account_name, COUNT(*) AS entry_count,
                 COALESCE(SUM(debit_amount), 0) AS total_debit,
                 COALESCE(SUM(credit_amount), 0) AS total_credit
          FROM "${tableName}"
          WHERE LOWER(account_name) LIKE LOWER('${accountNamePattern.replace(/'/g, "''")}')
            AND transaction_date BETWEEN '${startIso}' AND '${endIso}'
          GROUP BY account_name
          LIMIT 20
        `;
        return runSql(sql);
      },
    },
  ];
}

// ─── Hallucination cross-checks (Sprint 1, Day 5) ───────────────────────────
//
// After agent reaches a conclusion, run deterministic SQL to verify
// the conclusion isn't contradicted by the actual data. If contradicted,
// downgrade confidence and flag the contradiction.

export interface CrossCheckResult {
  passed:           boolean;
  contradictions:   string[];
  verifiedClaims:   string[];
}

export async function crossCheckClaims(
  claims: { claim: string; verifyTool: string; verifyArgs: unknown; expectedResult: unknown }[],
  tools:  AgentTool[]
): Promise<CrossCheckResult> {
  const contradictions: string[] = [];
  const verifiedClaims: string[] = [];

  for (const { claim, verifyTool, verifyArgs, expectedResult } of claims) {
    const tool = tools.find((t) => t.name === verifyTool);
    if (!tool) continue;

    try {
      const actual = await tool.execute(verifyArgs as never);
      const matches = JSON.stringify(actual).includes(JSON.stringify(expectedResult));
      if (matches) verifiedClaims.push(claim);
      else contradictions.push(`Claim "${claim}" contradicted by data: expected ${JSON.stringify(expectedResult)}, found ${JSON.stringify(actual)}`);
    } catch {
      contradictions.push(`Could not verify claim "${claim}"`);
    }
  }

  return {
    passed: contradictions.length === 0,
    contradictions,
    verifiedClaims,
  };
}
