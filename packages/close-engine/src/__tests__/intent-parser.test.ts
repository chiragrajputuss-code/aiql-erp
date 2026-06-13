import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseUserIntent, sanitiseWatchAccount } from "../intent-parser";

// We exercise the heuristic path (Layer 1) by default. The LLM (Layer 2)
// is deliberately not mocked here — those tests would require fetch interception
// and we'd be testing fetch wiring rather than the parser logic. Heuristic
// coverage is the safety net for the common short-prompt case.

describe("parseUserIntent — empty / whitespace", () => {
  it("returns empty intent for empty string", async () => {
    const r = await parseUserIntent("");
    expect(r.source).toBe("empty");
    expect(r.focusAreas).toEqual([]);
    expect(r.exclusions).toEqual([]);
    expect(r.confidence).toBe(0);
  });

  it("returns empty intent for whitespace", async () => {
    const r = await parseUserIntent("   \n  ");
    expect(r.source).toBe("empty");
  });
});

describe("parseUserIntent — heuristic focus detection", () => {
  beforeEach(() => {
    // Force heuristic path by removing the API key
    delete process.env.GROQ_API_KEY;
  });

  it("detects bank focus", async () => {
    const r = await parseUserIntent("focus on bank");
    expect(r.focusAreas).toContain("bank");
    expect(r.source).toBe("heuristic");
    expect(r.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("detects multiple areas in one prompt", async () => {
    const r = await parseUserIntent("check bank and inventory");
    expect(r.focusAreas).toContain("bank");
    expect(r.focusAreas).toContain("inventory");
  });

  it("detects salary in Hinglish", async () => {
    const r = await parseUserIntent("salary check karna hai");
    expect(r.focusAreas).toContain("salary");
  });

  it("detects GST", async () => {
    const r = await parseUserIntent("review CGST");
    expect(r.focusAreas).toContain("gst");
  });

  it("detects AR via 'debtor'", async () => {
    const r = await parseUserIntent("focus on debtor balances");
    expect(r.focusAreas).toContain("ar");
  });

  it("detects AP via 'creditor'", async () => {
    const r = await parseUserIntent("creditor recon needed");
    expect(r.focusAreas).toContain("ap");
  });
});

describe("parseUserIntent — exclusion detection", () => {
  beforeEach(() => { delete process.env.GROQ_API_KEY; });

  it("detects 'skip flux'", async () => {
    const r = await parseUserIntent("skip flux");
    expect(r.exclusions).toContain("flux-analysis");
  });

  it("detects 'no flux'", async () => {
    const r = await parseUserIntent("no flux this time");
    expect(r.exclusions).toContain("flux-analysis");
  });

  it("detects 'don't run flux'", async () => {
    const r = await parseUserIntent("don't run flux");
    expect(r.exclusions).toContain("flux-analysis");
  });

  it("detects 'skip GST'", async () => {
    const r = await parseUserIntent("skip GST");
    expect(r.exclusions).toContain("gst-recon");
  });

  it("detects 'skip balance sheet'", async () => {
    const r = await parseUserIntent("skip balance sheet");
    expect(r.exclusions).toContain("bs-review");
  });
});

describe("parseUserIntent — quoted account watch items", () => {
  beforeEach(() => { delete process.env.GROQ_API_KEY; });

  it("extracts a single quoted account name with original casing", async () => {
    const r = await parseUserIntent('watch "Petty Cash - Mumbai"');
    expect(r.watchAccounts).toContain("Petty Cash - Mumbai");
  });

  it("extracts multiple quoted account names with original casing", async () => {
    const r = await parseUserIntent('watch "Salary Advance" and "Bonus Payable"');
    expect(r.watchAccounts).toContain("Salary Advance");
    expect(r.watchAccounts).toContain("Bonus Payable");
  });

  it("ignores empty quotes", async () => {
    const r = await parseUserIntent('watch "" account');
    expect(r.watchAccounts).toEqual([]);
  });

  it("routes quoted account-signal names to watchAccounts, not watchParties", async () => {
    const r = await parseUserIntent('watch "HDFC Bank A/c" carefully');
    expect(r.watchAccounts).toContain("HDFC Bank A/c");
    expect(r.watchParties).toEqual([]);
  });

  it("routes quoted proper nouns (no account signal words) to watchParties", async () => {
    const r = await parseUserIntent('check "Ganesh Traders Pvt Ltd" for ITC');
    expect(r.watchParties).toContain("Ganesh Traders Pvt Ltd");
    expect(r.watchAccounts).toEqual([]);
  });

  it("routes mixed quoted strings correctly — account to watchAccounts, party to watchParties", async () => {
    const r = await parseUserIntent('watch "CGST Input" and check "Shree Services LLP"');
    expect(r.watchAccounts).toContain("CGST Input");
    expect(r.watchParties).toContain("Shree Services LLP");
  });
});

describe("parseUserIntent — unquoted party hint extraction", () => {
  beforeEach(() => { delete process.env.GROQ_API_KEY; });

  it("extracts party from 'check <Name>' pattern", async () => {
    const r = await parseUserIntent("check Ganesh Traders for gst");
    expect(r.watchParties).toContain("Ganesh Traders");
    expect(r.focusAreas).toContain("gst");
  });

  it("extracts party from 'verify <Name>' pattern", async () => {
    const r = await parseUserIntent("verify Shree Services LLP payment history");
    expect(r.watchParties.some((p) => p.toLowerCase().includes("shree"))).toBe(true);
  });

  it("extracts party from 'deep-dive <Name>' pattern", async () => {
    const r = await parseUserIntent("deep-dive Maa Suppliers for ITC gst");
    expect(r.watchParties.some((p) => p.toLowerCase().includes("maa"))).toBe(true);
  });

  it("deduplicates party fragments mentioned twice", async () => {
    const r = await parseUserIntent('check "Ganesh Traders" and also "Ganesh Traders"');
    const ganeshCount = r.watchParties.filter((p) => p === "Ganesh Traders").length;
    expect(ganeshCount).toBe(1);
  });

  it("watchParties is always present (not undefined) even when empty", async () => {
    const r = await parseUserIntent("focus on bank");
    expect(Array.isArray(r.watchParties)).toBe(true);
    expect(r.watchParties).toEqual([]);
  });
});

describe("parseUserIntent — combined patterns", () => {
  beforeEach(() => { delete process.env.GROQ_API_KEY; });

  it("focus + exclusion in same prompt", async () => {
    const r = await parseUserIntent("focus on bank, skip flux");
    expect(r.focusAreas).toContain("bank");
    expect(r.exclusions).toContain("flux-analysis");
  });

  it("focus + watch account", async () => {
    const r = await parseUserIntent('bank focus, watch "Cash on Hand"');
    expect(r.focusAreas).toContain("bank");
    expect(r.watchAccounts).toContain("Cash on Hand");
  });

  it("rationale is non-empty when matches exist", async () => {
    const r = await parseUserIntent("focus on bank");
    expect(r.rationale.length).toBeGreaterThan(0);
  });
});

describe("parseUserIntent — graceful degradation", () => {
  beforeEach(() => { delete process.env.GROQ_API_KEY; });

  it("returns empty intent when no patterns match and LLM unavailable", async () => {
    const r = await parseUserIntent("xyzabc unknown phrase 12345");
    // No patterns matched + no LLM key → falls through to empty
    expect(r.source).toBe("empty");
  });

  it("does not throw on weird input", async () => {
    await expect(parseUserIntent("!!!@@@###")).resolves.toBeDefined();
  });
});

describe("parseUserIntent — edge cases", () => {
  beforeEach(() => { delete process.env.GROQ_API_KEY; });

  it("handles very long input without truncation crashes", async () => {
    const longInput = "focus on bank ".repeat(500);
    await expect(parseUserIntent(longInput)).resolves.toBeDefined();
  });

  it("handles contradictory input gracefully (focus + skip same area)", async () => {
    // Pure heuristic — both signals present, parser should record both
    // and let downstream code decide. Truthful parse beats silent dropping.
    const r = await parseUserIntent("focus on flux, skip flux");
    expect(r.focusAreas).toContain("flux");
    expect(r.exclusions).toContain("flux-analysis");
  });

  it("handles input with only punctuation", async () => {
    const r = await parseUserIntent("...!!!???");
    expect(r.source).toBe("empty");
  });

  it("handles unsupported language gracefully (Tamil)", async () => {
    // No keywords match — no LLM key — falls through to empty
    const r = await parseUserIntent("வங்கி கணக்கு பார்க்க வேண்டும்");
    expect(r.source).toBe("empty");
  });

  it("strips overly long quoted account names", async () => {
    const longName = "x".repeat(200);
    const r = await parseUserIntent(`watch "${longName}"`);
    // Quoted regex caps at 50 chars, so this should NOT match
    expect(r.watchAccounts).toEqual([]);
  });

  it("deduplicates watch accounts mentioned twice (case-insensitive)", async () => {
    const r = await parseUserIntent('watch "Bank A" and also "BANK a"');
    expect(r.watchAccounts).toHaveLength(1);
    // First-seen casing wins
    expect(r.watchAccounts[0]).toBe("Bank A");
  });

  it("does not treat comma-separated keywords as one focus area", async () => {
    const r = await parseUserIntent("bank, cash, salary");
    expect(r.focusAreas).toContain("bank");
    expect(r.focusAreas).toContain("cash");
    expect(r.focusAreas).toContain("salary");
  });
});

describe("sanitiseWatchAccount — SQL-safety allow-list", () => {
  it("accepts plain account names with original casing preserved", () => {
    expect(sanitiseWatchAccount("Petty Cash Mumbai")).toBe("Petty Cash Mumbai");
    expect(sanitiseWatchAccount("Salary Advance")).toBe("Salary Advance");
    expect(sanitiseWatchAccount("Sundry Creditors / Local")).toBe("Sundry Creditors / Local");
  });

  it("accepts names with allowed punctuation", () => {
    expect(sanitiseWatchAccount("HDFC Bank - Current A/c")).toBe("HDFC Bank - Current A/c");
    expect(sanitiseWatchAccount("M&S Trading Co.")).toBe("M&S Trading Co.");
    expect(sanitiseWatchAccount("Sales (Domestic)")).toBe("Sales (Domestic)");
    expect(sanitiseWatchAccount("Loan_2026")).toBe("Loan_2026");
  });

  it("accepts non-Latin scripts (Devanagari, Tamil) — \\p{L} covers Unicode letters", () => {
    expect(sanitiseWatchAccount("नकद")).toBe("नकद");
    expect(sanitiseWatchAccount("வங்கி")).toBe("வங்கி");
  });

  it("rejects empty / whitespace-only", () => {
    expect(sanitiseWatchAccount("")).toBeNull();
    expect(sanitiseWatchAccount("   ")).toBeNull();
    expect(sanitiseWatchAccount("\t\n")).toBeNull();
  });

  it("rejects single-quote injection (the classic vector)", () => {
    expect(sanitiseWatchAccount("foo' OR '1'='1")).toBeNull();
    expect(sanitiseWatchAccount("'; DROP TABLE users; --")).toBeNull();
  });

  it("preserves original casing (does NOT lowercase)", () => {
    expect(sanitiseWatchAccount("HDFC")).toBe("HDFC");
    expect(sanitiseWatchAccount("MixedCaseAccount")).toBe("MixedCaseAccount");
  });

  it("rejects double-quote injection", () => {
    expect(sanitiseWatchAccount('foo" OR "x"="x')).toBeNull();
  });

  it("rejects SQL comment markers", () => {
    expect(sanitiseWatchAccount("foo -- comment")).toBeNull();
    expect(sanitiseWatchAccount("foo /* block */")).toBeNull();
  });

  it("rejects semicolons (statement separators)", () => {
    expect(sanitiseWatchAccount("foo; SELECT 1")).toBeNull();
  });

  it("rejects backslashes (escape character)", () => {
    expect(sanitiseWatchAccount("foo\\")).toBeNull();
  });

  it("rejects percent / underscore (LIKE wildcards) — these would let the user steer the LIKE pattern", () => {
    expect(sanitiseWatchAccount("foo%bar")).toBeNull();
    expect(sanitiseWatchAccount("foo%_bar")).toBeNull();
  });

  it("UNION SELECT keyword payload is harmless because it stays inside the LIKE literal — but we accept it as a normal-looking string", () => {
    // Security analysis: this fragment is interpolated into LIKE '%...%' which
    // wraps it in a single-quoted string literal. Without an unescaped quote
    // (forbidden above), no character — including the words UNION/SELECT —
    // can escape that literal. So this is just a weird account-name search.
    // We document the model here rather than over-blocking legitimate names
    // that happen to contain English keywords.
    expect(sanitiseWatchAccount("foo union select pg_sleep")).toBe("foo union select pg_sleep");
  });

  it("rejects UNION SELECT payloads that include real injection vectors (the parens with colon-quote)", () => {
    expect(sanitiseWatchAccount("foo' UNION SELECT 1--")).toBeNull();
  });

  it("rejects null bytes", () => {
    expect(sanitiseWatchAccount("foo\0bar")).toBeNull();
  });

  it("rejects newlines and tabs", () => {
    expect(sanitiseWatchAccount("foo\nbar")).toBeNull();
    expect(sanitiseWatchAccount("foo\tbar")).toBeNull();
  });

  it("rejects strings exceeding length cap (50 chars)", () => {
    expect(sanitiseWatchAccount("a".repeat(51))).toBeNull();
    expect(sanitiseWatchAccount("a".repeat(50))).toBe("a".repeat(50));
  });

  it("rejects non-string input", () => {
    // @ts-expect-error testing runtime behaviour with bad input
    expect(sanitiseWatchAccount(123)).toBeNull();
    // @ts-expect-error testing runtime behaviour with bad input
    expect(sanitiseWatchAccount(null)).toBeNull();
    // @ts-expect-error testing runtime behaviour with bad input
    expect(sanitiseWatchAccount(undefined)).toBeNull();
  });

  it("trims surrounding whitespace before validating", () => {
    expect(sanitiseWatchAccount("  bank  ")).toBe("bank");
  });
});

describe("parseUserIntent — injection-resistant heuristic", () => {
  beforeEach(() => { delete process.env.GROQ_API_KEY; });

  it("filters out injected quoted fragments from watchAccounts", async () => {
    const r = await parseUserIntent(`watch "valid bank account" and "'; DROP TABLE--"`);
    expect(r.watchAccounts).toEqual(["valid bank account"]);
  });

  it("rejects all watch fragments when only injection vectors are present", async () => {
    const r = await parseUserIntent(`watch "foo'; DELETE FROM users; --"`);
    expect(r.watchAccounts).toEqual([]);
    expect(r.watchParties).toEqual([]);
  });

  it("rejects watch fragments with LIKE wildcards in both account and party buckets", async () => {
    const r = await parseUserIntent(`watch "%admin%" and check "%Vendor%"`);
    expect(r.watchAccounts).toEqual([]);
    expect(r.watchParties).toEqual([]);
  });

  it("SQL-safety gate also applies to watchParties from quoted strings", async () => {
    const r = await parseUserIntent(`check "Ganesh Traders' OR '1'='1"`);
    expect(r.watchParties).toEqual([]);
  });
});

describe("parseUserIntent — LLM path with mock fetch", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    process.env.GROQ_API_KEY = "test-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
  });

  it("uses LLM output when heuristic confidence is low", async () => {
    const mockResponse = {
      focusAreas:    ["salary", "bank"],
      watchAccounts: ["bonus march"],
      watchParties:  [],
      exclusions:    [],
      riskFlags:     ["one-time bonus paid"],
      oneOffEvents:  ["march bonus payout"],
      ambiguities:   [],
      confidence:    0.85,
      rationale:     "Focus on salary and bank for March bonus event.",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify(mockResponse) } }],
      }),
    }) as unknown as typeof globalThis.fetch;

    // Long ambiguous prompt — heuristic confidence will be ≤ 0.6 → falls to LLM
    const r = await parseUserIntent(
      "we paid a one-time bonus in March that was significantly larger than usual, please make sure salary and bank balances reflect this correctly"
    );

    expect(r.source).toBe("llm");
    expect(r.focusAreas).toContain("salary");
    expect(r.riskFlags).toContain("one-time bonus paid");
    expect(r.confidence).toBe(0.85);
  });

  it("falls back to heuristic when LLM returns invalid JSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve({
        choices: [{ message: { content: "not json at all" } }],
      }),
    }) as unknown as typeof globalThis.fetch;

    const r = await parseUserIntent("focus on bank");
    expect(r.source).toBe("heuristic");
    expect(r.focusAreas).toContain("bank");
  });

  it("filters out invalid focus areas from LLM output", async () => {
    const mockResponse = {
      focusAreas:    ["bank", "definitely_not_a_real_area", "ar"],
      watchAccounts: [],
      exclusions:    [],
      riskFlags:     [],
      oneOffEvents:  [],
      ambiguities:   [],
      confidence:    0.7,
      rationale:     "ok",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify(mockResponse) } }],
      }),
    }) as unknown as typeof globalThis.fetch;

    const r = await parseUserIntent(
      "we paid a one-time bonus in March that was significantly larger than usual, please make sure salary and bank balances reflect this correctly"
    );

    expect(r.focusAreas).toEqual(["bank", "ar"]);
    expect(r.focusAreas).not.toContain("definitely_not_a_real_area");
  });

  it("extracts watchParties from LLM output and applies SQL-safety gate", async () => {
    const mockResponse = {
      focusAreas:    ["gst", "ap"],
      watchAccounts: ["cgst input"],
      watchParties:  ["Ganesh Traders", "Shree Services LLP", "bad'; DROP--"],
      exclusions:    [],
      riskFlags:     ["ITC mismatch for Ganesh Traders"],
      oneOffEvents:  [],
      ambiguities:   [],
      confidence:    0.9,
      rationale:     "Deep-dive Ganesh Traders and Shree Services for GST ITC reconciliation.",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify(mockResponse) } }],
      }),
    }) as unknown as typeof globalThis.fetch;

    const r = await parseUserIntent(
      "GST notice received — check Ganesh Traders and Shree Services LLP ITC entries carefully, there may be a GSTR-2B mismatch"
    );

    expect(r.source).toBe("llm");
    expect(r.watchParties).toContain("Ganesh Traders");
    expect(r.watchParties).toContain("Shree Services LLP");
    // Injection payload must be stripped
    expect(r.watchParties).not.toContain("bad'; DROP--");
    expect(r.focusAreas).toContain("gst");
  });

  it("clamps LLM confidence to [0, 1]", async () => {
    const mockResponse = {
      focusAreas:    ["bank"],
      watchAccounts: [],
      exclusions:    [],
      riskFlags:     [],
      oneOffEvents:  [],
      ambiguities:   [],
      confidence:    1.5,
      rationale:     "ok",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify(mockResponse) } }],
      }),
    }) as unknown as typeof globalThis.fetch;

    const r = await parseUserIntent(
      "we paid a one-time bonus in March that was significantly larger than usual, please make sure salary and bank balances reflect this correctly"
    );

    expect(r.confidence).toBeLessThanOrEqual(1);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
  });
});
