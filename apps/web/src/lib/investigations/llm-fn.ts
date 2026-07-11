// ─── LLM adapter for the investigation engine ────────────────────────────────
//
// Wraps safeLlmCall (PII-tokenised, graceful) into the engine's injected LlmFn
// signature. The engine package never imports this — the run route passes it in.
// Returns null on any failure so the engine falls back to its deterministic
// executive summary (Principle 5).

import { safeLlmCall } from "@aiql/tokeniser";
import type { LlmFn } from "@aiql/investigation-engine";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export function makeInvestigationLlmFn(): LlmFn | undefined {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return undefined; // no key → engine uses deterministic fallback

  const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

  return async (systemPrompt: string, userContent: string): Promise<string | null> => {
    const res = await safeLlmCall({
      endpoint:    GROQ_ENDPOINT,
      apiKey,
      model,
      systemPrompt,
      userContent,
      maxTokens:   300,
      temperature: 0.3,
      timeoutMs:   8000,
    });
    return res?.content ?? null;
  };
}
