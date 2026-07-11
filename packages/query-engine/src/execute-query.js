import { detokenise } from "@aiql/tokeniser";
import { buildPrompt } from "./prompt-builder";
import { routeQuery } from "./llm-router";
import { validateSql } from "./sql-validator";
import { calculateConfidence, BUILT_IN_TEMPLATES } from "./confidence-scorer";
import { matchTemplate } from "./template-matcher";
import { checkGuardrails } from "./guardrails";
// ─── Thresholds ───────────────────────────────────────────────────────────────
const RAG_CONFIDENCE_THRESHOLD = parseFloat(process.env.AIQL_RAG_CONFIDENCE_THRESHOLD ?? "0.75");
// ─── Layer 1: Template engine ─────────────────────────────────────────────────
function tryTemplate(question, schema, templates, t0, run, connector) {
    const match = matchTemplate(question, schema);
    if (!match)
        return null;
    const syntheticLlm = {
        sql: match.sql,
        confidence: match.confidence,
        explanation: `Matched built-in template: ${match.templateId}`,
        assumptions: [],
        clarificationsNeeded: [],
        tokensIn: 0,
        tokensOut: 0,
    };
    const confidence = calculateConfidence(syntheticLlm, schema, question, templates);
    return (async () => {
        const queryResult = run && connector
            ? await connector.executeQuery(match.sql)
            : undefined;
        return {
            sql: match.sql,
            rawSql: match.sql,
            confidence,
            explanation: syntheticLlm.explanation,
            assumptions: [],
            clarificationsNeeded: [],
            warnings: [],
            verdict: confidence.verdict,
            provider: "template",
            model: "template",
            cost: 0,
            retried: false,
            templateId: match.templateId,
            layer: "template",
            queryResult,
            executionTimeMs: Date.now() - t0,
        };
    })();
}
// ─── Layer 2: RAG retrieval ───────────────────────────────────────────────────
async function fetchRagExamples(question, ragStore) {
    try {
        const entries = await ragStore.findSimilar(question, 5);
        return entries.filter((e) => e.similarity >= RAG_CONFIDENCE_THRESHOLD);
    }
    catch {
        // RAG failure must never break the pipeline — fall through to LLM
        return [];
    }
}
// ─── Layer 3: LLM ────────────────────────────────────────────────────────────
async function runLlm(question, schema, erpType, sqlDialect, orgConfig, dictionary, tokenisationConfig, templates, ragExamples, run, connector, ragStore, t0, dateContext, conversationContext) {
    // Build prompt — inject RAG few-shot examples, date context, conversation context
    const { systemPrompt, userPrompt, tokenMap } = buildPrompt({
        schema,
        rawQuestion: question,
        erpType,
        sqlDialect: sqlDialect,
        config: tokenisationConfig,
        dictionary,
        fewShotExamples: ragExamples.map((e) => ({ question: e.question, sql: e.sql })),
        dateContext,
        conversationContext,
    });
    // Route to LLM (Groq→Claude fallback handled inside routeQuery)
    const routerResult = await routeQuery(systemPrompt, userPrompt, orgConfig);
    const llmResponse = routerResult.response;
    // Validate SQL
    const validation = validateSql(llmResponse.sql);
    const warnings = [...validation.warnings];
    // Score confidence
    const confidence = calculateConfidence(llmResponse, schema, question, templates);
    // Low confidence or invalid SQL → return clarification
    if (!validation.isValid || confidence.verdict === "needs_clarification") {
        return {
            sql: "",
            rawSql: llmResponse.sql,
            confidence,
            explanation: llmResponse.explanation,
            assumptions: llmResponse.assumptions,
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
            warnings: [...warnings, ...validation.errors],
            verdict: "needs_clarification",
            provider: routerResult.provider,
            model: routerResult.model,
            cost: routerResult.cost,
            retried: routerResult.retried,
            layer: "llm",
            ragExamples: ragExamples.length > 0 ? ragExamples : undefined,
            executionTimeMs: Date.now() - t0,
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
        ragStore.store(question, detokenisedSql, confidence.final).catch(() => { });
    }
    return {
        sql: detokenisedSql,
        rawSql: llmResponse.sql,
        confidence,
        explanation: llmResponse.explanation,
        assumptions: llmResponse.assumptions,
        clarificationsNeeded: llmResponse.clarificationsNeeded,
        warnings,
        verdict: confidence.verdict,
        provider: routerResult.provider,
        model: routerResult.model,
        cost: routerResult.cost,
        retried: routerResult.retried,
        layer: "llm",
        ragExamples: ragExamples.length > 0 ? ragExamples : undefined,
        queryResult,
        executionTimeMs: Date.now() - t0,
    };
}
// ─── Orchestrator ─────────────────────────────────────────────────────────────
export async function executeQuery(request) {
    const t0 = Date.now();
    const { question, schema, erpType, sqlDialect = "postgresql", orgConfig = { llmProvider: null, llmModel: null, llmApiKey: null }, connector, executeQuery: run = false, dictionary, tokenisationConfig = {}, templates = BUILT_IN_TEMPLATES, ragStore, dateContext, conversationContext, } = request;
    // ── Layer 0: Guardrails — injection + relevance check ────────────────────
    const guard = await checkGuardrails(question);
    if (!guard.pass) {
        const zeroConf = calculateConfidence({ sql: "", confidence: 0, explanation: "", assumptions: [],
            clarificationsNeeded: [], tokensIn: 0, tokensOut: 0 }, schema, question, templates);
        return {
            sql: "",
            rawSql: "",
            confidence: { ...zeroConf, verdict: "needs_clarification" },
            explanation: guard.message,
            assumptions: [],
            clarificationsNeeded: [guard.message],
            warnings: [],
            verdict: "needs_clarification",
            provider: "guardrails",
            model: "guardrails",
            cost: 0,
            retried: false,
            layer: "template",
            executionTimeMs: Date.now() - t0,
        };
    }
    // ── Layer 1: Template engine ──────────────────────────────────────────────
    const templateResponse = tryTemplate(question, schema, templates, t0, run, connector);
    if (templateResponse)
        return templateResponse;
    // ── Layer 2: RAG — fetch similar past queries as few-shot context ─────────
    const ragExamples = ragStore
        ? await fetchRagExamples(question, ragStore)
        : [];
    // ── Layer 3: LLM (with RAG + date + conversation context injected into prompt) ─
    return runLlm(question, schema, erpType, sqlDialect, orgConfig, dictionary, tokenisationConfig, templates, ragExamples, run, connector, ragStore, t0, dateContext, conversationContext);
}
