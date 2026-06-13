import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { executeQuery } from "@aiql/query-engine";
import type { RagStore, RagEntry } from "@aiql/query-engine";
import { previewTokenisation } from "@aiql/tokeniser";
import { executeUploadQuery } from "@aiql/erp-connectors";
import type { ERPSchema } from "@aiql/schema-intel";
import type { EntityDictionary, TokenisationConfig } from "@aiql/tokeniser";
import type { ERPConnector } from "@aiql/erp-connectors";
import { textSimilarity } from "@aiql/query-engine/src/rag/text-similarity";
import { checkRateLimit } from "@/lib/rate-limit";

// ─── RAG store — Prisma implementation ───────────────────────────────────────

const RAG_QUALITY_GATE = 0.7;   // minimum confidence for RAG eligibility
const RAG_TTL_DAYS     = 180;   // 6-month sliding window

// SQL table name is abstracted as this token before storing so past queries
// are reusable by other connections that share the same org's question patterns.
const GL_TABLE_TOKEN = '"{{GL_TABLE}}"';

class PrismaRagStore implements RagStore {
  constructor(
    private readonly orgId:        string,
    private readonly connectionId: string,
    private readonly tableName:    string | null,
  ) {}

  private restoreSql(abstractSql: string): string {
    if (!this.tableName) return abstractSql;
    return abstractSql.replace(GL_TABLE_TOKEN, `"${this.tableName}"`);
  }

  private async fetchScored(question: string, extraWhere: object): Promise<RagEntry[]> {
    const ttlCutoff = new Date(Date.now() - RAG_TTL_DAYS * 24 * 60 * 60 * 1000);

    const logs = await prisma.queryLog.findMany({
      where: {
        orgId:        this.orgId,
        status:       "COMPLETED",
        generatedSql: { not: null },
        confidence:   { gte: RAG_QUALITY_GATE },
        createdAt:    { gte: ttlCutoff },
        AND: [
          // Exclude zero-row results (likely wrong query) but allow null (template/unexecuted)
          { OR: [{ rowCount: null }, { rowCount: { gt: 0 } }] },
          // Include unrated (null) and thumbs-up; exclude thumbs-down
          { OR: [{ feedback: null }, { feedback: { not: "thumbs_down" } }] },
        ],
        ...extraWhere,
      },
      select:  { question: true, generatedSql: true, confidence: true },
      orderBy: { createdAt: "desc" },
      take:    200,
    });

    return logs
      .map((log) => ({
        question:   log.question,
        sql:        this.restoreSql(log.generatedSql!),
        confidence: log.confidence ?? 0,
        similarity: textSimilarity(question, log.question),
      }))
      .filter((e) => e.similarity > 0.3)
      .sort((a, b) => b.similarity - a.similarity);
  }

  async findSimilar(question: string, limit = 5): Promise<RagEntry[]> {
    // Pass 1: same-connection (SQL table name always matches after restore)
    const pass1 = await this.fetchScored(question, { connectionId: this.connectionId });
    if (pass1.length >= 3) return pass1.slice(0, limit);

    // Pass 2: rest of org — table name abstraction makes these portable
    const pass2 = await this.fetchScored(question, {
      connectionId: { not: this.connectionId },
    });

    return [...pass1, ...pass2].slice(0, limit);
  }

  async store(_question: string, _sql: string, _confidence: number): Promise<void> {
    // No-op: route handler persists QueryLog directly after every query.
  }
}

// Replace actual GL table name with the portable {{GL_TABLE}} token before storing.
function abstractTableName(sql: string | null | undefined, tableName: string | null): string | null {
  if (!sql || !tableName) return sql ?? null;
  return sql.replace(new RegExp(`"${tableName}"`, "g"), GL_TABLE_TOKEN);
}

// ─── Request schema ───────────────────────────────────────────────────────────

const requestSchema = z.object({
  question:     z.string().min(1).max(2000),
  connectionId: z.string().min(1),
  options: z
    .object({
      executeQuery: z.boolean().optional(),
      sqlDialect:   z.enum(["postgresql", "mysql", "sqlite"]).optional(),
    })
    .optional(),
});

// ─── POST /api/v1/query ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { question, connectionId, options } = parsed.data;
  const shouldExecute = options?.executeQuery ?? false;

  // ── Load connection + org in parallel ─────────────────────────────────────
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

  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }
  if (connection.status !== "ACTIVE") {
    return NextResponse.json({ error: "Connection is not active — please check your connection settings" }, { status: 422 });
  }
  if (!connection.schemaCacheJson) {
    return NextResponse.json({ error: "No schema cached for this connection — please refresh the connection first" }, { status: 422 });
  }
  if (!org) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  // ── Query limit check ─────────────────────────────────────────────────────
  if (org.queriesUsed >= org.queryLimit) {
    return NextResponse.json(
      { error: `Query limit reached (${org.queryLimit} queries/period). Upgrade your plan to continue.` },
      { status: 429 }
    );
  }

  // ── Per-user rate limit: 20 queries / hour ────────────────────────────────
  const rateCheck = checkRateLimit(`query:${user.id}`, 20, 60 * 60 * 1000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. You can run up to 20 queries per hour. Resets at ${rateCheck.resetAt.toISOString()}.` },
      { status: 429 }
    );
  }

  // ── Parse cached schema ───────────────────────────────────────────────────
  // schemaCacheJson may be a full ERPSchema (from schema-intel introspection)
  // or a RawSchemaData (from file upload via buildUploadSchema). Normalise both.
  let schema: ERPSchema;
  try {
    const raw = JSON.parse(connection.schemaCacheJson) as Record<string, unknown>;
    const rawMeta = (raw.metadata ?? {}) as Record<string, unknown>;

    schema = {
      erpType:        (raw.erpType as string)    ?? connection.erpType,
      tables:         (raw.tables  as ERPSchema["tables"]) ?? [],
      relationships:  (raw.relationships as ERPSchema["relationships"]) ?? [],
      // RawSchemaData has no accountTypeMap / dimensions / currency — supply safe defaults
      accountTypeMap: (raw.accountTypeMap as ERPSchema["accountTypeMap"]) ?? {},
      dimensions:     (raw.dimensions    as string[]) ?? [],
      currency: (raw.currency as ERPSchema["currency"]) ?? {
        baseCurrency:    (rawMeta.currency as string) ?? "INR",
        isMultiCurrency: false,
        amountColumns:   [],
        locale:          "en-IN",
      },
      metadata:       rawMeta,
      introspectedAt: raw.introspectedAt
        ? new Date(raw.introspectedAt as string)
        : new Date(),
    };
  } catch {
    return NextResponse.json({ error: "Failed to parse cached schema" }, { status: 500 });
  }

  // ── Parse entity dictionary ───────────────────────────────────────────────
  const dictionary: EntityDictionary | undefined = connection.entityDictionaryJson
    ? (JSON.parse(connection.entityDictionaryJson) as EntityDictionary)
    : undefined;

  // ── Build tokenisation config ─────────────────────────────────────────────
  const dbConfig = org.tokenisationConfig;
  const tokenisationConfig: Partial<TokenisationConfig> = dbConfig
    ? {
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
      }
    : {};

  // ── Preview tokenisation for audit log ────────────────────────────────────
  const tokenPreview = previewTokenisation(question, tokenisationConfig, dictionary);
  const auditLog = tokenPreview.tokens.map((t) => ({
    original: t.original,
    token:    t.token,
    category: t.category as string,
  }));

  // ── Build FILE_UPLOAD connector if execution requested ────────────────────
  const tableName = connection.uploadedFile?.tableName ?? null;
  let connector: ERPConnector | undefined;
  if (shouldExecute && connection.erpType === "FILE_UPLOAD" && tableName) {
    connector = {
      erpType:          "FILE_UPLOAD",
      testConnection:   () => Promise.resolve({ success: true, message: "ok" }),
      introspectSchema: () => Promise.reject(new Error("not supported")),
      executeQuery:     (sql: string) => executeUploadQuery(tableName, sql),
      getEntityLists:   () => Promise.resolve({ vendors: [], customers: [], employees: [] }),
    };
  }

  // ── Build OrgLLMConfig ────────────────────────────────────────────────────
  const orgConfig = {
    llmProvider: org.llmProvider as string | null,
    llmModel:    org.llmModel,
    llmApiKey:   org.llmApiKey,
  };

  // ── Run query pipeline ────────────────────────────────────────────────────
  const ragStore = new PrismaRagStore(user.orgId, connectionId, tableName);

  let result: Awaited<ReturnType<typeof executeQuery>>;
  try {
    result = await executeQuery({
      question,
      schema,
      erpType:           connection.erpType,
      sqlDialect:        options?.sqlDialect ?? "postgresql",
      orgConfig,
      connector,
      executeQuery:      shouldExecute,
      dictionary,
      tokenisationConfig,
      ragStore,
    });
  } catch (err) {
    await prisma.queryLog.create({
      data: {
        orgId:                user.orgId,
        connectionId,
        question,
        tokenisedQuestion:    tokenPreview.tokenised,
        status:               "FAILED",
        errorMessage:         (err as Error).message,
        tokenisationAuditJson: JSON.stringify(auditLog),
      },
    });
    return NextResponse.json(
      { error: "Query pipeline failed", detail: (err as Error).message },
      { status: 500 }
    );
  }

  // ── Map verdict to QueryStatus ────────────────────────────────────────────
  const status =
    result.verdict === "needs_clarification" ? "LOW_CONFIDENCE" :
    result.verdict === "execute" || result.verdict === "execute_with_warning" ? "COMPLETED" :
    "COMPLETED";

  // ── Persist QueryLog + increment queriesUsed in parallel ─────────────────
  // Abstract the GL table name so stored SQL is portable across connections
  const storedSql = abstractTableName(result.sql || result.rawSql || null, tableName);

  const [queryLog] = await Promise.all([
    prisma.queryLog.create({
      data: {
        orgId:                user.orgId,
        connectionId,
        question,
        tokenisedQuestion:    tokenPreview.tokenised,
        generatedSql:         storedSql,
        confidence:           result.confidence.final,
        verdict:              result.verdict,
        llmProvider:          result.provider,
        llmModel:             result.model,
        estimatedCostUsd:     result.cost,
        executionTimeMs:      result.executionTimeMs,
        fromTemplate:         result.templateId ?? null,
        status,
        rowCount:             result.queryResult?.rowCount ?? null,
        tokenisationAuditJson: JSON.stringify(auditLog),
      },
    }),
    prisma.organisation.update({
      where: { id: user.orgId },
      data:  { queriesUsed: { increment: 1 } },
    }),
  ]);

  return NextResponse.json({
    queryLogId:        queryLog.id,
    sql:               result.sql,
    rawSql:            result.rawSql,
    confidence:        result.confidence,
    explanation:       result.explanation,
    assumptions:       result.assumptions,
    clarificationsNeeded: result.clarificationsNeeded,
    warnings:          result.warnings,
    verdict:           result.verdict,
    provider:          result.provider,
    model:             result.model,
    cost:              result.cost,
    retried:           result.retried,
    templateId:        result.templateId,
    queryResult:       result.queryResult,
    executionTimeMs:   result.executionTimeMs,
    auditLog,
    tokenisedQuestion: tokenPreview.tokenised,
    layer:             result.layer,
    ragExamples:       result.ragExamples,
  });
}
