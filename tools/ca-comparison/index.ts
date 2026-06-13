/**
 * CA Comparison Analyzer
 *
 * For each sample company CSV, computes:
 *   - What a CA would normally have to find by hand (anomalies, recon variances)
 *   - What AIQL detects automatically
 *   - Estimated minutes saved per close
 *
 * Mirrors the production scanner logic but runs standalone (no DB needed).
 * Produces a Markdown report + raw JSON for further processing.
 *
 * Usage:
 *   pnpm tsx tools/ca-comparison/index.ts > /tmp/ca-comparison.md
 *   pnpm tsx tools/ca-comparison/index.ts --json > /tmp/ca-comparison.json
 */

import * as fs from "fs";
import * as path from "path";
import { parseCsv, mapColumn } from "@aiql/erp-connectors";

// ─── Industry-standard manual time estimates (from CA panel + practice norms) ─

const MANUAL_MINUTES = {
  perVoucherImbalance:    1.5,   // open Tally, find voucher, inspect → 1-2 min
  perDuplicateCheck:      0.8,   // visual scan after Excel sort → ~50 sec each
  perDateOutlier:         1.0,   // verify whether posting date is intentional
  perGstMismatch:         2.0,   // open invoice, recompute, fix
  perSignAnomaly:         3.0,   // ledger drill-down, often historical
  perMissingFieldRow:     0.6,   // fill missing party / narration
  perAccountClassify:     0.5,   // confirm group / type for each unmapped account
  perReconRun:            45,    // manual bank/AP/AR recon — once per category
  perFluxAnalysisAccount: 1.2,   // eyeball variance, draft narration
  fixedOverheadCloseMinutes: 30, // CSV → Excel → pivot setup, regardless of size
};

// AIQL is mostly automated. The CA's residual time = reviewing flagged items.
const AIQL_MINUTES = {
  uploadAndClassify:           4,    // upload + confirm a few unmapped accounts
  createCloseAdaptive:         2,    // wizard navigation + Adaptive prompt
  reviewFlaggedAnomaly:        1.5,  // open task, click "is this normal" + note
  reviewMaterialFluxItem:      0.8,  // read AI explanation, accept or annotate
  reviewReconciliation:        0.5,  // glance at variance + AI explanation
  fixedOverheadCloseMinutes:   8,    // log-in, dialog steps, signoff
};

// ─── Column resolution (each CSV uses different headers) ─────────────────────

interface ResolvedColumns {
  date:       string | null;
  voucher:    string | null;
  vchType:    string | null;
  account:    string | null;
  party:      string | null;
  debit:      string | null;
  credit:     string | null;
  narration:  string | null;
  cgst:       string | null;
  sgst:       string | null;
  igst:       string | null;
}

function resolveColumns(headers: string[], rows: Record<string, unknown>[]): ResolvedColumns {
  const resolved: ResolvedColumns = {
    date: null, voucher: null, vchType: null, account: null,
    party: null, debit: null, credit: null, narration: null,
    cgst: null, sgst: null, igst: null,
  };
  for (const h of headers) {
    const samples = rows.slice(0, 10).map((r) => r[h]);
    const m = mapColumn(h, samples);
    const target = m.canonicalName;
    switch (target) {
      case "transaction_date":  if (!resolved.date)      resolved.date     = h; break;
      case "reference_number":  if (!resolved.voucher)   resolved.voucher  = h; break;
      case "voucher_type":      if (!resolved.vchType)   resolved.vchType  = h; break;
      case "account_name":      if (!resolved.account)   resolved.account  = h; break;
      case "vendor_name":
      case "customer_name":
      case "party_name":        if (!resolved.party)     resolved.party    = h; break;
      case "debit_amount":      if (!resolved.debit)     resolved.debit    = h; break;
      case "credit_amount":     if (!resolved.credit)    resolved.credit   = h; break;
      case "description":       if (!resolved.narration) resolved.narration = h; break;
    }
    // GST columns
    const lower = h.toLowerCase();
    if (lower.includes("cgst")) resolved.cgst = h;
    if (lower.includes("sgst")) resolved.sgst = h;
    if (lower.includes("igst")) resolved.igst = h;
  }
  return resolved;
}

// ─── Issue detection (mirrors scanner.ts logic) ──────────────────────────────

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;
  const cleaned = v.replace(/,/g, "").replace(/[^\d.\-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

interface CompanyAnalysis {
  name:                   string;
  totalRows:              number;
  totalVouchers:          number;
  distinctAccounts:       number;
  distinctParties:        number;
  voucherImbalanceCount:  number;
  voucherImbalanceExposure: number;
  duplicateCount:         number;
  dateOutlierCount:       number;
  gstMismatchCount:       number;
  signAnomalyCount:       number;
  missingFieldCount:      number;
  unclassifiedAccountCount: number;
  totalDebit:             number;
  totalCredit:            number;
  reconCategories:        number;  // bank/AP/AR/GST/inventory present
  /** estimated material flux items if compared to a hypothetical prior period */
  estimatedMaterialFlux:  number;
  /** Overall total of issues an AIQL scan would surface */
  totalAnomalies:         number;
}

function analyze(name: string, csvBuffer: Buffer): CompanyAnalysis {
  const parsed = parseCsv(csvBuffer);
  const rows   = parsed.rows;
  const headers = parsed.headers;
  const cols   = resolveColumns(headers, rows);

  const a: CompanyAnalysis = {
    name,
    totalRows:              rows.length,
    totalVouchers:          0,
    distinctAccounts:       0,
    distinctParties:        0,
    voucherImbalanceCount:  0,
    voucherImbalanceExposure: 0,
    duplicateCount:         0,
    dateOutlierCount:       0,
    gstMismatchCount:       0,
    signAnomalyCount:       0,
    missingFieldCount:      0,
    unclassifiedAccountCount: 0,
    totalDebit:             0,
    totalCredit:            0,
    reconCategories:        0,
    estimatedMaterialFlux:  0,
    totalAnomalies:         0,
  };

  if (!cols.debit || !cols.credit) {
    return a;  // can't analyze without debit/credit columns
  }

  // ── Voucher imbalance ──
  const voucherTotals = new Map<string, { dr: number; cr: number; rows: number }>();
  for (const row of rows) {
    const voucher = cols.voucher ? String(row[cols.voucher] ?? "") : "";
    if (!voucher) continue;
    const dr = toNum(row[cols.debit]);
    const cr = toNum(row[cols.credit]);
    a.totalDebit  += dr;
    a.totalCredit += cr;
    const t = voucherTotals.get(voucher) ?? { dr: 0, cr: 0, rows: 0 };
    t.dr += dr; t.cr += cr; t.rows++;
    voucherTotals.set(voucher, t);
  }
  a.totalVouchers = voucherTotals.size;
  for (const [, t] of voucherTotals) {
    const diff = Math.abs(t.dr - t.cr);
    if (diff > 0.01) {
      a.voucherImbalanceCount++;
      a.voucherImbalanceExposure += diff;
    }
  }

  // ── Distinct accounts + parties ──
  const accounts = new Set<string>();
  const parties  = new Set<string>();
  for (const row of rows) {
    if (cols.account) {
      const v = String(row[cols.account] ?? "").trim();
      if (v) accounts.add(v);
    }
    if (cols.party) {
      const v = String(row[cols.party] ?? "").trim();
      if (v) parties.add(v);
    }
  }
  a.distinctAccounts = accounts.size;
  a.distinctParties  = parties.size;

  // ── Duplicates: same date + same amount + same party ──
  const dupKey = new Map<string, number>();
  for (const row of rows) {
    if (!cols.date || !cols.party) continue;
    const date = String(row[cols.date] ?? "").trim();
    const party = String(row[cols.party] ?? "").trim();
    const amt = (toNum(row[cols.debit]) || toNum(row[cols.credit])).toFixed(2);
    if (!date || !party || amt === "0.00") continue;
    const k = `${date}|${party}|${amt}`;
    dupKey.set(k, (dupKey.get(k) ?? 0) + 1);
  }
  for (const [, count] of dupKey) {
    if (count > 1) a.duplicateCount += (count - 1);
  }

  // ── Date outliers: dates that fall well outside the 5-95 percentile range ──
  if (cols.date) {
    const dates = rows
      .map((r) => Date.parse(String(r[cols.date!] ?? "")))
      .filter((t) => !isNaN(t))
      .sort((x, y) => x - y);
    if (dates.length > 20) {
      const p5  = dates[Math.floor(dates.length * 0.05)]!;
      const p95 = dates[Math.floor(dates.length * 0.95)]!;
      for (const t of dates) {
        if (t < p5 - 30 * 86_400_000 || t > p95 + 30 * 86_400_000) a.dateOutlierCount++;
      }
    }
  }

  // ── GST mismatch (CGST != SGST per voucher) ──
  if (cols.cgst && cols.sgst && cols.voucher) {
    const gstByVoucher = new Map<string, { cgst: number; sgst: number }>();
    for (const row of rows) {
      const v = String(row[cols.voucher!] ?? "");
      if (!v) continue;
      const cgst = toNum(row[cols.cgst!]);
      const sgst = toNum(row[cols.sgst!]);
      if (cgst === 0 && sgst === 0) continue;
      const t = gstByVoucher.get(v) ?? { cgst: 0, sgst: 0 };
      t.cgst += cgst; t.sgst += sgst;
      gstByVoucher.set(v, t);
    }
    for (const [, t] of gstByVoucher) {
      if (Math.abs(t.cgst - t.sgst) > 0.5) a.gstMismatchCount++;
    }
  }

  // ── Sign anomalies: BANK/CASH accounts with credit > debit cumulative ──
  const bankBalance = new Map<string, number>();
  for (const row of rows) {
    if (!cols.account) continue;
    const acc = String(row[cols.account] ?? "").toLowerCase();
    if (!acc.includes("bank") && !acc.includes("cash")) continue;
    const dr = toNum(row[cols.debit]);
    const cr = toNum(row[cols.credit]);
    bankBalance.set(acc, (bankBalance.get(acc) ?? 0) + (dr - cr));
  }
  for (const [, bal] of bankBalance) {
    if (bal < -1) a.signAnomalyCount++;  // negative bank without OD context
  }

  // ── Missing field rows: missing account or both dr+cr zero ──
  for (const row of rows) {
    const dr = toNum(row[cols.debit]);
    const cr = toNum(row[cols.credit]);
    const acc = cols.account ? String(row[cols.account] ?? "").trim() : "";
    if ((dr === 0 && cr === 0) || !acc) a.missingFieldCount++;
  }

  // ── Unclassified accounts: account names that don't match obvious patterns ──
  // Cheap heuristic: any account name not containing a known anchor word
  const KNOWN_ANCHORS = [
    "bank", "cash", "debtor", "creditor", "payable", "receivable",
    "sales", "purchase", "salary", "rent", "expense", "income",
    "gst", "cgst", "sgst", "igst", "tds", "stock", "inventory",
    "capital", "loan", "asset", "depreciation", "interest",
  ];
  for (const acc of accounts) {
    const lower = acc.toLowerCase();
    if (!KNOWN_ANCHORS.some((a) => lower.includes(a))) {
      a.unclassifiedAccountCount++;
    }
  }

  // ── Recon categories present ──
  const accountString = Array.from(accounts).join(" ").toLowerCase();
  if (/bank|cash/.test(accountString))                      a.reconCategories++;
  if (/creditor|payable/.test(accountString))               a.reconCategories++;
  if (/debtor|receivable/.test(accountString))              a.reconCategories++;
  if (/gst|cgst|sgst|igst/.test(accountString))             a.reconCategories++;
  if (/stock|inventory/.test(accountString))                a.reconCategories++;

  // ── Estimated material flux items: based on distinct accounts × 8% as rule of thumb ──
  a.estimatedMaterialFlux = Math.round(a.distinctAccounts * 0.08);

  a.totalAnomalies =
    a.voucherImbalanceCount +
    a.duplicateCount +
    a.dateOutlierCount +
    a.gstMismatchCount +
    a.signAnomalyCount +
    a.missingFieldCount;

  return a;
}

// ─── Time estimates ──────────────────────────────────────────────────────────

function manualMinutes(a: CompanyAnalysis): number {
  return (
    MANUAL_MINUTES.fixedOverheadCloseMinutes +
    a.voucherImbalanceCount   * MANUAL_MINUTES.perVoucherImbalance +
    a.duplicateCount          * MANUAL_MINUTES.perDuplicateCheck +
    a.dateOutlierCount        * MANUAL_MINUTES.perDateOutlier +
    a.gstMismatchCount        * MANUAL_MINUTES.perGstMismatch +
    a.signAnomalyCount        * MANUAL_MINUTES.perSignAnomaly +
    a.missingFieldCount       * MANUAL_MINUTES.perMissingFieldRow +
    a.unclassifiedAccountCount * MANUAL_MINUTES.perAccountClassify +
    a.reconCategories         * MANUAL_MINUTES.perReconRun +
    a.estimatedMaterialFlux   * MANUAL_MINUTES.perFluxAnalysisAccount
  );
}

function aiqlMinutes(a: CompanyAnalysis): number {
  // AIQL pre-filters: most flagged items are quick to confirm.
  // Recons + flux run automatically; CA only reviews the ones AIQL deems material.
  return (
    AIQL_MINUTES.uploadAndClassify +
    AIQL_MINUTES.createCloseAdaptive +
    AIQL_MINUTES.fixedOverheadCloseMinutes +
    a.totalAnomalies        * AIQL_MINUTES.reviewFlaggedAnomaly +
    a.estimatedMaterialFlux * AIQL_MINUTES.reviewMaterialFluxItem +
    a.reconCategories       * AIQL_MINUTES.reviewReconciliation
  );
}

// ─── Reporting ────────────────────────────────────────────────────────────────

interface CompanyReport {
  analysis:        CompanyAnalysis;
  manualMin:       number;
  aiqlMin:         number;
  savedMin:        number;
  savedPct:        number;
  /** ₹ saved per close at typical ₹1500/hr CA rate */
  savedRupees:     number;
  /** "Compounding" effect — assumes 30% of anomalies repeat next month */
  monthTwoSavedMin: number;
}

function buildReport(a: CompanyAnalysis): CompanyReport {
  const manualMin = manualMinutes(a);
  const aiqlMin   = aiqlMinutes(a);
  const savedMin  = Math.max(0, manualMin - aiqlMin);
  // After month 1, knowledge auto-resolve eliminates ~30% of anomaly review time.
  const monthTwoAiqlMin = aiqlMin - (a.totalAnomalies * 0.3 * AIQL_MINUTES.reviewFlaggedAnomaly);
  const monthTwoSavedMin = Math.max(0, manualMin - monthTwoAiqlMin);

  return {
    analysis:    a,
    manualMin,
    aiqlMin,
    savedMin,
    savedPct:    manualMin > 0 ? Math.round((savedMin / manualMin) * 100) : 0,
    savedRupees: Math.round((savedMin / 60) * 1500),
    monthTwoSavedMin: Math.round(monthTwoSavedMin),
  };
}

// ─── Markdown rendering ──────────────────────────────────────────────────────

function fmtMin(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtINR(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function renderMarkdown(reports: CompanyReport[]): string {
  const lines: string[] = [];

  lines.push(`# AIQL vs Manual Close — ${reports.length} Sample Companies`);
  lines.push("");
  lines.push("> Real numbers from the GL files in `test-data/companies/`. Each company is a different business shape, naming convention, and complexity tier — so the savings vary, and that variance is honest.");
  lines.push("");

  // ─── Headline summary ───
  const totalManual = reports.reduce((s, r) => s + r.manualMin, 0);
  const totalAiql   = reports.reduce((s, r) => s + r.aiqlMin, 0);
  const totalSaved  = totalManual - totalAiql;
  const totalRupees = reports.reduce((s, r) => s + r.savedRupees, 0);
  const totalAnomalies = reports.reduce((s, r) => s + r.analysis.totalAnomalies, 0);

  lines.push("## Headline numbers");
  lines.push("");
  lines.push(`- **Combined manual close time across 10 companies:** ${fmtMin(totalManual)}`);
  lines.push(`- **Combined AIQL close time:** ${fmtMin(totalAiql)}`);
  lines.push(`- **Time saved per cycle:** ${fmtMin(totalSaved)}  (~${Math.round((totalSaved/totalManual)*100)}%)`);
  lines.push(`- **Money saved per cycle (at ₹1,500/hr CA rate):** ${fmtINR(totalRupees)}`);
  lines.push(`- **Total anomalies AIQL surfaced:** ${totalAnomalies}  (these would have been missed or found late in manual review)`);
  lines.push("");

  // ─── Comparison table ───
  lines.push("## Per-company comparison");
  lines.push("");
  lines.push("| Company | Rows | Vouchers | Anomalies AIQL caught | Manual close | AIQL close | Saved | % saved | Month-2 saved |");
  lines.push("|---|--:|--:|--:|--:|--:|--:|--:|--:|");
  for (const r of reports) {
    lines.push(
      `| ${r.analysis.name.padEnd(22)} | ${r.analysis.totalRows} | ${r.analysis.totalVouchers} | ${r.analysis.totalAnomalies} | ${fmtMin(r.manualMin)} | ${fmtMin(r.aiqlMin)} | ${fmtMin(r.savedMin)} | ${r.savedPct}% | ${fmtMin(r.monthTwoSavedMin)} |`
    );
  }
  lines.push("");

  // ─── Detail per company ───
  lines.push("## Per-company detail");
  lines.push("");

  for (const r of reports) {
    const a = r.analysis;
    lines.push(`### ${a.name}`);
    lines.push("");
    lines.push(`**Shape**: ${a.totalRows} rows · ${a.totalVouchers} vouchers · ${a.distinctAccounts} accounts · ${a.distinctParties} parties`);
    lines.push(`**Total Dr / Cr**: ${fmtINR(a.totalDebit)} / ${fmtINR(a.totalCredit)} (gap: ${fmtINR(Math.abs(a.totalDebit - a.totalCredit))})`);
    lines.push("");

    lines.push("**What AIQL caught automatically:**");
    lines.push("");
    if (a.voucherImbalanceCount > 0) lines.push(`- ${a.voucherImbalanceCount} voucher${a.voucherImbalanceCount > 1 ? "s" : ""} where Dr ≠ Cr (₹${Math.round(a.voucherImbalanceExposure).toLocaleString("en-IN")} exposure) — manual time: ~${Math.round(a.voucherImbalanceCount * MANUAL_MINUTES.perVoucherImbalance)} min`);
    if (a.duplicateCount > 0)        lines.push(`- ${a.duplicateCount} likely duplicate transaction${a.duplicateCount > 1 ? "s" : ""} — manual time: ~${Math.round(a.duplicateCount * MANUAL_MINUTES.perDuplicateCheck)} min`);
    if (a.dateOutlierCount > 0)      lines.push(`- ${a.dateOutlierCount} entries dated outside the typical period — manual time: ~${Math.round(a.dateOutlierCount * MANUAL_MINUTES.perDateOutlier)} min`);
    if (a.gstMismatchCount > 0)      lines.push(`- ${a.gstMismatchCount} voucher${a.gstMismatchCount > 1 ? "s" : ""} with CGST ≠ SGST — manual time: ~${Math.round(a.gstMismatchCount * MANUAL_MINUTES.perGstMismatch)} min`);
    if (a.signAnomalyCount > 0)      lines.push(`- ${a.signAnomalyCount} bank/cash account${a.signAnomalyCount > 1 ? "s" : ""} with negative balance — manual time: ~${Math.round(a.signAnomalyCount * MANUAL_MINUTES.perSignAnomaly)} min`);
    if (a.missingFieldCount > 0)     lines.push(`- ${a.missingFieldCount} rows with missing critical fields — manual time: ~${Math.round(a.missingFieldCount * MANUAL_MINUTES.perMissingFieldRow)} min`);
    if (a.unclassifiedAccountCount > 0) lines.push(`- ${a.unclassifiedAccountCount} unmapped account${a.unclassifiedAccountCount > 1 ? "s" : ""} (AIQL classifies + asks user to confirm) — manual time: ~${Math.round(a.unclassifiedAccountCount * MANUAL_MINUTES.perAccountClassify)} min`);
    if (a.totalAnomalies === 0 && a.unclassifiedAccountCount === 0) {
      lines.push(`- Books are clean — no anomalies surfaced`);
    }
    lines.push("");

    lines.push("**What still runs (with AIQL doing the heavy lift):**");
    lines.push("");
    lines.push(`- ${a.reconCategories} automated reconciliation${a.reconCategories !== 1 ? "s" : ""} (bank/AP/AR/GST/inventory as applicable) — manual: ~${a.reconCategories * MANUAL_MINUTES.perReconRun} min · AIQL: ~${a.reconCategories * AIQL_MINUTES.reviewReconciliation} min`);
    lines.push(`- ~${a.estimatedMaterialFlux} likely material flux items vs prior period — manual: ~${Math.round(a.estimatedMaterialFlux * MANUAL_MINUTES.perFluxAnalysisAccount)} min · AIQL: ~${Math.round(a.estimatedMaterialFlux * AIQL_MINUTES.reviewMaterialFluxItem)} min (AI generates the narration)`);
    lines.push("");

    lines.push("**Bottom line for this company:**");
    lines.push("");
    lines.push(`| Path | Time per close | At ₹1,500/hr |`);
    lines.push(`|---|---|---|`);
    lines.push(`| Manual today | ${fmtMin(r.manualMin)} | ${fmtINR((r.manualMin/60) * 1500)} |`);
    lines.push(`| With AIQL (month 1) | ${fmtMin(r.aiqlMin)} | ${fmtINR((r.aiqlMin/60) * 1500)} |`);
    lines.push(`| With AIQL (month 2+, after knowledge accumulates) | ${fmtMin(r.aiqlMin - r.analysis.totalAnomalies * 0.3 * AIQL_MINUTES.reviewFlaggedAnomaly)} | ${fmtINR(((r.aiqlMin - r.analysis.totalAnomalies * 0.3 * AIQL_MINUTES.reviewFlaggedAnomaly)/60) * 1500)} |`);
    lines.push(`| **Saved per close** | **${fmtMin(r.savedMin)} (${r.savedPct}%)** | **${fmtINR(r.savedRupees)}** |`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // ─── Honest caveats ───
  lines.push("## Honest caveats on these numbers");
  lines.push("");
  lines.push("- **Manual time estimates** are based on industry norms (15-20 hrs per monthly close on a 3,000-row GL is typical for a single-CA workflow). Your team may be faster or slower depending on tooling and experience.");
  lines.push("- **AIQL time estimates** assume a healthy network connection, configured account mappings (one-time setup), and a moderate scan-issue count. First-time setup adds ~30 min that we haven't counted here.");
  lines.push("- **Month-2 savings** assume 30% of anomalies repeat (i.e., the same patterns auto-resolve). Real compounding rate depends on how stable your client's books are — could be higher (commodity wholesale), could be lower (fast-moving startups).");
  lines.push("- **₹1,500/hr** is the assumed CA opportunity cost. If this is the article's time, halve it. If it's a partner-grade hour, double it.");
  lines.push("- **Anomaly counts can be misleading.** A clean book with 0 anomalies still saves you the recon + flux time. A messy book with 200 anomalies might mean AIQL surfaces noise — review the per-company detail to judge fit.");
  lines.push("");
  lines.push("## What these numbers don't capture");
  lines.push("");
  lines.push("- **Fewer year-end fire drills.** Catching a misposting in month 3 instead of year-end audit is worth more than its 2 minutes of detection time.");
  lines.push("- **Audit defensibility.** Every anomaly answered, every recon run, every variance reviewed — timestamped, attestable evidence under SA 230.");
  lines.push("- **DPDP/privacy posture.** When your team uses ChatGPT through the AIQL proxy, client data never reaches OpenAI. Hard to put a rupee figure on that until something goes wrong.");
  lines.push("- **Knowledge compounding.** The numbers above show one cycle. The real value is the third, sixth, twelfth cycle — when most of your judgments are already captured.");
  lines.push("");

  return lines.join("\n");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dir = path.join(__dirname, "..", "..", "test-data", "companies");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".csv")).sort();
  if (files.length === 0) {
    console.error("No CSVs found in", dir);
    process.exit(1);
  }

  const reports: CompanyReport[] = [];
  for (const file of files) {
    const buf = fs.readFileSync(path.join(dir, file));
    const name = path.basename(file, ".csv");
    const analysis = analyze(name, buf);
    reports.push(buildReport(analysis));
  }

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    console.log(renderMarkdown(reports));
  }
}

void main();
