import { describe, it, expect } from "vitest";
import {
  patternKeyForScanIssue,
  patternKeyForRecon,
  patternKeyForFlux,
  patternKeyForAgentQuestion,
  patternKeyForManual,
  appendHistory,
  shortHash,
  type KnowledgeHistoryEntry,
} from "../knowledge";

describe("patternKeyForScanIssue", () => {
  it("builds a deterministic key from issue code", () => {
    const k = patternKeyForScanIssue({ issueCode: "voucher_imbalance" });
    expect(k.patternKey).toBe("scan:voucher-imbalance");
    expect(k.source).toBe("SCAN_ISSUE");
  });

  it("includes account name when provided", () => {
    const k = patternKeyForScanIssue({
      issueCode: "sign_anomalies",
      accountName: "Petty Cash Mumbai",
    });
    expect(k.patternKey).toBe("scan:sign-anomalies:petty-cash-mumbai");
  });

  it("captures sourceRef for context display", () => {
    const k = patternKeyForScanIssue({ issueCode: "duplicate_transactions" });
    expect(k.sourceRef).toEqual({
      issueCode:   "duplicate_transactions",
      accountName: undefined,
    });
  });

  it("normalises case so different casings produce identical keys", () => {
    const a = patternKeyForScanIssue({ issueCode: "VOUCHER_IMBALANCE" });
    const b = patternKeyForScanIssue({ issueCode: "voucher_imbalance" });
    expect(a.patternKey).toBe(b.patternKey);
  });
});

describe("patternKeyForRecon", () => {
  it("derives from recon name", () => {
    const k = patternKeyForRecon({ reconName: "Bank Internal Consistency Check" });
    expect(k.patternKey).toBe("recon:bank-internal-consistency-check");
    expect(k.source).toBe("RECONCILIATION");
  });

  it("strips special chars", () => {
    const k = patternKeyForRecon({ reconName: "AP Control vs Vendor Subsidiary" });
    expect(k.patternKey).toBe("recon:ap-control-vs-vendor-subsidiary");
  });
});

describe("patternKeyForFlux", () => {
  it("uses month, account, and direction — same month/account/direction = same key", () => {
    const a = patternKeyForFlux({
      accountName: "Salary Expense",
      periodEnd:   "2026-03-31",
      direction:   "increase",
    });
    const b = patternKeyForFlux({
      accountName: "Salary Expense",
      periodEnd:   "2025-03-31",
      direction:   "increase",
    });
    expect(a.patternKey).toBe(b.patternKey);
    expect(a.patternKey).toContain("flux:salary-expense");
    expect(a.patternKey).toContain(":mar:");
    expect(a.patternKey).toContain(":increase");
  });

  it("different month → different key (so March bonus doesn't auto-resolve October bonus)", () => {
    const march = patternKeyForFlux({
      accountName: "Salary Expense",
      periodEnd:   "2026-03-31",
      direction:   "increase",
    });
    const oct = patternKeyForFlux({
      accountName: "Salary Expense",
      periodEnd:   "2026-10-31",
      direction:   "increase",
    });
    expect(march.patternKey).not.toBe(oct.patternKey);
  });

  it("opposite direction → different key", () => {
    const up = patternKeyForFlux({
      accountName: "Sales", periodEnd: "2026-03-31", direction: "increase",
    });
    const down = patternKeyForFlux({
      accountName: "Sales", periodEnd: "2026-03-31", direction: "decrease",
    });
    expect(up.patternKey).not.toBe(down.patternKey);
  });

  it("handles Date objects same as ISO strings", () => {
    const fromDate = patternKeyForFlux({
      accountName: "Sales",
      periodEnd:   new Date("2026-03-31T00:00:00Z"),
      direction:   "increase",
    });
    const fromString = patternKeyForFlux({
      accountName: "Sales",
      periodEnd:   "2026-03-31T00:00:00Z",
      direction:   "increase",
    });
    expect(fromDate.patternKey).toBe(fromString.patternKey);
  });

  it("recovers from invalid date input", () => {
    const k = patternKeyForFlux({
      accountName: "Sales",
      periodEnd:   "not-a-date",
      direction:   "increase",
    });
    expect(k.patternKey).toContain("unknown");
  });
});

describe("patternKeyForAgentQuestion", () => {
  it("hashes question text so same question = same key", () => {
    const a = patternKeyForAgentQuestion({
      agentType: "pl_review",
      question:  "Why did the salary expense jump?",
    });
    const b = patternKeyForAgentQuestion({
      agentType: "pl_review",
      question:  "Why did the salary expense jump?",
    });
    expect(a.patternKey).toBe(b.patternKey);
  });

  it("different question text → different key", () => {
    const a = patternKeyForAgentQuestion({
      agentType: "pl_review",
      question:  "Why did the salary expense jump?",
    });
    const b = patternKeyForAgentQuestion({
      agentType: "pl_review",
      question:  "Why did the rent expense jump?",
    });
    expect(a.patternKey).not.toBe(b.patternKey);
  });

  it("includes agent type so the same question in different agents differs", () => {
    const a = patternKeyForAgentQuestion({
      agentType: "pl_review", question: "Anything unusual?",
    });
    const b = patternKeyForAgentQuestion({
      agentType: "bs_review", question: "Anything unusual?",
    });
    expect(a.patternKey).not.toBe(b.patternKey);
  });
});

describe("patternKeyForManual", () => {
  it("derives from topic", () => {
    const k = patternKeyForManual({ topic: "Bonus paid every March" });
    expect(k.patternKey).toBe("manual:bonus-paid-every-march");
    expect(k.source).toBe("MANUAL");
  });
});

describe("shortHash", () => {
  it("is deterministic", () => {
    expect(shortHash("hello world")).toBe(shortHash("hello world"));
  });

  it("is not all zeros for short input", () => {
    expect(shortHash("a")).not.toBe("00000000");
  });

  it("differs across different inputs", () => {
    const a = shortHash("question one");
    const b = shortHash("question two");
    expect(a).not.toBe(b);
  });

  it("is fixed-length 8 chars regardless of input", () => {
    expect(shortHash("x")).toHaveLength(8);
    expect(shortHash("a much longer string of text")).toHaveLength(8);
    expect(shortHash("")).toHaveLength(8);  // even empty hashes to a fixed length
  });
});

describe("appendHistory", () => {
  const T0 = "2026-03-01T00:00:00.000Z";
  const T1 = "2026-04-01T00:00:00.000Z";

  function entry(askedAt: string, verdict: KnowledgeHistoryEntry["verdict"] = "NORMAL"): KnowledgeHistoryEntry {
    return { askedAt, answeredAt: askedAt, verdict, annotation: null };
  }

  it("creates a single-entry history from null", () => {
    const out = appendHistory(null, entry(T0));
    const parsed = JSON.parse(out) as KnowledgeHistoryEntry[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.askedAt).toBe(T0);
  });

  it("appends to existing history", () => {
    const round1 = appendHistory(null, entry(T0));
    const round2 = appendHistory(round1, entry(T1));
    const parsed = JSON.parse(round2) as KnowledgeHistoryEntry[];
    expect(parsed).toHaveLength(2);
  });

  it("caps history at default 20 entries", () => {
    let json: string | null = null;
    for (let i = 0; i < 30; i++) {
      json = appendHistory(json, entry(`2026-${String((i % 12) + 1).padStart(2, "0")}-01T00:00:00.000Z`));
    }
    const parsed = JSON.parse(json!) as KnowledgeHistoryEntry[];
    expect(parsed).toHaveLength(20);
  });

  it("respects custom cap", () => {
    let json: string | null = null;
    for (let i = 0; i < 10; i++) {
      json = appendHistory(json, entry(T0), 3);
    }
    const parsed = JSON.parse(json!) as KnowledgeHistoryEntry[];
    expect(parsed).toHaveLength(3);
  });

  it("recovers from malformed prior JSON", () => {
    const out = appendHistory("not json", entry(T0));
    const parsed = JSON.parse(out) as KnowledgeHistoryEntry[];
    expect(parsed).toHaveLength(1);
  });

  it("filters out malformed entries when reading prior history", () => {
    const broken = JSON.stringify([
      { askedAt: T0, answeredAt: T0, verdict: "NORMAL", annotation: null },
      { wrong: "shape" },
      "not an object",
      null,
    ]);
    const out = appendHistory(broken, entry(T1));
    const parsed = JSON.parse(out) as KnowledgeHistoryEntry[];
    expect(parsed).toHaveLength(2);  // 1 valid + 1 new
  });

  it("preserves verdict and annotation on each entry", () => {
    const out = appendHistory(null, {
      askedAt:    T0,
      answeredAt: T0,
      verdict:    "ANNOTATED",
      annotation: "Annual bonus, paid every March",
    });
    const parsed = JSON.parse(out) as KnowledgeHistoryEntry[];
    expect(parsed[0]?.verdict).toBe("ANNOTATED");
    expect(parsed[0]?.annotation).toBe("Annual bonus, paid every March");
  });
});
