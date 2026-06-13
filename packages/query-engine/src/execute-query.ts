import type { ERPSchema } from "@aiql/schema-intel";
import type { EntityDictionary, TokenisationConfig } from "@aiql/tokeniser";
import { detokenise } from "@aiql/tokeniser";
import type { ERPConnector, QueryResult } from "@aiql/erp-connectors";
import { buildPrompt } from "./prompt-builder";
import { routeQuery } from "./llm-router";
import { validateSql } from "./sql-validator";
import { calculateConfidence, BUILT_IN_TEMPLATES } from "./confidence-scorer";
import { matchTemplate } from "./template-matcher";
import { checkGuardrails } from "./guardrails";
import type { OrgLLMConfig, LLMResponse } from "./llm-providers/types";
import type { ConfidenceBreakdown, Verdict, QueryTemplate } from "./confidence-scorer";
import type { RagStore, RagEntry } from "./rag/types";

export type { RagStore, RagEntry } from "./rag/types";

// ─── Chat context types ───────────────────────────────────────────────────────

/** Date and fiscal year facts injected into every chat prompt. */
export interface DateContext {
  today:               string;  // ISO "YYYY-MM-DD"
  currentFY:           string;  // e.g. "FY26"
  currentFYStart:      string;  // e.g. "2025-04-01"
  currentFYEnd:        string;  // e.g. "2026-03-31"
  currentQuarter:      string;  // e.g. "Q1 FY26"
  currentQuarterStart: string;  // e.g. "2025-04-01"
  currentQuarterEnd:   string;  // e.g. "2025-06-30"
  glPeriodStart:       string | null;
  glPeriodEnd:         string | null;
}

/** A past Q/A turn passed for follow-up context (last 3 turns max). */
export interface ConversationTurn {
  role:      "user" | "assistant";
  question:  string;
  sql?:      string;
  rowCount?: number;
  columns?:  string[];
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

const RAG_CONFIDENCE_THRESHOLD = parseFloat(
  process.env.AIQL_RAG_CONFIDENCE_THRESHOLD ?? "0.75"
);

// ─── Public types ─────────────────────────────────────────────────────────────

export interface QueryRequest {
  question:           string;
  schema:             ERPSchema;
  erpType:            string;
  sqlDialect?:        "postgresql" | "mysql" | "sqlite";
  orgConfig?:         OrgLLMConfig;
  /** ERP connector — required only when executeQuery=true */
  connector?:         ERPConnector;
  executeQuery?:      boolean;
  dictionary?:        EntityDictionary;
  tokenisationConfig?: Partial<TokenisationConfig>;
  templates?:         QueryTemplate[];
  /**
   * RAG store — injected by the caller (web app provides Prisma implementation).
   * When provided, Layer 2 fires before the LLM.
   */
  ragStore?:           RagStore;
  /** Date + fiscal year facts for resolving "this month", "Q1", "FY25" etc. */
  dateContext?:        DateContext;
  /** Last ≤3 turns of conversation for follow-up question handling. */
  conversationContext?: ConversationTurn[];
}

export interface QueryResponse {
  /** Detokenised SQL ready to execute. Empty string when verdict=needs_clarification */
  sql:                  string;
  /** Tokenised SQL as returned by the LLM */
  rawSql:               string;
  confidence:           ConfidenceBreakdown;
  explanation:          string;
  assumptions:          string[];
  clarificationsNeeded: string[];
  warnings:             string[];
  verdict:              Verdict;
  provider:             string;
  model:                string;
  cost:                 number;
  retried:              boolean;
  templateId?:          string;
  /** Which layer answered the query: "template" | "rag" | "llm" */
  layer:                "template" | "rag" | "llm";
  /** RAG entries that were used as few-shot context (if any) */
  ragExamples?:         RagEntry[];
  queryResult?:         QueryResult;
  executionTimeMs:      number;
}

// ─── Layer 1: Template engine ─────────────────────────────────────────────────

function tryTemplate(
  question:  string,
  schema:    ERPSchema,
  templates: QueryTemplate[],
  t0:        number,
  run:       boolean,
  connector: ERPConnector | undefined
): Promise<QueryResponse> | null {
  const match = matchTemplate(question, schema);
  if (!match) return null;

  const syntheticLlm: LLMResponse = {
    sql:                  match.sql,
    confidence:           match.confidence,
    explanation:          `Matched built-in template: ${match.templateId}`,
    assumptions:          [],
    clarificationsNeeded: [],
    tokensIn:             0,
    tokensOut:            0,
  };

  const confidence = calculateConfidence(syntheticLlm, schema, question, templates);

  return (async () => {
    const queryResult = run && connector
      ? await connector.executeQuery(match.sql)
      : undefined;

    return {
      sql:                  match.sql,
      rawSql:               match.sql,
      confidence,
      explanation:          syntheticLlm.explanation,
      assumptions:          [],
      clarificationsNeeded: [],
      warnings:             [],
      verdict:              confidence.verdict,
      provider:             "template",
      model:                "template",
      cost:                 0,
      retried:              false,
      templateId:           match.templateId,
      layer:                "template" as const,
      queryResult,
      executionTimeMs:      Date.now() - t0,
    };
  })();
}

// ─── Layer 2: RAG retrieval ───────────────────────────────────────────────────

async function fetchRagExamples(
  question: string,
  ragStore: RagStore
): Promise<RagEntry[]> {
  try {
    const entries = await ragStore.findSimilar(question, 5);
    return entries.filter((e) => e.similarity >= RAG_CONFIDENCE_THRESHOLD);
  } catch {
    // RAG failure must never break the pipeline — fall through to LLM
    return [];
  }
}

// ─── Layer 3: LLM ────────────────────────────────────────────────────────────

async function runLlm(
  question:            string,
  schema:              ERPSchema,
  erpType:             string,
  sqlDialect:          string,
  orgConfig:           OrgLLMConfig,
  dictionary:          EntityDictionary | undefined,
  tokenisationConfig:  Partial<TokenisationConfig>,
  templates:           QueryTemplate[],
  ragExamples:         RagEntry[],
  run:                 boolean,
  connector:           ERPConnector | undefined,
  ragStore:            RagStore | undefined,
  t0:                  number,
  dateContext?:        DateContext,
  conversationContext?: ConversationTurn[],
): Promise<QueryResponse> {

  // Build prompt — inject RAG few-shot examples, date context, conversation context
  const { systemPrompt, userPrompt, tokenMap } = buildPrompt({
    schema,
    rawQuestion:    question,
    erpType,
    sqlDialect:     sqlDialect as "postgresql" | "mysql" | "sqlite",
    config:         tokenisationConfig,
    dictionary,
    fewShotExamples:    ragExamples.map((e) => ({ question: e.question, sql: e.sql })),
    dateContext,
    conversationContext,
  });

  // Route to LLM (Groq→Claude fallback handled inside routeQuery)
  const routerResult = await routeQuery(systemPrompt, userPrompt, orgConfig);
  const llmResponse  = routerResult.response;

  // Validate SQL
  const validation = validateSql(llmResponse.sql);
  const warnings   = [...validation.warnings];

  // Score confidence
  const confidence = calculateConfidence(llmResponse, schema, question, templates);

  // Low confidence or invalid SQL → return clarification
  if (!validation.isValid || confidence.verdict === "needs_clarification") {
    return {
      sql:                  "",
      rawSql:               llmResponse.sql,
      confidence,
      explanation:          llmResponse.explanation,
      assumptions:          llmResponse.assumptions,
      clarificationsNeeded: [
        ...llmResponse.clarificationsNeeded,
        ...(!validation.isValid
          ? [`SQL validation failed: ${validation.errors.join("; ")}`]
          : []),
      ].filter(Boolean).length > 0
        ? [
            ...llmResponse.clarificationsNeeded,
            ...(!validation.isValid ? [`SQL validation failed: ${validation.errors.join("; ")}`] : []),
          ]
        : ["Please rephrase your query with more specific details."],
      warnings:             [...warnings, ...validation.errors],
      verdict:              "needs_clarification",
      provider:             routerResult.provider,
      model:                routerResult.model,
      cost:                 routerResult.cost,
      retried:              routerResult.retried,
      layer:                "llm",
      ragExamples:          ragExamples.length > 0 ? ragExamples : undefined,
      executionTimeMs:      Date.now() - t0,
    };
  }

  // Detokenise
  const detokenisedSql = detokenise(validation.sanitisedSql, tokenMap);

  // Execute if requested
  const queryResult = run && connector
    ? await connector.executeQuery(detokenisedSql)
    : undefined;

  // Store in RAG so next similar question skips the LLM (early return above guards needs_clarification)
  if (ragStore) {
    ragStore.store(question, detokenisedSql, confidence.final).catch(() => {});
  }

  return {
    sql:                  detokenisedSql,
    rawSql:               llmResponse.sql,
    confidence,
    explanation:          llmResponse.explanation,
    assumptions:          llmResponse.assumptions,
    clarificationsNeeded: llmResponse.clarificationsNeeded,
    warnings,
    verdict:              confidence.verdict,
    provider:             routerResult.provider,
    model:                routerResult.model,
    cost:                 routerResult.cost,
    retried:              routerResult.retried,
    layer:                "llm",
    ragExamples:          ragExamples.length > 0 ? ragExamples : undefined,
    queryResult,
    executionTimeMs:      Date.now() - t0,
  };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function executeQuery(request: QueryRequest): Promise<QueryResponse> {
  const t0 = Date.now();

  const {
    question,
    schema,
    erpType,
    sqlDialect           = "postgresql",
    orgConfig            = { llmProvider: null, llmModel: null, llmApiKey: null },
    connector,
    executeQuery: run    = false,
    dictionary,
    tokenisationConfig   = {},
    templates            = BUILT_IN_TEMPLATES,
    ragStore,
    dateContext,
    conversationContext,
  } = request;

  // ── Layer 0: Guardrails — injection + relevance check ────────────────────
  const guard = await checkGuardrails(question);
  if (!guard.pass) {
    const zeroConf = calculateConfidence(
      { sql: "", confidence: 0, explanation: "", assumptions: [],
        clarificationsNeeded: [], tokensIn: 0, tokensOut: 0 },
      schema, question, templates
    );
    return {
      sql:                  "",
      rawSql:               "",
      confidence:           { ...zeroConf, verdict: "needs_clarification" as const },
      explanation:          guard.message,
      assumptions:          [],
      clarificationsNeeded: [guard.message],
      warnings:             [],
      verdict:              "needs_clarification",
      provider:             "guardrails",
      model:                "guardrails",
      cost:                 0,
      retried:              false,
      layer:                "template" as const,
      executionTimeMs:      Date.now() - t0,
    };
  }

  // ── Layer 1: Template engine ──────────────────────────────────────────────
  const templateResponse = tryTemplate(question, schema, templates, t0, run, connector);
  if (templateResponse) return templateResponse;

  // ── Layer 2: RAG — fetch similar past queries as few-shot context ─────────
  const ragExamples = ragStore
    ? await fetchRagExamples(question, ragStore)
    : [];

  // ── Layer 3: LLM (with RAG + date + conversation context injected into prompt) ─
  return runLlm(
    question, schema, erpType, sqlDialect, orgConfig,
    dictionary, tokenisationConfig, templates,
    ragExamples, run, connector, ragStore, t0,
    dateContext, conversationContext,
  );
}
