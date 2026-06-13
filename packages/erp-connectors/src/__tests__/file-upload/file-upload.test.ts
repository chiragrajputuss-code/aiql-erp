import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { mapColumn, normalizeColumnName } from "../../file-upload/column-mapper";
import { shouldSkipColumn }              from "../../file-upload/skip-rules";
import { resolveRedundancy }             from "../../file-upload/redundancy-resolver";
import { validateMappings }              from "../../file-upload/validator";
import { parseExcel, parseCsv }          from "../../file-upload/parser";
import { CANONICAL_SCHEMA }              from "../../file-upload/canonical-schema";
import type { ColumnMappingResult }      from "../../file-upload/column-mapper";

// ─── Helper: build a minimal Excel buffer ────────────────────────────────────

function makeExcel(headers: string[], rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer);
}

// ─── Canonical schema ─────────────────────────────────────────────────────────

describe("CANONICAL_SCHEMA", () => {
  it("has exactly 24 columns", () => {
    expect(Object.keys(CANONICAL_SCHEMA)).toHaveLength(24);
  });

  it("transaction_date is required", () => {
    expect(CANONICAL_SCHEMA.transaction_date.required).toBe(true);
  });

  it("all other columns are optional", () => {
    const required = Object.entries(CANONICAL_SCHEMA).filter(([, v]) => v.required);
    expect(required).toHaveLength(1); // only transaction_date
  });
});

// ─── Column mapper — Step 1: exact/alias match ────────────────────────────────

describe("column-mapper — exact match", () => {
  it("maps 'Date' → transaction_date", () => {
    const r = mapColumn("Date");
    expect(r.canonicalName).toBe("transaction_date");
    expect(r.detectionMethod).toBe("exact");
    expect(r.confidence).toBe(1.0);
  });

  it("maps 'Voucher Date' → transaction_date", () => {
    expect(mapColumn("Voucher Date").canonicalName).toBe("transaction_date");
  });

  it("maps 'Dr Amt' → debit_amount", () => {
    expect(mapColumn("Dr Amt").canonicalName).toBe("debit_amount");
  });

  it("maps 'Cr Amt' → credit_amount", () => {
    expect(mapColumn("Cr Amt").canonicalName).toBe("credit_amount");
  });

  it("maps 'Amount' → net_amount", () => {
    expect(mapColumn("Amount").canonicalName).toBe("net_amount");
  });

  it("maps 'Narration' → description", () => {
    expect(mapColumn("Narration").canonicalName).toBe("description");
  });

  it("maps 'Cost Centre' → cost_centre", () => {
    expect(mapColumn("Cost Centre").canonicalName).toBe("cost_centre");
  });

  it("maps 'Voucher No' → reference_number", () => {
    expect(mapColumn("Voucher No").canonicalName).toBe("reference_number");
  });

  it("maps 'Account Name' → account_name", () => {
    expect(mapColumn("Account Name").canonicalName).toBe("account_name");
  });

  it("maps 'Account Code' → account_code", () => {
    expect(mapColumn("Account Code").canonicalName).toBe("account_code");
  });

  it("maps 'Voucher Type' → voucher_type", () => {
    expect(mapColumn("Voucher Type").canonicalName).toBe("voucher_type");
  });
});

// ─── Column mapper — canonical-name self-match (regression) ────────────────────

describe("column-mapper — canonical-name self-match", () => {
  // Bug: canonical names like `reference_number` (the exact field name in
  // CANONICAL_SCHEMA) weren't being recognized because they weren't aliases
  // and the fuzzy matcher's length-difference gate skipped them. CSVs that
  // already use canonical naming (a common pattern for clean exports) had
  // their reference_number column silently dropped.

  it("REGRESSION: maps 'reference_number' (canonical name) → reference_number", () => {
    const r = mapColumn("reference_number");
    expect(r.canonicalName).toBe("reference_number");
    expect(r.detectionMethod).toBe("exact");
    expect(r.confidence).toBe(1.0);
  });

  it("REGRESSION: maps 'transaction_date' → transaction_date", () => {
    expect(mapColumn("transaction_date").canonicalName).toBe("transaction_date");
  });

  it("REGRESSION: maps 'party_name' → party_name", () => {
    expect(mapColumn("party_name").canonicalName).toBe("party_name");
  });

  it("REGRESSION: maps 'debit_amount' → debit_amount", () => {
    expect(mapColumn("debit_amount").canonicalName).toBe("debit_amount");
  });

  it("REGRESSION: maps 'vendor_name' → vendor_name", () => {
    expect(mapColumn("vendor_name").canonicalName).toBe("vendor_name");
  });

  it("REGRESSION: maps 'Reference_Number' (mixed case) → reference_number", () => {
    expect(mapColumn("Reference_Number").canonicalName).toBe("reference_number");
  });

  it("REGRESSION: 'Reference No' (with space, common in Sharma/Speedy Cargo CSVs) → reference_number", () => {
    // Added as explicit alias because fuzzy gate skipped it
    expect(mapColumn("Reference No").canonicalName).toBe("reference_number");
  });

  it("REGRESSION: 'Reference Number' (with space, full word) → reference_number", () => {
    expect(mapColumn("Reference Number").canonicalName).toBe("reference_number");
  });
});

// ─── Column mapper — Hindi columns ───────────────────────────────────────────

describe("column-mapper — Hindi columns", () => {
  it("maps 'डेबिट' (Devanagari debit) → debit_amount", () => {
    expect(mapColumn("डेबिट").canonicalName).toBe("debit_amount");
  });

  it("maps 'जमा' (jama = credit) → credit_amount", () => {
    expect(mapColumn("जमा").canonicalName).toBe("credit_amount");
  });

  it("maps 'खाता' (khata = account) → account_name", () => {
    expect(mapColumn("खाता").canonicalName).toBe("account_name");
  });

  it("maps 'तारीख' (tarikh = date) → transaction_date", () => {
    expect(mapColumn("तारीख").canonicalName).toBe("transaction_date");
  });
});

// ─── Column mapper — Step 2: fuzzy match ─────────────────────────────────────

describe("column-mapper — fuzzy match", () => {
  it("'acnt' → account_name (Levenshtein 1 from 'acnt name' close)", () => {
    const r = mapColumn("acnt");
    // "acnt" is Levenshtein 1 from "acnt" alias for account_name
    expect(r.canonicalName).toBe("account_name");
    expect(r.detectionMethod).toBe("exact"); // it IS in aliases as exact
  });

  it("'Narrations' → description (Levenshtein 1 from 'narration')", () => {
    const r = mapColumn("Narrations");
    expect(r.canonicalName).toBe("description");
  });

  it("'Dr Amount' → debit_amount (Levenshtein 0 via alias)", () => {
    expect(mapColumn("Dr Amount").canonicalName).toBe("debit_amount");
  });

  it("'Vndor Name' → vendor_name (Levenshtein 1)", () => {
    const r = mapColumn("Vndor Name");
    // "vndor name" vs "vendor name" = Levenshtein 1
    expect(r.canonicalName).toBe("vendor_name");
  });
});

// ─── Column mapper — Step 3: inference from values ───────────────────────────

describe("column-mapper — data-type inference", () => {
  it("column of dd/mm/yyyy values → transaction_date", () => {
    const dates = Array.from({ length: 20 }, (_, i) => `${String((i % 28) + 1).padStart(2, "0")}/08/2026`);
    const r = mapColumn("UnknownDateCol", dates);
    expect(r.canonicalName).toBe("transaction_date");
    expect(r.detectionMethod).toBe("inference");
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("column of dd-MMM-yyyy values → transaction_date", () => {
    const dates = ["15-Aug-2026", "16-Aug-2026", "17-Aug-2026", "18-Aug-2026", "19-Aug-2026",
                   "20-Aug-2026", "21-Aug-2026", "22-Aug-2026", "23-Aug-2026", "24-Aug-2026"];
    const r = mapColumn("TxnDate_Raw", dates);
    expect(r.canonicalName).toBe("transaction_date");
    expect(r.detectionMethod).toBe("inference");
  });

  it("column of ₹ amounts → net_amount", () => {
    const amounts = Array.from({ length: 20 }, (_, i) => `₹${(i + 1) * 1000}`);
    const r = mapColumn("Value_Computed", amounts);
    expect(r.canonicalName).toBe("net_amount");
    expect(r.detectionMethod).toBe("inference");
  });

  it("mixed garbage values → unmapped", () => {
    const r = mapColumn("XYZ_Internal", ["foo", "bar", "baz", "qux", "quux"]);
    expect(r.canonicalName).toBeNull();
    expect(r.detectionMethod).toBe("unmapped");
  });
});

// ─── Skip rules ───────────────────────────────────────────────────────────────

describe("skip-rules", () => {
  it("skips 'Sr No'", () => {
    expect(shouldSkipColumn("Sr No").skip).toBe(true);
  });

  it("skips 'S.No'", () => {
    expect(shouldSkipColumn("S.No").skip).toBe(true);
  });

  it("skips 'Created By'", () => {
    expect(shouldSkipColumn("Created By").skip).toBe(true);
  });

  it("skips 'Row Color'", () => {
    expect(shouldSkipColumn("Row Color").skip).toBe(true);
  });

  it("skips 'Modified By'", () => {
    expect(shouldSkipColumn("Modified By").skip).toBe(true);
  });

  it("does NOT skip 'Amount'", () => {
    expect(shouldSkipColumn("Amount").skip).toBe(false);
  });

  it("does NOT skip 'Account Name'", () => {
    expect(shouldSkipColumn("Account Name").skip).toBe(false);
  });

  it("skips column where 98% values are empty", () => {
    const values = ["value", ...Array(49).fill("")];
    expect(shouldSkipColumn("Misc", values).skip).toBe(true);
  });

  it("skips column with single constant value", () => {
    const values = Array(20).fill("India");
    expect(shouldSkipColumn("Country", values).skip).toBe(true);
  });

  it("does NOT skip column with varied values", () => {
    const values = ["Acme Corp", "Beta Ltd", "Infosys Ltd", "Wipro Ltd", "TCS"];
    expect(shouldSkipColumn("Vendor", values).skip).toBe(false);
  });
});

// ─── Redundancy resolver ──────────────────────────────────────────────────────

function makeMappings(pairs: Array<[string, string]>): ColumnMappingResult[] {
  return pairs.map(([original, canonical]) => ({
    originalName: original, canonicalName: canonical,
    confidence: 1.0, detectionMethod: "exact" as const,
  }));
}

describe("redundancy-resolver", () => {
  it("drops 'Amount' (net_amount) when Dr Amt + Cr Amt exist", () => {
    const mappings = makeMappings([
      ["Dr Amt", "debit_amount"],
      ["Cr Amt", "credit_amount"],
      ["Amount", "net_amount"],
    ]);
    const resolved = resolveRedundancy(mappings);
    const dropped = resolved.find((m) => m.originalName === "Amount");
    expect(dropped?.dropped).toBe(true);
    expect(dropped?.dropReason).toContain("debit_amount");
  });

  it("keeps Dr Amt and Cr Amt when Amount is also present", () => {
    const mappings = makeMappings([
      ["Dr Amt", "debit_amount"],
      ["Cr Amt", "credit_amount"],
      ["Amount", "net_amount"],
    ]);
    const resolved = resolveRedundancy(mappings);
    expect(resolved.find((m) => m.originalName === "Dr Amt")?.dropped).toBe(false);
    expect(resolved.find((m) => m.originalName === "Cr Amt")?.dropped).toBe(false);
  });

  it("drops vendor_name when party_name exists", () => {
    const mappings = makeMappings([
      ["Vendor", "vendor_name"],
      ["Party", "party_name"],
    ]);
    const resolved = resolveRedundancy(mappings);
    expect(resolved.find((m) => m.originalName === "Vendor")?.dropped).toBe(true);
  });

  it("drops customer_name when party_name exists", () => {
    const mappings = makeMappings([
      ["Customer", "customer_name"],
      ["Party Name", "party_name"],
    ]);
    const resolved = resolveRedundancy(mappings);
    expect(resolved.find((m) => m.originalName === "Customer")?.dropped).toBe(true);
  });

  it("drops duplicate canonical type — keeps first", () => {
    const mappings = makeMappings([
      ["Date", "transaction_date"],
      ["Bill Date", "transaction_date"],
    ]);
    const resolved = resolveRedundancy(mappings);
    expect(resolved.find((m) => m.originalName === "Date")?.dropped).toBe(false);
    expect(resolved.find((m) => m.originalName === "Bill Date")?.dropped).toBe(true);
  });

  it("drops opening_balance in transaction file", () => {
    const mappings = makeMappings([
      ["Date", "transaction_date"],
      ["Opening Bal", "opening_balance"],
    ]);
    const resolved = resolveRedundancy(mappings, "transaction");
    expect(resolved.find((m) => m.originalName === "Opening Bal")?.dropped).toBe(true);
  });
});

// ─── Validator ────────────────────────────────────────────────────────────────

describe("validator", () => {
  function resolvedFrom(pairs: Array<[string, string | null, boolean]>) {
    return pairs.map(([original, canonical, dropped]) => ({
      originalName: original, canonicalName: canonical,
      confidence: 1.0, detectionMethod: "exact" as const, dropped,
    }));
  }

  it("valid file with date + account + amount → isValid true", () => {
    const mappings = resolvedFrom([
      ["Date",     "transaction_date", false],
      ["Account",  "account_name",     false],
      ["Dr Amt",   "debit_amount",     false],
      ["Cr Amt",   "credit_amount",    false],
    ]);
    const result = validateMappings(mappings);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("file with no date column → error", () => {
    const mappings = resolvedFrom([
      ["Account", "account_name",  false],
      ["Amount",  "net_amount",    false],
    ]);
    const result = validateMappings(mappings);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("date"))).toBe(true);
  });

  it("file with no account identifier → error", () => {
    const mappings = resolvedFrom([
      ["Date",   "transaction_date", false],
      ["Amount", "net_amount",       false],
    ]);
    expect(validateMappings(mappings).errors.some((e) => e.includes("account"))).toBe(true);
  });

  it("file with no amount column → error", () => {
    const mappings = resolvedFrom([
      ["Date",    "transaction_date", false],
      ["Account", "account_name",     false],
    ]);
    expect(validateMappings(mappings).errors.some((e) => e.includes("amount"))).toBe(true);
  });

  it("warns when no description column", () => {
    const mappings = resolvedFrom([
      ["Date",    "transaction_date", false],
      ["Account", "account_name",     false],
      ["Amount",  "net_amount",       false],
    ]);
    const result = validateMappings(mappings);
    expect(result.warnings.some((w) => w.includes("description"))).toBe(true);
  });

  it("excludes dropped columns from canonicalColumns", () => {
    const mappings = resolvedFrom([
      ["Date",       "transaction_date", false],
      ["Account",    "account_name",     false],
      ["Amount",     "net_amount",       true],  // dropped
      ["Dr Amt",     "debit_amount",     false],
    ]);
    const result = validateMappings(mappings);
    expect(result.canonicalColumns).not.toContain("net_amount");
    expect(result.canonicalColumns).toContain("debit_amount");
    expect(result.droppedColumns).toContain("Amount");
  });
});

// ─── Full pipeline: 15-column GL → 8 canonical ───────────────────────────────

describe("full pipeline — 15-column GL Excel → 8 canonical", () => {
  const GL_HEADERS = [
    "Sr No",          // → SKIP (serial)
    "Date",           // → transaction_date
    "Account Code",   // → account_code
    "Account Name",   // → account_name
    "Dr Amt",         // → debit_amount
    "Cr Amt",         // → credit_amount
    "Amount",         // → net_amount → DROPPED (Dr+Cr exist)
    "Narration",      // → description
    "Created By",     // → SKIP (audit)
    "Row Color",      // → SKIP (formatting)
    "Modified By",    // → SKIP (audit)
    "Voucher Type",   // → voucher_type
    "Cost Centre",    // → cost_centre
    "Bill Date",      // → transaction_date → DROPPED (duplicate)
    "Blank Column",   // → SKIP (all empty)
  ];

  const VOUCHER_TYPES = ["Payment", "Receipt", "Purchase", "Sales", "Journal",
                         "Contra", "Debit Note", "Credit Note", "Payment", "Receipt"];
  const COST_CENTRES  = ["Head Office", "Mumbai Branch", "Delhi Office", "Chennai",
                         "Head Office", "Mumbai Branch", "Delhi Office", "Chennai", "Pune", "Hyderabad"];

  const SAMPLE_ROWS = Array.from({ length: 10 }, (_, i) => ({
    "Sr No": String(i + 1),
    "Date": `${String(i + 1).padStart(2, "0")}/08/2026`,
    "Account Code": `${4000 + i}`,
    "Account Name": `Ledger ${i}`,
    "Dr Amt": i % 2 === 0 ? `${(i + 1) * 1000}` : "0",
    "Cr Amt": i % 2 === 1 ? `${(i + 1) * 500}` : "0",
    "Amount": `${(i + 1) * 1000}`,
    "Narration": `Transaction ${i} - payment to vendor`,
    "Created By": "admin",
    "Row Color": "white",
    "Modified By": "admin",
    "Voucher Type": VOUCHER_TYPES[i],
    "Cost Centre": COST_CENTRES[i],
    "Bill Date": `${String(i + 1).padStart(2, "0")}/08/2026`,
    "Blank Column": "",
  }));

  it("parses the Excel buffer correctly", () => {
    const buf = makeExcel(GL_HEADERS, SAMPLE_ROWS.map((r) => GL_HEADERS.map((h) => r[h as keyof typeof r])));
    const parsed = parseExcel(buf);
    expect(parsed.headers).toHaveLength(15);
    expect(parsed.rowCount).toBe(10);
  });

  it("produces exactly 8 active canonical columns after full pipeline", () => {
    const sampleValues = (header: string) =>
      SAMPLE_ROWS.map((r) => r[header as keyof typeof r] ?? "");

    // Step 1: Skip
    const nonSkipped = GL_HEADERS.filter((h) => {
      const samples = sampleValues(h);
      return !shouldSkipColumn(h, samples).skip;
    });

    // Step 2: Map
    const mappings: ColumnMappingResult[] = nonSkipped.map((h) =>
      mapColumn(h, sampleValues(h))
    );

    // Step 3: Resolve redundancy
    const resolved = resolveRedundancy(mappings, "transaction");

    // Step 4: Validate
    const result = validateMappings(resolved);

    expect(result.canonicalColumns).toHaveLength(8);
    expect(result.canonicalColumns).toContain("transaction_date");
    expect(result.canonicalColumns).toContain("account_code");
    expect(result.canonicalColumns).toContain("account_name");
    expect(result.canonicalColumns).toContain("debit_amount");
    expect(result.canonicalColumns).toContain("credit_amount");
    expect(result.canonicalColumns).toContain("description");
    expect(result.canonicalColumns).toContain("voucher_type");
    expect(result.canonicalColumns).toContain("cost_centre");
    // net_amount and bill_date should be dropped
    expect(result.canonicalColumns).not.toContain("net_amount");
  });
});

// ─── CSV parser ───────────────────────────────────────────────────────────────

describe("parseCsv", () => {
  it("parses comma-delimited CSV", () => {
    const csv = "Date,Account,Amount\n15/08/2026,Cash,5000\n16/08/2026,Bank,3000";
    const result = parseCsv(Buffer.from(csv));
    expect(result.headers).toEqual(["Date", "Account", "Amount"]);
    expect(result.rowCount).toBe(2);
    expect(result.detectedDelimiter).toBe(",");
  });

  it("auto-detects tab delimiter", () => {
    const tsv = "Date\tAccount\tAmount\n15/08/2026\tCash\t5000";
    const result = parseCsv(Buffer.from(tsv));
    expect(result.detectedDelimiter).toBe("\t");
    expect(result.headers).toHaveLength(3);
  });

  it("strips BOM from UTF-8 CSV", () => {
    const csv = "\uFEFFDate,Amount\n15/08/2026,5000";
    const result = parseCsv(Buffer.from(csv));
    expect(result.headers[0]).toBe("Date"); // no BOM in header
  });
});
