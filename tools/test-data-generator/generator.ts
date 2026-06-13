/**
 * Core transaction generator.
 *
 * Generates realistic Indian SME GL vouchers respecting accounting rules:
 *   - Sales:    Customer Dr,  Sales Cr,   GST Cr  (regular GST)
 *   - Purchase: Purchase Dr,  GST Dr,     Vendor Cr
 *   - Receipt:  Bank Dr,      Customer Cr
 *   - Payment:  Vendor Dr,    Bank Cr
 *   - Journal:  flexible
 *   - Contra:   Bank Dr,      Bank Cr (transfer)
 *
 * Then applies seeded issues to create deliberate quality problems.
 */

import { CompanyConfig, buildChartOfAccounts } from "./companies";

// ─── Seeded RNG (Mulberry32) for reproducibility ──────────────────────────────

export function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RNG = () => number;

const pick = <T,>(arr: T[], rng: RNG): T => arr[Math.floor(rng() * arr.length)]!;
const intBetween = (min: number, max: number, rng: RNG): number => Math.floor(rng() * (max - min + 1)) + min;
const between = (min: number, max: number, rng: RNG): number => rng() * (max - min) + min;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Indian names ─────────────────────────────────────────────────────────────

const VENDOR_NAME_PARTS = {
  prefix: ["Shree", "Maa", "Krishna", "Om", "Sai", "Ganesh", "Lakshmi", "Bharat", "Sidh", "Ratan"],
  middle: ["Steel", "Industries", "Trading", "Suppliers", "Enterprises", "Traders", "Agencies", "Mills", "Works", "Services"],
  suffix: ["Pvt Ltd", "LLP", "& Sons", "& Co", "Pvt Ltd", "Pvt Ltd", "& Bros", "Group", "Pvt Ltd", "Industries"],
};

const CUSTOMER_FIRSTNAMES = ["Amit", "Priya", "Rahul", "Sunita", "Rajesh", "Anjali", "Vikram", "Pooja", "Suresh", "Kavita",
  "Manoj", "Neha", "Arjun", "Meena", "Sanjay", "Ritu", "Deepak", "Swati", "Nitin", "Asha"];
const CUSTOMER_LASTNAMES = ["Sharma", "Patel", "Singh", "Kumar", "Gupta", "Reddy", "Iyer", "Mehta", "Nair", "Verma",
  "Shah", "Joshi", "Desai", "Bhat", "Kapoor", "Rao", "Pillai", "Banerjee", "Choudhary", "Agarwal"];

function generateVendorName(rng: RNG): string {
  return `${pick(VENDOR_NAME_PARTS.prefix, rng)} ${pick(VENDOR_NAME_PARTS.middle, rng)} ${pick(VENDOR_NAME_PARTS.suffix, rng)}`;
}

function generateCustomerName(rng: RNG): string {
  return `${pick(CUSTOMER_FIRSTNAMES, rng)} ${pick(CUSTOMER_LASTNAMES, rng)}`;
}

// ─── Format-valid fake Indian PAN/GSTIN ───────────────────────────────────────

function generatePAN(rng: RNG): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const ent = pick(["AAAPL", "ABCDE", "PQRST", "AAFCS", "BBHPM"], rng);
  const num = String(intBetween(1000, 9999, rng));
  const last = upper[Math.floor(rng() * 26)]!;
  return `${ent}${num}${last}`;
}

// ─── Voucher number generator ─────────────────────────────────────────────────

class VoucherNumberer {
  private counters: Map<string, number> = new Map([
    ["Sales", 1000], ["Purchase", 1000], ["Receipt", 1000],
    ["Payment", 1000], ["Journal", 1000], ["Contra", 1000],
  ]);

  next(type: string): string {
    const prefix = ({
      "Sales": "INV", "Purchase": "PUR", "Receipt": "BR",
      "Payment": "BP", "Journal": "JV", "Contra": "CON",
    } as Record<string, string>)[type] ?? "VCH";
    const n = this.counters.get(type) ?? 1000;
    this.counters.set(type, n + 1);
    return `${prefix}-${String(n).padStart(4, "0")}`;
  }
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function dateInRange(start: Date, end: Date, rng: RNG): Date {
  const startMs = start.getTime();
  const endMs   = end.getTime();
  return new Date(startMs + rng() * (endMs - startMs));
}

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Core types ──────────────────────────────────────────────────────────────

export interface Transaction {
  date:            string;     // YYYY-MM-DD
  voucherNo:       string;
  voucherType:     string;
  accountName:     string;
  partyName?:      string;
  vendorName?:     string;
  customerName?:   string;
  debit:           number;
  credit:          number;
  narration:       string;
}

// ─── Voucher generators ──────────────────────────────────────────────────────

interface GenContext {
  company:  CompanyConfig;
  rng:      RNG;
  vendors:  string[];
  customers: string[];
  vouchers: VoucherNumberer;
  bankAccounts: string[];
  inventory: string[];      // inventory account names
  expenses:  string[];
  revenues:  string[];
  cogs:      string[];
}

function genSales(ctx: GenContext, date: Date, accounts: ReturnType<typeof buildChartOfAccounts>): Transaction[] {
  const customer = pick(ctx.customers, ctx.rng);
  const revenueAcct = pick(ctx.revenues, ctx.rng);
  const baseAmount = round2(between(2000, 200_000, ctx.rng));
  const voucherNo = ctx.vouchers.next("Sales");
  const dt = isoDateOnly(date);

  if (ctx.company.gstRegime === "composition") {
    // Simple sales voucher, no GST split
    return [
      { date: dt, voucherNo, voucherType: "Sales", accountName: "Sundry Debtors",
        partyName: customer, customerName: customer, debit: baseAmount, credit: 0,
        narration: `Being sales to ${customer}` },
      { date: dt, voucherNo, voucherType: "Sales", accountName: revenueAcct,
        debit: 0, credit: baseAmount, narration: `Being sales to ${customer}` },
    ];
  }

  // Regular GST: 18% split as 9% CGST + 9% SGST (intra-state)
  const taxRate = 0.18;
  const taxAmount = round2(baseAmount * taxRate);
  const cgst = round2(taxAmount / 2);
  const sgst = round2(taxAmount / 2);
  const totalInvoice = round2(baseAmount + taxAmount);

  return [
    { date: dt, voucherNo, voucherType: "Sales", accountName: "Sundry Debtors",
      partyName: customer, customerName: customer, debit: totalInvoice, credit: 0,
      narration: `Being sales to ${customer}` },
    { date: dt, voucherNo, voucherType: "Sales", accountName: revenueAcct,
      debit: 0, credit: baseAmount, narration: `Sale of goods to ${customer}` },
    { date: dt, voucherNo, voucherType: "Sales", accountName: "CGST Output @9%",
      debit: 0, credit: cgst, narration: `CGST on sale to ${customer}` },
    { date: dt, voucherNo, voucherType: "Sales", accountName: "SGST Output @9%",
      debit: 0, credit: sgst, narration: `SGST on sale to ${customer}` },
  ];
}

function genPurchase(ctx: GenContext, date: Date): Transaction[] {
  const vendor = pick(ctx.vendors, ctx.rng);
  const cogsAcct = pick(ctx.cogs, ctx.rng);
  const baseAmount = round2(between(5000, 300_000, ctx.rng));
  const voucherNo = ctx.vouchers.next("Purchase");
  const dt = isoDateOnly(date);

  if (ctx.company.gstRegime === "composition") {
    return [
      { date: dt, voucherNo, voucherType: "Purchase", accountName: cogsAcct,
        debit: baseAmount, credit: 0, narration: `Purchase from ${vendor}` },
      { date: dt, voucherNo, voucherType: "Purchase", accountName: "Sundry Creditors",
        partyName: vendor, vendorName: vendor, debit: 0, credit: baseAmount,
        narration: `Purchase from ${vendor}` },
    ];
  }

  const taxRate = 0.18;
  const taxAmount = round2(baseAmount * taxRate);
  const cgst = round2(taxAmount / 2);
  const sgst = round2(taxAmount / 2);
  const totalBill = round2(baseAmount + taxAmount);

  return [
    { date: dt, voucherNo, voucherType: "Purchase", accountName: cogsAcct,
      debit: baseAmount, credit: 0, narration: `Purchase from ${vendor}` },
    { date: dt, voucherNo, voucherType: "Purchase", accountName: "CGST Input @9%",
      debit: cgst, credit: 0, narration: `CGST input on purchase from ${vendor}` },
    { date: dt, voucherNo, voucherType: "Purchase", accountName: "SGST Input @9%",
      debit: sgst, credit: 0, narration: `SGST input on purchase from ${vendor}` },
    { date: dt, voucherNo, voucherType: "Purchase", accountName: "Sundry Creditors",
      partyName: vendor, vendorName: vendor, debit: 0, credit: totalBill,
      narration: `Purchase from ${vendor}` },
  ];
}

function genReceipt(ctx: GenContext, date: Date): Transaction[] {
  const customer = pick(ctx.customers, ctx.rng);
  const bank = pick(ctx.bankAccounts, ctx.rng);
  const amount = round2(between(2000, 250_000, ctx.rng));
  const voucherNo = ctx.vouchers.next("Receipt");
  const dt = isoDateOnly(date);

  return [
    { date: dt, voucherNo, voucherType: "Receipt", accountName: bank,
      debit: amount, credit: 0, narration: `Received from ${customer}` },
    { date: dt, voucherNo, voucherType: "Receipt", accountName: "Sundry Debtors",
      partyName: customer, customerName: customer, debit: 0, credit: amount,
      narration: `Received from ${customer}` },
  ];
}

function genPayment(ctx: GenContext, date: Date): Transaction[] {
  const vendor = pick(ctx.vendors, ctx.rng);
  const bank = pick(ctx.bankAccounts, ctx.rng);
  const amount = round2(between(5000, 300_000, ctx.rng));
  const voucherNo = ctx.vouchers.next("Payment");
  const dt = isoDateOnly(date);

  return [
    { date: dt, voucherNo, voucherType: "Payment", accountName: "Sundry Creditors",
      partyName: vendor, vendorName: vendor, debit: amount, credit: 0,
      narration: `Payment to ${vendor}` },
    { date: dt, voucherNo, voucherType: "Payment", accountName: bank,
      debit: 0, credit: amount, narration: `Payment to ${vendor}` },
  ];
}

function genJournal(ctx: GenContext, date: Date): Transaction[] {
  const expense = pick(ctx.expenses, ctx.rng);
  const bank = pick(ctx.bankAccounts, ctx.rng);
  const amount = round2(between(500, 100_000, ctx.rng));
  const voucherNo = ctx.vouchers.next("Journal");
  const dt = isoDateOnly(date);

  return [
    { date: dt, voucherNo, voucherType: "Journal", accountName: expense,
      debit: amount, credit: 0, narration: `Being ${expense.toLowerCase()} for the period` },
    { date: dt, voucherNo, voucherType: "Journal", accountName: bank,
      debit: 0, credit: amount, narration: `Being ${expense.toLowerCase()} for the period` },
  ];
}

function genContra(ctx: GenContext, date: Date): Transaction[] {
  if (ctx.bankAccounts.length < 2) return genJournal(ctx, date);
  const [bank1, bank2] = [...ctx.bankAccounts].sort(() => ctx.rng() - 0.5);
  const amount = round2(between(10_000, 500_000, ctx.rng));
  const voucherNo = ctx.vouchers.next("Contra");
  const dt = isoDateOnly(date);

  return [
    { date: dt, voucherNo, voucherType: "Contra", accountName: bank1!,
      debit: amount, credit: 0, narration: `Transfer from ${bank2} to ${bank1}` },
    { date: dt, voucherNo, voucherType: "Contra", accountName: bank2!,
      debit: 0, credit: amount, narration: `Transfer from ${bank2} to ${bank1}` },
  ];
}

// ─── Main: generate clean transactions then seed issues ───────────────────────

export interface SeededIssue {
  type:        string;
  description: string;
  affectedRefs: string[];
}

export function generateTransactions(company: CompanyConfig, seed: number): {
  transactions: Transaction[];
  seededIssues: SeededIssue[];
} {
  const rng = makeRng(seed);

  // Build chart of accounts
  const accounts = buildChartOfAccounts(company);

  // Build vendor/customer pools
  const vendors:   string[] = [];
  const customers: string[] = [];
  for (let i = 0; i < company.vendorCount; i++)   vendors.push(generateVendorName(rng));
  for (let i = 0; i < company.customerCount; i++) customers.push(generateCustomerName(rng));

  const ctx: GenContext = {
    company, rng, vendors, customers,
    vouchers:     new VoucherNumberer(),
    bankAccounts: company.bankAccounts.filter((b) => !b.toLowerCase().includes("cash")),
    inventory:    accounts.filter((a) => a.type === "INVENTORY").map((a) => a.name),
    expenses:     accounts.filter((a) => a.type === "EXPENSE").map((a) => a.name),
    revenues:     accounts.filter((a) => a.type === "REVENUE").map((a) => a.name),
    cogs:         accounts.filter((a) => a.type === "COGS").map((a) => a.name),
  };

  if (ctx.bankAccounts.length === 0) ctx.bankAccounts = company.bankAccounts.slice(0, 1);
  if (ctx.expenses.length === 0)     ctx.expenses = ["Office Rent"];
  if (ctx.revenues.length === 0)     ctx.revenues = ["Service Income"];
  if (ctx.cogs.length === 0)         ctx.cogs = ctx.expenses;

  const startDate = new Date(company.periodStart);
  const endDate   = new Date(company.periodEnd);

  // Variability: target row count ±20%
  const targetCount = Math.round(company.baseRowCount * (0.8 + rng() * 0.4));

  const transactions: Transaction[] = [];

  // Voucher type distribution per company industry
  const distribution: Record<string, number> = {
    Sales: 0.30, Purchase: 0.25, Receipt: 0.18,
    Payment: 0.15, Journal: 0.08, Contra: 0.04,
  };

  while (transactions.length < targetCount) {
    const r = rng();
    let cumulative = 0;
    let picked = "Sales";
    for (const [type, prob] of Object.entries(distribution)) {
      cumulative += prob;
      if (r <= cumulative) { picked = type; break; }
    }

    const date = dateInRange(startDate, endDate, rng);
    let lines: Transaction[];
    switch (picked) {
      case "Sales":    lines = genSales(ctx, date, accounts); break;
      case "Purchase": lines = genPurchase(ctx, date);        break;
      case "Receipt":  lines = genReceipt(ctx, date);         break;
      case "Payment":  lines = genPayment(ctx, date);         break;
      case "Contra":   lines = genContra(ctx, date);          break;
      default:         lines = genJournal(ctx, date);
    }
    transactions.push(...lines);
  }

  // Apply flux spike multipliers — bias towards latter half of period
  // (spike account values become 2x-5x typical in the last month)
  if (company.fluxSpikes) {
    const halfwayMs = (startDate.getTime() + endDate.getTime()) / 2;
    for (const txn of transactions) {
      const txnDate = new Date(txn.date).getTime();
      if (txnDate < halfwayMs) continue;
      for (const [acctName, multiplier] of Object.entries(company.fluxSpikes)) {
        if (txn.accountName === acctName && (txn.debit > 0 || txn.credit > 0)) {
          if (txn.debit > 0)  txn.debit  = round2(txn.debit  * multiplier);
          if (txn.credit > 0) txn.credit = round2(txn.credit * multiplier);
        }
      }
    }
  }

  // Apply seeded issues
  const issues: SeededIssue[] = [];
  applySeededIssues(transactions, company, rng, issues);

  // Sort by date for realism
  transactions.sort((a, b) => a.date.localeCompare(b.date) || a.voucherNo.localeCompare(b.voucherNo));

  return { transactions, seededIssues: issues };
}

// ─── Seeded issue applicators ─────────────────────────────────────────────────

function applySeededIssues(
  txns:    Transaction[],
  company: CompanyConfig,
  rng:     RNG,
  log:     SeededIssue[]
): void {
  const cfg = company.seededIssues;

  // Voucher imbalance: pick N vouchers, add small Dr-Cr difference (rounding)
  const allVouchers = Array.from(new Set(txns.map((t) => t.voucherNo)));
  for (let i = 0; i < cfg.voucherImbalance; i++) {
    const vNo = pick(allVouchers, rng);
    const lines = txns.filter((t) => t.voucherNo === vNo);
    if (lines.length === 0) continue;
    const lastLine = lines[lines.length - 1]!;
    const delta = round2(between(0.01, 99.99, rng));
    if (lastLine.debit > 0)  lastLine.debit  = round2(lastLine.debit + delta);
    else                     lastLine.credit = round2(lastLine.credit + delta);
    log.push({
      type: "voucher_imbalance",
      description: `Voucher ${vNo} has Dr ≠ Cr by ₹${delta}`,
      affectedRefs: [vNo],
    });
  }

  // Duplicate transactions: pick N transactions, duplicate them with date shift 1-7 days
  for (let i = 0; i < cfg.duplicateTransactions; i++) {
    const original = pick(txns, rng);
    if (original.debit === 0 && original.credit === 0) continue;
    const shiftDays = intBetween(1, 7, rng);
    const newDate = new Date(original.date);
    newDate.setDate(newDate.getDate() + shiftDays);
    const dupVchNo = `${original.voucherNo}-DUP`;
    const dupLines = txns.filter((t) => t.voucherNo === original.voucherNo).map((t) => ({
      ...t,
      voucherNo: dupVchNo,
      date: isoDateOnly(newDate),
    }));
    txns.push(...dupLines);
    log.push({
      type: "duplicate_transactions",
      description: `Duplicate of ${original.voucherNo} as ${dupVchNo}, ${shiftDays}d later`,
      affectedRefs: [original.voucherNo, dupVchNo],
    });
  }

  // Date outliers: pick N entries, change date to outside period
  const start = new Date(company.periodStart);
  for (let i = 0; i < cfg.dateOutliers; i++) {
    const txn = pick(txns, rng);
    const yearShift = rng() < 0.5 ? -1 : 0;
    const monthShift = rng() < 0.5 ? -3 : 6;
    const badDate = new Date(start);
    badDate.setFullYear(badDate.getFullYear() + yearShift);
    badDate.setMonth(badDate.getMonth() + monthShift);
    txn.date = isoDateOnly(badDate);
    log.push({
      type: "date_outliers",
      description: `Voucher ${txn.voucherNo} dated ${txn.date} (outside period)`,
      affectedRefs: [txn.voucherNo],
    });
  }

  // Missing fields: pick N entries, blank the narration or zero amount
  for (let i = 0; i < cfg.missingFields; i++) {
    const txn = pick(txns, rng);
    if (rng() < 0.7) {
      txn.narration = "";
      log.push({ type: "missing_fields", description: `Voucher ${txn.voucherNo} missing narration`, affectedRefs: [txn.voucherNo] });
    } else {
      // Zero out amount (creates entry with no Dr or Cr)
      txn.debit = 0;
      txn.credit = 0;
      log.push({ type: "missing_fields", description: `Voucher ${txn.voucherNo} has zero amount`, affectedRefs: [txn.voucherNo] });
    }
  }

  // Unclassified accounts: insert N transactions with weird account names
  const weirdAccounts = [
    "Misc Expenses 999", "Suspense A/c", "Adjustment Account",
    "Petty Refund", "Old Liability A/c", "Round Off",
    "Sundry Adjustments", "Temp Holding", "Reconciliation A/c", "Other Charges",
  ];
  for (let i = 0; i < cfg.unclassifiedAccounts; i++) {
    const date = dateInRange(start, new Date(company.periodEnd), rng);
    const amount = round2(between(100, 10_000, rng));
    const acct = pick(weirdAccounts, rng);
    const vNo = `JV-X${String(intBetween(100, 999, rng))}`;
    const dt = isoDateOnly(date);
    txns.push(
      { date: dt, voucherNo: vNo, voucherType: "Journal", accountName: acct,
        debit: amount, credit: 0, narration: `Unknown adjustment` },
      { date: dt, voucherNo: vNo, voucherType: "Journal", accountName: company.bankAccounts[0]!,
        debit: 0, credit: amount, narration: `Unknown adjustment` },
    );
    log.push({
      type: "unclassified_accounts",
      description: `Account "${acct}" used (${vNo})`,
      affectedRefs: [vNo],
    });
  }

  // GST mismatch: only for regular GST. Modify CGST or SGST in N vouchers
  if (company.gstRegime === "regular" && cfg.gstMismatch > 0) {
    const salesVouchers = Array.from(new Set(
      txns.filter((t) => t.voucherType === "Sales").map((t) => t.voucherNo)
    ));
    for (let i = 0; i < cfg.gstMismatch; i++) {
      const vNo = pick(salesVouchers, rng);
      const cgstLine = txns.find((t) => t.voucherNo === vNo && t.accountName === "CGST Output @9%");
      const sgstLine = txns.find((t) => t.voucherNo === vNo && t.accountName === "SGST Output @9%");
      if (!cgstLine || !sgstLine) continue;
      // Tweak CGST by ±5-15%
      const delta = round2(cgstLine.credit * between(0.05, 0.15, rng) * (rng() < 0.5 ? -1 : 1));
      cgstLine.credit = round2(cgstLine.credit + delta);
      log.push({
        type: "gst_mismatch",
        description: `Voucher ${vNo} has CGST ≠ SGST (delta ₹${Math.abs(delta)})`,
        affectedRefs: [vNo],
      });
    }
  }

  // Sign anomalies: insert vouchers that put Sundry Creditors in Dr balance
  // (e.g., refund from vendor without proper reclass)
  for (let i = 0; i < cfg.signAnomalies; i++) {
    const vendor = pick(company.vendorCount > 0 ? Array.from({ length: company.vendorCount }, (_, k) => `${pick(VENDOR_NAME_PARTS.prefix, rng)} ${pick(VENDOR_NAME_PARTS.middle, rng)}`) : ["Some Vendor"], rng);
    const date = dateInRange(start, new Date(company.periodEnd), rng);
    const amount = round2(between(50_000, 200_000, rng));
    const vNo = `JV-S${String(intBetween(100, 999, rng))}`;
    const dt = isoDateOnly(date);
    // Put Dr in Sundry Creditors (reverse direction)
    txns.push(
      { date: dt, voucherNo: vNo, voucherType: "Journal", accountName: "Sundry Creditors",
        partyName: vendor, vendorName: vendor, debit: amount, credit: 0,
        narration: `Refund/advance from vendor` },
      { date: dt, voucherNo: vNo, voucherType: "Journal", accountName: company.bankAccounts[0]!,
        debit: 0, credit: amount, narration: `Refund/advance from vendor` },
    );
    log.push({
      type: "sign_anomalies",
      description: `Sundry Creditors with Dr balance for ${vendor} (₹${amount})`,
      affectedRefs: [vNo],
    });
  }
}
