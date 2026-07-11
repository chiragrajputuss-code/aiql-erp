// ─── Supported Zoho reports ───────────────────────────────────────────────────
const REPORT_ENDPOINTS = {
    profitandloss: "/reports/profitandloss",
    profit_and_loss: "/reports/profitandloss",
    "profit & loss": "/reports/profitandloss",
    balancesheet: "/reports/balancesheet",
    "balance sheet": "/reports/balancesheet",
    trialbalance: "/reports/trialbalance",
    "trial balance": "/reports/trialbalance",
    generalledger: "/reports/generalledger",
    "general ledger": "/reports/generalledger",
    cashflow: "/reports/cashflow",
    "cash flow": "/reports/cashflow",
    receivablesummary: "/reports/receivablesummary",
    "ar aging": "/reports/receivablesummary",
    payablesummary: "/reports/payablesummary",
    "ap aging": "/reports/payablesummary",
};
function parseQuery(query) {
    // Try JSON first: {"report": "profitandloss", "params": {"from_date": "..."}}
    try {
        const parsed = JSON.parse(query);
        if (parsed.report)
            return parsed;
    }
    catch { /* not JSON — treat as report name */ }
    return { report: query.trim().toLowerCase() };
}
function flattenReport(data) {
    // Zoho report responses vary by type — try common shapes
    // P&L and Balance Sheet: { profitloss: { income: [...], expense: [...] } }
    // Trial Balance: { trialbalance: [...] }
    // General Ledger: { generalledger: [...] }
    for (const key of Object.keys(data)) {
        const val = data[key];
        if (Array.isArray(val))
            return val;
        if (val && typeof val === "object") {
            // Try to flatten one level deeper
            const inner = val;
            const rows = [];
            for (const [section, items] of Object.entries(inner)) {
                if (Array.isArray(items)) {
                    rows.push(...items.map((r) => ({ _section: section, ...r })));
                }
            }
            if (rows.length > 0)
                return rows;
        }
    }
    return [];
}
/**
 * Execute a Zoho Books report query.
 * `query` can be:
 *  - A report name: "profitandloss", "balancesheet", "trial balance", etc.
 *  - A JSON string: `{"report": "generalledger", "params": {"from_date": "2026-04-01"}}`
 *
 * Zoho's API is inherently read-only for reports — no write guard needed.
 */
export async function executeZohoQuery(connector, query) {
    const { report, params } = parseQuery(query);
    const reportKey = report.toLowerCase();
    const endpoint = REPORT_ENDPOINTS[reportKey];
    if (!endpoint) {
        throw new Error(`Unknown Zoho Books report: "${report}". Supported: ${Object.keys(REPORT_ENDPOINTS).join(", ")}`);
    }
    const t0 = Date.now();
    const data = await connector.get(endpoint, params);
    const rows = flattenReport(data);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return {
        columns,
        rows,
        rowCount: rows.length,
        executionTimeMs: Date.now() - t0,
    };
}
