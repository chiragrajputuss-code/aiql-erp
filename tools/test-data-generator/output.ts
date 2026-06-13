/**
 * CSV writer with multiple column conventions + README generator.
 */

import * as fs from "fs";
import * as path from "path";
import type { CompanyConfig, ColumnConvention } from "./companies";
import type { Transaction, SeededIssue } from "./generator";

// ─── Column header mapping per convention ─────────────────────────────────────

interface ColumnMap {
  date:        string;
  voucherNo:   string;
  voucherType: string;
  account:     string;
  party?:      string;
  vendor?:     string;
  customer?:   string;
  debit:       string;
  credit:      string;
  narration:   string;
}

const COLUMN_MAPS: Record<ColumnConvention, ColumnMap> = {
  tally_classic: {
    date: "Date", voucherNo: "Vch No", voucherType: "Vch Type",
    account: "Particulars", debit: "Debit", credit: "Credit", narration: "Narration",
  },
  verbose: {
    date: "Voucher Date", voucherNo: "Reference No", voucherType: "Voucher Type",
    account: "Account Head", party: "Party Name",
    debit: "Dr Amount", credit: "Cr Amount", narration: "Description",
  },
  hindi_mixed: {
    date: "दिनांक", voucherNo: "Vch No", voucherType: "Voucher Type",
    account: "Account Name", debit: "उधार", credit: "जमा", narration: "Narration",
  },
  tally_with_party: {
    date: "Date", voucherNo: "Vch No", voucherType: "Vch Type",
    account: "Account", party: "Party",
    debit: "Debit", credit: "Credit", narration: "Narration",
  },
  sap_style: {
    date: "Posting Date", voucherNo: "Document No", voucherType: "Document Type",
    account: "GL Account", vendor: "Vendor", customer: "Customer",
    debit: "Dr Amt", credit: "Cr Amt", narration: "Text",
  },
  canonical: {
    date: "transaction_date", voucherNo: "reference_number", voucherType: "voucher_type",
    account: "account_name", party: "party_name",
    debit: "debit_amount", credit: "credit_amount", narration: "description",
  },
  shortened: {
    date: "Dt", voucherNo: "VchNo", voucherType: "VchTyp",
    account: "Acct", party: "Party",
    debit: "Dr", credit: "Cr", narration: "Narr",
  },
};

// ─── CSV escaping ────────────────────────────────────────────────────────────

function csvEscape(value: string | number): string {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatAmount(n: number): string {
  if (n === 0) return "";
  return n.toFixed(2);
}

// ─── CSV writer ──────────────────────────────────────────────────────────────

export function writeCSV(
  outPath:     string,
  company:     CompanyConfig,
  transactions: Transaction[]
): void {
  const cols = COLUMN_MAPS[company.columnConvention];

  // Build header row
  const headers: string[] = [cols.date, cols.voucherNo, cols.voucherType, cols.account];
  if (cols.party)    headers.push(cols.party);
  if (cols.vendor)   headers.push(cols.vendor);
  if (cols.customer) headers.push(cols.customer);
  headers.push(cols.debit, cols.credit, cols.narration);

  const lines: string[] = [headers.map(csvEscape).join(",")];

  for (const txn of transactions) {
    const row: (string | number)[] = [
      txn.date,
      txn.voucherNo,
      txn.voucherType,
      txn.accountName,
    ];
    if (cols.party)    row.push(txn.partyName ?? "");
    if (cols.vendor)   row.push(txn.vendorName ?? "");
    if (cols.customer) row.push(txn.customerName ?? "");
    row.push(formatAmount(txn.debit), formatAmount(txn.credit), txn.narration);
    lines.push(row.map(csvEscape).join(","));
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
}

// ─── README writer ───────────────────────────────────────────────────────────

export function writeREADME(
  outPath:      string,
  company:      CompanyConfig,
  transactions: Transaction[],
  issues:       SeededIssue[]
): void {
  const issuesByType = issues.reduce((acc, i) => {
    (acc[i.type] ??= []).push(i);
    return acc;
  }, {} as Record<string, SeededIssue[]>);

  const distinctAccounts = Array.from(new Set(transactions.map((t) => t.accountName))).length;
  const distinctVouchers = Array.from(new Set(transactions.map((t) => t.voucherNo))).length;
  const totalDr = transactions.reduce((s, t) => s + t.debit,  0);
  const totalCr = transactions.reduce((s, t) => s + t.credit, 0);

  const sections: string[] = [
    `# ${company.name}`,
    "",
    `**City:** ${company.city}`,
    `**Industry:** ${company.industry.replace(/_/g, " ")}`,
    `**GST Regime:** ${company.gstRegime}${company.compositionRate ? ` (${company.compositionRate}%)` : ""}`,
    `**Period:** ${company.periodStart} to ${company.periodEnd}`,
    `**Column convention:** \`${company.columnConvention}\``,
    "",
    "## Statistics",
    "",
    `- **Total transaction lines:** ${transactions.length.toLocaleString()}`,
    `- **Distinct vouchers:** ${distinctVouchers.toLocaleString()}`,
    `- **Distinct accounts used:** ${distinctAccounts}`,
    `- **Total debits:** ₹${totalDr.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`,
    `- **Total credits:** ₹${totalCr.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`,
    `- **Imbalance (Dr - Cr):** ₹${(totalDr - totalCr).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`,
    "",
    "## Chart of accounts",
    "",
    `${company.vendorCount} vendors, ${company.customerCount} customers, ${company.bankAccounts.length} bank/cash accounts.`,
    "",
    "Bank/Cash accounts:",
    company.bankAccounts.map((b) => `- ${b}`).join("\n"),
    "",
    "## Deliberately seeded issues",
    "",
    "These issues are intentional. The AIQL Data Quality Scanner should detect them.",
    "",
  ];

  for (const [type, items] of Object.entries(issuesByType)) {
    sections.push(`### ${prettifyIssueType(type)} (${items.length})`);
    sections.push("");
    for (const item of items.slice(0, 10)) {
      sections.push(`- ${item.description}`);
    }
    if (items.length > 10) {
      sections.push(`- ...and ${items.length - 10} more`);
    }
    sections.push("");
  }

  if (company.fluxSpikes && Object.keys(company.fluxSpikes).length > 0) {
    sections.push("## Deliberate flux variances (for period-over-period testing)");
    sections.push("");
    sections.push("These accounts spike in the latter half of the period. Flux analysis should flag them as material variances:");
    sections.push("");
    for (const [acct, mult] of Object.entries(company.fluxSpikes)) {
      const direction = mult > 1 ? "spike" : "drop";
      sections.push(`- **${acct}** — ${direction} of ${(mult * 100 - 100).toFixed(0)}% in second half`);
    }
    sections.push("");
  }

  sections.push("## Expected scanner output");
  sections.push("");
  sections.push("When this CSV is uploaded and scanned, the engine should report:");
  sections.push("");

  const cfg = company.seededIssues;
  if (cfg.voucherImbalance > 0) sections.push(`- ${cfg.voucherImbalance} voucher imbalance(s) — \`voucher_imbalance\``);
  if (cfg.duplicateTransactions > 0) sections.push(`- ${cfg.duplicateTransactions} duplicate transaction(s) — \`duplicate_transactions\``);
  if (cfg.dateOutliers > 0) sections.push(`- ${cfg.dateOutliers} date outlier(s) — \`date_outliers\``);
  if (cfg.missingFields > 0) sections.push(`- ${cfg.missingFields} missing field(s) — \`missing_fields\``);
  if (cfg.unclassifiedAccounts > 0) sections.push(`- ${cfg.unclassifiedAccounts} unclassified account(s) — \`unclassified_accounts\``);
  if (cfg.gstMismatch > 0) sections.push(`- ${cfg.gstMismatch} CGST ≠ SGST mismatch(es) — \`gst_mismatch\``);
  if (cfg.signAnomalies > 0) sections.push(`- ${cfg.signAnomalies} sign anomaly(ies) — \`sign_anomalies\``);

  sections.push("");
  sections.push("---");
  sections.push("");
  sections.push("_Generated by AIQL test-data-generator. Synthetic data — no real PII._");

  fs.writeFileSync(outPath, sections.join("\n"), "utf-8");
}

function prettifyIssueType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Output directory helpers ────────────────────────────────────────────────

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function joinPath(...parts: string[]): string {
  return path.join(...parts);
}
