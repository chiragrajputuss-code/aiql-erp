// ─── Supplier filing behaviour ───────────────────────────────────────────────
//
// GSTR-2B carries, on every record, the date the supplier actually filed the
// GSTR-1 that contained it (`supfildt`) and the period they filed it in
// (`supprd`). Almost every reconciliation tool ignores these fields and asks
// only one question: "does this invoice match, this period?"
//
// That produces a specific and expensive false positive. A vendor who files on
// the 17th every month is NOT a defaulter — their invoice simply lands in the
// NEXT GSTR-2B. Flagging them as "hasn't filed, ITC at risk" trains the user to
// ignore the alert, and worse, may lead to rejecting the record in IMS, which
// costs the credit AND starts a supplier dispute.
//
// This module turns the filing dates into a per-supplier verdict so the
// consuming investigation can say "expect this next period, do not reject"
// instead of "at risk".
//
// Pure: no DB, no network, no dates from the system clock.

import type { Gstr2BRow } from "../types";

/** GSTR-1 monthly due date. Filing after this lands the invoice in a later 2B. */
export const GSTR1_DUE_DAY = 11;

export type FilingPattern =
  | "on_time"        // consistently files by the 11th
  | "habitual_late"  // consistently files after the 11th — invoices still arrive, just late
  | "erratic"        // sometimes on time, sometimes not
  | "unknown";       // not enough dated records to judge

export interface SupplierFilingProfile {
  supplierGstin: string | null;
  supplierName:  string | null;
  /** Records that carried a usable filing date. */
  observations:  number;
  /** How many of those were filed after the 11th. */
  lateCount:     number;
  /** Latest day-of-month the supplier was seen filing on. */
  latestFilingDay: number | null;
  pattern:       FilingPattern;
  /**
   * Plain-English line safe to put in front of a professional. Deterministic —
   * no LLM, no adjectives that imply intent.
   */
  summary:       string;
}

function isLate(d: Date): boolean {
  return d.getDate() > GSTR1_DUE_DAY;
}

/**
 * Build per-supplier filing profiles from one or more periods of GSTR-2B rows.
 *
 * Works on a SINGLE customer's own 2B files — no cross-customer pooling, no
 * consent problem, no cold start. Accuracy improves as more months are added.
 */
export function buildFilingProfiles(rows: Gstr2BRow[]): Map<string, SupplierFilingProfile> {
  const byKey = new Map<string, Gstr2BRow[]>();

  for (const r of rows) {
    // GSTIN is the reliable identity; fall back to name when absent.
    const key = (r.supplierGstin || r.supplierName || "").trim().toUpperCase();
    if (!key) continue;
    const list = byKey.get(key);
    if (list) list.push(r);
    else byKey.set(key, [r]);
  }

  const out = new Map<string, SupplierFilingProfile>();

  for (const [key, group] of byKey) {
    const dated = group.filter((r) => r.supplierFiledDate instanceof Date);
    const observations = dated.length;
    const lateCount = dated.filter((r) => isLate(r.supplierFiledDate as Date)).length;

    const latestFilingDay = observations === 0
      ? null
      : Math.max(...dated.map((r) => (r.supplierFiledDate as Date).getDate()));

    let pattern: FilingPattern;
    if (observations < 2) {
      pattern = "unknown";
    } else if (lateCount === 0) {
      pattern = "on_time";
    } else if (lateCount === observations) {
      pattern = "habitual_late";
    } else if (lateCount / observations >= 0.6) {
      pattern = "habitual_late";
    } else {
      pattern = "erratic";
    }

    const name = group[0].supplierName || group[0].supplierGstin || key;

    let summary: string;
    switch (pattern) {
      case "habitual_late":
        summary = `${name} filed GSTR-1 after the ${GSTR1_DUE_DAY}th in ${lateCount} of the last ${observations} periods observed`
          + (latestFilingDay ? ` (latest seen: day ${latestFilingDay})` : "")
          + ". Invoices from this supplier typically appear in a later GSTR-2B rather than being absent.";
        break;
      case "erratic":
        summary = `${name} filed GSTR-1 late in ${lateCount} of ${observations} periods observed. Filing timing is inconsistent.`;
        break;
      case "on_time":
        summary = `${name} filed GSTR-1 on or before the ${GSTR1_DUE_DAY}th in all ${observations} periods observed.`;
        break;
      default:
        summary = `Not enough dated GSTR-2B records for ${name} to establish a filing pattern (${observations} observed).`;
    }

    out.set(key, {
      supplierGstin: group[0].supplierGstin,
      supplierName:  group[0].supplierName,
      observations,
      lateCount,
      latestFilingDay,
      pattern,
      summary,
    });
  }

  return out;
}

/** Look up a profile by GSTIN or name, matching buildFilingProfiles' keying. */
export function lookupProfile(
  profiles: Map<string, SupplierFilingProfile>,
  gstin: string | null | undefined,
  name: string | null | undefined,
): SupplierFilingProfile | null {
  const key = (gstin || name || "").trim().toUpperCase();
  if (!key) return null;
  return profiles.get(key) ?? null;
}

/**
 * Should a "missing from GSTR-2B" finding be softened from "ITC at risk" to
 * "expected next period"? True when the supplier demonstrably files late.
 */
export function isLikelyLateNotMissing(profile: SupplierFilingProfile | null): boolean {
  return profile !== null && profile.pattern === "habitual_late" && profile.observations >= 2;
}
