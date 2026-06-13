/**
 * LLM Proxy — provider adapters.
 *
 * Customers send OpenAI-compatible chat requests to /api/v1/llm-proxy/chat.
 * Internally we translate to each provider's wire format. PII tokenisation
 * happens in the route handler before this adapter is called; detokenisation
 * happens after.
 *
 * Wire formats:
 *   OpenAI / Groq / Azure-OpenAI:  /chat/completions, messages[] include system
 *   Anthropic Messages:            /v1/messages, system as separate field, no
 *                                   "system" entries inside messages[]
 */

export type Provider = "OPENAI" | "ANTHROPIC" | "GROQ" | "AZURE_OPENAI";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProxyChatRequest {
  model:    string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?:  number;
  /** Pass through to OpenAI-style providers; ignored for Anthropic. */
  response_format?: { type: "json_object" };
}

export interface ProxyChatResponse {
  /** Assistant response content (single choice; non-streaming). */
  content:        string;
  /** Echo of which model the upstream actually used. */
  modelUsed:      string;
  promptTokens:   number;
  completionTokens: number;
  /** Raw upstream HTTP status. */
  upstreamStatus: number;
}

export interface CallProviderArgs {
  provider:  Provider;
  apiKey:    string;
  request:   ProxyChatRequest;
  timeoutMs?: number;
}

export async function callProvider(args: CallProviderArgs): Promise<ProxyChatResponse> {
  switch (args.provider) {
    case "OPENAI":
    case "GROQ":
    case "AZURE_OPENAI":
      return callOpenAiCompatible(args);
    case "ANTHROPIC":
      return callAnthropic(args);
  }
}

// ─── OpenAI / Groq / Azure (same wire format) ───────────────────────────────

async function callOpenAiCompatible(args: CallProviderArgs): Promise<ProxyChatResponse> {
  const url = openAiCompatibleUrl(args.provider, args.request.model);
  const res = await fetch(url, {
    method:  "POST",
    headers: openAiCompatibleHeaders(args.provider, args.apiKey),
    body: JSON.stringify({
      model:       args.request.model,
      messages:    args.request.messages,
      temperature: args.request.temperature ?? 0.2,
      max_tokens:  args.request.max_tokens  ?? 1024,
      ...(args.request.response_format ? { response_format: args.request.response_format } : {}),
    }),
    signal: AbortSignal.timeout(args.timeoutMs ?? 30_000),
  });

  if (!res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new ProxyError(`Upstream ${args.provider} returned ${res.status}: ${detail.slice(0, 500)}`, res.status);
  }

  const data = await res.json() as {
    model?:   string;
    choices?: { message?: { content?: string } }[];
    usage?:   { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    content:          data.choices?.[0]?.message?.content ?? "",
    modelUsed:        data.model ?? args.request.model,
    promptTokens:     data.usage?.prompt_tokens     ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    upstreamStatus:   res.status,
  };
}

function openAiCompatibleUrl(provider: Provider, model: string): string {
  switch (provider) {
    case "OPENAI": return "https://api.openai.com/v1/chat/completions";
    case "GROQ":   return "https://api.groq.com/openai/v1/chat/completions";
    case "AZURE_OPENAI": {
      // Format: https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-02-15-preview
      // For demo, expect AZURE_OPENAI_ENDPOINT env var as the resource base.
      const base = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, "");
      if (!base) throw new ProxyError("AZURE_OPENAI_ENDPOINT not configured", 0);
      return `${base}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=2024-02-15-preview`;
    }
    default:
      throw new ProxyError(`Unsupported OpenAI-compatible provider: ${provider}`, 0);
  }
}

function openAiCompatibleHeaders(provider: Provider, apiKey: string): Record<string, string> {
  if (provider === "AZURE_OPENAI") {
    return { "api-key": apiKey, "Content-Type": "application/json" };
  }
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

// ─── Anthropic Messages API ─────────────────────────────────────────────────

async function callAnthropic(args: CallProviderArgs): Promise<ProxyChatResponse> {
  // Anthropic puts system prompt outside messages[], so split it out.
  const systemMsg = args.request.messages.find((m) => m.role === "system");
  const otherMsgs = args.request.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":         args.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type":      "application/json",
    },
    body: JSON.stringify({
      model:       args.request.model,
      max_tokens:  args.request.max_tokens ?? 1024,
      temperature: args.request.temperature ?? 0.2,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      messages: otherMsgs,
    }),
    signal: AbortSignal.timeout(args.timeoutMs ?? 30_000),
  });

  if (!res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new ProxyError(`Upstream Anthropic returned ${res.status}: ${detail.slice(0, 500)}`, res.status);
  }

  const data = await res.json() as {
    model?:   string;
    content?: { type: string; text?: string }[];
    usage?:   { input_tokens?: number; output_tokens?: number };
  };

  // Anthropic returns content as an array of typed blocks. Concatenate text blocks.
  const content = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text!)
    .join("\n");

  return {
    content,
    modelUsed:        data.model ?? args.request.model,
    promptTokens:     data.usage?.input_tokens  ?? 0,
    completionTokens: data.usage?.output_tokens ?? 0,
    upstreamStatus:   res.status,
  };
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class ProxyError extends Error {
  constructor(message: string, public upstreamStatus: number) {
    super(message);
    this.name = "ProxyError";
  }
}
