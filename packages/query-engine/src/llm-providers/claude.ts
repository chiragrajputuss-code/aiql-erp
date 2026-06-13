import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMResponse } from "./types";
import { parseLLMJson } from "./parse-llm-json";

// Use the current production Sonnet model
const DEFAULT_MODEL = "claude-sonnet-4-6";

export class ClaudeProvider implements LLMProvider {
  readonly name = "claude";
  private readonly client: Anthropic;
  private readonly model:  string;

  constructor(apiKey?: string, model?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
    this.model  = model ?? process.env.CLAUDE_MODEL ?? DEFAULT_MODEL;
  }

  async generateSQL(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
    let msg: Anthropic.Message;
    try {
      msg = await this.client.messages.create({
        model:       this.model,
        max_tokens:  1024,
        temperature: 0,
        system:      systemPrompt,
        messages:    [{ role: "user", content: userPrompt }],
      });
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 429) throw new Error("Claude rate limit hit");
      if (e.status === 401) throw new Error("Claude authentication failed — check ANTHROPIC_API_KEY");
      throw new Error(`Claude API error: ${e.message}`);
    }

    // Extract text content from the response
    const content = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = parseLLMJson(content);

    return {
      ...parsed,
      tokensIn:  msg.usage.input_tokens,
      tokensOut: msg.usage.output_tokens,
    };
  }
}
