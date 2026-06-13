import type { LLMProvider, RouterResult, OrgLLMConfig } from "./llm-providers/types";
import { GroqProvider }                              from "./llm-providers/groq";
import { ClaudeProvider }                            from "./llm-providers/claude";
import { OpenAIProvider, OPENAI_NANO_MODEL, OPENAI_MINI_MODEL } from "./llm-providers/openai";

// ─── Cost per million tokens (USD) ────────────────────────────────────────────

const COSTS: Record<string, { input: number; output: number }> = {
  // Groq
  "llama-3.3-70b-versatile":    { input: 0.59,  output: 0.79  },
  // OpenAI
  "gpt-4.1-nano":               { input: 0.10,  output: 0.40  },
  "gpt-4.1-mini":               { input: 0.40,  output: 1.60  },
  "gpt-4o-mini":                { input: 0.15,  output: 0.60  },
  "gpt-4o":                     { input: 5.00,  output: 15.00 },
  "gpt-4.1":                    { input: 2.00,  output: 8.00  },
  // Claude
  "claude-haiku-4-5-20251001":  { input: 0.80,  output: 4.00  },
  "claude-sonnet-4-6":          { input: 3.00,  output: 15.00 },
  "claude-opus-4-7":            { input: 15.00, output: 75.00 },
  // fallback
  default:                      { input: 1.00,  output: 3.00  },
};

function calcCost(model: string, tokensIn: number, tokensOut: number): number {
  const rates = COSTS[model] ?? COSTS.default;
  return (tokensIn * rates.input + tokensOut * rates.output) / 1_000_000;
}

// ─── Complexity assessment ────────────────────────────────────────────────────

const WINDOW_FN_RE = /\b(rank|row_number|dense_rank|lag|lead|first_value|last_value|over\s*\(|partition\s+by)\b/i;
const SUBQUERY_RE  = /\b(exists|not\s+exists)\b|\bwhere\b[^;]*\bselect\b|\bfrom\s*\(/i;
const JOIN_RE      = /\b(join)\b/gi;
const AGGREGATE_RE = /\b(group\s+by|having|sum|avg|count|min|max)\b/i;

export type Complexity = "simple" | "medium" | "complex";

export function assessComplexity(question: string): Complexity {
  let score = 0;
  if (WINDOW_FN_RE.test(question)) score += 4;
  if (SUBQUERY_RE.test(question))  score += 3;
  score += (question.match(JOIN_RE) ?? []).length;
  if (AGGREGATE_RE.test(question)) score += 1;

  if (score >= 4) return "complex";
  if (score >= 1) return "medium";
  return "simple";
}

// ─── Custom org provider ──────────────────────────────────────────────────────

function buildCustomProvider(config: OrgLLMConfig): LLMProvider | null {
  if (!config.llmProvider || config.llmProvider === "AIQL_MANAGED") return null;
  switch (config.llmProvider) {
    case "GROQ":
      return new GroqProvider(config.llmApiKey ?? undefined, config.llmModel ?? undefined);
    case "OPENAI":
      return new OpenAIProvider(config.llmApiKey ?? undefined, config.llmModel ?? undefined);
    default:
      return null;
  }
}

// ─── Key availability ─────────────────────────────────────────────────────────

function keys() {
  return {
    groq:   !!(process.env.GROQ_API_KEY),
    openai: !!(process.env.OPENAI_API_KEY),
    claude: !!(process.env.ANTHROPIC_API_KEY),
  };
}

// ─── Individual callers ───────────────────────────────────────────────────────

async function callGroq(systemPrompt: string, userPrompt: string, retried: boolean): Promise<RouterResult> {
  const model    = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
  const response = await new GroqProvider().generateSQL(systemPrompt, userPrompt);
  return {
    provider: "groq", model, response,
    tokensIn:  response.tokensIn,
    tokensOut: response.tokensOut,
    cost:      calcCost(model, response.tokensIn, response.tokensOut),
    retried,
  };
}

async function callOpenAI(
  systemPrompt: string,
  userPrompt:   string,
  model:        string,
  retried:      boolean
): Promise<RouterResult> {
  const response = await new OpenAIProvider(undefined, model).generateSQL(systemPrompt, userPrompt);
  return {
    provider: "openai", model, response,
    tokensIn:  response.tokensIn,
    tokensOut: response.tokensOut,
    cost:      calcCost(model, response.tokensIn, response.tokensOut),
    retried,
  };
}

async function callClaude(systemPrompt: string, userPrompt: string, retried: boolean): Promise<RouterResult> {
  const model    = process.env.CLAUDE_MODEL ?? "claude-haiku-4-5-20251001";
  const response = await new ClaudeProvider().generateSQL(systemPrompt, userPrompt);
  return {
    provider: "claude", model, response,
    tokensIn:  response.tokensIn,
    tokensOut: response.tokensOut,
    cost:      calcCost(model, response.tokensIn, response.tokensOut),
    retried,
  };
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

const CONFIDENCE_RETRY_THRESHOLD = parseFloat(
  process.env.AIQL_CONFIDENCE_RETRY_THRESHOLD ?? "0.75"
);

// ─── Router ───────────────────────────────────────────────────────────────────
//
// Cascade (cheapest → most capable):
//   Groq (free/cheap)  →  OpenAI nano ($0.10/1M)  →  OpenAI mini ($0.15/1M)  →  Claude (fallback)
//
// Each step fires only when:
//   - the previous provider errors/rate-limits, OR
//   - confidence < CONFIDENCE_RETRY_THRESHOLD
//
export async function routeQuery(
  systemPrompt: string,
  userPrompt:   string,
  orgConfig:    OrgLLMConfig = { llmProvider: null, llmModel: null, llmApiKey: null }
): Promise<RouterResult> {

  // 1. Org-level custom provider
  const customProvider = buildCustomProvider(orgConfig);
  if (customProvider) {
    const response = await customProvider.generateSQL(systemPrompt, userPrompt);
    const model    = orgConfig.llmModel ?? "custom";
    return {
      provider:  customProvider.name,
      model,
      response,
      tokensIn:  response.tokensIn,
      tokensOut: response.tokensOut,
      cost:      calcCost(model, response.tokensIn, response.tokensOut),
      retried:   false,
    };
  }

  const available   = keys();
  const complexity  = assessComplexity(userPrompt);

  if (!available.groq && !available.openai && !available.claude) {
    throw new Error(
      "No LLM API key configured. Set GROQ_API_KEY (free at console.groq.com), OPENAI_API_KEY, or ANTHROPIC_API_KEY in your .env"
    );
  }

  // 2. Complex queries skip Groq — go straight to OpenAI mini or Claude
  if (complexity === "complex") {
    if (available.openai) return callOpenAI(systemPrompt, userPrompt, OPENAI_MINI_MODEL, false);
    if (available.claude) return callClaude(systemPrompt, userPrompt, false);
  }

  // 3. Try Groq first (cheapest)
  if (available.groq) {
    let groqResult: RouterResult;
    try {
      groqResult = await callGroq(systemPrompt, userPrompt, false);
    } catch {
      // Groq failed (rate limit / error) — fall through to OpenAI
      groqResult = null!;
    }

    if (groqResult && groqResult.response.confidence >= CONFIDENCE_RETRY_THRESHOLD) {
      return groqResult;
    }
    // Groq returned low confidence or failed — escalate to OpenAI nano
  }

  // 4. OpenAI nano (simple / medium)
  if (available.openai) {
    let nanoResult: RouterResult;
    try {
      nanoResult = await callOpenAI(systemPrompt, userPrompt, OPENAI_NANO_MODEL, available.groq);
    } catch {
      nanoResult = null!;
    }

    if (nanoResult && nanoResult.response.confidence >= CONFIDENCE_RETRY_THRESHOLD) {
      return nanoResult;
    }

    // nano low confidence — escalate to mini
    try {
      return await callOpenAI(systemPrompt, userPrompt, OPENAI_MINI_MODEL, true);
    } catch {
      // mini failed — fall through to Claude
    }
  }

  // 5. Claude as final fallback
  if (available.claude) {
    return callClaude(systemPrompt, userPrompt, true);
  }

  // Should never reach here — but satisfy TypeScript
  throw new Error("All LLM providers exhausted without a result");
}

// Re-export for compatibility
export type { RouterResult, OrgLLMConfig } from "./llm-providers/types";
