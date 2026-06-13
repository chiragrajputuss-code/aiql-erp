import type { PulseAlertPayload } from "./types";

// TDS threshold for payment to a single vendor in a financial year (194C)
const TDS_VENDOR_ANNUAL_THRESHOLD = 100_000; // ₹1L
const TDS_VENDOR_SINGLE_THRESHOLD = 30_000;  // ₹30K per payment

interface TdsSummary {
  vendorName:  string;
  totalPaid:   number;
  hasTds:      boolean;
  tdsAmount:   number;
}

/**
 * Compute TDS liability from GL rows.
 * Rows should be payment vouchers for the current month.
 * Canonical columns: vendor_name, net_amount (or debit_amount), tds_amount (if any)
 */
export function computeTdsAlerts(
  rows:         Record<string, unknown>[],
  connectionId: string,
  today:        Date,
): PulseAlertPayload[] {
  if (rows.length === 0) return [];

  // Group by vendor
  const byVendor = new Map<string, TdsSummary>();

  for (const row of rows) {
    const vendor    = String(row.vendor_name ?? row.party_name ?? row.account_name ?? "Unknown");
    const amount    = Math.abs(Number(row.net_amount ?? row.debit_amount ?? row.credit_amount ?? 0));
    const tdsAmount = Number(row.tds_amount ?? 0);
    const existing  = byVendor.get(vendor);

    if (existing) {
      existing.totalPaid  += amount;
      existing.tdsAmount  += tdsAmount;
      existing.hasTds      = existing.hasTds || tdsAmount > 0;
    } else {
      byVendor.set(vendor, {
        vendorName: vendor,
        totalPaid:  amount,
        hasTds:     tdsAmount > 0,
        tdsAmount,
      });
    }
  }

  // Vendors that cross threshold without TDS
  const monthName = today.toLocaleDateString("en-IN", { month: "long" });
  const potentialMissed: string[] = [];
  let totalUndeducted = 0;

  for (const summary of byVendor.values()) {
    if (!summary.hasTds && summary.totalPaid >= TDS_VENDOR_SINGLE_THRESHOLD) {
      potentialMissed.push(summary.vendorName);
      // Estimate 2% TDS (194C rate for companies) as a rough pending amount
      totalUndeducted += summary.totalPaid * 0.02;
    }
  }

  if (potentialMissed.length === 0) return [];

  return [{
    category:  "tds_calculator",
    severity:  "review",
    title:     `₹${(totalUndeducted / 1e5).toFixed(2)}L TDS may be pending for ${monthName}`,
    detail:    `${potentialMissed.length} vendor${potentialMissed.length !== 1 ? "s" : ""} paid above ₹30K without TDS recorded: ${potentialMissed.slice(0, 3).join(", ")}${potentialMissed.length > 3 ? ` and ${potentialMissed.length - 3} more` : ""}`,
    actionUrl: `/connections/${connectionId}/chat?q=Show+vendor+payments+above+30000+without+TDS`,
    detailJson: { totalUndeducted, potentialMissed, monthName },
  }];
}
