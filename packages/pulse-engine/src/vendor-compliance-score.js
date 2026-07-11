// Trailing average of (invoicesAtRisk / invoicesTotal) across the records
// passed in (caller decides the window — typically trailing 3 periods).
export function computeVendorRiskBand(records) {
    if (records.length === 0)
        return "green";
    const ratios = records
        .filter((r) => r.invoicesTotal > 0)
        .map((r) => r.invoicesAtRisk / r.invoicesTotal);
    if (ratios.length === 0)
        return "green";
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    if (avg > 0.3)
        return "red";
    if (avg > 0.1)
        return "amber";
    return "green";
}
// One alert summarising ITC at risk for the latest period across all vendors
// on a connection. Mirrors computeTdsAlerts's shape/threshold style.
export function computeVendorComplianceAlerts(latestPeriodRecords, today) {
    const atRisk = latestPeriodRecords.filter((r) => r.amountAtRisk > 0);
    if (atRisk.length === 0)
        return [];
    const totalAtRisk = atRisk.reduce((sum, r) => sum + r.amountAtRisk, 0);
    const vendorNames = atRisk
        .sort((a, b) => b.amountAtRisk - a.amountAtRisk)
        .slice(0, 5)
        .map((r) => r.vendorName);
    const monthName = today.toLocaleDateString("en-IN", { month: "long" });
    return [
        {
            category: "vendor_gst_filing",
            severity: totalAtRisk > 50000 ? "critical" : "review",
            title: `₹${totalAtRisk.toLocaleString("en-IN", { maximumFractionDigits: 0 })} ITC at risk this month — ${atRisk.length} vendor${atRisk.length > 1 ? "s" : ""} may not have filed`,
            detail: `For ${monthName}, ${atRisk.length} vendor${atRisk.length > 1 ? "s" : ""} have purchase invoices booked in your GL that don't appear in GSTR-2B yet. Top vendors: ${vendorNames.join(", ")}.`,
            detailJson: {
                totalAtRisk,
                vendorCount: atRisk.length,
                vendors: atRisk.map((r) => ({
                    vendorName: r.vendorName,
                    amountAtRisk: r.amountAtRisk,
                    invoicesAtRisk: r.invoicesAtRisk,
                })),
            },
        },
    ];
}
