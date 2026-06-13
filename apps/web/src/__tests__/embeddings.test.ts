import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    orgBusinessKnowledge: { findUnique: vi.fn() },
    $executeRawUnsafe:    vi.fn(),
    $queryRawUnsafe:      vi.fn(),
  },
}));

vi.mock("@aiql/db", () => ({ prisma: mockPrisma }));

import { embed, embedKnowledgeRow, searchByEmbedding, backfillEmbeddings, _resetOllamaUrlWarning } from "@/lib/embeddings";

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.OLLAMA_URL;
  delete process.env.OLLAMA_MODEL;
  delete process.env.OLLAMA_ALLOW_REMOTE;
  _resetOllamaUrlWarning();
});

// ─── embed() — single-text encoding ──────────────────────────────────────

describe("embed()", () => {
  function mockOllama(payload: unknown, ok = true) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(payload),
    }) as unknown as typeof globalThis.fetch;
  }

  it("returns null for empty / whitespace input", async () => {
    expect(await embed("")).toBeNull();
    expect(await embed("   ")).toBeNull();
  });

  it("returns null when Ollama is unreachable (network error)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof globalThis.fetch;
    expect(await embed("hello")).toBeNull();
  });

  it("returns null on non-OK HTTP response", async () => {
    mockOllama({}, false);
    expect(await embed("hello")).toBeNull();
  });

  it("returns null on malformed payload (no embedding field)", async () => {
    mockOllama({ wrongShape: true });
    expect(await embed("hello")).toBeNull();
  });

  it("returns null when dim count is wrong (model mismatch)", async () => {
    // 1536 dims is OpenAI text-embedding-3-small — wrong for nomic.
    mockOllama({ embedding: new Array(1536).fill(0.01) });
    expect(await embed("hello")).toBeNull();
  });

  it("returns embedding when shape is correct", async () => {
    const vec = new Array(768).fill(0).map((_, i) => i / 768);
    mockOllama({ embedding: vec });
    const r = await embed("hello world");
    expect(r).not.toBeNull();
    expect(r!.dims).toBe(768);
    expect(r!.embedding).toHaveLength(768);
  });

  it("uses configured Ollama URL + model", async () => {
    process.env.OLLAMA_URL   = "http://my-ollama:9999";
    process.env.OLLAMA_MODEL = "custom-model";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve({ embedding: new Array(768).fill(0) }),
    });
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    await embed("hello");

    const url = fetchSpy.mock.calls[0]![0];
    expect(url).toBe("http://my-ollama:9999/api/embeddings");
    const init = fetchSpy.mock.calls[0]![1] as { body: string };
    const body = JSON.parse(init.body);
    expect(body.model).toBe("custom-model");
  });

  it("trims input to 8000 chars to avoid Ollama timeouts", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve({ embedding: new Array(768).fill(0) }),
    });
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    await embed("a".repeat(20_000));

    const init = fetchSpy.mock.calls[0]![1] as { body: string };
    const body = JSON.parse(init.body);
    expect(body.prompt).toHaveLength(8000);
  });
});

// ─── embedKnowledgeRow() — persists vector via raw SQL ───────────────────

describe("embedKnowledgeRow()", () => {
  it("returns false when row does not exist", async () => {
    mockPrisma.orgBusinessKnowledge.findUnique.mockResolvedValue(null);
    expect(await embedKnowledgeRow("missing")).toBe(false);
  });

  it("returns false when Ollama unreachable (no UPDATE issued)", async () => {
    mockPrisma.orgBusinessKnowledge.findUnique.mockResolvedValue({
      context: "x", answer: "y", annotation: null,
    });
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("down")) as unknown as typeof globalThis.fetch;
    expect(await embedKnowledgeRow("k1")).toBe(false);
    expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("persists embedding via raw SQL on success", async () => {
    mockPrisma.orgBusinessKnowledge.findUnique.mockResolvedValue({
      context: "March bonus", answer: "Annual", annotation: "every year",
    });
    const vec = new Array(768).fill(0).map((_, i) => i * 0.001);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ embedding: vec }),
    }) as unknown as typeof globalThis.fetch;
    mockPrisma.$executeRawUnsafe.mockResolvedValue(1);

    const ok = await embedKnowledgeRow("k1");
    expect(ok).toBe(true);
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalled();

    const args = mockPrisma.$executeRawUnsafe.mock.calls[0];
    expect(args[0]).toContain("UPDATE");
    expect(args[0]).toContain("vector");
    // The vector literal should be a [a,b,...] string
    expect(args[1]).toMatch(/^\[[\d.,e\-+]+\]$/);
    expect(args[2]).toBe("k1");
  });

  it("composes embedding text from context + answer + annotation", async () => {
    mockPrisma.orgBusinessKnowledge.findUnique.mockResolvedValue({
      context: "ctx", answer: "ans", annotation: "anno",
    });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ embedding: new Array(768).fill(0) }),
    });
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
    mockPrisma.$executeRawUnsafe.mockResolvedValue(1);

    await embedKnowledgeRow("k1");

    const init = fetchSpy.mock.calls[0]![1] as { body: string };
    const body = JSON.parse(init.body);
    expect(body.prompt).toContain("ctx");
    expect(body.prompt).toContain("ans");
    expect(body.prompt).toContain("anno");
  });
});

// ─── searchByEmbedding() — cosine retrieval ───────────────────────────────

describe("searchByEmbedding()", () => {
  it("returns empty when Ollama is down (graceful fallback signal)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("down")) as unknown as typeof globalThis.fetch;
    const r = await searchByEmbedding({ orgId: "org1", queryText: "anything" });
    expect(r).toEqual([]);
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("returns rows above similarity threshold", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ embedding: new Array(768).fill(0.1) }),
    }) as unknown as typeof globalThis.fetch;

    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { id: "k1", context: "x", answer: "y", annotation: null, verdict: "NORMAL",
        reaffirmationCount: 2, source: "MANUAL", similarity: 0.85 },
      { id: "k2", context: "x", answer: "y", annotation: null, verdict: "NORMAL",
        reaffirmationCount: 1, source: "MANUAL", similarity: 0.40 },  // below default 0.5
    ]);

    const r = await searchByEmbedding({ orgId: "org1", queryText: "test" });
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe("k1");
  });

  it("filters by minSimilarity option", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ embedding: new Array(768).fill(0.1) }),
    }) as unknown as typeof globalThis.fetch;

    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { id: "k1", similarity: 0.65, context: "x", answer: "y", annotation: null,
        verdict: "NORMAL", reaffirmationCount: 1, source: "MANUAL" },
    ]);

    const r = await searchByEmbedding({
      orgId: "org1", queryText: "test", minSimilarity: 0.7,
    });
    expect(r).toHaveLength(0);
  });

  it("scopes by connectionId when explicitly provided", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ embedding: new Array(768).fill(0) }),
    }) as unknown as typeof globalThis.fetch;
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    await searchByEmbedding({ orgId: "org1", queryText: "test", connectionId: "c1" });

    const args = mockPrisma.$queryRawUnsafe.mock.calls[0];
    expect(args[0]).toContain(`"connectionId" = $3`);
    expect(args[3]).toBe("c1");
  });

  it("matches NULL connectionId when explicitly null", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ embedding: new Array(768).fill(0) }),
    }) as unknown as typeof globalThis.fetch;
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    await searchByEmbedding({ orgId: "org1", queryText: "test", connectionId: null });

    const args = mockPrisma.$queryRawUnsafe.mock.calls[0];
    expect(args[0]).toContain(`"connectionId" IS NULL`);
  });

  it("returns empty on SQL error (graceful)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ embedding: new Array(768).fill(0) }),
    }) as unknown as typeof globalThis.fetch;
    mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error("vector type missing"));

    const r = await searchByEmbedding({ orgId: "org1", queryText: "test" });
    expect(r).toEqual([]);
  });

  it("excludes REJECTED verdict via SQL filter", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ embedding: new Array(768).fill(0) }),
    }) as unknown as typeof globalThis.fetch;
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    await searchByEmbedding({ orgId: "org1", queryText: "test" });

    const sql = mockPrisma.$queryRawUnsafe.mock.calls[0][0];
    expect(sql).toContain(`verdict <> 'REJECTED'`);
  });
});

// ─── OLLAMA_URL validation (Gap #2) ─────────────────────────────────────

describe("OLLAMA_URL validation", () => {
  it("does not warn for default localhost", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ embedding: new Array(768).fill(0) }),
    }) as unknown as typeof globalThis.fetch;

    await embed("hello");

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("non-local"),
      expect.anything()
    );
    warnSpy.mockRestore();
  });

  it("warns once when OLLAMA_URL is non-local", async () => {
    process.env.OLLAMA_URL = "https://hosted-ollama.example.com";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ embedding: new Array(768).fill(0) }),
    }) as unknown as typeof globalThis.fetch;

    await embed("hello");
    await embed("world");  // second call must NOT re-warn

    const warnings = warnSpy.mock.calls.flat().filter(
      (a) => typeof a === "string" && /non-local/.test(a)
    );
    expect(warnings).toHaveLength(1);
    warnSpy.mockRestore();
  });

  it("OLLAMA_ALLOW_REMOTE=true silences the warning", async () => {
    process.env.OLLAMA_URL = "https://hosted-ollama.example.com";
    process.env.OLLAMA_ALLOW_REMOTE = "true";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ embedding: new Array(768).fill(0) }),
    }) as unknown as typeof globalThis.fetch;

    await embed("hello");

    const warnings = warnSpy.mock.calls.flat().filter(
      (a) => typeof a === "string" && /non-local/.test(a)
    );
    expect(warnings).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it("accepts host.docker.internal as local", async () => {
    process.env.OLLAMA_URL = "http://host.docker.internal:11434";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ embedding: new Array(768).fill(0) }),
    }) as unknown as typeof globalThis.fetch;

    await embed("hello");

    const warnings = warnSpy.mock.calls.flat().filter(
      (a) => typeof a === "string" && /non-local/.test(a)
    );
    expect(warnings).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it("falls back to default when URL is malformed", async () => {
    process.env.OLLAMA_URL = "not a url";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ embedding: new Array(768).fill(0) }),
    }) as unknown as typeof globalThis.fetch;

    await embed("hello");

    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>;
    const url = fetchSpy.mock.calls[0]![0];
    expect(url).toContain("localhost:11434");
    warnSpy.mockRestore();
  });
});

// ─── backfillEmbeddings() — bulk processor ────────────────────────────────

describe("backfillEmbeddings()", () => {
  it("returns zero counts when no rows need embedding", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    const r = await backfillEmbeddings({ orgId: "org1" });
    expect(r).toEqual({ embedded: 0, failed: 0, skipped: 0 });
  });

  it("scopes to orgId when provided (parameter passed to SQL)", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    await backfillEmbeddings({ orgId: "org1" });
    const args = mockPrisma.$queryRawUnsafe.mock.calls[0];
    expect(args[0]).toContain(`"orgId" = $1`);
    expect(args[1]).toBe("org1");
  });

  it("respects maxRows safety cap", async () => {
    // First batch: 3 rows. Second batch: 3 rows. maxRows=2 stops after 2 embed attempts.
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: "k1" }, { id: "k2" }, { id: "k3" }]);
    mockPrisma.orgBusinessKnowledge.findUnique
      .mockResolvedValue({ context: "x", answer: "y", annotation: null });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ embedding: new Array(768).fill(0) }),
    }) as unknown as typeof globalThis.fetch;
    mockPrisma.$executeRawUnsafe.mockResolvedValue(1);

    const r = await backfillEmbeddings({ orgId: "org1", maxRows: 2 });
    expect(r.embedded + r.failed).toBe(2);
  });
});
