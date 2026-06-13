/**
 * 10 Indian SME company configurations for synthetic GL data generation.
 *
 * Each company has:
 *   - Industry profile (drives chart of accounts, transaction patterns)
 *   - Period covered (different quarters across FY24-25, FY25-26, FY26-27)
 *   - Column naming convention (tests our column mapper)
 *   - GST regime (regular vs composition)
 *   - Volume range
 *   - Seeded issue counts
 */

export type Industry =
  | "manufacturing" | "wholesale" | "it_services" | "fmcg_distribution"
  | "construction" | "healthcare" | "textiles" | "restaurant"
  | "logistics" | "education";

export type GstRegime = "regular" | "composition";

export type ColumnConvention =
  | "tally_classic"      // Date, Particulars, Vch Type, Vch No, Debit, Credit, Narration
  | "verbose"            // Voucher Date, Account Head, Voucher Type, Reference No, Dr Amount, Cr Amount, Description
  | "hindi_mixed"        // दिनांक, Account Name, Voucher Type, Vch No, उधार, जमा, Narration
  | "tally_with_party"   // Date, Vch No, Vch Type, Account, Party, Debit, Credit, Narration
  | "sap_style"          // Posting Date, GL Account, Document No, Document Type, Dr Amt, Cr Amt, Text
  | "canonical"          // transaction_date, account_name, voucher_type, reference_number, debit_amount, credit_amount
  | "shortened";         // Dt, Acct, VchTyp, VchNo, Dr, Cr, Narr, Party

export interface CompanyConfig {
  id:           string;
  name:         string;
  city:         string;
  industry:     Industry;
  gstRegime:    GstRegime;
  /** Composition rate (1% / 5%) — only set for composition */
  compositionRate?: 1 | 5 | 6;
  /** Period start (inclusive) */
  periodStart:  string;     // YYYY-MM-DD
  periodEnd:    string;
  /** Number of transactions to generate (will be randomised within ±20%) */
  baseRowCount: number;
  /** Column header convention */
  columnConvention: ColumnConvention;
  /** Bank accounts in chart */
  bankAccounts: string[];
  /** Vendor count */
  vendorCount: number;
  /** Customer count */
  customerCount: number;
  /** Seeded issue counts (deliberate quality problems for the scanner to find) */
  seededIssues: {
    voucherImbalance:    number;  // vouchers with Dr ≠ Cr
    duplicateTransactions: number; // same party + amount within 7 days
    dateOutliers:        number;  // entries dated outside period
    missingFields:       number;  // entries with blank narration / amount
    unclassifiedAccounts: number; // unusual account names
    gstMismatch:         number;  // CGST ≠ SGST (regular only)
    signAnomalies:       number;  // creditor with Dr balance
  };
  /** Flux-friendly: account name → spike multiplier (vs typical) */
  fluxSpikes?: Record<string, number>;
}

export const COMPANIES: CompanyConfig[] = [
  {
    id: "steelco",
    name: "SteelCo Industries Pvt Ltd",
    city: "Mumbai, Maharashtra",
    industry: "manufacturing",
    gstRegime: "regular",
    periodStart: "2025-04-01", // Q1 FY25-26
    periodEnd:   "2025-06-30",
    baseRowCount: 2800,
    columnConvention: "tally_classic",
    bankAccounts: ["HDFC Bank A/c", "ICICI Current A/c", "SBI Cash Credit A/c"],
    vendorCount: 45,
    customerCount: 32,
    seededIssues: {
      voucherImbalance: 6, duplicateTransactions: 3, dateOutliers: 3,
      missingFields: 12, unclassifiedAccounts: 7, gstMismatch: 5, signAnomalies: 2,
    },
    fluxSpikes: { "Power & Fuel": 2.4, "Raw Material - Steel": 1.8 },
  },
  {
    id: "sharma_electronics",
    name: "Sharma Electronics Trading Co",
    city: "New Delhi",
    industry: "wholesale",
    gstRegime: "regular",
    periodStart: "2025-07-01", // Q2 FY25-26
    periodEnd:   "2025-09-30",
    baseRowCount: 3200,
    columnConvention: "verbose",
    bankAccounts: ["Axis Bank A/c", "Kotak Current A/c"],
    vendorCount: 28,
    customerCount: 95,
    seededIssues: {
      voucherImbalance: 4, duplicateTransactions: 5, dateOutliers: 2,
      missingFields: 15, unclassifiedAccounts: 6, gstMismatch: 7, signAnomalies: 3,
    },
    fluxSpikes: { "Mobile Phones - Samsung": 3.1, "Discount Allowed": 0.4 },
  },
  {
    id: "techvista",
    name: "TechVista Solutions LLP",
    city: "Bengaluru, Karnataka",
    industry: "it_services",
    gstRegime: "regular",
    periodStart: "2025-10-01", // Q3 FY25-26
    periodEnd:   "2025-12-31",
    baseRowCount: 1600,
    columnConvention: "hindi_mixed",
    bankAccounts: ["HDFC Bank A/c", "ICICI EEFC USD A/c"],
    vendorCount: 22,
    customerCount: 18,
    seededIssues: {
      voucherImbalance: 3, duplicateTransactions: 2, dateOutliers: 2,
      missingFields: 8, unclassifiedAccounts: 9, gstMismatch: 4, signAnomalies: 1,
    },
    fluxSpikes: { "Salaries & Wages": 1.6, "AWS Cloud Services": 2.2 },
  },
  {
    id: "patel_distributors",
    name: "Patel Distributors Pvt Ltd",
    city: "Ahmedabad, Gujarat",
    industry: "fmcg_distribution",
    gstRegime: "regular",
    periodStart: "2026-01-01", // Q4 FY25-26 (year-end)
    periodEnd:   "2026-03-31",
    baseRowCount: 3500,
    columnConvention: "tally_with_party",
    bankAccounts: ["BoB Current A/c", "Yes Bank A/c"],
    vendorCount: 18,
    customerCount: 120,
    seededIssues: {
      voucherImbalance: 8, duplicateTransactions: 5, dateOutliers: 4,
      missingFields: 14, unclassifiedAccounts: 5, gstMismatch: 6, signAnomalies: 3,
    },
    fluxSpikes: { "Year-end Bonus": 5.0, "Sales - Hindustan Unilever": 1.4 },
  },
  {
    id: "buildpro",
    name: "BuildPro Infrastructure Pvt Ltd",
    city: "Pune, Maharashtra",
    industry: "construction",
    gstRegime: "regular",
    periodStart: "2024-04-01", // Q1 FY24-25 (older period)
    periodEnd:   "2024-06-30",
    baseRowCount: 2100,
    columnConvention: "sap_style",
    bankAccounts: ["SBI Construction A/c", "HDFC Bank A/c", "Cash-in-Hand"],
    vendorCount: 55,
    customerCount: 12,
    seededIssues: {
      voucherImbalance: 7, duplicateTransactions: 4, dateOutliers: 3,
      missingFields: 11, unclassifiedAccounts: 8, gstMismatch: 5, signAnomalies: 2,
    },
    fluxSpikes: { "Subcontractor Payments": 2.8, "Cement Purchases": 1.7 },
  },
  {
    id: "apollo_diag",
    name: "Apollo Diagnostics Centre",
    city: "Chennai, Tamil Nadu",
    industry: "healthcare",
    gstRegime: "regular",
    periodStart: "2024-10-01", // Q3 FY24-25
    periodEnd:   "2024-12-31",
    baseRowCount: 2400,
    columnConvention: "canonical",
    bankAccounts: ["ICICI Bank A/c", "Petty Cash"],
    vendorCount: 35,
    customerCount: 580,
    seededIssues: {
      voucherImbalance: 5, duplicateTransactions: 6, dateOutliers: 2,
      missingFields: 13, unclassifiedAccounts: 6, gstMismatch: 4, signAnomalies: 2,
    },
    fluxSpikes: { "Lab Reagents": 2.1, "X-Ray Machine Maintenance": 4.5 },
  },
  {
    id: "kumar_textiles",
    name: "Kumar Textile Mills Pvt Ltd",
    city: "Surat, Gujarat",
    industry: "textiles",
    gstRegime: "regular",
    periodStart: "2025-01-01", // Q4 FY24-25 (older year-end)
    periodEnd:   "2025-03-31",
    baseRowCount: 3000,
    columnConvention: "shortened",
    bankAccounts: ["HDFC Bank A/c", "Bank of India A/c", "Punjab National Bank"],
    vendorCount: 40,
    customerCount: 65,
    seededIssues: {
      voucherImbalance: 7, duplicateTransactions: 4, dateOutliers: 3,
      missingFields: 14, unclassifiedAccounts: 7, gstMismatch: 6, signAnomalies: 3,
    },
    fluxSpikes: { "Cotton Yarn Purchases": 1.9, "Export Sales - USA": 2.3 },
  },
  // ── Composition scheme (3 companies, simpler structure, no GST line items) ──
  {
    id: "spice_garden",
    name: "Spice Garden Restaurants",
    city: "Hyderabad, Telangana",
    industry: "restaurant",
    gstRegime: "composition",
    compositionRate: 5,
    periodStart: "2024-07-01", // Q2 FY24-25
    periodEnd:   "2024-09-30",
    baseRowCount: 2700,
    columnConvention: "tally_classic",
    bankAccounts: ["HDFC Bank A/c", "Cash-in-Hand", "Petty Cash"],
    vendorCount: 25,
    customerCount: 4, // mostly cash sales, no named customers
    seededIssues: {
      voucherImbalance: 5, duplicateTransactions: 7, dateOutliers: 3,
      missingFields: 18, unclassifiedAccounts: 8, gstMismatch: 0, signAnomalies: 2,
    },
    fluxSpikes: { "Vegetable Purchases": 1.6, "Diwali Bonus to Staff": 8.0 },
  },
  {
    id: "speedy_cargo",
    name: "Speedy Cargo Logistics",
    city: "Kolkata, West Bengal",
    industry: "logistics",
    gstRegime: "composition",
    compositionRate: 6,
    periodStart: "2026-04-01", // Q1 FY26-27
    periodEnd:   "2026-06-30",
    baseRowCount: 2200,
    columnConvention: "verbose",
    bankAccounts: ["UCO Bank A/c", "SBI Current A/c"],
    vendorCount: 32,
    customerCount: 48,
    seededIssues: {
      voucherImbalance: 4, duplicateTransactions: 3, dateOutliers: 2,
      missingFields: 10, unclassifiedAccounts: 6, gstMismatch: 0, signAnomalies: 2,
    },
    fluxSpikes: { "Fuel - Diesel": 1.5, "Driver Salaries": 1.3 },
  },
  {
    id: "learnright",
    name: "LearnRight Coaching Institute",
    city: "Jaipur, Rajasthan",
    industry: "education",
    gstRegime: "composition",
    compositionRate: 1,
    periodStart: "2026-07-01", // Q2 FY26-27
    periodEnd:   "2026-09-30",
    baseRowCount: 1800,
    columnConvention: "hindi_mixed",
    bankAccounts: ["SBI A/c", "Cash"],
    vendorCount: 12,
    customerCount: 240, // students
    seededIssues: {
      voucherImbalance: 3, duplicateTransactions: 4, dateOutliers: 2,
      missingFields: 9, unclassifiedAccounts: 5, gstMismatch: 0, signAnomalies: 1,
    },
    fluxSpikes: { "Tuition Fees": 2.4, "Faculty Salaries": 1.8 },
  },
];

// ─── Industry-specific account templates ──────────────────────────────────────

interface AccountTemplate {
  name: string;
  type: "BANK" | "CASH" | "RECEIVABLE" | "PAYABLE" | "TAX" | "INVENTORY" | "FIXED_ASSET" | "REVENUE" | "EXPENSE" | "COGS" | "EQUITY";
  group?: string;
}

const COMMON_ACCOUNTS: AccountTemplate[] = [
  { name: "Sundry Creditors",     type: "PAYABLE",       group: "Sundry Creditors" },
  { name: "Sundry Debtors",       type: "RECEIVABLE",    group: "Sundry Debtors" },
  { name: "Capital Account",      type: "EQUITY",        group: "Capital Account" },
  { name: "Drawings",             type: "EQUITY",        group: "Capital Account" },
  { name: "Salaries & Wages",     type: "EXPENSE",       group: "Indirect Expenses" },
  { name: "Office Rent",          type: "EXPENSE",       group: "Indirect Expenses" },
  { name: "Electricity Charges",  type: "EXPENSE",       group: "Indirect Expenses" },
  { name: "Telephone & Internet", type: "EXPENSE",       group: "Indirect Expenses" },
  { name: "Bank Charges",         type: "EXPENSE",       group: "Indirect Expenses" },
  { name: "Audit Fees",           type: "EXPENSE",       group: "Indirect Expenses" },
  { name: "Travelling Expenses",  type: "EXPENSE",       group: "Indirect Expenses" },
  { name: "Printing & Stationery", type: "EXPENSE",      group: "Indirect Expenses" },
  { name: "Postage & Courier",    type: "EXPENSE",       group: "Indirect Expenses" },
  { name: "TDS Payable",          type: "TAX",           group: "Duties & Taxes" },
];

const REGULAR_GST_ACCOUNTS: AccountTemplate[] = [
  { name: "CGST Output @9%",      type: "TAX",           group: "Duties & Taxes" },
  { name: "SGST Output @9%",      type: "TAX",           group: "Duties & Taxes" },
  { name: "IGST Output @18%",     type: "TAX",           group: "Duties & Taxes" },
  { name: "CGST Input @9%",       type: "TAX",           group: "Duties & Taxes" },
  { name: "SGST Input @9%",       type: "TAX",           group: "Duties & Taxes" },
  { name: "IGST Input @18%",      type: "TAX",           group: "Duties & Taxes" },
];

const INDUSTRY_ACCOUNTS: Record<Industry, AccountTemplate[]> = {
  manufacturing: [
    { name: "Sales - Finished Goods",   type: "REVENUE",   group: "Sales Accounts" },
    { name: "Raw Material - Steel",     type: "COGS",      group: "Direct Expenses" },
    { name: "Raw Material - Coal",      type: "COGS",      group: "Direct Expenses" },
    { name: "Power & Fuel",             type: "COGS",      group: "Direct Expenses" },
    { name: "Factory Wages",            type: "COGS",      group: "Direct Expenses" },
    { name: "Plant & Machinery",        type: "FIXED_ASSET", group: "Fixed Assets" },
    { name: "Finished Goods - Stock",   type: "INVENTORY", group: "Stock-in-Hand" },
    { name: "Raw Material - Stock",     type: "INVENTORY", group: "Stock-in-Hand" },
  ],
  wholesale: [
    { name: "Sales - Mobile Phones",    type: "REVENUE",   group: "Sales Accounts" },
    { name: "Sales - Laptops",          type: "REVENUE",   group: "Sales Accounts" },
    { name: "Sales - Accessories",      type: "REVENUE",   group: "Sales Accounts" },
    { name: "Mobile Phones - Samsung",  type: "COGS",      group: "Purchase Accounts" },
    { name: "Laptops - Dell",           type: "COGS",      group: "Purchase Accounts" },
    { name: "Discount Allowed",         type: "EXPENSE",   group: "Indirect Expenses" },
    { name: "Stock-in-Hand",            type: "INVENTORY", group: "Stock-in-Hand" },
    { name: "Warehouse Rent",           type: "EXPENSE",   group: "Indirect Expenses" },
  ],
  it_services: [
    { name: "Service Income - Domestic", type: "REVENUE",  group: "Sales Accounts" },
    { name: "Export Service Income",     type: "REVENUE",  group: "Sales Accounts" },
    { name: "AWS Cloud Services",        type: "EXPENSE",  group: "Indirect Expenses" },
    { name: "Software Subscriptions",    type: "EXPENSE",  group: "Indirect Expenses" },
    { name: "Computers & Laptops",       type: "FIXED_ASSET", group: "Fixed Assets" },
    { name: "Provident Fund Payable",    type: "PAYABLE",  group: "Current Liabilities" },
    { name: "Professional Tax Payable",  type: "TAX",      group: "Duties & Taxes" },
  ],
  fmcg_distribution: [
    { name: "Sales - Hindustan Unilever",type: "REVENUE",  group: "Sales Accounts" },
    { name: "Sales - Nestle",            type: "REVENUE",  group: "Sales Accounts" },
    { name: "Sales - ITC Foods",         type: "REVENUE",  group: "Sales Accounts" },
    { name: "Purchase - Hindustan Unilever", type: "COGS", group: "Purchase Accounts" },
    { name: "Purchase - Nestle",         type: "COGS",     group: "Purchase Accounts" },
    { name: "Year-end Bonus",            type: "EXPENSE",  group: "Indirect Expenses" },
    { name: "Vehicle Maintenance",       type: "EXPENSE",  group: "Indirect Expenses" },
    { name: "Stock-in-Hand",             type: "INVENTORY",group: "Stock-in-Hand" },
  ],
  construction: [
    { name: "Project Revenue",           type: "REVENUE",  group: "Sales Accounts" },
    { name: "Cement Purchases",          type: "COGS",     group: "Direct Expenses" },
    { name: "Steel & TMT Purchases",     type: "COGS",     group: "Direct Expenses" },
    { name: "Subcontractor Payments",    type: "COGS",     group: "Direct Expenses" },
    { name: "Site Wages",                type: "COGS",     group: "Direct Expenses" },
    { name: "WIP - Project A",           type: "INVENTORY",group: "Stock-in-Hand" },
    { name: "Plant & Machinery",         type: "FIXED_ASSET", group: "Fixed Assets" },
    { name: "Advance from Customer",     type: "PAYABLE",  group: "Current Liabilities" },
  ],
  healthcare: [
    { name: "Diagnostic Service Income", type: "REVENUE",  group: "Sales Accounts" },
    { name: "Consultation Fees Income",  type: "REVENUE",  group: "Sales Accounts" },
    { name: "Lab Reagents",              type: "COGS",     group: "Direct Expenses" },
    { name: "Medical Consumables",       type: "COGS",     group: "Direct Expenses" },
    { name: "Doctor Consultancy Fees",   type: "EXPENSE",  group: "Indirect Expenses" },
    { name: "X-Ray Machine Maintenance", type: "EXPENSE",  group: "Indirect Expenses" },
    { name: "Medical Equipment",         type: "FIXED_ASSET", group: "Fixed Assets" },
  ],
  textiles: [
    { name: "Domestic Sales",            type: "REVENUE",  group: "Sales Accounts" },
    { name: "Export Sales - USA",        type: "REVENUE",  group: "Sales Accounts" },
    { name: "Export Sales - UAE",        type: "REVENUE",  group: "Sales Accounts" },
    { name: "Cotton Yarn Purchases",     type: "COGS",     group: "Direct Expenses" },
    { name: "Dyes & Chemicals",          type: "COGS",     group: "Direct Expenses" },
    { name: "Power & Fuel",              type: "COGS",     group: "Direct Expenses" },
    { name: "Finished Goods - Stock",    type: "INVENTORY",group: "Stock-in-Hand" },
    { name: "Looms & Machinery",         type: "FIXED_ASSET", group: "Fixed Assets" },
  ],
  restaurant: [
    { name: "Restaurant Sales",          type: "REVENUE",  group: "Sales Accounts" },
    { name: "Vegetable Purchases",       type: "COGS",     group: "Direct Expenses" },
    { name: "Meat & Poultry Purchases",  type: "COGS",     group: "Direct Expenses" },
    { name: "Spices & Provisions",       type: "COGS",     group: "Direct Expenses" },
    { name: "Kitchen Wages",             type: "COGS",     group: "Direct Expenses" },
    { name: "Diwali Bonus to Staff",     type: "EXPENSE",  group: "Indirect Expenses" },
    { name: "Restaurant Equipment",      type: "FIXED_ASSET", group: "Fixed Assets" },
  ],
  logistics: [
    { name: "Freight Income",            type: "REVENUE",  group: "Sales Accounts" },
    { name: "Cargo Handling Income",     type: "REVENUE",  group: "Sales Accounts" },
    { name: "Fuel - Diesel",             type: "COGS",     group: "Direct Expenses" },
    { name: "Driver Salaries",           type: "COGS",     group: "Direct Expenses" },
    { name: "Vehicle Maintenance",       type: "COGS",     group: "Direct Expenses" },
    { name: "Toll Charges",              type: "COGS",     group: "Direct Expenses" },
    { name: "Trucks & Vehicles",         type: "FIXED_ASSET", group: "Fixed Assets" },
  ],
  education: [
    { name: "Tuition Fees",              type: "REVENUE",  group: "Sales Accounts" },
    { name: "Registration Fees",         type: "REVENUE",  group: "Sales Accounts" },
    { name: "Faculty Salaries",          type: "EXPENSE",  group: "Indirect Expenses" },
    { name: "Study Material Printing",   type: "EXPENSE",  group: "Indirect Expenses" },
    { name: "Building Rent - Centre",    type: "EXPENSE",  group: "Indirect Expenses" },
    { name: "Furniture & Fixtures",      type: "FIXED_ASSET", group: "Fixed Assets" },
  ],
};

export function buildChartOfAccounts(company: CompanyConfig): AccountTemplate[] {
  const accounts: AccountTemplate[] = [];

  // Bank/cash accounts from company config
  for (const bank of company.bankAccounts) {
    accounts.push({
      name: bank,
      type: bank.toLowerCase().includes("cash") ? "CASH" : "BANK",
      group: bank.toLowerCase().includes("cash") ? "Cash-in-Hand" : "Bank Accounts",
    });
  }

  // Common accounts
  accounts.push(...COMMON_ACCOUNTS);

  // GST only for regular regime
  if (company.gstRegime === "regular") {
    accounts.push(...REGULAR_GST_ACCOUNTS);
  } else {
    // Composition: just one account for total composition tax
    accounts.push({
      name: `Composition Tax @${company.compositionRate}%`,
      type: "TAX",
      group: "Duties & Taxes",
    });
  }

  // Industry-specific
  accounts.push(...INDUSTRY_ACCOUNTS[company.industry]);

  return accounts;
}
