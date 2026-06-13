import type { ERPSchema } from "@aiql/schema-intel";

export interface TemplateMatch {
  templateId:  string;
  sql:         string;
  confidence:  number;
}

interface Template {
  id:       string;
  patterns: RegExp[];
  buildSql: (table: string, cols: Set<string>) => string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Best available party column — prefers specific over generic */
function partyCol(cols: Set<string>, prefer: "vendor" | "customer"): string {
  if (prefer === "vendor") {
    if (cols.has("vendor_name"))   return "vendor_name";
    if (cols.has("party_name"))    return "party_name";
    return "account_name";
  }
  if (cols.has("customer_name"))   return "customer_name";
  if (cols.has("party_name"))      return "party_name";
  return "account_name";
}

/** Best available amount column for a debit/purchase context */
function debitCol(cols: Set<string>): string {
  if (cols.has("debit_amount")) return "debit_amount";
  if (cols.has("net_amount"))   return "net_amount";
  return "0";
}

/** Best available amount column for a credit/sales context */
function creditCol(cols: Set<string>): string {
  if (cols.has("credit_amount")) return "credit_amount";
  if (cols.has("net_amount"))    return "net_amount";
  return "0";
}

// ─── Built-in templates ───────────────────────────────────────────────────────

const TEMPLATES: Template[] = [

  // ── Existing 5 ──────────────────────────────────────────────────────────────

  {
    id: "ap-aging",
    patterns: [/\bap\s+aging\b/i, /\baccounts?\s+payable\s+aging\b/i, /\bvendor\s+outstanding\b/i],
    buildSql: (t, cols) => cols.has("account_name") && cols.has("debit_amount")
      ? `SELECT account_name, ROUND(SUM(debit_amount) - SUM(COALESCE(credit_amount, 0)), 2) AS outstanding FROM "${t}" GROUP BY account_name HAVING SUM(debit_amount) - SUM(COALESCE(credit_amount, 0)) > 0 ORDER BY outstanding DESC`
      : `SELECT * FROM "${t}" LIMIT 100`,
  },
  {
    id: "ar-aging",
    patterns: [/\bar\s+aging\b/i, /\baccounts?\s+receivable\s+aging\b/i, /\bcustomer\s+outstanding\b/i],
    buildSql: (t, cols) => cols.has("credit_amount")
      ? `SELECT account_name, ROUND(SUM(credit_amount) - SUM(COALESCE(debit_amount, 0)), 2) AS outstanding FROM "${t}" GROUP BY account_name HAVING SUM(credit_amount) - SUM(COALESCE(debit_amount, 0)) > 0 ORDER BY outstanding DESC`
      : `SELECT * FROM "${t}" LIMIT 100`,
  },
  {
    id: "top-vendors",
    patterns: [/\btop\b.*\bvendors?\b/i, /\blargest\b.*\bpayment\b/i, /\bhighest\s+spend\b/i],
    buildSql: (t, cols) => cols.has("debit_amount")
      ? `SELECT account_name, ROUND(SUM(debit_amount), 2) AS total_spend FROM "${t}" GROUP BY account_name ORDER BY total_spend DESC LIMIT 10`
      : `SELECT * FROM "${t}" LIMIT 10`,
  },
  {
    id: "monthly-summary",
    patterns: [/\bmonthly\s+summary\b/i, /\bmonth\s+wise\b/i, /\bby\s+month\b/i],
    buildSql: (t, cols) => cols.has("transaction_date") && cols.has("debit_amount")
      ? `SELECT DATE_TRUNC('month', transaction_date) AS month, ROUND(SUM(debit_amount), 2) AS total_debits, ROUND(SUM(COALESCE(credit_amount, 0)), 2) AS total_credits FROM "${t}" GROUP BY month ORDER BY month`
      : `SELECT * FROM "${t}" LIMIT 100`,
  },
  {
    id: "cost-centre-breakdown",
    patterns: [/\bcost\s+centre\s+breakdown\b/i, /\bdepartment[\s\-]?wise\b/i],
    buildSql: (t, cols) => cols.has("cost_centre") && cols.has("debit_amount")
      ? `SELECT cost_centre, ROUND(SUM(debit_amount), 2) AS total FROM "${t}" WHERE cost_centre IS NOT NULL GROUP BY cost_centre ORDER BY total DESC`
      : `SELECT * FROM "${t}" LIMIT 100`,
  },

  // ── Tier 1 — 8 new templates ─────────────────────────────────────────────────

  {
    id: "cash-balance",
    patterns: [
      /\bcash\s+balance\b/i,
      /\bbank\s+balance\b/i,
      /\bcash\s+in\s+hand\b/i,
      /\bcash\s+position\b/i,
      /\bhow\s+much\s+cash\b/i,
      /\bcurrent\s+(?:cash|bank)\b/i,
      /\bcash\s+kitna\b/i,
      /\bbank\s+mein\s+kitna\b/i,
      /\bpaisa\s+kitna\b/i,
    ],
    buildSql: (t, cols) => {
      if (!cols.has("account_name")) return `SELECT * FROM "${t}" LIMIT 50`;

      // Prefer closing_balance when available — it's the exact ledger snapshot
      if (cols.has("closing_balance")) {
        return (
          `SELECT account_name,` +
          ` ROUND(MAX(closing_balance), 2) AS balance` +
          ` FROM "${t}"` +
          ` WHERE (LOWER(account_name) LIKE '%cash%' OR LOWER(account_name) LIKE '%bank%'` +
          `   OR LOWER(account_name) LIKE '%petty cash%' OR LOWER(account_name) LIKE '%savings%')` +
          `   AND closing_balance IS NOT NULL` +
          ` GROUP BY account_name` +
          ` ORDER BY balance DESC`
        );
      }

      // Fallback: derive balance from movements
      const dc = debitCol(cols);
      const cc = cols.has("credit_amount") ? "credit_amount" : "0";
      return (
        `SELECT account_name,` +
        ` ROUND(SUM(COALESCE(${cc}, 0)) - SUM(COALESCE(${dc}, 0)), 2) AS balance` +
        ` FROM "${t}"` +
        ` WHERE LOWER(account_name) LIKE '%cash%' OR LOWER(account_name) LIKE '%bank%'` +
        ` GROUP BY account_name` +
        ` HAVING ROUND(SUM(COALESCE(${cc}, 0)) - SUM(COALESCE(${dc}, 0)), 2) > 0` +
        ` ORDER BY balance DESC`
      );
    },
  },

  {
    id: "overdue-debtors-30-60-90",
    patterns: [
      /\boverdue\s+debtors?\b/i,
      /\bdebtors?\s+aging\b/i,
      /\breceivable\s+aging\b/i,
      /\b(?:30|60|90)\s*[–\-]\s*(?:60|90|120)\s+day\b/i,
      /\baging\s+(?:report|analysis|buckets?)\b/i,
      /\boverdue\s+(?:customers?|receivables?|invoices?)\b/i,
      /\bbaaki\s+(?:customers?|debtors?)\b/i,
      /\bukraane\s+wale\b/i,
    ],
    buildSql: (t, cols) => {
      if (!cols.has("transaction_date")) return `SELECT * FROM "${t}" LIMIT 100`;

      const party = cols.has("customer_name")
        ? "customer_name"
        : cols.has("party_name") ? "party_name" : "account_name";
      const dr    = debitCol(cols);
      const cr    = cols.has("credit_amount") ? "credit_amount" : "0";

      return (
        `SELECT` +
        `  COALESCE(${party}, 'Unknown') AS customer,` +
        `  ROUND(SUM(CASE WHEN (CURRENT_DATE - transaction_date::date) BETWEEN 0  AND 30  THEN COALESCE(${dr}, 0) - COALESCE(${cr}, 0) ELSE 0 END), 2) AS "0_30_days",` +
        `  ROUND(SUM(CASE WHEN (CURRENT_DATE - transaction_date::date) BETWEEN 31 AND 60  THEN COALESCE(${dr}, 0) - COALESCE(${cr}, 0) ELSE 0 END), 2) AS "31_60_days",` +
        `  ROUND(SUM(CASE WHEN (CURRENT_DATE - transaction_date::date) BETWEEN 61 AND 90  THEN COALESCE(${dr}, 0) - COALESCE(${cr}, 0) ELSE 0 END), 2) AS "61_90_days",` +
        `  ROUND(SUM(CASE WHEN (CURRENT_DATE - transaction_date::date) > 90              THEN COALESCE(${dr}, 0) - COALESCE(${cr}, 0) ELSE 0 END), 2) AS over_90_days,` +
        `  ROUND(SUM(COALESCE(${dr}, 0) - COALESCE(${cr}, 0)), 2) AS total_outstanding` +
        ` FROM "${t}"` +
        ` WHERE transaction_date IS NOT NULL` +
        ` GROUP BY customer` +
        ` HAVING ROUND(SUM(COALESCE(${dr}, 0) - COALESCE(${cr}, 0)), 2) > 0` +
        ` ORDER BY total_outstanding DESC`
      );
    },
  },

  {
    id: "gst-summary",
    patterns: [
      /\bgst\s+summary\b/i,
      /\bgst\s+(?:report|returns?|filing|details?)\b/i,
      /\bcgst\b.*\bsgst\b/i,
      /\bigst\s+(?:summary|report)\b/i,
      /\btax\s+summary\b/i,
      /\bkar\s+vivaran\b/i,
      /\bkar\s+summary\b/i,
    ],
    buildSql: (t, cols) => {
      if (!cols.has("transaction_date")) {
        return `SELECT account_name, ROUND(SUM(COALESCE(${debitCol(cols)}, 0)), 2) AS amount FROM "${t}" WHERE LOWER(COALESCE(account_name, '')) LIKE '%gst%' GROUP BY account_name ORDER BY amount DESC`;
      }

      const amt = cols.has("net_amount") ? "net_amount" : debitCol(cols);
      const acct = cols.has("account_name") ? "account_name" : "''" ;
      const desc = cols.has("description")  ? "description"  : "''";

      return (
        `SELECT` +
        `  TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,` +
        `  ROUND(SUM(CASE WHEN LOWER(COALESCE(${acct}, '')) LIKE '%cgst%' OR LOWER(COALESCE(${desc}, '')) LIKE '%cgst%' THEN COALESCE(${amt}, 0) ELSE 0 END), 2) AS cgst,` +
        `  ROUND(SUM(CASE WHEN LOWER(COALESCE(${acct}, '')) LIKE '%sgst%' OR LOWER(COALESCE(${desc}, '')) LIKE '%sgst%' THEN COALESCE(${amt}, 0) ELSE 0 END), 2) AS sgst,` +
        `  ROUND(SUM(CASE WHEN LOWER(COALESCE(${acct}, '')) LIKE '%igst%' OR LOWER(COALESCE(${desc}, '')) LIKE '%igst%' THEN COALESCE(${amt}, 0) ELSE 0 END), 2) AS igst,` +
        `  ROUND(SUM(CASE WHEN LOWER(COALESCE(${acct}, '')) LIKE '%gst%'  OR LOWER(COALESCE(${desc}, '')) LIKE '%gst%'  THEN COALESCE(${amt}, 0) ELSE 0 END), 2) AS total_gst` +
        ` FROM "${t}"` +
        ` WHERE transaction_date IS NOT NULL` +
        `   AND (LOWER(COALESCE(${acct}, '')) LIKE '%gst%' OR LOWER(COALESCE(${desc}, '')) LIKE '%gst%')` +
        ` GROUP BY month` +
        ` ORDER BY month`
      );
    },
  },

  {
    id: "vendor-ledger",
    patterns: [
      /\bvendor\s+ledger\b/i,
      /\bsupplier\s+ledger\b/i,
      /\bvendor[\s\-]?wise\s+(?:transactions?|summary|statement|balance)\b/i,
      /\ball\s+vendors?\b/i,
      /\bsupplier\s+(?:summary|statement)\b/i,
      /\bvendor\s+(?:transactions?|history|account)\b/i,
      /\bvikreta\s+(?:khata|ledger)\b/i,
      /\bvikreta\s+vivaran\b/i,
    ],
    buildSql: (t, cols) => {
      const vendor = partyCol(cols, "vendor");
      const dr     = debitCol(cols);
      const cr     = cols.has("credit_amount") ? "credit_amount" : "0";

      return (
        `SELECT` +
        `  COALESCE(${vendor}, 'Unknown') AS vendor,` +
        `  COUNT(*) AS transactions,` +
        `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS total_purchases,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)), 2) AS total_paid,` +
        `  ROUND(SUM(COALESCE(${dr}, 0)) - SUM(COALESCE(${cr}, 0)), 2) AS outstanding` +
        ` FROM "${t}"` +
        ` WHERE ${vendor} IS NOT NULL` +
        ` GROUP BY vendor` +
        ` ORDER BY outstanding DESC`
      );
    },
  },

  {
    id: "customer-ledger",
    patterns: [
      /\bcustomer\s+ledger\b/i,
      /\bdebtor\s+ledger\b/i,
      /\bcustomer[\s\-]?wise\s+(?:transactions?|summary|statement|balance)\b/i,
      /\ball\s+customers?\b/i,
      /\bclient\s+(?:summary|statement|ledger)\b/i,
      /\bcustomer\s+(?:transactions?|history|account)\b/i,
      /\bgrahak\s+(?:khata|ledger)\b/i,
      /\bgrahak\s+vivaran\b/i,
    ],
    buildSql: (t, cols) => {
      const customer = partyCol(cols, "customer");
      const dr       = cols.has("debit_amount")  ? "debit_amount"  : "0";
      const cr       = creditCol(cols);

      return (
        `SELECT` +
        `  COALESCE(${customer}, 'Unknown') AS customer,` +
        `  COUNT(*) AS transactions,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)), 2) AS total_sales,` +
        `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS total_received,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)) - SUM(COALESCE(${dr}, 0)), 2) AS outstanding` +
        ` FROM "${t}"` +
        ` WHERE ${customer} IS NOT NULL` +
        ` GROUP BY customer` +
        ` ORDER BY outstanding DESC`
      );
    },
  },

  {
    id: "purchase-register",
    patterns: [
      /\bpurchase\s+register\b/i,
      /\bpurchase\s+(?:list|report|log|history|register)\b/i,
      /\bpurchases?\s+(?:this|last|current)?\s*(?:month|year|quarter|week)\b/i,
      /\bkharid\s+(?:vivaran|register|list|report)\b/i,
      /\bkharid\s+ki\b/i,
    ],
    buildSql: (t, cols) => {
      const vendor = partyCol(cols, "vendor");
      const dr     = debitCol(cols);
      const ref    = cols.has("reference_number") ? "reference_number"
        : cols.has("document_number") ? "document_number" : "NULL";
      const desc   = cols.has("description") ? "description" : "NULL";
      const vtype  = cols.has("voucher_type")     ? "voucher_type"
        : cols.has("transaction_type") ? "transaction_type" : null;

      const whereClause = vtype
        ? `WHERE (LOWER(COALESCE(${vtype}, '')) LIKE '%purchase%' OR LOWER(COALESCE(${vtype}, '')) LIKE '%bill%' OR ${vendor} IS NOT NULL)`
        : `WHERE ${vendor} IS NOT NULL`;

      return (
        `SELECT` +
        (cols.has("transaction_date") ? `  transaction_date,` : "") +
        `  COALESCE(${vendor}, 'Unknown') AS vendor,` +
        `  ${ref} AS bill_no,` +
        `  ${desc} AS narration,` +
        `  ROUND(COALESCE(${dr}, 0), 2) AS amount` +
        ` FROM "${t}"` +
        ` ${whereClause}` +
        (cols.has("transaction_date") ? ` ORDER BY transaction_date DESC` : ` ORDER BY amount DESC`)
      );
    },
  },

  {
    id: "sales-register",
    patterns: [
      /\bsales?\s+register\b/i,
      /\bsales?\s+(?:list|report|log|history)\b/i,
      /\binvoice\s+register\b/i,
      /\bsales?\s+(?:this|current)\s+(?:month|year|quarter|week)\b/i,
      /\bbikri\s+(?:vivaran|register|list|report)\b/i,
      /\bbikri\s+ki\b/i,
    ],
    buildSql: (t, cols) => {
      const customer = partyCol(cols, "customer");
      const cr       = creditCol(cols);
      const ref      = cols.has("reference_number") ? "reference_number"
        : cols.has("document_number") ? "document_number" : "NULL";
      const desc     = cols.has("description") ? "description" : "NULL";
      const vtype    = cols.has("voucher_type")     ? "voucher_type"
        : cols.has("transaction_type") ? "transaction_type" : null;

      const whereClause = vtype
        ? `WHERE (LOWER(COALESCE(${vtype}, '')) LIKE '%sales%' OR LOWER(COALESCE(${vtype}, '')) LIKE '%invoice%' OR ${customer} IS NOT NULL)`
        : `WHERE ${customer} IS NOT NULL`;

      return (
        `SELECT` +
        (cols.has("transaction_date") ? `  transaction_date,` : "") +
        `  COALESCE(${customer}, 'Unknown') AS customer,` +
        `  ${ref} AS invoice_no,` +
        `  ${desc} AS narration,` +
        `  ROUND(COALESCE(${cr}, 0), 2) AS amount` +
        ` FROM "${t}"` +
        ` ${whereClause}` +
        (cols.has("transaction_date") ? ` ORDER BY transaction_date DESC` : ` ORDER BY amount DESC`)
      );
    },
  },

  {
    id: "payroll-summary",
    patterns: [
      /\bpayroll\s+summary\b/i,
      /\bsalary\s+(?:summary|report|statement|register|list)\b/i,
      /\bwages?\s+(?:summary|report|register)\b/i,
      /\bemployee\s+(?:salary|payment|payroll)\b/i,
      /\bstaff\s+(?:salary|payment|cost)\b/i,
      /\btankhwah\b/i,
      /\bvetan\b/i,
    ],
    buildSql: (t, cols) => {
      const party = cols.has("party_name")    ? "party_name"
        : cols.has("account_name") ? "account_name" : null;
      const dr    = debitCol(cols);
      const acct  = cols.has("account_name") ? "account_name" : "''";
      const vtype = cols.has("voucher_type")     ? "voucher_type"
        : cols.has("transaction_type") ? "transaction_type" : null;
      const desc  = cols.has("description") ? "description" : "''";

      const salaryFilter =
        `(LOWER(COALESCE(${acct}, '')) LIKE ANY(ARRAY['%salary%','%payroll%','%wages%','%remuneration%','%staff%'])` +
        (vtype ? ` OR LOWER(COALESCE(${vtype}, '')) LIKE '%payroll%'` : "") +
        ` OR LOWER(COALESCE(${desc}, '')) LIKE ANY(ARRAY['%salary%','%payroll%','%wages%']))`;

      if (cols.has("transaction_date")) {
        const employeeCount = party
          ? `COUNT(DISTINCT COALESCE(${party}, 'Unknown')) AS employees,`
          : "";
        return (
          `SELECT` +
          `  TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,` +
          `  ${employeeCount}` +
          `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS total_salary` +
          ` FROM "${t}"` +
          ` WHERE ${salaryFilter}` +
          ` GROUP BY month` +
          ` ORDER BY month`
        );
      }

      // No date column — just show party-wise salary totals
      return (
        `SELECT` +
        `  COALESCE(${party ?? "'Unknown'"}, 'Unknown') AS employee,` +
        `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS total_salary` +
        ` FROM "${t}"` +
        ` WHERE ${salaryFilter}` +
        ` GROUP BY employee` +
        ` ORDER BY total_salary DESC`
      );
    },
  },

  // ── Tier 1 — Day 4 additions ─────────────────────────────────────────────

  {
    id: "profit-loss-summary",
    patterns: [
      /\bprofit\s*(?:and|&|n)\s*loss\b/i,
      /\bp\s*[&n]\s*l\b/i,
      /\bincome\s+statement\b/i,
      /\bnet\s+profit\b/i,
      /\bprofit\s+summary\b/i,
      /\btotal\s+(?:income|revenue)\s+(?:vs|versus|and)\s+(?:expense|cost)\b/i,
      /\blabh\s+(?:haani|loss)\b/i,
      /\bmunaafa\b/i,
    ],
    buildSql: (t, cols) => {
      const dr   = cols.has("debit_amount")  ? "debit_amount"  : "0";
      const cr   = cols.has("credit_amount") ? "credit_amount" : "0";
      const amt  = cols.has("net_amount")    ? "net_amount"    : null;
      const grp  = cols.has("account_group") ? "account_group"
        : cols.has("account_type") ? "account_type" : null;

      if (grp) {
        return (
          `SELECT` +
          `  ${grp} AS category,` +
          `  ROUND(SUM(COALESCE(${cr}, 0)), 2) AS total_income,` +
          `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS total_expense,` +
          `  ROUND(SUM(COALESCE(${cr}, 0)) - SUM(COALESCE(${dr}, 0)), 2) AS net` +
          ` FROM "${t}"` +
          ` WHERE ${grp} IS NOT NULL` +
          ` GROUP BY category` +
          ` ORDER BY net DESC`
        );
      }

      // No grouping column — single-row P&L total
      const amtExpr = amt ? `COALESCE(${amt}, 0)` : `COALESCE(${cr}, 0) - COALESCE(${dr}, 0)`;
      return (
        `SELECT` +
        `  ROUND(SUM(CASE WHEN LOWER(COALESCE(account_name,'')) LIKE ANY(ARRAY['%income%','%revenue%','%sales%']) THEN ${amtExpr} ELSE 0 END), 2) AS total_income,` +
        `  ROUND(SUM(CASE WHEN LOWER(COALESCE(account_name,'')) LIKE ANY(ARRAY['%expense%','%cost%','%purchase%']) THEN ${amtExpr} ELSE 0 END), 2) AS total_expense` +
        ` FROM "${t}"`
      );
    },
  },

  {
    id: "balance-sheet-snapshot",
    patterns: [
      /\bbalance\s+sheet\b/i,
      /\bassets?\s*(?:and|&)\s*liabilit/i,
      /\bnet\s+(?:assets?|worth)\b/i,
      /\bliabilit(?:y|ies)\s+(?:summary|report)\b/i,
      /\btulapat\b/i,
    ],
    buildSql: (t, cols) => {
      const grp = cols.has("account_group") ? "account_group"
        : cols.has("account_type") ? "account_type" : null;
      const dr  = cols.has("debit_amount")  ? "debit_amount"  : "0";
      const cr  = cols.has("credit_amount") ? "credit_amount" : "0";

      if (cols.has("closing_balance") && grp) {
        return (
          `SELECT` +
          `  ${grp} AS category,` +
          `  ROUND(SUM(closing_balance), 2) AS balance` +
          ` FROM "${t}"` +
          ` WHERE ${grp} IS NOT NULL` +
          `   AND closing_balance IS NOT NULL` +
          `   AND LOWER(COALESCE(${grp},'')) LIKE ANY(ARRAY['%asset%','%liabilit%','%equity%','%capital%','%loan%','%reserve%'])` +
          ` GROUP BY category` +
          ` ORDER BY balance DESC`
        );
      }

      if (grp) {
        return (
          `SELECT` +
          `  ${grp} AS category,` +
          `  ROUND(SUM(COALESCE(${dr}, 0)) - SUM(COALESCE(${cr}, 0)), 2) AS balance` +
          ` FROM "${t}"` +
          ` WHERE ${grp} IS NOT NULL` +
          `   AND LOWER(COALESCE(${grp},'')) LIKE ANY(ARRAY['%asset%','%liabilit%','%equity%','%capital%','%loan%','%reserve%'])` +
          ` GROUP BY category` +
          ` ORDER BY balance DESC`
        );
      }

      // Fallback: all account balances
      return (
        `SELECT account_name,` +
        ` ROUND(SUM(COALESCE(${dr}, 0)) - SUM(COALESCE(${cr}, 0)), 2) AS balance` +
        ` FROM "${t}"` +
        ` GROUP BY account_name` +
        ` ORDER BY balance DESC`
      );
    },
  },

  {
    id: "expense-by-voucher-type",
    patterns: [
      /\bexpense\s+by\s+(?:voucher|type)\b/i,
      /\bvoucher[\s\-]?(?:type|wise)\s+(?:expense|summary|breakdown)\b/i,
      /\bexpenses?\s+by\s+type\b/i,
      /\btransaction[\s\-]?type\s+(?:wise|summary|breakdown)\b/i,
      /\bspend\s+by\s+(?:voucher|category|type)\b/i,
    ],
    buildSql: (t, cols) => {
      const vtype = cols.has("voucher_type")     ? "voucher_type"
        : cols.has("transaction_type") ? "transaction_type" : "account_group";
      const dr    = debitCol(cols);

      return (
        `SELECT` +
        `  COALESCE(${vtype}, 'Unclassified') AS type,` +
        `  COUNT(*) AS transactions,` +
        `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS total_amount` +
        ` FROM "${t}"` +
        ` WHERE ${vtype} IS NOT NULL` +
        ` GROUP BY type` +
        ` ORDER BY total_amount DESC`
      );
    },
  },

  {
    id: "tds-summary",
    patterns: [
      /\btds\s+(?:summary|report|deducted|details?|returns?|payable)\b/i,
      /\btax\s+deducted\s+at\s+source\b/i,
      /\btds\s+(?:this|last|current)?\s*(?:month|year|quarter)\b/i,
      /\bkar\s+katautee\b/i,
      /\bukaan\s+(?:tax|kar)\b/i,
    ],
    buildSql: (t, cols) => {
      const acct  = cols.has("account_name")  ? "account_name"  : "''";
      const desc  = cols.has("description")   ? "description"   : "''";
      const grp   = cols.has("account_group") ? "account_group" : "''";
      const party = cols.has("party_name")    ? "party_name"
        : cols.has("vendor_name")  ? "vendor_name"
        : cols.has("account_name") ? "account_name" : "'Unknown'";
      const amt   = cols.has("debit_amount")  ? "debit_amount"
        : cols.has("credit_amount") ? "credit_amount"
        : cols.has("net_amount")    ? "net_amount"   : "0";

      const tdsFilter =
        `(LOWER(COALESCE(${acct},'')) LIKE '%tds%'` +
        ` OR LOWER(COALESCE(${desc},'')) LIKE '%tds%'` +
        ` OR LOWER(COALESCE(${grp},''))  LIKE '%tds%')`;

      if (cols.has("transaction_date")) {
        return (
          `SELECT` +
          `  TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,` +
          `  COALESCE(${party}, 'Unknown') AS deductee,` +
          `  ROUND(SUM(COALESCE(${amt}, 0)), 2) AS tds_amount` +
          ` FROM "${t}"` +
          ` WHERE ${tdsFilter}` +
          ` GROUP BY month, deductee` +
          ` ORDER BY month, tds_amount DESC`
        );
      }

      return (
        `SELECT` +
        `  COALESCE(${party}, 'Unknown') AS deductee,` +
        `  ROUND(SUM(COALESCE(${amt}, 0)), 2) AS tds_amount` +
        ` FROM "${t}"` +
        ` WHERE ${tdsFilter}` +
        ` GROUP BY deductee` +
        ` ORDER BY tds_amount DESC`
      );
    },
  },

  {
    id: "bank-reconciliation",
    patterns: [
      /\bbank\s+recon(?:ciliation)?\b/i,
      /\brecon(?:ciliation)?\s+(?:summary|report|status)\b/i,
      /\bbank\s+statement\s+(?:match|reconcil|verify)\b/i,
      /\bunmatched\s+(?:entries|transactions?)\b/i,
      /\bbank\s+milan\b/i,
    ],
    buildSql: (t, cols) => {
      const dr   = cols.has("debit_amount")  ? "debit_amount"  : "0";
      const cr   = cols.has("credit_amount") ? "credit_amount" : "0";
      const acct = cols.has("account_name")  ? "account_name"  : "'Bank'";

      return (
        `SELECT` +
        `  COALESCE(${acct}, 'Bank') AS bank_account,` +
        `  COUNT(*) AS entries,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)), 2) AS total_credits,` +
        `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS total_debits,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)) - SUM(COALESCE(${dr}, 0)), 2) AS net_balance` +
        ` FROM "${t}"` +
        ` WHERE LOWER(COALESCE(${acct},'')) LIKE ANY(ARRAY['%bank%','%savings%','%current account%','%hdfc%','%icici%','%sbi%','%axis%'])` +
        ` GROUP BY bank_account` +
        ` ORDER BY net_balance DESC`
      );
    },
  },

  {
    id: "advance-payments-outstanding",
    patterns: [
      /\badvance\s+(?:payments?\s+outstanding|outstanding)\b/i,
      /\boutstanding\s+advances?\b/i,
      /\badvances?\s+(?:given|paid|received|pending)\b/i,
      /\bprepayments?\b/i,
      /\badvance\s+(?:debtors?|creditors?)\b/i,
      /\bpeshgi\b/i,
      /\badvance\s+(?:diya|baaki|pending)\b/i,
    ],
    buildSql: (t, cols) => {
      const party = cols.has("vendor_name")   ? "vendor_name"
        : cols.has("customer_name") ? "customer_name"
        : cols.has("party_name")    ? "party_name"
        : "account_name";
      const dr    = debitCol(cols);
      const acct  = cols.has("account_name")  ? "account_name"  : "''";
      const desc  = cols.has("description")   ? "description"   : "''";
      const vtype = cols.has("voucher_type")   ? "voucher_type"
        : cols.has("transaction_type") ? "transaction_type" : null;

      const advFilter =
        `(LOWER(COALESCE(${acct},'')) LIKE '%advance%'` +
        ` OR LOWER(COALESCE(${desc},'')) LIKE '%advance%'` +
        (vtype ? ` OR LOWER(COALESCE(${vtype},'')) LIKE '%advance%'` : "") +
        `)`;

      return (
        `SELECT` +
        `  COALESCE(${party}, 'Unknown') AS party,` +
        `  COUNT(*) AS count,` +
        `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS total_advance` +
        ` FROM "${t}"` +
        ` WHERE ${advFilter}` +
        ` GROUP BY party` +
        ` HAVING ROUND(SUM(COALESCE(${dr}, 0)), 2) > 0` +
        ` ORDER BY total_advance DESC`
      );
    },
  },

  {
    id: "top-customers",
    patterns: [
      /\btop\b.*\bcustomers?\b/i,
      /\bbest\s+customers?\b/i,
      /\bhighest\s+(?:revenue|sales|paying)\s+customers?\b/i,
      /\bcustomer\s+(?:ranking|rank|top)\b/i,
      /\blargest\s+(?:buyers?|clients?)\b/i,
      /\bsabse\s+bade\s+grahak\b/i,
    ],
    buildSql: (t, cols) => {
      const customer = partyCol(cols, "customer");
      const cr       = creditCol(cols);

      return (
        `SELECT` +
        `  COALESCE(${customer}, 'Unknown') AS customer,` +
        `  COUNT(*) AS transactions,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)), 2) AS total_revenue` +
        ` FROM "${t}"` +
        ` WHERE ${customer} IS NOT NULL` +
        ` GROUP BY customer` +
        ` ORDER BY total_revenue DESC` +
        ` LIMIT 10`
      );
    },
  },

  // ── Tier 1 — Day 5 additions (date-range + cost-centre variants) ─────────

  {
    id: "sales-last-quarter",
    patterns: [
      /\bsales?\s+(?:last|previous)\s+quarter\b/i,
      /\blast\s+quarter(?:'s)?\s+(?:sales?|revenue)\b/i,
      /\brevenue\s+(?:last|previous)\s+quarter\b/i,
      /\bpichli\s+timahi\s+(?:bikri|sales?|revenue)\b/i,
    ],
    buildSql: (t, cols) => {
      if (!cols.has("transaction_date")) return `SELECT * FROM "${t}" LIMIT 100`;

      const cr       = creditCol(cols);
      const customer = partyCol(cols, "customer");
      const vtype    = cols.has("voucher_type")     ? "voucher_type"
        : cols.has("transaction_type") ? "transaction_type" : null;
      const vtypeFilter = vtype
        ? ` AND (LOWER(COALESCE(${vtype},'')) LIKE '%sales%' OR LOWER(COALESCE(${vtype},'')) LIKE '%invoice%' OR ${customer} IS NOT NULL)`
        : "";

      return (
        `SELECT` +
        `  TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,` +
        `  COALESCE(${customer}, 'Unknown') AS customer,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)), 2) AS sales` +
        ` FROM "${t}"` +
        ` WHERE transaction_date >= DATE_TRUNC('quarter', CURRENT_DATE) - INTERVAL '3 months'` +
        `   AND transaction_date <  DATE_TRUNC('quarter', CURRENT_DATE)` +
        `${vtypeFilter}` +
        ` GROUP BY month, customer` +
        ` ORDER BY month, sales DESC`
      );
    },
  },

  {
    id: "expenses-last-quarter",
    patterns: [
      /\bexpenses?\s+(?:last|previous)\s+quarter\b/i,
      /\blast\s+quarter(?:'s)?\s+(?:expenses?|spend|costs?)\b/i,
      /\bspend\s+(?:last|previous)\s+quarter\b/i,
      /\bpichli\s+timahi\s+(?:kharcha|expense)\b/i,
    ],
    buildSql: (t, cols) => {
      if (!cols.has("transaction_date")) return `SELECT * FROM "${t}" LIMIT 100`;

      const dr  = debitCol(cols);
      const grp = cols.has("account_group") ? "account_group"
        : cols.has("account_type") ? "account_type" : null;

      if (grp) {
        return (
          `SELECT` +
          `  TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,` +
          `  COALESCE(${grp}, 'Unclassified') AS category,` +
          `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS expenses` +
          ` FROM "${t}"` +
          ` WHERE transaction_date >= DATE_TRUNC('quarter', CURRENT_DATE) - INTERVAL '3 months'` +
          `   AND transaction_date <  DATE_TRUNC('quarter', CURRENT_DATE)` +
          ` GROUP BY month, category` +
          ` ORDER BY month, expenses DESC`
        );
      }

      return (
        `SELECT` +
        `  TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,` +
        `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS total_expenses` +
        ` FROM "${t}"` +
        ` WHERE transaction_date >= DATE_TRUNC('quarter', CURRENT_DATE) - INTERVAL '3 months'` +
        `   AND transaction_date <  DATE_TRUNC('quarter', CURRENT_DATE)` +
        ` GROUP BY month` +
        ` ORDER BY month`
      );
    },
  },

  {
    id: "cash-flow-monthly",
    patterns: [
      /\bcash\s+flow\s+(?:monthly|by\s+month|month[\s\-]?wise)\b/i,
      /\bmonthly\s+cash\s+flow\b/i,
      /\bcash\s+(?:inflow|outflow|in\s*[-&]\s*out)\b/i,
      /\breceipts?\s+(?:and|vs)\s+payments?\s+monthly\b/i,
      /\bpaise\s+ki\s+(?:aavak|aavak\s+jaavak)\b/i,
    ],
    buildSql: (t, cols) => {
      if (!cols.has("transaction_date")) return `SELECT * FROM "${t}" LIMIT 100`;

      const dr   = cols.has("debit_amount")  ? "debit_amount"  : "0";
      const cr   = cols.has("credit_amount") ? "credit_amount" : "0";
      const acct = cols.has("account_name")  ? "account_name"  : "''";

      return (
        `SELECT` +
        `  TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)), 2) AS inflows,` +
        `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS outflows,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)) - SUM(COALESCE(${dr}, 0)), 2) AS net_cash_flow` +
        ` FROM "${t}"` +
        ` WHERE transaction_date IS NOT NULL` +
        `   AND (LOWER(COALESCE(${acct},'')) LIKE '%cash%' OR LOWER(COALESCE(${acct},'')) LIKE '%bank%')` +
        ` GROUP BY month` +
        ` ORDER BY month`
      );
    },
  },

  {
    id: "cost-centre-revenue",
    patterns: [
      /\bcost\s+centre\s+(?:revenue|income|sales?)\b/i,
      /\brevenue\s+by\s+(?:cost\s+centre|department|dept)\b/i,
      /\bdepartment[\s\-]?wise\s+(?:revenue|income|sales?)\b/i,
      /\bby\s+department\s+(?:revenue|income)\b/i,
      /\bvibhag[\s\-]?wise\s+aay\b/i,
    ],
    buildSql: (t, cols) => {
      if (!cols.has("cost_centre")) return `SELECT * FROM "${t}" LIMIT 50`;

      const cr = creditCol(cols);

      return (
        `SELECT` +
        `  COALESCE(cost_centre, 'Unassigned') AS cost_centre,` +
        `  COUNT(*) AS transactions,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)), 2) AS revenue` +
        ` FROM "${t}"` +
        ` WHERE cost_centre IS NOT NULL` +
        ` GROUP BY cost_centre` +
        ` ORDER BY revenue DESC`
      );
    },
  },

  {
    id: "cost-centre-expenses",
    patterns: [
      /\bcost\s+centre\s+(?:expense|spend|cost)\b/i,
      /\bexpenses?\s+by\s+(?:cost\s+centre|department|dept)\b/i,
      /\bdepartment[\s\-]?wise\s+(?:expense|spend|cost)\b/i,
      /\bby\s+department\s+(?:expense|spend)\b/i,
      /\bvibhag[\s\-]?wise\s+kharcha\b/i,
    ],
    buildSql: (t, cols) => {
      if (!cols.has("cost_centre")) return `SELECT * FROM "${t}" LIMIT 50`;

      const dr = debitCol(cols);

      return (
        `SELECT` +
        `  COALESCE(cost_centre, 'Unassigned') AS cost_centre,` +
        `  COUNT(*) AS transactions,` +
        `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS expenses` +
        ` FROM "${t}"` +
        ` WHERE cost_centre IS NOT NULL` +
        ` GROUP BY cost_centre` +
        ` ORDER BY expenses DESC`
      );
    },
  },

  {
    id: "yoy-comparison-monthly",
    patterns: [
      /\byear\s+(?:on|over)\s+year\b/i,
      /\byoy\b/i,
      /\bthis\s+year\s+vs\.?\s+last\s+year\b/i,
      /\bcurrent\s+year\s+vs\.?\s+(?:last|previous)\s+year\b/i,
      /\bcompare\s+(?:this|current|year\s+on)\b.*\byear\b/i,
      /\bsaal\s+dar\s+saal\b/i,
    ],
    buildSql: (t, cols) => {
      if (!cols.has("transaction_date")) return `SELECT * FROM "${t}" LIMIT 100`;

      const cr = cols.has("credit_amount") ? "credit_amount"
        : cols.has("net_amount")   ? "net_amount" : "0";

      return (
        `SELECT` +
        `  TO_CHAR(transaction_date, 'MM') AS month,` +
        `  ROUND(SUM(CASE WHEN EXTRACT(YEAR FROM transaction_date) = EXTRACT(YEAR FROM CURRENT_DATE)     THEN COALESCE(${cr}, 0) ELSE 0 END), 2) AS current_year,` +
        `  ROUND(SUM(CASE WHEN EXTRACT(YEAR FROM transaction_date) = EXTRACT(YEAR FROM CURRENT_DATE) - 1 THEN COALESCE(${cr}, 0) ELSE 0 END), 2) AS previous_year,` +
        `  ROUND(` +
        `    SUM(CASE WHEN EXTRACT(YEAR FROM transaction_date) = EXTRACT(YEAR FROM CURRENT_DATE)     THEN COALESCE(${cr}, 0) ELSE 0 END) -` +
        `    SUM(CASE WHEN EXTRACT(YEAR FROM transaction_date) = EXTRACT(YEAR FROM CURRENT_DATE) - 1 THEN COALESCE(${cr}, 0) ELSE 0 END),` +
        `  2) AS yoy_growth` +
        ` FROM "${t}"` +
        ` WHERE EXTRACT(YEAR FROM transaction_date) IN (EXTRACT(YEAR FROM CURRENT_DATE), EXTRACT(YEAR FROM CURRENT_DATE) - 1)` +
        ` GROUP BY month` +
        ` ORDER BY month`
      );
    },
  },

  {
    id: "gst-input-vs-output",
    patterns: [
      /\bgst\s+input\s+(?:vs\.?|versus|and)\s+output\b/i,
      /\binput\s+(?:vs\.?|versus|and)\s+output\s+gst\b/i,
      /\bgst\s+(?:payable|net\s+liability|net\s+gst)\b/i,
      /\binput\s+tax\s+credit\b/i,
      /\bitc\b.*\bgst\b/i,
    ],
    buildSql: (t, cols) => {
      if (!cols.has("transaction_date")) {
        const acct = cols.has("account_name") ? "account_name" : "''";
        const amt  = cols.has("net_amount") ? "net_amount" : debitCol(cols);
        return (
          `SELECT account_name,` +
          ` ROUND(SUM(COALESCE(${amt}, 0)), 2) AS amount` +
          ` FROM "${t}"` +
          ` WHERE LOWER(COALESCE(${acct},'')) LIKE '%gst%'` +
          ` GROUP BY account_name ORDER BY amount DESC`
        );
      }

      const acct = cols.has("account_name") ? "account_name" : "''";
      const desc = cols.has("description")  ? "description"  : "''";
      const dr   = cols.has("debit_amount")  ? "debit_amount"  : cols.has("net_amount") ? "net_amount" : "0";
      const cr   = cols.has("credit_amount") ? "credit_amount" : cols.has("net_amount") ? "net_amount" : "0";

      return (
        `SELECT` +
        `  TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,` +
        `  ROUND(SUM(CASE WHEN LOWER(COALESCE(${acct},'')) LIKE '%input%' OR LOWER(COALESCE(${desc},'')) LIKE '%input%gst%' THEN COALESCE(${dr}, 0) ELSE 0 END), 2) AS input_gst,` +
        `  ROUND(SUM(CASE WHEN LOWER(COALESCE(${acct},'')) LIKE '%output%' OR LOWER(COALESCE(${desc},'')) LIKE '%output%gst%' THEN COALESCE(${cr}, 0) ELSE 0 END), 2) AS output_gst,` +
        `  ROUND(` +
        `    SUM(CASE WHEN LOWER(COALESCE(${acct},'')) LIKE '%output%' THEN COALESCE(${cr}, 0) ELSE 0 END) -` +
        `    SUM(CASE WHEN LOWER(COALESCE(${acct},'')) LIKE '%input%'  THEN COALESCE(${dr}, 0) ELSE 0 END),` +
        `  2) AS net_gst_payable` +
        ` FROM "${t}"` +
        ` WHERE (LOWER(COALESCE(${acct},'')) LIKE '%gst%' OR LOWER(COALESCE(${desc},'')) LIKE '%gst%')` +
        `   AND transaction_date IS NOT NULL` +
        ` GROUP BY month` +
        ` ORDER BY month`
      );
    },
  },

  {
    id: "creditors-top-10",
    patterns: [
      /\btop\b.*\bcreditors?\b/i,
      /\bhighest\s+(?:payable|outstanding)\s+(?:vendors?|creditors?|suppliers?)\b/i,
      /\blargest\s+creditors?\b/i,
      /\bvendors?\s+(?:we\s+owe|most\s+owed)\b/i,
      /\bsabse\s+bade\s+lenadar\b/i,
    ],
    buildSql: (t, cols) => {
      const vendor = partyCol(cols, "vendor");
      const dr     = debitCol(cols);
      const cr     = cols.has("credit_amount") ? "credit_amount" : "0";

      return (
        `SELECT` +
        `  COALESCE(${vendor}, 'Unknown') AS creditor,` +
        `  ROUND(SUM(COALESCE(${dr}, 0)) - SUM(COALESCE(${cr}, 0)), 2) AS outstanding` +
        ` FROM "${t}"` +
        ` WHERE ${vendor} IS NOT NULL` +
        ` GROUP BY creditor` +
        ` HAVING ROUND(SUM(COALESCE(${dr}, 0)) - SUM(COALESCE(${cr}, 0)), 2) > 0` +
        ` ORDER BY outstanding DESC` +
        ` LIMIT 10`
      );
    },
  },

  {
    id: "debtors-top-10",
    patterns: [
      /\btop\b.*\bdebtors?\b/i,
      /\bhighest\s+(?:receivable|outstanding)\s+(?:customers?|debtors?|clients?)\b/i,
      /\blargest\s+debtors?\b/i,
      /\bcustomers?\s+(?:who\s+owe|most\s+owe)\b/i,
      /\bsabse\s+bade\s+denadaar\b/i,
    ],
    buildSql: (t, cols) => {
      const customer = partyCol(cols, "customer");
      const dr       = cols.has("debit_amount")  ? "debit_amount"  : "0";
      const cr       = creditCol(cols);

      return (
        `SELECT` +
        `  COALESCE(${customer}, 'Unknown') AS debtor,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)) - SUM(COALESCE(${dr}, 0)), 2) AS outstanding` +
        ` FROM "${t}"` +
        ` WHERE ${customer} IS NOT NULL` +
        ` GROUP BY debtor` +
        ` HAVING ROUND(SUM(COALESCE(${cr}, 0)) - SUM(COALESCE(${dr}, 0)), 2) > 0` +
        ` ORDER BY outstanding DESC` +
        ` LIMIT 10`
      );
    },
  },

  {
    id: "zero-balance-accounts",
    patterns: [
      /\bzero[\s\-]balance\s+accounts?\b/i,
      /\baccounts?\s+(?:with\s+)?zero\s+balance\b/i,
      /\bnil\s+(?:balance\s+)?accounts?\b/i,
      /\baccounts?\s+(?:with\s+)?nil(?:\s+balance)?\b/i,
      /\bdormant\s+accounts?\b/i,
      /\bshunya\s+(?:bakaya|balance)\b/i,
    ],
    buildSql: (t, cols) => {
      if (!cols.has("account_name")) return `SELECT * FROM "${t}" LIMIT 100`;

      // closing_balance = 0 is most accurate
      if (cols.has("closing_balance")) {
        return (
          `SELECT account_name, ROUND(MAX(closing_balance), 2) AS balance` +
          ` FROM "${t}"` +
          ` WHERE closing_balance IS NOT NULL` +
          ` GROUP BY account_name` +
          ` HAVING ABS(ROUND(MAX(closing_balance), 2)) < 0.01` +
          ` ORDER BY account_name`
        );
      }

      const dr = cols.has("debit_amount")  ? "debit_amount"  : "0";
      const cr = cols.has("credit_amount") ? "credit_amount" : "0";
      const grp = cols.has("account_group") ? `, COALESCE(account_group, 'Unknown') AS category` : "";

      return (
        `SELECT account_name${grp},` +
        ` ROUND(SUM(COALESCE(${dr}, 0)) - SUM(COALESCE(${cr}, 0)), 2) AS balance` +
        ` FROM "${t}"` +
        ` WHERE account_name IS NOT NULL` +
        ` GROUP BY account_name${cols.has("account_group") ? ", category" : ""}` +
        ` HAVING ABS(ROUND(SUM(COALESCE(${dr}, 0)) - SUM(COALESCE(${cr}, 0)), 2)) < 0.01` +
        ` ORDER BY account_name`
      );
    },
  },

  // ── Week 2 — Day 6-7 additions ───────────────────────────────────────────

  {
    id: "journal-entries",
    patterns: [
      /\bjournal\s+(?:entries|vouchers?|listing)\b/i,
      /\bjv\s+(?:entries|list|report)\b/i,
      /\bmanual\s+(?:entries|journals?)\b/i,
      /\bjournal\s+entry\s+(?:report|list)\b/i,
      /\bjournal\s+voucher\b/i,
      /\broznamcha\b/i,
    ],
    buildSql: (t, cols) => {
      const ref  = cols.has("reference_number") ? "reference_number"
        : cols.has("document_number") ? "document_number" : "NULL";
      const desc = cols.has("description")  ? "description"  : "NULL";
      const dr   = cols.has("debit_amount")  ? "debit_amount"  : "NULL";
      const cr   = cols.has("credit_amount") ? "credit_amount" : "NULL";
      const acct = cols.has("account_name")  ? "account_name"  : "NULL";
      const vtype = cols.has("voucher_type")     ? "voucher_type"
        : cols.has("transaction_type") ? "transaction_type" : null;

      const vtypeFilter = vtype
        ? `WHERE (LOWER(COALESCE(${vtype},'')) LIKE '%journal%'` +
          ` OR LOWER(COALESCE(${vtype},'')) LIKE '%jv%'` +
          ` OR LOWER(COALESCE(${desc},'')) LIKE '%journal%')`
        : `WHERE LOWER(COALESCE(${desc},'')) LIKE '%journal%'`;

      return (
        `SELECT` +
        (cols.has("transaction_date") ? `  transaction_date,` : "") +
        `  ${ref} AS voucher_no,` +
        `  ${acct} AS account,` +
        `  ${desc} AS narration,` +
        `  ROUND(COALESCE(${dr}, 0), 2) AS debit,` +
        `  ROUND(COALESCE(${cr}, 0), 2) AS credit` +
        ` FROM "${t}"` +
        ` ${vtypeFilter}` +
        (cols.has("transaction_date") ? ` ORDER BY transaction_date DESC` : "") +
        ` LIMIT 200`
      );
    },
  },

  {
    id: "contra-entries",
    patterns: [
      /\bcontra\s+(?:entries|vouchers?|transactions?)\b/i,
      /\bcash\s+to\s+bank\b/i,
      /\bbank\s+to\s+cash\b/i,
      /\bcash\s+transfer\b/i,
      /\bcontra\s+voucher\b/i,
    ],
    buildSql: (t, cols) => {
      const dr   = cols.has("debit_amount")  ? "debit_amount"  : "NULL";
      const cr   = cols.has("credit_amount") ? "credit_amount" : "NULL";
      const ref  = cols.has("reference_number") ? "reference_number" : "NULL";
      const desc = cols.has("description")   ? "description"   : "NULL";
      const acct = cols.has("account_name")  ? "account_name"  : "NULL";
      const vtype = cols.has("voucher_type")     ? "voucher_type"
        : cols.has("transaction_type") ? "transaction_type" : null;

      const filter = vtype
        ? `WHERE LOWER(COALESCE(${vtype},'')) LIKE '%contra%'` +
          `   OR (LOWER(COALESCE(${acct},'')) LIKE '%cash%' AND LOWER(COALESCE(${desc},'')) LIKE '%bank%')` +
          `   OR (LOWER(COALESCE(${acct},'')) LIKE '%bank%' AND LOWER(COALESCE(${desc},'')) LIKE '%cash%')`
        : `WHERE (LOWER(COALESCE(${acct},'')) LIKE '%cash%' AND LOWER(COALESCE(${desc},'')) LIKE '%bank%')` +
          `   OR (LOWER(COALESCE(${acct},'')) LIKE '%bank%' AND LOWER(COALESCE(${desc},'')) LIKE '%cash%')`;

      return (
        `SELECT` +
        (cols.has("transaction_date") ? `  transaction_date,` : "") +
        `  ${ref} AS voucher_no,` +
        `  ${acct} AS account,` +
        `  ${desc} AS narration,` +
        `  ROUND(COALESCE(${dr}, 0), 2) AS debit,` +
        `  ROUND(COALESCE(${cr}, 0), 2) AS credit` +
        ` FROM "${t}"` +
        ` ${filter}` +
        (cols.has("transaction_date") ? ` ORDER BY transaction_date DESC` : "") +
        ` LIMIT 200`
      );
    },
  },

  {
    id: "provisions",
    patterns: [
      /\bprovisions?\s+(?:made|entries|summary|report|list)\b/i,
      /\bprovision\s+for\b/i,
      /\baccounting\s+provisions?\b/i,
      /\bpraavdhan\b/i,
    ],
    buildSql: (t, cols) => {
      const dr   = debitCol(cols);
      const cr   = cols.has("credit_amount") ? "credit_amount" : "0";
      const desc = cols.has("description")   ? "description"   : "NULL";
      const acct = cols.has("account_name")  ? "account_name"  : "NULL";
      const grp  = cols.has("account_group") ? "account_group" : "NULL";

      return (
        `SELECT` +
        (cols.has("transaction_date") ? `  transaction_date,` : "") +
        `  ${acct} AS account,` +
        `  ${grp} AS group,` +
        `  ${desc} AS narration,` +
        `  ROUND(COALESCE(${dr}, 0), 2) AS debit,` +
        `  ROUND(COALESCE(${cr}, 0), 2) AS credit` +
        ` FROM "${t}"` +
        ` WHERE LOWER(COALESCE(${acct},'')) LIKE '%provision%'` +
        `    OR LOWER(COALESCE(${desc},'')) LIKE '%provision%'` +
        `    OR LOWER(COALESCE(${grp},''))  LIKE '%provision%'` +
        (cols.has("transaction_date") ? ` ORDER BY transaction_date DESC` : "") +
        ` LIMIT 200`
      );
    },
  },

  {
    id: "write-offs",
    patterns: [
      /\bwrite[\s\-]?offs?\b/i,
      /\bbad\s+debts?\b/i,
      /\bwritten\s+off\b/i,
      /\bdebt\s+write[\s\-]?off\b/i,
      /\bkhatam\s+(?:karana|kiya)\b/i,
    ],
    buildSql: (t, cols) => {
      const dr   = debitCol(cols);
      const cr   = cols.has("credit_amount") ? "credit_amount" : "0";
      const desc = cols.has("description")   ? "description"   : "NULL";
      const acct = cols.has("account_name")  ? "account_name"  : "NULL";

      return (
        `SELECT` +
        (cols.has("transaction_date") ? `  transaction_date,` : "") +
        `  ${acct} AS account,` +
        `  ${desc} AS narration,` +
        `  ROUND(COALESCE(${dr}, 0), 2) AS debit,` +
        `  ROUND(COALESCE(${cr}, 0), 2) AS credit` +
        ` FROM "${t}"` +
        ` WHERE LOWER(COALESCE(${acct},'')) LIKE ANY(ARRAY['%write%off%','%bad debt%','%written off%'])` +
        `    OR LOWER(COALESCE(${desc},'')) LIKE ANY(ARRAY['%write%off%','%bad debt%','%written off%'])` +
        (cols.has("transaction_date") ? ` ORDER BY transaction_date DESC` : "") +
        ` LIMIT 200`
      );
    },
  },

  {
    id: "multi-currency-summary",
    patterns: [
      /\bmulti[\s\-]?currency\b/i,
      /\bforeign\s+currency\s+(?:transactions?|summary)\b/i,
      /\bcurrency[\s\-]?wise\s+(?:summary|breakdown|transactions?)\b/i,
      /\btransactions?\s+by\s+currency\b/i,
      /\bvideshi\s+mudra\b/i,
    ],
    buildSql: (t, cols) => {
      const dr = cols.has("debit_amount")  ? "debit_amount"  : "0";
      const cr = cols.has("credit_amount") ? "credit_amount" : "0";
      const cx = cols.has("currency_code") ? "currency_code" : "'INR'";

      return (
        `SELECT` +
        `  COALESCE(${cx}, 'INR') AS currency,` +
        `  COUNT(*) AS transactions,` +
        `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS total_debits,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)), 2) AS total_credits` +
        ` FROM "${t}"` +
        ` GROUP BY currency` +
        ` ORDER BY total_debits + total_credits DESC`
      );
    },
  },

  {
    id: "unrealized-gains-losses",
    patterns: [
      /\bunrealized\s+(?:gain|loss|forex|fx)\b/i,
      /\bforeign\s+exchange\s+(?:gain|loss|p&l)\b/i,
      /\bforex\s+(?:gain|loss|variance)\b/i,
      /\bexchange\s+(?:gain|loss|difference)\b/i,
      /\bvideshi\s+mudra\s+(?:labh|haani)\b/i,
    ],
    buildSql: (t, cols) => {
      const dr   = cols.has("debit_amount")  ? "debit_amount"  : "0";
      const cr   = cols.has("credit_amount") ? "credit_amount" : "0";
      const cx   = cols.has("currency_code") ? "currency_code" : "'INR'";
      const acct = cols.has("account_name")  ? "account_name"  : "NULL";
      const desc = cols.has("description")   ? "description"   : "NULL";

      return (
        `SELECT` +
        `  COALESCE(${cx}, 'INR') AS currency,` +
        `  ${acct} AS account,` +
        `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS total_debit,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)), 2) AS total_credit,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)) - SUM(COALESCE(${dr}, 0)), 2) AS net_position` +
        ` FROM "${t}"` +
        ` WHERE LOWER(COALESCE(${acct},'')) LIKE ANY(ARRAY['%forex%','%exchange%','%fx %','%foreign%'])` +
        `    OR LOWER(COALESCE(${desc},'')) LIKE ANY(ARRAY['%unrealized%','%exchange gain%','%exchange loss%','%forex%'])` +
        (cols.has("currency_code") ? `    OR COALESCE(${cx},'INR') <> 'INR'` : "") +
        ` GROUP BY currency, account` +
        ` ORDER BY ABS(ROUND(SUM(COALESCE(${cr}, 0)) - SUM(COALESCE(${dr}, 0)), 2)) DESC`
      );
    },
  },

  {
    id: "current-ratio",
    patterns: [
      /\bcurrent\s+ratio\b/i,
      /\bcurrent\s+assets?\s+(?:vs\.?|\/|to)\s+(?:current\s+)?liabilit/i,
      /\bliquidity\s+ratio\b/i,
      /\bvartamaan\s+anupat\b/i,
    ],
    buildSql: (t, cols) => {
      const bal = cols.has("closing_balance") ? "closing_balance" : null;
      const dr  = cols.has("debit_amount")    ? "debit_amount"    : "0";
      const cr  = cols.has("credit_amount")   ? "credit_amount"   : "0";
      const grp = cols.has("account_group")   ? "account_group"   : "account_type";
      const net = bal ? `COALESCE(${bal}, 0)` : `COALESCE(${dr}, 0) - COALESCE(${cr}, 0)`;

      return (
        `SELECT` +
        `  ROUND(SUM(CASE WHEN LOWER(COALESCE(${grp},'')) LIKE '%current asset%' THEN ${net} ELSE 0 END), 2) AS current_assets,` +
        `  ROUND(SUM(CASE WHEN LOWER(COALESCE(${grp},'')) LIKE '%current liabilit%' THEN ABS(${net}) ELSE 0 END), 2) AS current_liabilities,` +
        `  ROUND(` +
        `    SUM(CASE WHEN LOWER(COALESCE(${grp},'')) LIKE '%current asset%'    THEN ${net}   ELSE 0 END) /` +
        `    NULLIF(SUM(CASE WHEN LOWER(COALESCE(${grp},'')) LIKE '%current liabilit%' THEN ABS(${net}) ELSE 0 END), 0),` +
        `  2) AS current_ratio` +
        ` FROM "${t}"`
      );
    },
  },

  {
    id: "debt-equity-ratio",
    patterns: [
      /\bdebt[\s\-]?(?:to[\s\-]?)?equity\s+ratio\b/i,
      /\bd\/e\s+ratio\b/i,
      /\bleverage\s+ratio\b/i,
      /\btotal\s+debt\s+(?:vs\.?|\/)\s+equity\b/i,
      /\brin\s+punji\s+anupat\b/i,
    ],
    buildSql: (t, cols) => {
      const bal = cols.has("closing_balance") ? `ABS(COALESCE(closing_balance, 0))` : `ABS(COALESCE(${debitCol(cols)}, 0))`;
      const grp = cols.has("account_group") ? "account_group" : "account_type";

      return (
        `SELECT` +
        `  ROUND(SUM(CASE WHEN LOWER(COALESCE(${grp},'')) LIKE ANY(ARRAY['%loan%','%borrowing%','%debt%','%term loan%']) THEN ${bal} ELSE 0 END), 2) AS total_debt,` +
        `  ROUND(SUM(CASE WHEN LOWER(COALESCE(${grp},'')) LIKE ANY(ARRAY['%equity%','%capital%','%reserve%','%surplus%']) THEN ${bal} ELSE 0 END), 2) AS total_equity,` +
        `  ROUND(` +
        `    SUM(CASE WHEN LOWER(COALESCE(${grp},'')) LIKE ANY(ARRAY['%loan%','%borrowing%','%debt%']) THEN ${bal} ELSE 0 END) /` +
        `    NULLIF(SUM(CASE WHEN LOWER(COALESCE(${grp},'')) LIKE ANY(ARRAY['%equity%','%capital%','%reserve%']) THEN ${bal} ELSE 0 END), 0),` +
        `  2) AS debt_equity_ratio` +
        ` FROM "${t}"`
      );
    },
  },

  {
    id: "working-capital",
    patterns: [
      /\bworking\s+capital\b/i,
      /\bcurrent\s+assets?\s*[-–]\s*(?:current\s+)?liabilit/i,
      /\bnet\s+current\s+assets?\b/i,
      /\bkarya\s+poonji\b/i,
    ],
    buildSql: (t, cols) => {
      const bal = cols.has("closing_balance") ? `COALESCE(closing_balance, 0)` : `COALESCE(${debitCol(cols)}, 0) - COALESCE(${cols.has("credit_amount") ? "credit_amount" : "0"}, 0)`;
      const grp = cols.has("account_group") ? "account_group" : "account_type";

      return (
        `SELECT` +
        `  ROUND(SUM(CASE WHEN LOWER(COALESCE(${grp},'')) LIKE '%current asset%'    THEN ${bal}   ELSE 0 END), 2) AS current_assets,` +
        `  ROUND(SUM(CASE WHEN LOWER(COALESCE(${grp},'')) LIKE '%current liabilit%' THEN ABS(${bal}) ELSE 0 END), 2) AS current_liabilities,` +
        `  ROUND(` +
        `    SUM(CASE WHEN LOWER(COALESCE(${grp},'')) LIKE '%current asset%'    THEN ${bal}   ELSE 0 END) -` +
        `    SUM(CASE WHEN LOWER(COALESCE(${grp},'')) LIKE '%current liabilit%' THEN ABS(${bal}) ELSE 0 END),` +
        `  2) AS working_capital` +
        ` FROM "${t}"`
      );
    },
  },

  {
    id: "budget-variance",
    patterns: [
      /\bbudget\s+(?:variance|vs\.?\s+actual|versus\s+actual)\b/i,
      /\bactual\s+vs\.?\s+budget\b/i,
      /\bvariance\s+(?:report|analysis|summary)\b/i,
      /\bover\s+(?:budget|spend)\b/i,
      /\bbudget\s+antar\b/i,
    ],
    buildSql: (t, cols) => {
      if (!cols.has("transaction_date")) return `SELECT * FROM "${t}" LIMIT 100`;

      const dr  = debitCol(cols);
      const grp = cols.has("account_group") ? "account_group"
        : cols.has("account_type") ? "account_type" : null;

      // When account grouping exists, show monthly actuals vs avg as proxy for budget
      if (grp) {
        return (
          `WITH monthly AS (` +
          ` SELECT TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,` +
          `  COALESCE(${grp}, 'Unclassified') AS category,` +
          `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS actual` +
          ` FROM "${t}" WHERE transaction_date IS NOT NULL` +
          ` GROUP BY month, category` +
          `)` +
          ` SELECT month, category, actual,` +
          `  ROUND(AVG(actual) OVER (PARTITION BY category), 2) AS avg_monthly,` +
          `  ROUND(actual - AVG(actual) OVER (PARTITION BY category), 2) AS variance_from_avg` +
          ` FROM monthly ORDER BY month, ABS(variance_from_avg) DESC`
        );
      }

      return (
        `WITH monthly AS (` +
        ` SELECT TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,` +
        `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS actual` +
        ` FROM "${t}" WHERE transaction_date IS NOT NULL GROUP BY month` +
        `)` +
        ` SELECT month, actual,` +
        `  ROUND(AVG(actual) OVER (), 2) AS avg_monthly,` +
        `  ROUND(actual - AVG(actual) OVER (), 2) AS variance_from_avg` +
        ` FROM monthly ORDER BY month`
      );
    },
  },

  {
    id: "forecast-vs-actual",
    patterns: [
      /\bforecast\s+(?:vs\.?|versus)\s+actual\b/i,
      /\bactual\s+(?:vs\.?|versus)\s+forecast\b/i,
      /\bprojected\s+(?:vs\.?|versus)\s+actual\b/i,
      /\brevenue\s+forecast\b/i,
      /\banuman\s+vs\s+vastavik\b/i,
    ],
    buildSql: (t, cols) => {
      if (!cols.has("transaction_date")) return `SELECT * FROM "${t}" LIMIT 100`;

      const cr = cols.has("credit_amount") ? "credit_amount"
        : cols.has("net_amount")   ? "net_amount" : "0";

      return (
        `WITH monthly AS (` +
        ` SELECT DATE_TRUNC('month', transaction_date) AS month,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)), 2) AS actual` +
        ` FROM "${t}" WHERE transaction_date IS NOT NULL GROUP BY month` +
        `)` +
        ` SELECT TO_CHAR(month, 'YYYY-MM') AS month, actual AS actual_revenue,` +
        `  ROUND(LAG(actual, 1) OVER (ORDER BY month) * 1.05, 2) AS forecast_5pct_growth,` +
        `  ROUND(actual - COALESCE(LAG(actual, 1) OVER (ORDER BY month) * 1.05, actual), 2) AS variance` +
        ` FROM monthly ORDER BY month`
      );
    },
  },

  {
    id: "fixed-asset-summary",
    patterns: [
      /\bfixed\s+assets?\s+(?:summary|report|list|register)\b/i,
      /\bcapital\s+assets?\b/i,
      /\bproperty\s+plant\s+(?:and\s+)?equipment\b/i,
      /\bppe\b/i,
      /\basthir\s+sampatti\b/i,
    ],
    buildSql: (t, cols) => {
      const dr   = cols.has("debit_amount")  ? "debit_amount"  : "0";
      const cr   = cols.has("credit_amount") ? "credit_amount" : "0";
      const grp  = cols.has("account_group") ? "account_group"
        : cols.has("account_type") ? "account_type" : null;
      const acct = cols.has("account_name")  ? "account_name"  : "NULL";
      const assetFilter =
        `(LOWER(COALESCE(${grp ? grp : acct},'')) LIKE ANY(ARRAY['%fixed asset%','%capital work%','%plant%','%equipment%','%machinery%','%furniture%','%vehicle%','%building%','%land%']))`;

      return (
        `SELECT` +
        `  ${acct} AS asset,` +
        (grp ? `  COALESCE(${grp}, 'Fixed Asset') AS category,` : "") +
        `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS gross_value,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)), 2) AS accumulated_depreciation,` +
        `  ROUND(SUM(COALESCE(${dr}, 0)) - SUM(COALESCE(${cr}, 0)), 2) AS net_book_value` +
        ` FROM "${t}"` +
        ` WHERE ${assetFilter}` +
        ` GROUP BY asset${grp ? ", category" : ""}` +
        ` ORDER BY gross_value DESC`
      );
    },
  },

  {
    id: "depreciation-schedule",
    patterns: [
      /\bdepreciation\s+(?:schedule|report|summary|entries)\b/i,
      /\bdepreciation\s+(?:this|last|current)?\s*(?:year|month|quarter)\b/i,
      /\baccumulated\s+depreciation\b/i,
      /\bmulya\s+hrass\b/i,
    ],
    buildSql: (t, cols) => {
      const dr   = debitCol(cols);
      const desc = cols.has("description")  ? "description"  : "NULL";
      const acct = cols.has("account_name") ? "account_name" : "NULL";
      const grp  = cols.has("account_group") ? "account_group" : "NULL";

      if (cols.has("transaction_date")) {
        return (
          `SELECT` +
          `  TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,` +
          `  ${acct} AS asset,` +
          `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS depreciation_amount` +
          ` FROM "${t}"` +
          ` WHERE LOWER(COALESCE(${acct},'')) LIKE '%depreciation%'` +
          `    OR LOWER(COALESCE(${grp},''))  LIKE '%depreciation%'` +
          `    OR LOWER(COALESCE(${desc},'')) LIKE '%depreciation%'` +
          ` GROUP BY month, asset` +
          ` ORDER BY month, depreciation_amount DESC`
        );
      }

      return (
        `SELECT ${acct} AS asset,` +
        ` ROUND(SUM(COALESCE(${dr}, 0)), 2) AS depreciation_amount` +
        ` FROM "${t}"` +
        ` WHERE LOWER(COALESCE(${acct},'')) LIKE '%depreciation%'` +
        `    OR LOWER(COALESCE(${desc},'')) LIKE '%depreciation%'` +
        ` GROUP BY asset ORDER BY depreciation_amount DESC`
      );
    },
  },

  {
    id: "vendor-payment-summary",
    patterns: [
      /\bvendor\s+payments?\s+(?:summary|made|report)\b/i,
      /\bpayments?\s+(?:made\s+to|to)\s+vendors?\b/i,
      /\bsupplier\s+payments?\b/i,
      /\bkitna\s+(?:diya|bhugtan|pay)\s+(?:vendor|supplier)\b/i,
    ],
    buildSql: (t, cols) => {
      const vendor = partyCol(cols, "vendor");
      const cr     = cols.has("credit_amount") ? "credit_amount" : debitCol(cols);
      const vtype  = cols.has("voucher_type")     ? "voucher_type"
        : cols.has("transaction_type") ? "transaction_type" : null;
      const vtypeFilter = vtype
        ? ` AND (LOWER(COALESCE(${vtype},'')) LIKE '%payment%' OR ${vendor} IS NOT NULL)`
        : ` AND ${vendor} IS NOT NULL`;

      if (cols.has("transaction_date")) {
        return (
          `SELECT` +
          `  COALESCE(${vendor}, 'Unknown') AS vendor,` +
          `  TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,` +
          `  COUNT(*) AS payments,` +
          `  ROUND(SUM(COALESCE(${cr}, 0)), 2) AS total_paid` +
          ` FROM "${t}"` +
          ` WHERE transaction_date IS NOT NULL${vtypeFilter}` +
          ` GROUP BY vendor, month` +
          ` ORDER BY month, total_paid DESC`
        );
      }

      return (
        `SELECT COALESCE(${vendor}, 'Unknown') AS vendor,` +
        ` COUNT(*) AS payments, ROUND(SUM(COALESCE(${cr}, 0)), 2) AS total_paid` +
        ` FROM "${t}" WHERE ${vendor} IS NOT NULL` +
        ` GROUP BY vendor ORDER BY total_paid DESC`
      );
    },
  },

  {
    id: "customer-receipts-summary",
    patterns: [
      /\bcustomer\s+receipts?\s+(?:summary|report)\b/i,
      /\breceipts?\s+(?:from\s+)?customers?\b/i,
      /\bmoney\s+received\s+from\s+customers?\b/i,
      /\bgrahak\s+se\s+(?:prapt|mila|receipts?)\b/i,
    ],
    buildSql: (t, cols) => {
      const customer = partyCol(cols, "customer");
      const dr       = cols.has("debit_amount") ? "debit_amount" : creditCol(cols);
      const vtype    = cols.has("voucher_type")     ? "voucher_type"
        : cols.has("transaction_type") ? "transaction_type" : null;
      const vtypeFilter = vtype
        ? ` AND (LOWER(COALESCE(${vtype},'')) LIKE '%receipt%' OR ${customer} IS NOT NULL)`
        : ` AND ${customer} IS NOT NULL`;

      if (cols.has("transaction_date")) {
        return (
          `SELECT` +
          `  COALESCE(${customer}, 'Unknown') AS customer,` +
          `  TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,` +
          `  COUNT(*) AS receipts,` +
          `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS total_received` +
          ` FROM "${t}"` +
          ` WHERE transaction_date IS NOT NULL${vtypeFilter}` +
          ` GROUP BY customer, month` +
          ` ORDER BY month, total_received DESC`
        );
      }

      return (
        `SELECT COALESCE(${customer}, 'Unknown') AS customer,` +
        ` COUNT(*) AS receipts, ROUND(SUM(COALESCE(${dr}, 0)), 2) AS total_received` +
        ` FROM "${t}" WHERE ${customer} IS NOT NULL` +
        ` GROUP BY customer ORDER BY total_received DESC`
      );
    },
  },

  {
    id: "large-transactions",
    patterns: [
      /\blarge\s+transactions?\b/i,
      /\bhigh[\s\-]?value\s+transactions?\b/i,
      /\btransactions?\s+(?:above|over|exceeding)\s+(?:[\d,]+|[0-9]+\s*(?:lakh|crore|k|l))\b/i,
      /\bbade\s+transactions?\b/i,
      /\bbadi\s+rashi\b/i,
    ],
    buildSql: (t, cols) => {
      const amt  = cols.has("debit_amount")  ? "COALESCE(debit_amount, credit_amount, net_amount, 0)"
        : cols.has("credit_amount") ? "COALESCE(credit_amount, net_amount, 0)"
        : "COALESCE(net_amount, 0)";
      const acct = cols.has("account_name")  ? "account_name"  : "NULL";
      const desc = cols.has("description")   ? "description"   : "NULL";
      const ref  = cols.has("reference_number") ? "reference_number" : "NULL";

      return (
        `SELECT` +
        (cols.has("transaction_date") ? `  transaction_date,` : "") +
        `  ${acct} AS account,` +
        `  ${ref} AS reference,` +
        `  ${desc} AS narration,` +
        `  ROUND(${amt}, 2) AS amount` +
        ` FROM "${t}"` +
        ` WHERE ${amt} >= 100000` +
        (cols.has("transaction_date") ? ` ORDER BY transaction_date DESC` : ` ORDER BY amount DESC`) +
        ` LIMIT 50`
      );
    },
  },

  {
    id: "intercompany-transactions",
    patterns: [
      /\bintercompany\s+(?:transactions?|entries)\b/i,
      /\binter[\s\-]company\b/i,
      /\brelated\s+party\s+(?:transactions?|entries)\b/i,
      /\bgroup\s+company\s+transactions?\b/i,
      /\bsamanbandhit\s+paksh\b/i,
    ],
    buildSql: (t, cols) => {
      const dr   = cols.has("debit_amount")  ? "debit_amount"  : "NULL";
      const cr   = cols.has("credit_amount") ? "credit_amount" : "NULL";
      const acct = cols.has("account_name")  ? "account_name"  : "NULL";
      const desc = cols.has("description")   ? "description"   : "NULL";

      return (
        `SELECT` +
        (cols.has("transaction_date") ? `  transaction_date,` : "") +
        `  ${acct} AS entity,` +
        `  ${desc} AS narration,` +
        `  ROUND(COALESCE(${dr}, 0), 2) AS debit,` +
        `  ROUND(COALESCE(${cr}, 0), 2) AS credit` +
        ` FROM "${t}"` +
        ` WHERE LOWER(COALESCE(${acct},'')) LIKE ANY(ARRAY['%intercompany%','%inter company%','%related party%','%group company%','%subsidiary%','%holding%'])` +
        `    OR LOWER(COALESCE(${desc},'')) LIKE ANY(ARRAY['%intercompany%','%related party%','%group company%'])` +
        (cols.has("transaction_date") ? ` ORDER BY transaction_date DESC` : "") +
        ` LIMIT 200`
      );
    },
  },

  {
    id: "pending-bills",
    patterns: [
      /\bpending\s+(?:bills?|invoices?)\b/i,
      /\bunpaid\s+(?:bills?|invoices?)\b/i,
      /\boverdue\s+(?:bills?|invoices?)\b/i,
      /\bbills?\s+(?:due|payable|pending)\b/i,
      /\bbaaki\s+bill\b/i,
      /\bbhugtan\s+baaki\b/i,
    ],
    buildSql: (t, cols) => {
      const vendor = partyCol(cols, "vendor");
      const dr     = debitCol(cols);
      const ref    = cols.has("reference_number") ? "reference_number"
        : cols.has("document_number") ? "document_number" : "NULL";
      const vtype  = cols.has("voucher_type")     ? "voucher_type"
        : cols.has("transaction_type") ? "transaction_type" : null;
      const vtypeFilter = vtype
        ? `LOWER(COALESCE(${vtype},'')) LIKE ANY(ARRAY['%purchase%','%invoice%','%bill%'])`
        : `${vendor} IS NOT NULL`;

      if (cols.has("due_date")) {
        return (
          `SELECT` +
          `  COALESCE(${vendor}, 'Unknown') AS vendor,` +
          `  ${ref} AS bill_no,` +
          (cols.has("transaction_date") ? `  transaction_date,` : "") +
          `  due_date,` +
          `  CURRENT_DATE - due_date::date AS days_overdue,` +
          `  ROUND(COALESCE(${dr}, 0), 2) AS amount` +
          ` FROM "${t}"` +
          ` WHERE ${vtypeFilter} AND due_date IS NOT NULL AND due_date::date < CURRENT_DATE` +
          ` ORDER BY days_overdue DESC LIMIT 100`
        );
      }

      return (
        `SELECT` +
        `  COALESCE(${vendor}, 'Unknown') AS vendor,` +
        `  ${ref} AS bill_no,` +
        (cols.has("transaction_date") ? `  transaction_date,` : "") +
        `  ROUND(COALESCE(${dr}, 0), 2) AS amount` +
        ` FROM "${t}"` +
        ` WHERE ${vtypeFilter}` +
        (cols.has("transaction_date") ? ` ORDER BY transaction_date DESC` : ` ORDER BY amount DESC`) +
        ` LIMIT 100`
      );
    },
  },

  {
    id: "account-monthly-drill",
    patterns: [
      /\baccount[\s\-]?wise\s+monthly\b/i,
      /\bmonthly\s+(?:drill|breakdown)\s+(?:by\s+)?account\b/i,
      /\baccount\s+(?:wise\s+)?month[\s\-]?wise\b/i,
      /\beach\s+account\s+by\s+month\b/i,
      /\bkhata\s+wise\s+mahine\b/i,
    ],
    buildSql: (t, cols) => {
      if (!cols.has("transaction_date") || !cols.has("account_name")) {
        return `SELECT * FROM "${t}" LIMIT 100`;
      }

      const dr = cols.has("debit_amount")  ? "debit_amount"  : "0";
      const cr = cols.has("credit_amount") ? "credit_amount" : "0";

      return (
        `SELECT` +
        `  account_name,` +
        `  TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,` +
        `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS debits,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)), 2) AS credits,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)) - SUM(COALESCE(${dr}, 0)), 2) AS net` +
        ` FROM "${t}"` +
        ` WHERE account_name IS NOT NULL AND transaction_date IS NOT NULL` +
        ` GROUP BY account_name, month` +
        ` ORDER BY account_name, month`
      );
    },
  },

  {
    id: "period-close-summary",
    patterns: [
      /\bperiod[\s\-]?close\s+summary\b/i,
      /\bmonth[\s\-]?end\s+(?:close\s+)?summary\b/i,
      /\bperiod\s+end\s+(?:summary|report|close)\b/i,
      /\bclosing\s+entries\s+summary\b/i,
      /\bmahine\s+ke\s+ant\s+(?:ka|ki)\s+(?:summary|vivaran)\b/i,
    ],
    buildSql: (t, cols) => {
      if (!cols.has("transaction_date")) return `SELECT * FROM "${t}" LIMIT 100`;

      const dr  = cols.has("debit_amount")  ? "debit_amount"  : "0";
      const cr  = cols.has("credit_amount") ? "credit_amount" : "0";
      const grp = cols.has("account_group") ? "account_group"
        : cols.has("account_type") ? "account_type" : null;

      return (
        `SELECT` +
        `  TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS period,` +
        (grp ? `  COALESCE(${grp}, 'Unclassified') AS category,` : "") +
        `  COUNT(*) AS entries,` +
        `  ROUND(SUM(COALESCE(${dr}, 0)), 2) AS total_debits,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)), 2) AS total_credits,` +
        `  ROUND(SUM(COALESCE(${cr}, 0)) - SUM(COALESCE(${dr}, 0)), 2) AS net` +
        ` FROM "${t}"` +
        ` WHERE transaction_date IS NOT NULL` +
        ` GROUP BY period${grp ? ", category" : ""}` +
        ` ORDER BY period${grp ? ", ABS(net) DESC" : ""}`
      );
    },
  },

];

// ─── Exports ──────────────────────────────────────────────────────────────────

/** Build SQL directly by templateId — used by dashboard API (no question matching needed). */
export function getSqlForTemplate(
  templateId: string,
  schema: ERPSchema,
): string | null {
  const primaryTable = schema.tables[0];
  if (!primaryTable) return null;

  const tpl = TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return null;

  const colNames = new Set(primaryTable.columns.map((c) => c.name.toLowerCase()));
  return tpl.buildSql(primaryTable.name, colNames);
}

export function matchTemplate(question: string, schema: ERPSchema): TemplateMatch | null {
  const primaryTable = schema.tables[0];
  if (!primaryTable) return null;

  const tableName = primaryTable.name;
  const colNames  = new Set(primaryTable.columns.map((c) => c.name.toLowerCase()));

  for (const tpl of TEMPLATES) {
    if (tpl.patterns.some((re) => re.test(question))) {
      return {
        templateId: tpl.id,
        sql:        tpl.buildSql(tableName, colNames),
        confidence: 0.95,
      };
    }
  }
  return null;
}
