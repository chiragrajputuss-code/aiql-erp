import type { PulseAlertPayload, WorkspaceContext } from "./types";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function daysBefore(target: Date, today: Date): number {
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function daysAfter(target: Date, today: Date): number {
  return Math.floor((today.getTime() - target.getTime()) / 86400000);
}

function isInAlertWindow(dueDate: Date, today: Date, leadDays: number, graceDays: number): boolean {
  const db = daysBefore(dueDate, today);
  const da = daysAfter(dueDate, today);
  return db <= leadDays && da <= graceDays;
}

function fmt(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Advance tax due dates (Indian) ──────────────────────────────────────────

interface AdvanceTaxInstalment {
  month:      number; // 0-indexed
  day:        number;
  pct:        number; // cumulative %
}

const ADVANCE_TAX_INSTALMENTS: AdvanceTaxInstalment[] = [
  { month: 5,  day: 15, pct: 15  }, // 15 Jun
  { month: 8,  day: 15, pct: 45  }, // 15 Sep
  { month: 11, day: 15, pct: 75  }, // 15 Dec
  { month: 2,  day: 15, pct: 100 }, // 15 Mar
];

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateComplianceAlerts(
  today:     Date,
  ctx:       WorkspaceContext,
): PulseAlertPayload[] {
  const alerts: PulseAlertPayload[] = [];

  // Historical workspaces don't need compliance deadline alerts
  if (ctx.dataIntent === "HISTORICAL") return alerts;

  // If GL data is > 90 days stale, compliance deadlines are likely not relevant
  if (ctx.glMaxDate) {
    const daysStale = daysAfter(new Date(ctx.glMaxDate), today);
    if (daysStale > 90) return alerts;
  }

  const snoozed = new Set(ctx.snoozedCategories);
  const year    = today.getFullYear();
  const month   = today.getMonth(); // 0-indexed

  // ── TDS deposit: due 7th of following month ───────────────────────────────
  if (!snoozed.has("tds_deadline")) {
    // TDS on payments made last month is due by 7th of this month
    const tdueDue = new Date(year, month, 7);
    if (isInAlertWindow(tdueDue, today, 6, 2)) {
      const overdue = daysBefore(tdueDue, today) < 0;
      alerts.push({
        category:  "tds_deadline",
        severity:  overdue ? "critical" : "review",
        title:     overdue
          ? `TDS deposit overdue (was due ${fmt(tdueDue)})`
          : `TDS deposit due ${fmt(tdueDue)} — ${daysBefore(tdueDue, today)} day${daysBefore(tdueDue, today) !== 1 ? "s" : ""} left`,
        detail:    "TDS deducted during the previous month must be deposited by the 7th.",
        actionUrl: `/connections/${ctx.connectionId}/chat?q=Show+vendor+payments+last+month+with+TDS`,
      });
    }
  }

  // ── GSTR-1: due 10th of following month ───────────────────────────────────
  if (!snoozed.has("gstr1_deadline") && (ctx.documentTypes.includes("GL") || ctx.documentTypes.includes("GSTR_1"))) {
    const gstr1Due = new Date(year, month, 10);
    if (isInAlertWindow(gstr1Due, today, 2, 1)) {
      alerts.push({
        category:  "gstr1_deadline",
        severity:  daysBefore(gstr1Due, today) <= 0 ? "critical" : "review",
        title:     `GSTR-1 filing due ${fmt(gstr1Due)}`,
        detail:    "Monthly outward supply return. Verify invoice details before filing.",
        actionUrl: `/connections/${ctx.connectionId}/chat?q=Show+sales+invoices+last+month+with+GST`,
      });
    }
  }

  // ── GSTR-3B: due 20th of following month ─────────────────────────────────
  if (!snoozed.has("gstr3b_deadline") && (ctx.documentTypes.includes("GL") || ctx.documentTypes.includes("GSTR_3B"))) {
    const gstr3bDue = new Date(year, month, 20);
    if (isInAlertWindow(gstr3bDue, today, 2, 1)) {
      alerts.push({
        category:  "gstr3b_deadline",
        severity:  daysBefore(gstr3bDue, today) <= 0 ? "critical" : "review",
        title:     `GSTR-3B filing due ${fmt(gstr3bDue)}`,
        detail:    "Summary return of outward and inward supplies with tax payment.",
        actionUrl: `/connections/${ctx.connectionId}/chat?q=Show+GST+summary+last+month`,
      });
    }
  }

  // ── Advance tax instalments ────────────────────────────────────────────────
  if (!snoozed.has("advance_tax")) {
    for (const inst of ADVANCE_TAX_INSTALMENTS) {
      // March instalment (month 2) falls in the next calendar year when we're in Apr–Dec
      const instYear = inst.month === 2 && month >= 3 ? year + 1 : year;
      const instDate = new Date(instYear, inst.month, inst.day);

      if (isInAlertWindow(instDate, today, 7, 2)) {
        alerts.push({
          category:  "advance_tax",
          severity:  "review",
          title:     `Advance tax instalment due ${fmt(instDate)} (${inst.pct}% cumulative)`,
          detail:    `Pay ${inst.pct}% of estimated annual tax liability by ${fmt(instDate)}.`,
          actionUrl: `/connections/${ctx.connectionId}/chat?q=Show+estimated+tax+liability+current+year`,
        });
        break; // Only one advance tax alert at a time
      }
    }
  }

  // ── ITR filing ─────────────────────────────────────────────────────────────
  if (!snoozed.has("itr_deadline") && ctx.documentTypes.includes("ITR")) {
    const itrDue = new Date(year, 6, 31); // 31 July (individual, non-audit)
    if (isInAlertWindow(itrDue, today, 14, 3)) {
      alerts.push({
        category:  "itr_deadline",
        severity:  daysBefore(itrDue, today) <= 0 ? "critical" : "review",
        title:     `ITR filing due ${fmt(itrDue)}`,
        detail:    "Individual income tax return deadline. Audit cases have extended deadline of 30 Sep.",
        actionUrl: `/connections/${ctx.connectionId}/chat?q=Show+income+summary+current+year`,
      });
    }
  }

  return alerts;
}
