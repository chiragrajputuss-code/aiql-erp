import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    llmProxyApiKey:      { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    llmProxyAuditLog:    { create: vi.fn(), findMany: vi.fn() },
    orgBusinessKnowledge: { findMany: vi.fn() },
    tokenisationConfig:  { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth",  () => ({ validateRequest: vi.fn() }));
vi.mock("@aiql/db",    () => ({ prisma: mockPrisma }));
vi.mock("@/lib/crypto", () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => s.replace(/^enc:/, ""),
}));

import { validateRequest } from "@/lib/auth";
import { POST as keysPOST, GET as keysGET } from "@/app/api/v1/llm-proxy/keys/route";
import { PATCH as keyPATCH, DELETE as keyDELETE } from "@/app/api/v1/llm-proxy/keys/[id]/route";
import { POST as chatPOST }    from "@/app/api/v1/llm-proxy/chat/route";
import { POST as previewPOST } from "@/app/api/v1/llm-proxy/preview/route";
import { GET  as auditGET }    from "@/app/api/v1/llm-proxy/audit/route";

const validateRequestMock = validateRequest as ReturnType<typeof vi.fn>;
const AUTH = { user: { id: "u1", orgId: "org1", email: "x@y.com" } };

function jsonReq(body: unknown) {
  return { url: "http://x", method: "POST", json: async () => body } as Parameters<typeof keysPOST>[0];
}
function getReq(url = "http://x") {
  return { url, method: "GET" } as unknown as Parameters<typeof auditGET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  validateRequestMock.mockResolvedValue(AUTH);
  mockPrisma.orgBusinessKnowledge.findMany.mockResolvedValue([]);
  mockPrisma.tokenisationConfig.findUnique.mockResolvedValue(null);  // → defaults
});

// ─── Keys CRUD ───────────────────────────────────────────────────────────

describe("POST /api/v1/llm-proxy/keys", () => {
  it("rejects unauthenticated", async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await keysPOST(jsonReq({}));
    expect(res.status).toBe(401);
  });

  it("rejects body without required fields", async () => {
    const res = await keysPOST(jsonReq({ provider: "OPENAI" }));
    expect(res.status).toBe(400);
  });

  it("rejects keys that don't look like the right provider", async () => {
    const res = await keysPOST(jsonReq({
      provider: "OPENAI",
      name:     "Prod",
      apiKey:   "not-an-openai-key",  // missing sk- prefix
    }));
    expect(res.status).toBe(400);
  });

  it("encrypts the key before storage and never returns plaintext", async () => {
    mockPrisma.llmProxyApiKey.create.mockResolvedValue({
      id: "k1", provider: "OPENAI", name: "Prod", keyTail: "abcd",
      isActive: true, callCount: 0, lastUsedAt: null, createdAt: new Date(),
    });
    const res = await keysPOST(jsonReq({
      provider: "OPENAI",
      name:     "Prod",
      apiKey:   "sk-1234567890abcd",
    }));
    expect(res.status).toBe(201);
    const arg = mockPrisma.llmProxyApiKey.create.mock.calls[0][0];
    expect(arg.data.encryptedKey).toMatch(/^enc:/);
    expect(arg.data.encryptedKey).not.toBe("sk-1234567890abcd");
    expect(arg.data.keyTail).toBe("abcd");
    // Response must not include encryptedKey
    const body = await res.json();
    expect(body.encryptedKey).toBeUndefined();
  });

  it("trims name", async () => {
    mockPrisma.llmProxyApiKey.create.mockResolvedValue({
      id: "k1", provider: "OPENAI", name: "Prod", keyTail: "abcd",
      isActive: true, callCount: 0, lastUsedAt: null, createdAt: new Date(),
    });
    await keysPOST(jsonReq({
      provider: "OPENAI", name: "  Prod  ", apiKey: "sk-12345678",
    }));
    const arg = mockPrisma.llmProxyApiKey.create.mock.calls[0][0];
    expect(arg.data.name).toBe("Prod");
  });

  it("validates Anthropic key prefix", async () => {
    const res = await keysPOST(jsonReq({
      provider: "ANTHROPIC", name: "x", apiKey: "sk-not-ant-style",
    }));
    expect(res.status).toBe(400);
  });

  it("validates Groq key prefix", async () => {
    const res = await keysPOST(jsonReq({
      provider: "GROQ", name: "x", apiKey: "wrong-prefix",
    }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/llm-proxy/keys", () => {
  it("returns the org's keys without plaintext", async () => {
    mockPrisma.llmProxyApiKey.findMany.mockResolvedValue([
      { id: "k1", provider: "OPENAI", name: "Prod", keyTail: "abcd", isActive: true, callCount: 5, lastUsedAt: null, createdAt: new Date() },
    ]);
    const res = await keysGET();
    const body = await res.json();
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0].encryptedKey).toBeUndefined();
  });
});

describe("PATCH /api/v1/llm-proxy/keys/:id", () => {
  it("allows toggling isActive", async () => {
    mockPrisma.llmProxyApiKey.findFirst.mockResolvedValue({ id: "k1" });
    mockPrisma.llmProxyApiKey.update.mockResolvedValue({ id: "k1", isActive: false });
    const res = await keyPATCH(jsonReq({ isActive: false }), { params: { id: "k1" } });
    expect(res.status).toBe(200);
  });

  it("404s if not owned", async () => {
    mockPrisma.llmProxyApiKey.findFirst.mockResolvedValue(null);
    const res = await keyPATCH(jsonReq({ isActive: false }), { params: { id: "k1" } });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/llm-proxy/keys/:id", () => {
  it("deletes when owned", async () => {
    mockPrisma.llmProxyApiKey.findFirst.mockResolvedValue({ id: "k1" });
    mockPrisma.llmProxyApiKey.delete.mockResolvedValue({});
    const res = await keyDELETE({} as never, { params: { id: "k1" } });
    expect(res.status).toBe(200);
  });
});

// ─── Preview endpoint ────────────────────────────────────────────────────

describe("POST /api/v1/llm-proxy/preview", () => {
  it("rejects unauthenticated", async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await previewPOST(jsonReq({}));
    expect(res.status).toBe(401);
  });

  it("returns tokenised messages + masked summary", async () => {
    const res = await previewPOST(jsonReq({
      messages: [
        { role: "user", content: "Pay Reliance Industries ₹5,00,000 today" },
      ],
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tokenised).toHaveLength(1);
    // The amount should be masked; raw "5,00,000" should not appear
    expect(body.tokenised[0].content).not.toContain("5,00,000");
    expect(body.masked).toBeDefined();
  });

  it("preserves system messages without tokenising them", async () => {
    const res = await previewPOST(jsonReq({
      messages: [
        { role: "system", content: "You are a financial analyst at Reliance Industries." },
        { role: "user", content: "What is 2+2?" },
      ],
    }));
    const body = await res.json();
    // System text comes through verbatim
    expect(body.tokenised[0].role).toBe("system");
    expect(body.tokenised[0].content).toContain("Reliance Industries");
  });
});

// ─── Chat endpoint ───────────────────────────────────────────────────────

/**
 * The chat endpoint now calls Ollama (for knowledge embeddings) BEFORE
 * the upstream provider. Tests need a fetch mock that distinguishes
 * Ollama calls (return graceful failure → keyword fallback) from
 * upstream calls (return the test's expected response).
 */
function makeRoutedFetch(upstream: { ok: boolean; status?: number; payload?: unknown; text?: string } = {
  ok: true,
  payload: {
    model:   "gpt-4o-mini",
    choices: [{ message: { content: "ok" } }],
    usage:   { prompt_tokens: 100, completion_tokens: 50 },
    // Anthropic shape too, in case test calls Anthropic
    content: [{ type: "text", text: "ok" }],
  },
}) {
  return vi.fn().mockImplementation(async (url: string) => {
    if (typeof url === "string" && url.includes("/api/embeddings")) {
      // Ollama — return 404 so searchByEmbedding returns []
      return { ok: false, status: 404, json: () => Promise.resolve({}) };
    }
    if (!upstream.ok) {
      return {
        ok:     false,
        status: upstream.status ?? 500,
        text:   () => Promise.resolve(upstream.text ?? ""),
        json:   () => Promise.resolve({}),
      };
    }
    return {
      ok:   true,
      json: () => Promise.resolve(upstream.payload),
    };
  });
}

/** Get the fetch call that went to the upstream provider (skipping Ollama). */
function findUpstreamCall(spy: ReturnType<typeof vi.fn>): unknown[] | undefined {
  for (const call of spy.mock.calls) {
    const url = call[0];
    if (typeof url === "string" && !url.includes("/api/embeddings")) return call;
  }
  return undefined;
}

describe("POST /api/v1/llm-proxy/chat", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rejects unauthenticated", async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await chatPOST(jsonReq({}));
    expect(res.status).toBe(401);
  });

  it("returns 412 when no key registered for the provider", async () => {
    mockPrisma.llmProxyApiKey.findFirst.mockResolvedValue(null);
    const res = await chatPOST(jsonReq({
      provider: "OPENAI",
      model:    "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    }));
    expect(res.status).toBe(412);
    const body = await res.json();
    expect(body.code).toBe("NO_KEY");
  });

  it("forwards to OpenAI with decrypted key + tokenised body", async () => {
    mockPrisma.llmProxyApiKey.findFirst.mockResolvedValue({
      id: "k1", encryptedKey: "enc:sk-real-key", provider: "OPENAI",
    });
    mockPrisma.llmProxyApiKey.update.mockResolvedValue({});
    mockPrisma.llmProxyAuditLog.create.mockResolvedValue({});

    const fetchSpy = makeRoutedFetch();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const res = await chatPOST(jsonReq({
      provider: "OPENAI",
      model:    "gpt-4o-mini",
      messages: [{ role: "user", content: "Did Reliance Industries pay us?" }],
    }));

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();

    const upstreamCall = findUpstreamCall(fetchSpy);
    expect(upstreamCall).toBeDefined();
    expect(upstreamCall![0]).toBe("https://api.openai.com/v1/chat/completions");

    const init = upstreamCall![1] as { headers: Record<string, string>; body: string };
    expect(init.headers.Authorization).toBe("Bearer sk-real-key");

    const body = JSON.parse(init.body);
    // The vendor name must be tokenised, not raw
    const sentUserText = body.messages.find((m: { role: string }) => m.role === "user").content;
    expect(sentUserText).not.toContain("Reliance Industries");
  });

  it("writes an audit log on success", async () => {
    mockPrisma.llmProxyApiKey.findFirst.mockResolvedValue({
      id: "k1", encryptedKey: "enc:sk-x", provider: "OPENAI",
    });
    mockPrisma.llmProxyApiKey.update.mockResolvedValue({});
    mockPrisma.llmProxyAuditLog.create.mockResolvedValue({});

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve({
        choices: [{ message: { content: "ok" } }],
        usage:   { prompt_tokens: 10, completion_tokens: 5 },
      }),
    }) as unknown as typeof globalThis.fetch;

    await chatPOST(jsonReq({
      provider: "OPENAI",
      model:    "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    }));

    expect(mockPrisma.llmProxyAuditLog.create).toHaveBeenCalled();
  });

  it("writes an audit log even on upstream failure", async () => {
    mockPrisma.llmProxyApiKey.findFirst.mockResolvedValue({
      id: "k1", encryptedKey: "enc:sk-x", provider: "OPENAI",
    });
    mockPrisma.llmProxyAuditLog.create.mockResolvedValue({});

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok:     false,
      status: 401,
      text:   () => Promise.resolve("unauthorized"),
    }) as unknown as typeof globalThis.fetch;

    const res = await chatPOST(jsonReq({
      provider: "OPENAI",
      model:    "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    }));
    expect(res.status).toBe(401);
    expect(mockPrisma.llmProxyAuditLog.create).toHaveBeenCalled();
  });

  it("translates Anthropic format — system goes outside messages[]", async () => {
    mockPrisma.llmProxyApiKey.findFirst.mockResolvedValue({
      id: "k1", encryptedKey: "enc:sk-ant-x", provider: "ANTHROPIC",
    });
    mockPrisma.llmProxyApiKey.update.mockResolvedValue({});
    mockPrisma.llmProxyAuditLog.create.mockResolvedValue({});

    const fetchSpy = makeRoutedFetch({
      ok: true,
      payload: {
        content: [{ type: "text", text: "ok" }],
        usage:   { input_tokens: 5, output_tokens: 5 },
      },
    });
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    await chatPOST(jsonReq({
      provider: "ANTHROPIC",
      model:    "claude-haiku-4-5-20251001",
      messages: [
        { role: "system", content: "You are a CA assistant" },
        { role: "user",   content: "hello" },
      ],
    }));

    const upstream = findUpstreamCall(fetchSpy);
    const init = upstream![1] as { body: string };
    const body = JSON.parse(init.body);
    // Anthropic puts system OUTSIDE messages[]
    expect(body.system).toBe("You are a CA assistant");
    expect(body.messages.find((m: { role: string }) => m.role === "system")).toBeUndefined();
  });

  it("auto-injects knowledge when org has matching rows", async () => {
    mockPrisma.llmProxyApiKey.findFirst.mockResolvedValue({
      id: "k1", encryptedKey: "enc:sk-x", provider: "OPENAI",
    });
    mockPrisma.llmProxyApiKey.update.mockResolvedValue({});
    mockPrisma.llmProxyAuditLog.create.mockResolvedValue({});
    mockPrisma.orgBusinessKnowledge.findMany.mockResolvedValue([
      {
        id: "kb1",
        context:  "March bonus payout",
        answer:   "Annual bonus, paid every March — normal",
        annotation: null,
        verdict:  "NORMAL",
        confidence: 1.0,
        reaffirmationCount: 3,
        lastReaffirmedAt: new Date(),
        source:   "FLUX_VARIANCE",
      },
    ]);

    // Ollama 404 → falls back to keyword path → uses orgBusinessKnowledge.findMany above
    const fetchSpy = makeRoutedFetch();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    await chatPOST(jsonReq({
      provider: "OPENAI",
      model:    "gpt-4o-mini",
      messages: [{ role: "user", content: "Why did salary jump in March bonus?" }],
    }));

    const upstream = findUpstreamCall(fetchSpy);
    expect(upstream).toBeDefined();
    const init = upstream![1] as { body: string };
    const body = JSON.parse(init.body);
    // System message should now contain the knowledge addendum
    const sys = body.messages.find((m: { role: string }) => m.role === "system");
    expect(sys).toBeDefined();
    expect(sys.content).toContain("previously confirmed");
    expect(sys.content).toContain("Annual bonus");
  });
});

// ─── Gap fixes (post-Sprint B) ──────────────────────────────────────────

describe("POST /api/v1/llm-proxy/chat — system-prompt masking flag (Gap #1)", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("by default leaves system prompt PLAINTEXT (treated as our prompt)", async () => {
    mockPrisma.llmProxyApiKey.findFirst.mockResolvedValue({
      id: "k1", encryptedKey: "enc:sk-x", provider: "OPENAI",
    });
    mockPrisma.llmProxyApiKey.update.mockResolvedValue({});
    mockPrisma.llmProxyAuditLog.create.mockResolvedValue({});

    const fetchSpy = makeRoutedFetch();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    await chatPOST(jsonReq({
      provider: "OPENAI",
      model:    "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a CA for Reliance Industries" },
        { role: "user",   content: "Show payments" },
      ],
    }));

    const upstream = findUpstreamCall(fetchSpy);
    const body = JSON.parse((upstream![1] as { body: string }).body);
    const sys = body.messages.find((m: { role: string }) => m.role === "system");
    // Default: system passes through plaintext
    expect(sys.content).toContain("Reliance Industries");
  });

  it("when tokeniseSystem=true, ALSO masks the system prompt", async () => {
    mockPrisma.llmProxyApiKey.findFirst.mockResolvedValue({
      id: "k1", encryptedKey: "enc:sk-x", provider: "OPENAI",
    });
    mockPrisma.llmProxyApiKey.update.mockResolvedValue({});
    mockPrisma.llmProxyAuditLog.create.mockResolvedValue({});

    const fetchSpy = makeRoutedFetch();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    await chatPOST(jsonReq({
      provider:       "OPENAI",
      model:          "gpt-4o-mini",
      tokeniseSystem: true,
      messages: [
        { role: "system", content: "You are a CA for Reliance Industries" },
        { role: "user",   content: "Show payments" },
      ],
    }));

    const upstream = findUpstreamCall(fetchSpy);
    const body = JSON.parse((upstream![1] as { body: string }).body);
    const sys = body.messages.find((m: { role: string }) => m.role === "system");
    // tokeniseSystem=true: vendor name in system is also masked
    expect(sys.content).not.toContain("Reliance Industries");
  });
});

describe("POST /api/v1/llm-proxy/chat — org TokenisationConfig wired in (Gap #3)", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("respects org's customStripList (drops sensitive substrings entirely)", async () => {
    mockPrisma.llmProxyApiKey.findFirst.mockResolvedValue({
      id: "k1", encryptedKey: "enc:sk-x", provider: "OPENAI",
    });
    mockPrisma.llmProxyApiKey.update.mockResolvedValue({});
    mockPrisma.llmProxyAuditLog.create.mockResolvedValue({});
    mockPrisma.tokenisationConfig.findUnique.mockResolvedValue({
      tokeniseVendors: true, tokeniseCustomers: true, tokeniseEmployees: true,
      tokeniseAmounts: true, tokeniseAccounts: true, tokeniseProjects: true,
      sensitivityLevel: "STANDARD", accountPattern: null,
      customEntities: [],
      customStripList: ["INTERNAL_PROJECT_OMEGA"],
    });

    const fetchSpy = makeRoutedFetch();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    await chatPOST(jsonReq({
      provider: "OPENAI",
      model:    "gpt-4o-mini",
      messages: [
        { role: "user", content: "What about INTERNAL_PROJECT_OMEGA budget?" },
      ],
    }));

    const upstream = findUpstreamCall(fetchSpy);
    const body = JSON.parse((upstream![1] as { body: string }).body);
    const userMsg = body.messages.find((m: { role: string }) => m.role === "user");
    // The custom strip term must be entirely removed from the upstream payload
    expect(userMsg.content).not.toContain("INTERNAL_PROJECT_OMEGA");
  });

  it("respects org's customEntities (gets ENTITY tokens)", async () => {
    mockPrisma.llmProxyApiKey.findFirst.mockResolvedValue({
      id: "k1", encryptedKey: "enc:sk-x", provider: "OPENAI",
    });
    mockPrisma.llmProxyApiKey.update.mockResolvedValue({});
    mockPrisma.llmProxyAuditLog.create.mockResolvedValue({});
    mockPrisma.tokenisationConfig.findUnique.mockResolvedValue({
      tokeniseVendors: true, tokeniseCustomers: true, tokeniseEmployees: true,
      tokeniseAmounts: true, tokeniseAccounts: true, tokeniseProjects: true,
      sensitivityLevel: "STANDARD", accountPattern: null,
      customEntities: ["ProjectVeritas"],
      customStripList: [],
    });

    const fetchSpy = makeRoutedFetch();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    await chatPOST(jsonReq({
      provider: "OPENAI",
      model:    "gpt-4o-mini",
      messages: [
        { role: "user", content: "ProjectVeritas spent ₹1,00,000 last month" },
      ],
    }));

    const upstream = findUpstreamCall(fetchSpy);
    const body = JSON.parse((upstream![1] as { body: string }).body);
    const userMsg = body.messages.find((m: { role: string }) => m.role === "user");
    // The custom entity is replaced by an ENTITY token
    expect(userMsg.content).not.toContain("ProjectVeritas");
    expect(userMsg.content).toMatch(/ENTITY_T\d+/);
  });

  it("falls back to defaults when org has no TokenisationConfig", async () => {
    mockPrisma.llmProxyApiKey.findFirst.mockResolvedValue({
      id: "k1", encryptedKey: "enc:sk-x", provider: "OPENAI",
    });
    mockPrisma.llmProxyApiKey.update.mockResolvedValue({});
    mockPrisma.llmProxyAuditLog.create.mockResolvedValue({});
    mockPrisma.tokenisationConfig.findUnique.mockResolvedValue(null);

    const fetchSpy = makeRoutedFetch();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const res = await chatPOST(jsonReq({
      provider: "OPENAI",
      model:    "gpt-4o-mini",
      messages: [{ role: "user", content: "Reliance paid us ₹50,00,000" }],
    }));

    expect(res.status).toBe(200);
    const upstream = findUpstreamCall(fetchSpy);
    const body = JSON.parse((upstream![1] as { body: string }).body);
    const userMsg = body.messages.find((m: { role: string }) => m.role === "user");
    // With defaults, amount is masked
    expect(userMsg.content).not.toContain("50,00,000");
  });
});

// ─── Audit endpoint ──────────────────────────────────────────────────────

describe("GET /api/v1/llm-proxy/audit", () => {
  it("rejects unauthenticated", async () => {
    validateRequestMock.mockResolvedValue({ user: null });
    const res = await auditGET(getReq());
    expect(res.status).toBe(401);
  });

  it("returns parsed audit logs", async () => {
    mockPrisma.llmProxyAuditLog.findMany.mockResolvedValue([
      {
        id: "a1", provider: "OPENAI", model: "gpt-4o-mini",
        maskedJson: '[{"category":"VENDOR","count":2}]',
        promptChars: 100, responseChars: 50, tokensIn: 10, tokensOut: 5,
        upstreamStatus: 200, knowledgeApplied: 1, durationMs: 800,
        errorMessage: null, createdAt: new Date(),
      },
    ]);
    const res = await auditGET(getReq("http://x?limit=10"));
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].masked).toEqual([{ category: "VENDOR", count: 2 }]);
    expect(body.items[0].maskedTotal).toBe(2);
  });

  it("recovers from malformed maskedJson", async () => {
    mockPrisma.llmProxyAuditLog.findMany.mockResolvedValue([
      {
        id: "a1", provider: "OPENAI", model: "gpt-4o-mini",
        maskedJson: "not json", promptChars: 0, responseChars: 0,
        tokensIn: 0, tokensOut: 0, upstreamStatus: 200, knowledgeApplied: 0,
        durationMs: 100, errorMessage: null, createdAt: new Date(),
      },
    ]);
    const res = await auditGET(getReq());
    const body = await res.json();
    expect(body.items[0].masked).toEqual([]);
    expect(body.items[0].maskedTotal).toBe(0);
  });
});
