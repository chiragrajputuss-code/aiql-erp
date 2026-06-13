import type { LLMProvider, LLMResponse } from "./types";
import { parseLLMJson } from "./parse-llm-json";

const BASE_URL = "https://api.openai.com/v1/chat/completions";

export const OPENAI_NANO_MODEL = "gpt-4.1-nano";
export const OPENAI_MINI_MODEL = "gpt-4o-mini";

interface OpenAIChatResponse {
  choices: Array<{ message: { content: string } }>;
  usage:   { prompt_tokens: number; completion_tokens: number };
  error?:  { message: string; type: string; code?: string };
}

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private readonly apiKey: string;
  private readonly model:  string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.model  = model  ?? process.env.OPENAI_MODEL   ?? OPENAI_NANO_MODEL;
  }

  async generateSQL(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is not set");

    let res: Response;
    try {
      res = await fetch(BASE_URL, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model:           this.model,
          temperature:     0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPrompt   },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      const msg = (err as Error).message ?? "unknown";
      if (msg.includes("timeout") || msg.includes("abort")) {
        throw new Error(`OpenAI (${this.model}) request timed out after 30s`);
      }
      throw new Error(`OpenAI connection error: ${msg}`);
    }

    const body = await res.json() as OpenAIChatResponse;

    if (!res.ok) {
      if (res.status === 429) throw new Error(`OpenAI rate limit hit (${this.model})`);
      if (res.status === 401) throw new Error("OpenAI authentication failed — check OPENAI_API_KEY");
      throw new Error(`OpenAI API error ${res.status}: ${body.error?.message ?? res.statusText}`);
    }

    const content = body.choices?.[0]?.message?.content ?? "";
    const parsed  = parseLLMJson(content);

    return {
      ...parsed,
      tokensIn:  body.usage?.prompt_tokens     ?? 0,
      tokensOut: body.usage?.completion_tokens ?? 0,
    };
  }
}
