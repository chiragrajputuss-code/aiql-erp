import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { safeLlmCall } from "../safe-llm";

describe("safeLlmCall — PII safety contract", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    process.env.GROQ_API_KEY = "test-key";  // doesn't matter — fetch is mocked
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
  });

  function mockFetchEcho(content: string, usage = { prompt_tokens: 10, completion_tokens: 20 }) {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve({
        choices: [{ message: { content } }],
        usage,
      }),
    });
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
    return fetchSpy;
  }

  it("rejects non-HTTPS endpoints", async () => {
    await expect(safeLlmCall({
      endpoint:    "http://api.groq.com/openai/v1/chat/completions",
      apiKey:      "x", model: "x", systemPrompt: "x", userContent: "x",
    })).rejects.toThrow(/HTTPS/);
  });

  it("returns null when apiKey is empty (graceful no-op)", async () => {
    const r = await safeLlmCall({
      endpoint:    "https://api.groq.com/openai/v1/chat/completions",
      apiKey:      "", model: "x", systemPrompt: "x", userContent: "x",
    });
    expect(r).toBeNull();
  });

  it("does NOT send raw account/vendor names to the LLM (proper noun tokenisation)", async () => {
    const fetchSpy = mockFetchEcho("ok");

    await safeLlmCall({
      endpoint:     "https://api.groq.com/openai/v1/chat/completions",
      apiKey:       "key",
      model:        "x",
      systemPrompt: "Analyze",
      userContent:  "Reliance Industries paid us ₹50,00,000 last March via HDFC Bank",
    });

    expect(fetchSpy).toHaveBeenCalled();
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body);
    const sentUserText = body.messages[1].content as string;

    // Raw amount must not leak
    expect(sentUserText).not.toContain("50,00,000");
    expect(sentUserText).not.toContain("5000000");
  });

  it("does not tokenise the system prompt (our static prompt stays intact)", async () => {
    const fetchSpy = mockFetchEcho("ok");
    const sysPrompt = "Reliance Industries is a special party — never auto-resolve.";

    await safeLlmCall({
      endpoint:     "https://api.groq.com/openai/v1/chat/completions",
      apiKey:       "key", model: "x",
      systemPrompt: sysPrompt,
      userContent:  "ok",
    });

    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body);
    expect(body.messages[0].content).toBe(sysPrompt);
  });

  it("detokenises the response back to original values", async () => {
    // Capture what the wrapper sends, then echo back the same tokens — proving
    // the round-trip works regardless of which token IDs the tokeniser picks.
    let capturedSentText = "";
    const fetchSpy = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      capturedSentText = body.messages[1].content;
      return {
        ok:   true,
        json: () => Promise.resolve({
          // Echo the tokenised user text back as the LLM's "response"
          choices: [{ message: { content: `Analysis: ${capturedSentText}` } }],
          usage:   { prompt_tokens: 1, completion_tokens: 1 },
        }),
      };
    });
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const r = await safeLlmCall({
      endpoint:     "https://api.groq.com/openai/v1/chat/completions",
      apiKey:       "key", model: "x",
      systemPrompt: "x",
      userContent:  "Charge of ₹5,00,000",
    });

    // After detokenisation, original amount text should reappear
    expect(r?.content).toContain("5,00,000");
    // No AMOUNT_T* token survives in the final content
    expect(r?.content).not.toMatch(/AMOUNT_T\d+/);
  });

  it("returns audit summary by category", async () => {
    mockFetchEcho("ok");
    const r = await safeLlmCall({
      endpoint:     "https://api.groq.com/openai/v1/chat/completions",
      apiKey:       "key", model: "x",
      systemPrompt: "x",
      userContent:  "Reliance Industries paid ₹5,00,000 via HDFC Bank to Mr Kumar",
    });

    expect(r?.audit).toBeDefined();
    expect(Array.isArray(r?.audit)).toBe(true);
    // Should detect at least amounts and entities
    const masked = (r?.audit ?? []).reduce((sum, a) => sum + a.count, 0);
    expect(masked).toBeGreaterThan(0);
  });

  it("returns null on fetch failure (no throw)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof globalThis.fetch;

    const r = await safeLlmCall({
      endpoint:     "https://api.groq.com/openai/v1/chat/completions",
      apiKey:       "key", model: "x",
      systemPrompt: "x", userContent: "y",
    });
    expect(r).toBeNull();
  });

  it("returns null on non-OK HTTP response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 429, json: () => Promise.resolve({}),
    }) as unknown as typeof globalThis.fetch;

    const r = await safeLlmCall({
      endpoint:     "https://api.groq.com/openai/v1/chat/completions",
      apiKey:       "key", model: "x",
      systemPrompt: "x", userContent: "y",
    });
    expect(r).toBeNull();
  });

  it("validates JSON-mode responses (isJson=true only on parseable JSON)", async () => {
    mockFetchEcho('{"foo": "bar"}');
    const r = await safeLlmCall({
      endpoint:     "https://api.groq.com/openai/v1/chat/completions",
      apiKey:       "key", model: "x",
      systemPrompt: "x", userContent: "y",
      jsonMode:     true,
    });
    expect(r?.isJson).toBe(true);
  });

  it("isJson=false when JSON-mode response is not parseable", async () => {
    mockFetchEcho("not json");
    const r = await safeLlmCall({
      endpoint:     "https://api.groq.com/openai/v1/chat/completions",
      apiKey:       "key", model: "x",
      systemPrompt: "x", userContent: "y",
      jsonMode:     true,
    });
    expect(r?.isJson).toBe(false);
  });

  it("passes max_tokens and temperature to the LLM body", async () => {
    const fetchSpy = mockFetchEcho("ok");
    await safeLlmCall({
      endpoint:     "https://api.groq.com/openai/v1/chat/completions",
      apiKey:       "key", model: "x",
      systemPrompt: "x", userContent: "y",
      maxTokens:    1234,
      temperature:  0.05,
    });
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body);
    expect(body.max_tokens).toBe(1234);
    expect(body.temperature).toBe(0.05);
  });

  it("requests JSON response_format only when jsonMode=true", async () => {
    const fetchSpy = mockFetchEcho("ok");
    await safeLlmCall({
      endpoint:     "https://api.groq.com/openai/v1/chat/completions",
      apiKey:       "key", model: "x",
      systemPrompt: "x", userContent: "y",
      jsonMode:     false,
    });
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as { body: string }).body);
    expect(body.response_format).toBeUndefined();
  });
});
