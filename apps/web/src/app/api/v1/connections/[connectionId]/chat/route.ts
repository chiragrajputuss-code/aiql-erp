import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { executeQuery, type DateContext, type ConversationTurn } from "@aiql/query-engine";
import type { RagStore, RagEntry } from "@aiql/query-engine";
import { previewTokenisation } from "@aiql/tokeniser";
import { executeUploadQuery } from "@aiql/erp-connectors";
import type { ERPSchema } from "@aiql/schema-intel";
import type { EntityDictionary, TokenisationConfig } from "@aiql/tokeniser";
import type { ERPConnector } from "@aiql/erp-connectors";
import { textSimilarity } from "@aiql/query-engine/src/rag/text-similarity";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkPlanAccess, incrementQueryCount } from "@/lib/billing";

type Ctx = { params: { connectionId: string } };

// ─── RAG store (same hardened impl as query route) ────────────────────────────

const RAG_QUALITY_GATE = 0.7;
const RAG_TTL_DAYS     = 180;
const GL_TABLE_TOKEN   = '"{{GL_TABLE}}"';

class ChatRagStore implements RagStore {
  constructor(
    private readonly orgId:        string,
    private readonly connectionId: string,
    private readonly tableName:    string | null,
  ) {}

  private restoreSql(sql: string): string {
    return this.tableName ? sql.replace(GL_TABLE_TOKEN, `"${this.tableName}"`) : sql;
  }

  private async fetchScored(question: string, extraWhere: object): Promise<RagEntry[]> {
    const ttlCutoff = new Date(Date.now() - RAG_TTL_DAYS * 24 * 60 * 60 * 1000);
    const logs = await prisma.queryLog.findMany({
      where: {
        orgId: this.orgId, status: "COMPLETED",
        generatedSql: { not: null },
        confidence:   { gte: RAG_QUALITY_GATE },
        createdAt:    { gte: ttlCutoff },
        AND: [
          { OR: [{ rowCount: null }, { rowCount: { gt: 0 } }] },
          { OR: [{ feedback: null }, { feedback: { not: "thumbs_down" } }] },
        ],
        ...extraWhere,
      },
      select: { question: true, generatedSql: true, confidence: true },
      orderBy: { createdAt: "desc" }, take: 200,
    });
    return logs
      .map((l) => ({
        question: l.question, sql: this.restoreSql(l.generatedSql!),
        confidence: l.confidence ?? 0, similarity: textSimilarity(question, l.question),
      }))
      .filter((e) => e.similarity > 0.3)
      .sort((a, b) => b.similarity - a.similarity);
  }

  async findSimilar(question: string, limit = 5): Promise<RagEntry[]> {
    const p1 = await this.fetchScored(question, { connectionId: this.connectionId });
    if (p1.length >= 3) return p1.slice(0, limit);
    const p2 = await this.fetchScored(question, { connectionId: { not: this.connectionId } });
    return [...p1, ...p2].slice(0, limit);
  }

  async store(): Promise<void> { /* no-op */ }
}

// ─── Indian FY helpers ────────────────────────────────────────────────────────

function buildDateContext(glMinDate: string | null, glMaxDate: string | null): DateContext {
  const now   = new Date();
  const today = now.toISOString().slice(0, 10);

  // Indian FY: Apr–Mar. FY26 = Apr 2025 – Mar 2026.
  const month = now.getMonth(); // 0-indexed
  const year  = now.getFullYear();
  const fyYear = month >= 3 ? year + 1 : year; // April (3) starts new FY

  const currentFY       = `FY${String(fyYear).slice(-2)}`;
  const currentFYStart  = `${fyYear - 1}-04-01`;
  const currentFYEnd    = `${fyYear}-03-31`;

  // Quarter within Indian FY
  const quarterIdx = month >= 3 && month <= 5 ? 0
                   : month >= 6 && month <= 8 ? 1
                   : month >= 9 && month <= 11 ? 2
                   : 3;

  const quarterStarts = [
    `${fyYear - 1}-04-01`, `${fyYear - 1}-07-01`,
    `${fyYear - 1}-10-01`, `${fyYear}-01-01`,
  ];
  const quarterEnds = [
    `${fyYear - 1}-06-30`, `${fyYear - 1}-09-30`,
    `${fyYear - 1}-12-31`, `${fyYear}-03-31`,
  ];

  return {
    today,
    currentFY,
    currentFYStart,
    currentFYEnd,
    currentQuarter:      `Q${quarterIdx + 1} ${currentFY}`,
    currentQuarterStart: quarterStarts[quarterIdx],
    currentQuarterEnd:   quarterEnds[quarterIdx],
    glPeriodStart: glMinDate,
    glPeriodEnd:   glMaxDate,
  };
}

// ─── Follow-up detection ──────────────────────────────────────────────────────

const FOLLOW_UP_PRONOUNS = ["those", "them", "these", "that ", "it ", "they", "which of", "what about", "how about"];
const FOLLOW_UP_STARTERS = ["and ", "also ", "but ", "now ", "show only", "filter to", "sort by", "group by", "exclude "];

function isFollowUp(question: string, historyLength: number): boolean {
  if (historyLength === 0) return false;
  const q = question.toLowerCase().trim();
  return FOLLOW_UP_PRONOUNS.some((p) => q.includes(p)) ||
         FOLLOW_UP_STARTERS.some((s) => q.startsWith(s)) ||
         (q.length < 60 && !/\b(show|what|how|which|list|find|give|total|sum|count|get)\b/.test(q));
}

// ─── Server-side answer sentence (hallucination protection) ───────────────────

function formatINR(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function buildAnswerSentence(
  rows: Record<string, unknown>[],
  columns: string[],
  isSingleAggregate: boolean,
): string {
  const count = rows.length;
  if (count === 0) return "No transactions match your criteria. Try different filters.";

  const amountCols = columns.filter((c) =>
    /\b(amount|debit|credit|total|balance|value|sum|net)\b/i.test(c)
  );

  if (isSingleAggregate && count === 1 && amountCols.length > 0) {
    const val = Number(rows[0][amountCols[0]] ?? 0);
    return `Total: ${formatINR(val)}`;
  }

  if (amountCols.length > 0) {
    const col = amountCols[0];
    const sum = rows.reduce((acc, r) => acc + Number(r[col] ?? 0), 0);
    return `${count} transaction${count !== 1 ? "s" : ""} · ${formatINR(sum)} total`;
  }

  return `${count} result${count !== 1 ? "s" : ""}`;
}

// ─── Table name abstraction ───────────────────────────────────────────────────

function abstractTableName(sql: string | null | undefined, tableName: string | null): string | null {
  if (!sql || !tableName) return sql ?? null;
  return sql.replace(new RegExp(`"${tableName}"`, "g"), GL_TABLE_TOKEN);
}

// ─── Request schema ───────────────────────────────────────────────────────────

const conversationTurnSchema = z.object({
  role:      z.enum(["user", "assistant"]),
  question:  z.string().max(500),
  sql:       z.string().max(2000).optional(),
  rowCount:  z.number().int().optional(),
  columns:   z.array(z.string()).max(50).optional(),
});

const requestSchema = z.object({
  question: z.string().min(1).max(500),
  history:  z.array(conversationTurnSchema).max(3).optional().default([]),
});

// ─── POST /api/v1/connections/[connectionId]/chat ─────────────────────────────

export async function POST(req: NextRequest, { params }: Ctx) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { connectionId } = params;

  // ── Rate limit: 20 chat queries / hour per user ───────────────────────────
  const rateCheck = checkRateLimit(`chat:${user.id}`, 20, 60 * 60 * 1000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Up to 20 queries per hour. Resets at ${rateCheck.resetAt.toISOString()}.` },
      { status: 429 }
    );
  }

  // ── Plan / trial enforcement ──────────────────────────────────────────────
  const access = await checkPlanAccess(user.orgId, "query");
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.message, reason: access.reason },
      { status: 402 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { question, history } = parsed.data;

  // ── Load connection + org ─────────────────────────────────────────────────
  const [connection, org] = await Promise.all([
    prisma.erpConnection.findFirst({
      where:   { id: connectionId, orgId: user.orgId },
      include: { uploadedFile: true },
    }),
    prisma.organisation.findUnique({
      where:   { id: user.orgId },
      include: { tokenisationConfig: true },
    }),
  ]);

  if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  if (connection.status !== "ACTIVE") {
    return NextResponse.json({ error: "Connection is not active" }, { status: 422 });
  }
  if (!connection.schemaCacheJson) {
    return NextResponse.json({ error: "No schema cached — please refresh the connection" }, { status: 422 });
  }
  if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });

  // ── Guard: chat only supported on GL documents ────────────────────────────
  const documentType = connection.uploadedFile?.documentType ?? "GL";
  if (documentType !== "GL") {
    return NextResponse.json(
      { error: `AI chat is not yet available for ${documentType} documents — coming in v2.` },
      { status: 422 }
    );
  }

  // ── Query limit check ─────────────────────────────────────────────────────
  if (org.queriesUsed >= org.queryLimit) {
    return NextResponse.json(
      { error: `Query limit reached (${org.queryLimit}/period). Upgrade to continue.` },
      { status: 429 }
    );
  }

  // ── Parse schema ──────────────────────────────────────────────────────────
  let schema: ERPSchema;
  try {
    const raw    = JSON.parse(connection.schemaCacheJson) as Record<string, unknown>;
    const rawMeta = (raw.metadata ?? {}) as Record<string, unknown>;
    schema = {
      erpType:       (raw.erpType as string)    ?? connection.erpType,
      tables:        (raw.tables  as ERPSchema["tables"]) ?? [],
      relationships: (raw.relationships as ERPSchema["relationships"]) ?? [],
      accountTypeMap: (raw.accountTypeMap as ERPSchema["accountTypeMap"]) ?? {},
      dimensions:    (raw.dimensions as string[]) ?? [],
      currency: (raw.currency as ERPSchema["currency"]) ?? {
        baseCurrency: (rawMeta.currency as string) ?? "INR",
        isMultiCurrency: false, amountColumns: [], locale: "en-IN",
      },
      metadata:      rawMeta,
      introspectedAt: raw.introspectedAt ? new Date(raw.introspectedAt as string) : new Date(),
    };
  } catch {
    return NextResponse.json({ error: "Failed to parse cached schema" }, { status: 500 });
  }

  const dictionary: EntityDictionary | undefined = connection.entityDictionaryJson
    ? (JSON.parse(connection.entityDictionaryJson) as EntityDictionary)
    : undefined;

  const tableName = connection.uploadedFile?.tableName ?? null;

  // ── Build date context (fetch GL date range) ──────────────────────────────
  let glMinDate: string | null = null;
  let glMaxDate: string | null = null;
  if (tableName) {
    try {
      const dateRows = await prisma.$queryRawUnsafe<{ min_d: Date | null; max_d: Date | null }[]>(
        `SELECT MIN(transaction_date) AS min_d, MAX(transaction_date) AS max_d FROM "${tableName}"`
      );
      glMinDate = dateRows[0]?.min_d ? new Date(dateRows[0].min_d).toISOString().slice(0, 10) : null;
      glMaxDate = dateRows[0]?.max_d ? new Date(dateRows[0].max_d).toISOString().slice(0, 10) : null;
    } catch { /* table may not have transaction_date — ignore */ }
  }
  const dateContext = buildDateContext(glMinDate, glMaxDate);

  // ── Build tokenisation config ─────────────────────────────────────────────
  const dbConfig = org.tokenisationConfig;
  const tokenisationConfig: Partial<TokenisationConfig> = dbConfig ? {
    tokeniseVendors:   dbConfig.tokeniseVendors,
    tokeniseCustomers: dbConfig.tokeniseCustomers,
    tokeniseEmployees: dbConfig.tokeniseEmployees,
    tokeniseAmounts:   dbConfig.tokeniseAmounts,
    tokeniseAccounts:  dbConfig.tokeniseAccounts,
    tokeniseProjects:  dbConfig.tokeniseProjects,
    sensitivityLevel:  dbConfig.sensitivityLevel as TokenisationConfig["sensitivityLevel"],
    accountPattern:    dbConfig.accountPattern ?? undefined,
    customEntities:    dbConfig.customEntities,
    customStripList:   dbConfig.customStripList,
    documentType:      "GL",
  } : { documentType: "GL" };

  // ── Tokenisation audit ────────────────────────────────────────────────────
  const tokenPreview = previewTokenisation(question, tokenisationConfig, dictionary);
  const auditLog = tokenPreview.tokens.map((t) => ({
    original: t.original, token: t.token, category: t.category as string,
  }));

  // ── Detect follow-up + build conversation context ─────────────────────────
  const followUp = isFollowUp(question, history.length);
  const conversationContext: ConversationTurn[] = followUp ? history.slice(-3) : [];

  // ── Build FILE_UPLOAD connector ───────────────────────────────────────────
  let connector: ERPConnector | undefined;
  if (tableName) {
    connector = {
      erpType:          "FILE_UPLOAD",
      testConnection:   () => Promise.resolve({ success: true, message: "ok" }),
      introspectSchema: () => Promise.reject(new Error("not supported")),
      executeQuery:     (sql: string) => executeUploadQuery(tableName, sql),
      getEntityLists:   () => Promise.resolve({ vendors: [], customers: [], employees: [] }),
    };
  }

  // ── OrgLLMConfig ─────────────────────────────────────────────────────────
  const orgConfig = { llmProvider: org.llmProvider as string | null, llmModel: org.llmModel, llmApiKey: org.llmApiKey };

  // ── Run query pipeline ────────────────────────────────────────────────────
  const ragStore = new ChatRagStore(user.orgId, connectionId, tableName);

  let result: Awaited<ReturnType<typeof executeQuery>>;
  try {
    result = await executeQuery({
      question,
      schema,
      erpType:            connection.erpType,
      sqlDialect:         "postgresql",
      orgConfig,
      connector,
      executeQuery:       true,
      dictionary,
      tokenisationConfig,
      ragStore,
      dateContext,
      conversationContext,
    });
  } catch (err) {
    await prisma.queryLog.create({
      data: {
        orgId: user.orgId, connectionId, question,
        tokenisedQuestion: tokenPreview.tokenised,
        status: "FAILED", errorMessage: (err as Error).message,
        tokenisationAuditJson: JSON.stringify(auditLog),
      },
    });
    return NextResponse.json({ error: "Query pipeline failed", detail: (err as Error).message }, { status: 500 });
  }

  // ── Map verdict to status ─────────────────────────────────────────────────
  const status = result.verdict === "needs_clarification" ? "LOW_CONFIDENCE" : "COMPLETED";

  // ── Server-side answer sentence (hallucination protection) ────────────────
  const rows    = (result.queryResult?.rows ?? []) as Record<string, unknown>[];
  const columns = result.queryResult?.columns ?? [];
  const isSingleAggregate = rows.length === 1 && columns.length === 1;
  const answerSentence = buildAnswerSentence(rows, columns, isSingleAggregate);

  // ── Source label for UI badge ─────────────────────────────────────────────
  const source: "template" | "rag" | "llm" = result.layer;

  // ── Persist QueryLog (with table name abstraction) ────────────────────────
  const storedSql = abstractTableName(result.sql || result.rawSql || null, tableName);
  const [queryLog] = await Promise.all([
    prisma.queryLog.create({
      data: {
        orgId: user.orgId, connectionId, question,
        tokenisedQuestion: tokenPreview.tokenised,
        generatedSql:      storedSql,
        confidence:        result.confidence.final,
        verdict:           result.verdict,
        llmProvider:       result.provider,
        llmModel:          result.model,
        estimatedCostUsd:  result.cost,
        executionTimeMs:   result.executionTimeMs,
        fromTemplate:      result.templateId ?? null,
        status,
        rowCount:          result.queryResult?.rowCount ?? null,
        tokenisationAuditJson: JSON.stringify(auditLog),
      },
    }),
    prisma.organisation.update({
      where: { id: user.orgId },
      data:  { queriesUsed: { increment: 1 } },
    }),
  ]);

  return NextResponse.json({
    queryLogId:           queryLog.id,
    answer:               answerSentence,
    rows,
    columns,
    rowCount:             result.queryResult?.rowCount ?? rows.length,
    sql:                  result.sql,
    source,
    confidence:           result.confidence.final,
    verdict:              result.verdict,
    assumptions:          result.assumptions,
    clarificationsNeeded: result.clarificationsNeeded,
    warnings:             result.warnings,
    executionTimeMs:      result.executionTimeMs,
    followUp,
    dateContext: {
      today:               dateContext.today,
      currentFY:           dateContext.currentFY,
      currentQuarter:      dateContext.currentQuarter,
    },
    ragExamples: result.ragExamples?.map((e) => ({ question: e.question, similarity: e.similarity })),
    auditLog,
  });
}
