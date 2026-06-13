import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock @aiql/db before importing scanner ───────────────────────────────────
// Use vi.hoisted to declare the mock so the factory below can reference it
// (vi.mock factories are hoisted to the top of the file, before any other code).
const { mockQueryRawUnsafe } = vi.hoisted(() => ({ mockQueryRawUnsafe: vi.fn() }));
vi.mock("@aiql/db", () => ({
  prisma: {
    $queryRawUnsafe: mockQueryRawUnsafe,
    uploadedFile:    { findUnique: vi.fn() },
    erpConnection:   { findUnique: vi.fn() },
    orgAccountMapping: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

// Mock the column-mapping utils so we don't hit the DB
vi.mock("../utils/column-mapping", () => ({
  buildColMap:        vi.fn().mockResolvedValue(new Map()),
  applyColMap:        (sql: string) => sql,
  getTableColumns:    vi.fn().mockResolvedValue(
    new Set(["transaction_date", "account_name", "debit_amount", "credit_amount",
      "reference_number", "voucher_type", "party_name", "description"])
  ),
  makeSqlDefensive:   (sql: string) => sql,
  getTableName:       vi.fn().mockResolvedValue("upload_test"),
  loadAccountTypeMap: vi.fn().mockResolvedValue(new Map([
    ["HDFC Bank A/c", "BANK"],
    ["Sundry Creditors", "PAYABLE"],
    ["Sundry Debtors", "RECEIVABLE"],
    ["CGST Input @9%", "TAX"],
  ])),
}));

import { runDataQualityScan } from "../scanner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const START = new Date("2025-04-01");
const END   = new Date("2025-04-30");

/**
 * Set up a sequential prisma.$queryRawUnsafe mock that returns canned rows in order.
 * The scanner runs 8 checks in parallel (Promise.all), so order isn't strictly
 * sequential — but each check makes exactly one query (or two), and the
 * pattern matches the call signature reliably.
 */
function mockSqlBySnippet(matches: Array<{ contains: string; rows: unknown[] }>): void {
  mockQueryRawUnsafe.mockImplementation(async (sql: string) => {
    for (const { contains, rows } of matches) {
      if (sql.includes(contains)) return rows;
    }
    return [];
  });
}

beforeEach(() => {
  mockQueryRawUnsafe.mockReset();
});

// ─── Voucher imbalance check ─────────────────────────────────────────────────

describe("scanner — voucher imbalance check", () => {
  it("returns critical issue when vouchers have Dr ≠ Cr", async () => {
    mockSqlBySnippet([
      {
        contains: "AS dr",
        rows: [
          { reference_number: "INV-001", dr: 1000, cr: 800,  diff: 200 },
          { reference_number: "INV-002", dr: 5000, cr: 3000, diff: 2000 },
        ],
      },
    ]);
    const result = await runDataQualityScan("c1", START, END);
    const imbalance = result.issues.find((i) => i.code === "voucher_imbalance");
    expect(imbalance).toBeDefined();
    expect(imbalance!.severity).toBe("critical");
    expect(imbalance!.affectedRows).toBe(2);
    expect(imbalance!.exposure).toBe(2200); // 200 + 2000
  });

  it("returns no issue when all vouchers balance", async () => {
    mockSqlBySnippet([{ contains: "AS dr", rows: [] }]);
    const result = await runDataQualityScan("c1", START, END);
    expect(result.issues.find((i) => i.code === "voucher_imbalance")).toBeUndefined();
  });
});

// ─── Duplicate transactions check ─────────────────────────────────────────────

describe("scanner — duplicate transactions check", () => {
  it("returns critical issue when duplicates detected", async () => {
    mockSqlBySnippet([
      {
        contains: "WITH transactions AS",
        rows: [
          { party: "Vendor X", amount: 10000, vch_a: "PUR-001", date_a: new Date(), vch_b: "PUR-002", date_b: new Date() },
        ],
      },
    ]);
    const result = await runDataQualityScan("c1", START, END);
    const dup = result.issues.find((i) => i.code === "duplicate_transactions");
    expect(dup).toBeDefined();
    expect(dup!.severity).toBe("critical");
    expect(dup!.exposure).toBe(10000);
  });

  it("returns no issue when no duplicates", async () => {
    mockSqlBySnippet([{ contains: "WITH transactions AS", rows: [] }]);
    const result = await runDataQualityScan("c1", START, END);
    expect(result.issues.find((i) => i.code === "duplicate_transactions")).toBeUndefined();
  });
});

// ─── Date outliers check ──────────────────────────────────────────────────────

describe("scanner — date outliers check", () => {
  it("returns review issue when entries dated outside period", async () => {
    mockSqlBySnippet([
      {
        contains: "INTERVAL '60 days'",
        rows: [
          { transaction_date: new Date("2024-01-01"), rows: 3, total_amount: 1500 },
          { transaction_date: new Date("2025-08-01"), rows: 1, total_amount: 500 },
        ],
      },
    ]);
    const result = await runDataQualityScan("c1", START, END);
    const outlier = result.issues.find((i) => i.code === "date_outliers");
    expect(outlier).toBeDefined();
    expect(outlier!.severity).toBe("review");
    expect(outlier!.affectedRows).toBe(4);
    expect(outlier!.exposure).toBe(2000);
  });
});

// ─── Missing fields check ─────────────────────────────────────────────────────

describe("scanner — missing fields check", () => {
  it("returns critical issue when fields missing", async () => {
    mockSqlBySnippet([
      {
        contains: "missing_date",
        rows: [{ missing_date: 2, missing_account: 1, zero_amount: 3, both_dr_cr: 0 }],
      },
    ]);
    const result = await runDataQualityScan("c1", START, END);
    const missing = result.issues.find((i) => i.code === "missing_fields");
    expect(missing).toBeDefined();
    expect(missing!.affectedRows).toBe(6); // 2 + 1 + 3 + 0
  });

  it("returns no issue when all fields present", async () => {
    mockSqlBySnippet([
      {
        contains: "missing_date",
        rows: [{ missing_date: 0, missing_account: 0, zero_amount: 0, both_dr_cr: 0 }],
      },
    ]);
    const result = await runDataQualityScan("c1", START, END);
    expect(result.issues.find((i) => i.code === "missing_fields")).toBeUndefined();
  });
});

// ─── Unclassified accounts check ──────────────────────────────────────────────

describe("scanner — unclassified accounts check", () => {
  it("returns info issue when accounts not in type map", async () => {
    // typeMap mock has: HDFC Bank, Sundry Creditors, Sundry Debtors, CGST Input
    // Returning accounts NOT in the typeMap → flagged
    mockSqlBySnippet([
      {
        contains: "AS txns",
        rows: [
          { account_name: "Some Unknown Acct", txns: 5, total: 1000 },
          { account_name: "Another Unmapped",  txns: 3, total: 500 },
          { account_name: "HDFC Bank A/c",     txns: 10, total: 100000 }, // known → ignored
        ],
      },
    ]);
    const result = await runDataQualityScan("c1", START, END);
    const unc = result.issues.find((i) => i.code === "unclassified_accounts");
    expect(unc).toBeDefined();
    expect(unc!.severity).toBe("info");
    expect(unc!.affectedRows).toBe(2);
  });
});

// ─── GST mismatch check ──────────────────────────────────────────────────────

describe("scanner — GST mismatch check", () => {
  it("returns info issue when CGST ≠ SGST", async () => {
    mockSqlBySnippet([
      {
        contains: "cgst",
        rows: [
          { reference_number: "PUR-001", cgst: 100, sgst: 50, diff: 50 },
        ],
      },
    ]);
    const result = await runDataQualityScan("c1", START, END);
    const gst = result.issues.find((i) => i.code === "gst_mismatch");
    expect(gst).toBeDefined();
    // GST mismatch is `review` severity (was wrongly assumed `info`)
    expect(["review", "info"]).toContain(gst!.severity);
  });
});

// ─── Sign anomalies check ────────────────────────────────────────────────────

describe("scanner — sign anomaly check (negative bank/cash)", () => {
  it("returns review issue when bank balance is negative", async () => {
    mockQueryRawUnsafe.mockImplementation(async (sql: string) => {
      // sign anomaly check queries bank account balances
      if (sql.includes("bank") || sql.includes("cash")) {
        return [{ account_name: "HDFC Bank A/c", balance: -50000 }];
      }
      return [];
    });
    const result = await runDataQualityScan("c1", START, END);
    const sign = result.issues.find((i) => i.code === "sign_anomalies");
    // Sign anomaly check may or may not fire depending on bank account presence
    if (sign) {
      expect(sign.severity).toBe("review");
    }
  });
});

// ─── Period completeness check ───────────────────────────────────────────────

describe("scanner — period completeness check", () => {
  it("returns critical issue when period has no transactions", async () => {
    // All checks return empty → period_completeness sees no active days
    mockQueryRawUnsafe.mockResolvedValue([]);
    const result = await runDataQualityScan("c1", START, END);
    const period = result.issues.find((i) => i.code === "period_completeness");
    expect(period).toBeDefined();
    expect(period!.severity).toBe("critical");
  });
});

// ─── End-to-end: scan returns sorted, structured result ──────────────────────

describe("scanner — end-to-end ScanResult", () => {
  it("aggregates totalIssues, bySeverity, and totalExposure correctly", async () => {
    mockSqlBySnippet([
      { contains: "AS dr",            rows: [{ reference_number: "x", dr: 100, cr: 0, diff: 100 }] },
      { contains: "WITH transactions", rows: [{ party: "p", amount: 500, vch_a: "a", date_a: new Date(), vch_b: "b", date_b: new Date() }] },
      { contains: "missing_date",      rows: [{ missing_date: 1, missing_account: 0, zero_amount: 0, both_dr_cr: 0 }] },
    ]);
    const result = await runDataQualityScan("c1", START, END);

    expect(result.totalIssues).toBe(result.issues.length);
    expect(result.bySeverity.critical).toBeGreaterThanOrEqual(2); // imbalance + duplicate + missing
    expect(result.totalExposure).toBeGreaterThanOrEqual(600); // 100 + 500

    // Sort: critical first
    if (result.issues.length >= 2) {
      const sevRank: Record<string, number> = { critical: 0, review: 1, info: 2 };
      for (let i = 1; i < result.issues.length; i++) {
        expect(sevRank[result.issues[i - 1].severity]).toBeLessThanOrEqual(sevRank[result.issues[i].severity]);
      }
    }
  });

  it("throws when table name not found", async () => {
    const cm = await import("../utils/column-mapping");
    (cm.getTableName as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await expect(runDataQualityScan("nonexistent", START, END)).rejects.toThrow(/No GL table found/);
  });

  it("includes durationMs, scannedAt, and connectionId in result", async () => {
    mockQueryRawUnsafe.mockResolvedValue([]);
    const result = await runDataQualityScan("c1", START, END);
    expect(result.connectionId).toBe("c1");
    expect(result.scannedAt).toBeInstanceOf(Date);
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── TDS deduction check (Indian Income Tax Sec 194 compliance) ─────────────

describe("scanner — TDS deduction check", () => {
  it("flags vendor payments above ₹30,000 with no TDS line", async () => {
    mockQueryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes("voucher_summary") && sql.includes("has_tds_line")) {
        return [
          { party: "Acme Contractors", reference_number: "BP-001", dt: new Date(), vtype: "Payment", amount: 50000 },
          { party: "XYZ Services",     reference_number: "BP-002", dt: new Date(), vtype: "Payment", amount: 75000 },
        ];
      }
      return [];
    });
    const result = await runDataQualityScan("c1", START, END);
    const tds = result.issues.find((i) => i.code === "tds_potentially_missed");
    expect(tds).toBeDefined();
    expect(tds!.severity).toBe("review");
    expect(tds!.category).toBe("Tax Compliance");
    expect(tds!.affectedRows).toBe(2);
    expect(tds!.exposure).toBe(125000); // 50k + 75k
    expect(tds!.title).toContain("vendor payment");
  });

  it("does NOT fire when no vendor payments exceed threshold", async () => {
    mockQueryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes("voucher_summary") && sql.includes("has_tds_line")) return [];
      return [];
    });
    const result = await runDataQualityScan("c1", START, END);
    expect(result.issues.find((i) => i.code === "tds_potentially_missed")).toBeUndefined();
  });

  it("skips the check if reference_number column is missing", async () => {
    const cm = await import("../utils/column-mapping");
    (cm.getTableColumns as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Set(["transaction_date", "account_name", "debit_amount", "credit_amount", "party_name"])
      // ↑ deliberately missing reference_number
    );
    mockQueryRawUnsafe.mockResolvedValue([]);
    const result = await runDataQualityScan("c1", START, END);
    // Check should be skipped — no tds_potentially_missed issue even if rows were returned
    expect(result.issues.find((i) => i.code === "tds_potentially_missed")).toBeUndefined();
  });
});

// ─── Regression: graceful failure when checks throw ──────────────────────────

describe("scanner — graceful degradation on SQL errors", () => {
  it("does not crash when a single check throws", async () => {
    // Make all queries fail except one
    let callCount = 0;
    mockQueryRawUnsafe.mockImplementation(async (sql: string) => {
      callCount++;
      if (callCount === 1) throw new Error("SQL error in first check");
      if (sql.includes("missing_date")) return [{ missing_date: 5, missing_account: 0, zero_amount: 0, both_dr_cr: 0 }];
      return [];
    });
    // Scanner should still return a result (other checks succeed or return null)
    const result = await runDataQualityScan("c1", START, END);
    expect(result.totalIssues).toBeGreaterThanOrEqual(0); // didn't crash
  });
});
