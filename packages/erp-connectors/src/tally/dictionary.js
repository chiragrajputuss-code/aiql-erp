import { extractCollection } from "./utils";
// ─── Tally standard group → entity category ───────────────────────────────────
// Vendors = Accounts Payable side (Sundry Creditors and sub-groups)
const VENDOR_GROUPS = new Set([
    "sundry creditors",
    "creditors",
    "trade payables",
    "creditors (domestic)",
    "creditors (foreign)",
    "accounts payable",
]);
// Customers = Accounts Receivable side (Sundry Debtors and sub-groups)
const CUSTOMER_GROUPS = new Set([
    "sundry debtors",
    "debtors",
    "trade receivables",
    "debtors (domestic)",
    "debtors (foreign)",
    "accounts receivable",
]);
// Employees = payroll-related groups
const EMPLOYEE_GROUPS = new Set([
    "employees",
    "salary payable",
    "wages payable",
    "directors remuneration",
    "payroll liabilities",
    "employee benefits",
    "staff salaries",
]);
/**
 * Pull vendor, customer, and employee name lists from Tally.
 * These feed directly into the tokeniser's entity dictionary.
 */
export async function getTallyEntityLists(connector) {
    const res = await connector.sendRequest("List of Ledgers");
    const ledgers = extractCollection(res, "LEDGER");
    const vendors = [];
    const customers = [];
    const employees = [];
    for (const ledger of ledgers) {
        const name = (ledger["@_NAME"] ?? ledger.NAME)?.trim() ?? "";
        const parent = ledger.PARENT?.trim().toLowerCase() ?? "";
        if (!name)
            continue;
        if (VENDOR_GROUPS.has(parent))
            vendors.push(name);
        else if (CUSTOMER_GROUPS.has(parent))
            customers.push(name);
        else if (EMPLOYEE_GROUPS.has(parent))
            employees.push(name);
    }
    return { vendors, customers, employees };
}
