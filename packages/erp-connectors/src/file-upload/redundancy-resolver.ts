import type { ColumnMappingResult } from "./column-mapper";

export interface ResolvedMapping extends ColumnMappingResult {
  dropped:      boolean;
  dropReason?:  string;
}

/**
 * Apply redundancy rules to a list of mapped columns.
 * Returns the same list with `dropped: true` on redundant columns.
 *
 * Rules:
 *  R1 — debit_amount + credit_amount present → drop net_amount
 *  R2 — vendor_name + party_name → drop vendor_name (party_name is kept)
 *  R3 — customer_name + party_name → drop customer_name
 *  R4 — opening_balance in a transaction file → drop it
 *  R5 — Two columns map to the same semantic type → keep first, drop rest
 */
export function resolveRedundancy(
  mappings: ColumnMappingResult[],
  fileType: "transaction" | "balance" = "transaction"
): ResolvedMapping[] {
  const resolved: ResolvedMapping[] = mappings.map((m) => ({ ...m, dropped: false }));

  const canonical = (name: string | null) =>
    resolved.find((m) => !m.dropped && m.canonicalName === name);

  // R1: debit + credit → drop net_amount
  if (canonical("debit_amount") && canonical("credit_amount")) {
    const netCol = resolved.find((m) => m.canonicalName === "net_amount");
    if (netCol) {
      netCol.dropped = true;
      netCol.dropReason = "redundant: debit_amount + credit_amount already present";
    }
  }

  // R2: vendor_name + party_name → drop vendor_name
  if (canonical("vendor_name") && canonical("party_name")) {
    const v = resolved.find((m) => m.canonicalName === "vendor_name");
    if (v) { v.dropped = true; v.dropReason = "redundant: party_name is more generic"; }
  }

  // R3: customer_name + party_name → drop customer_name
  if (canonical("customer_name") && canonical("party_name")) {
    const c = resolved.find((m) => m.canonicalName === "customer_name");
    if (c) { c.dropped = true; c.dropReason = "redundant: party_name is more generic"; }
  }

  // R4: opening_balance in a transaction file
  if (fileType === "transaction") {
    const ob = resolved.find((m) => m.canonicalName === "opening_balance");
    if (ob) { ob.dropped = true; ob.dropReason = "opening_balance not expected in transaction file"; }
  }

  // R5: duplicate semantic type → keep first, drop rest
  const seenCanonical = new Map<string, boolean>();
  for (const m of resolved) {
    if (!m.canonicalName || m.dropped) continue;
    if (seenCanonical.has(m.canonicalName)) {
      m.dropped = true;
      m.dropReason = `duplicate: another column already mapped to ${m.canonicalName}`;
    } else {
      seenCanonical.set(m.canonicalName, true);
    }
  }

  return resolved;
}
