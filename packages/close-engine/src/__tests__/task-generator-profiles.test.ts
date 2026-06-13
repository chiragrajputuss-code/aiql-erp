import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the dependencies before importing the module under test
vi.mock("../utils/column-mapping", () => ({
  loadAccountTypeMap: vi.fn(),
  accountsByType:     vi.fn(),
}));
vi.mock("../scanner", () => ({
  runDataQualityScan: vi.fn(),
}));

import { generateAdaptiveTemplate } from "../task-generator";
import { loadAccountTypeMap, accountsByType } from "../utils/column-mapping";
import { runDataQualityScan } from "../scanner";
import type { CloseIntent } from "../intent-parser";

const mockLoad = loadAccountTypeMap as ReturnType<typeof vi.fn>;
const mockBuckets = accountsByType as ReturnType<typeof vi.fn>;
const mockScan = runDataQualityScan as ReturnType<typeof vi.fn>;

const FULL_BUCKETS = {
  bank:       ["HDFC Bank", "Petty Cash"],
  payable:    ["Sundry Creditors"],
  receivable: ["Sundry Debtors"],
  tax:        ["CGST Output", "SGST Output"],
  inventory:  ["Closing Stock"],
};

const EMPTY_BUCKETS = {
  bank: [], payable: [], receivable: [], tax: [], inventory: [],
};

const NO_ISSUES_SCAN = {
  connectionId: "c1",
  startDate:    new Date("2026-04-01"),
  endDate:      new Date("2026-04-30"),
  scannedAt:    new Date(),
  issues:       [],
  durationMs:   0,
} as never;

const SOME_ISSUES_SCAN = {
  connectionId: "c1",
  startDate:    new Date("2026-04-01"),
  endDate:      new Date("2026-04-30"),
  scannedAt:    new Date(),
  durationMs:   0,
  issues: [
    { code: "voucher_imbalance", severity: "critical", title: "Dr ≠ Cr",
      description: "x", affectedRows: 3, exposure: 5000, examples: [] },
    { code: "missing_fields", severity: "review", title: "Missing fields",
      description: "x", affectedRows: 2, exposure: 0, examples: [] },
    { code: "date_outliers", severity: "info", title: "Date outliers",
      description: "x", affectedRows: 1, exposure: 0, examples: [] },
  ],
} as never;

beforeEach(() => {
  mockLoad.mockResolvedValue(new Map());
  mockBuckets.mockReturnValue(FULL_BUCKETS);
  mockScan.mockResolvedValue(NO_ISSUES_SCAN);
});

describe("generateAdaptiveTemplate — STANDARD profile", () => {
  it("generates the full task list with all recons", async () => {
    const r = await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"));
    const keys = r.template.tasks.map((t) => t.key);

    expect(keys).toContain("opening-balance");
    expect(keys).toContain("bank-recon");
    expect(keys).toContain("ap-recon");
    expect(keys).toContain("ar-recon");
    expect(keys).toContain("gst-recon");
    expect(keys).toContain("inventory-recon");
    expect(keys).toContain("pl-review");
    expect(keys).toContain("bs-review");
    expect(keys).toContain("flux-analysis");
    expect(keys).toContain("cfo-signoff");
  });

  it("template name reflects profile", async () => {
    const r = await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"));
    expect(r.template.name).toBe("Standard Monthly Close");
    expect(r.template.periodType).toBe("MONTHLY");
  });
});

describe("generateAdaptiveTemplate — QUICK profile", () => {
  it("strips out account recons, keeps bank + PL + sign-off", async () => {
    const r = await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"), {
      profile: "QUICK",
    });
    const keys = r.template.tasks.map((t) => t.key);

    expect(keys).toContain("opening-balance");
    expect(keys).toContain("bank-recon");
    expect(keys).toContain("pl-review");
    expect(keys).toContain("cfo-signoff");

    expect(keys).not.toContain("ap-recon");
    expect(keys).not.toContain("ar-recon");
    expect(keys).not.toContain("gst-recon");
    expect(keys).not.toContain("inventory-recon");
    expect(keys).not.toContain("bs-review");
    expect(keys).not.toContain("flux-analysis");
  });

  it("only includes critical issues, drops review-severity", async () => {
    mockScan.mockResolvedValue(SOME_ISSUES_SCAN);
    const r = await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"), {
      profile: "QUICK",
    });
    const keys = r.template.tasks.map((t) => t.key);

    expect(keys).toContain("fix-voucher_imbalance");      // critical → kept
    expect(keys).not.toContain("fix-missing_fields");      // review → dropped
    expect(keys).not.toContain("fix-date_outliers");       // info → always dropped
  });

  it("template name is 'Quick Close'", async () => {
    const r = await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"), {
      profile: "QUICK",
    });
    expect(r.template.name).toBe("Quick Close");
  });
});

describe("generateAdaptiveTemplate — YEAR_END profile", () => {
  it("adds year-end extras and uses ANNUAL period type", async () => {
    const r = await generateAdaptiveTemplate("c1", new Date("2025-04-01"), new Date("2026-03-31"), {
      profile: "YEAR_END",
    });
    const keys = r.template.tasks.map((t) => t.key);

    expect(keys).toContain("ye-accruals");
    expect(keys).toContain("ye-depreciation");
    expect(keys).toContain("ye-26as");
    expect(keys).toContain("ye-physical-count");  // because inventory accounts exist
    expect(r.template.periodType).toBe("ANNUAL");
    expect(r.template.name).toBe("Year-End Close");
  });

  it("skips physical count when no inventory accounts", async () => {
    mockBuckets.mockReturnValue({ ...FULL_BUCKETS, inventory: [] });
    const r = await generateAdaptiveTemplate("c1", new Date("2025-04-01"), new Date("2026-03-31"), {
      profile: "YEAR_END",
    });
    const keys = r.template.tasks.map((t) => t.key);
    expect(keys).not.toContain("ye-physical-count");
    expect(keys).toContain("ye-accruals");  // still includes other YE extras
  });

  it("uses Year-on-Year flux title", async () => {
    const r = await generateAdaptiveTemplate("c1", new Date("2025-04-01"), new Date("2026-03-31"), {
      profile: "YEAR_END",
    });
    const flux = r.template.tasks.find((t) => t.key === "flux-analysis");
    expect(flux?.title).toBe("Year-on-Year Flux Analysis");
  });
});

describe("generateAdaptiveTemplate — ADAPTIVE profile with intent", () => {
  const makeIntent = (overrides: Partial<CloseIntent> = {}): CloseIntent => ({
    focusAreas:    [],
    watchAccounts: [],
    exclusions:    [],
    riskFlags:     [],
    oneOffEvents:  [],
    ambiguities:   [],
    confidence:    0.9,
    rationale:     "test",
    source:        "llm",
    ...overrides,
  });

  it("respects exclusions: skip flux", async () => {
    const r = await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"), {
      profile: "ADAPTIVE",
      intent:  makeIntent({ exclusions: ["flux-analysis"] }),
    });
    const keys = r.template.tasks.map((t) => t.key);
    expect(keys).not.toContain("flux-analysis");
  });

  it("respects exclusions: skip GST recon", async () => {
    const r = await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"), {
      profile: "ADAPTIVE",
      intent:  makeIntent({ exclusions: ["gst-recon"] }),
    });
    const keys = r.template.tasks.map((t) => t.key);
    expect(keys).not.toContain("gst-recon");
  });

  it("creates watch tasks for user-specified accounts", async () => {
    const r = await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"), {
      profile: "ADAPTIVE",
      intent:  makeIntent({ watchAccounts: ["salary advance", "bonus payable"] }),
    });
    const keys = r.template.tasks.map((t) => t.key);
    expect(keys).toContain("watch-salary-advance");
    expect(keys).toContain("watch-bonus-payable");
  });

  it("creates a consolidated risk-review task for risk flags", async () => {
    const r = await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"), {
      profile: "ADAPTIVE",
      intent:  makeIntent({
        riskFlags:    ["GST rate changed mid-month"],
        oneOffEvents: ["one-time bonus payout"],
      }),
    });
    const task = r.template.tasks.find((t) => t.key === "user-risk-review");
    expect(task).toBeDefined();
    expect(task?.description).toContain("GST rate changed mid-month");
    expect(task?.description).toContain("one-time bonus payout");
  });

  it("user-flagged tasks come first in sort order", async () => {
    const r = await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"), {
      profile: "ADAPTIVE",
      intent:  makeIntent({ watchAccounts: ["depreciation"] }),
    });
    const watchTask  = r.template.tasks.find((t) => t.key === "watch-depreciation");
    const openingTask = r.template.tasks.find((t) => t.key === "opening-balance");
    expect(watchTask).toBeDefined();
    expect(openingTask).toBeDefined();
    expect(watchTask!.sortOrder).toBeLessThan(openingTask!.sortOrder);
  });

  it("works with no intent (falls back to STANDARD-equivalent)", async () => {
    const r = await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"), {
      profile: "ADAPTIVE",
      intent:  null,
    });
    const keys = r.template.tasks.map((t) => t.key);
    expect(keys).toContain("opening-balance");
    expect(keys).toContain("bank-recon");
    expect(keys).toContain("flux-analysis");
  });
});

describe("generateAdaptiveTemplate — empty data", () => {
  it("only generates always-included tasks when no accounts and no issues", async () => {
    mockBuckets.mockReturnValue(EMPTY_BUCKETS);
    const r = await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"));
    const keys = r.template.tasks.map((t) => t.key);

    expect(keys).toContain("opening-balance");
    expect(keys).toContain("pl-review");
    expect(keys).toContain("bs-review");
    expect(keys).toContain("flux-analysis");
    expect(keys).toContain("cfo-signoff");

    expect(keys).not.toContain("bank-recon");
    expect(keys).not.toContain("ap-recon");
    expect(keys).not.toContain("ar-recon");
    expect(keys).not.toContain("gst-recon");
    expect(keys).not.toContain("inventory-recon");
  });
});

describe("generateAdaptiveTemplate — SQL safety on watch fragments", () => {
  const makeIntent = (watchAccounts: string[]): CloseIntent => ({
    focusAreas:    [],
    watchAccounts,
    exclusions:    [],
    riskFlags:     [],
    oneOffEvents:  [],
    ambiguities:   [],
    confidence:    0.9,
    rationale:     "test",
    source:        "llm",
  });

  it("skips watch tasks for fragments rejected by the safety check", async () => {
    // sanitiseWatchAccount in intent-parser is the first gate, but the
    // task-generator gate is the defence-in-depth fallback. Simulate a
    // bypassed first gate by passing raw unsafe strings on the intent.
    const r = await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"), {
      profile: "ADAPTIVE",
      intent:  makeIntent(["valid name", "foo'; DROP--", "%wildcard%"]),
    });
    const watchKeys = r.template.tasks.filter((t) => t.key.startsWith("watch-")).map((t) => t.key);
    expect(watchKeys).toContain("watch-valid-name");
    expect(watchKeys).toHaveLength(1);
  });

  it("records reasoning for skipped unsafe fragments", async () => {
    const r = await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"), {
      profile: "ADAPTIVE",
      intent:  makeIntent(["foo'; DROP--"]),
    });
    expect(r.reasoning.some((line) => line.includes("rejected by SQL safety check"))).toBe(true);
  });

  it("watch fragment is bound as a parameter, not interpolated into SQL", async () => {
    const r = await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"), {
      profile: "ADAPTIVE",
      intent:  makeIntent(["Petty Cash Mumbai"]),
    });
    const watchTask = r.template.tasks.find((t) => t.key === "watch-petty-cash-mumbai");
    expect(watchTask).toBeDefined();

    const recon = watchTask!.reconciliation!;
    // The SQL itself must NOT contain the user-supplied fragment — it uses $1
    expect(recon.sourceQuery).toContain("$1");
    expect(recon.sourceQuery).not.toContain("petty cash mumbai");
    expect(recon.targetQuery).toContain("$1");
    expect(recon.detailQuery).toContain("$1");
    // The fragment lives in params, lowercased + wrapped in % wildcards
    expect(recon.params).toEqual(["%petty cash mumbai%"]);
  });
});

describe("generateAdaptiveTemplate — pre-fetched context (W3.1 optimisation)", () => {
  it("uses pre-fetched context and does NOT re-call loadAccountTypeMap or runDataQualityScan", async () => {
    mockLoad.mockClear();
    mockScan.mockClear();
    const ctx = {
      accounts:   FULL_BUCKETS,
      scanResult: NO_ISSUES_SCAN,
    };

    await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"), {
      profile: "STANDARD",
      context: ctx,
    });

    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockScan).not.toHaveBeenCalled();
  });

  it("falls back to fetching context when not provided (backward compat)", async () => {
    mockLoad.mockClear();
    mockScan.mockClear();
    await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"));
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(mockScan).toHaveBeenCalledTimes(1);
  });

  it("two generations sharing one context → DB calls happen once total", async () => {
    mockLoad.mockClear();
    mockScan.mockClear();
    const ctx = {
      accounts:   FULL_BUCKETS,
      scanResult: NO_ISSUES_SCAN,
    };

    await Promise.all([
      generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"), {
        profile: "QUICK", context: ctx,
      }),
      generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"), {
        profile: "STANDARD", context: ctx,
      }),
    ]);

    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockScan).not.toHaveBeenCalled();
  });
});

describe("generateAdaptiveTemplate — backward compatibility", () => {
  it("matches STANDARD output when called with no options arg", async () => {
    const noArgs   = await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"));
    const standard = await generateAdaptiveTemplate("c1", new Date("2026-04-01"), new Date("2026-04-30"), {
      profile: "STANDARD",
    });
    expect(noArgs.template.tasks.map((t) => t.key))
      .toEqual(standard.template.tasks.map((t) => t.key));
  });
});
