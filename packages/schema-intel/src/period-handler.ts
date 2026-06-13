import type { PeriodConfig } from "./erp-knowledge/types";
import type { DateRange }    from "./types";

// ─── Month name lookup ────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  // Short forms
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, oct: 10, nov: 11, dec: 12,
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

function endOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0); // day 0 = last day of previous month
}

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month - 1, 1);
}

/**
 * Get the fiscal year boundaries.
 * fiscalYearStart "04-01" means April 1 (month=4, day=1).
 * For India: if today is July 2026, FY is 2026-27 (Apr 2026 – Mar 2027).
 */
function getFiscalYear(
  startYear: number,
  fiscalStartMonth: number
): { fyStart: Date; fyEnd: Date } {
  return {
    fyStart: startOfMonth(startYear, fiscalStartMonth),
    fyEnd:   endOfMonth(startYear + 1, fiscalStartMonth - 1 || 12),
  };
}

function currentFiscalYear(config: PeriodConfig, today: Date = new Date()): { fyStart: Date; fyEnd: Date; fyStartYear: number } {
  const month = today.getMonth() + 1;
  const year  = today.getFullYear();
  const fyMonth = parseInt(config.fiscalYearStart.split("-")[0]);

  const fyStartYear = month >= fyMonth ? year : year - 1;
  const { fyStart, fyEnd } = getFiscalYear(fyStartYear, fyMonth);
  return { fyStart, fyEnd, fyStartYear };
}

/** Return the calendar-month start/end for fiscal quarter Q (1-4) starting in fyStartYear */
function fiscalQuarterRange(
  quarter: number,
  fyStartYear: number,
  fyStartMonth: number
): DateRange {
  // Q1 starts at fyStartMonth, each quarter is 3 months
  const startMonthOffset = (quarter - 1) * 3;
  let startMonth = fyStartMonth + startMonthOffset;
  let startYear  = fyStartYear;
  if (startMonth > 12) { startMonth -= 12; startYear++; }

  let endMonth = startMonth + 2;
  let endYear  = startYear;
  if (endMonth > 12) { endMonth -= 12; endYear++; }

  return {
    startDate: startOfMonth(startYear, startMonth),
    endDate:   endOfMonth(endYear, endMonth),
    label:     `Q${quarter} FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`,
  };
}

function currentFiscalQuarter(config: PeriodConfig, today: Date = new Date()): number {
  const { fyStart } = currentFiscalYear(config, today);
  const monthsSinceFyStart =
    (today.getFullYear() - fyStart.getFullYear()) * 12 +
    (today.getMonth() - fyStart.getMonth());
  return Math.floor(monthsSinceFyStart / 3) + 1;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parse a natural-language period expression into a start/end date range.
 *
 * Handles (with Indian fiscal year defaults):
 *  - "March 2026" → single calendar month
 *  - "Q1 2026" → fiscal Q1 of FY starting 2026
 *  - "FY 2025-26" → full fiscal year
 *  - "last month" / "this month"
 *  - "last quarter" / "this quarter"
 *  - "last year" / "this year"
 *  - "YTD" / "year to date"
 */
export function parsePeriod(text: string, config: PeriodConfig, today: Date = new Date()): DateRange {
  const t = text.trim().toLowerCase();
  const fyMonth = parseInt(config.fiscalYearStart.split("-")[0]);

  // ── FY 2025-26 ─────────────────────────────────────────────────────────────
  const fyMatch = t.match(/fy\s*(\d{4})[/-](\d{2,4})/);
  if (fyMatch) {
    const startYear = parseInt(fyMatch[1]);
    const { fyStart, fyEnd } = getFiscalYear(startYear, fyMonth);
    return { startDate: fyStart, endDate: fyEnd, label: `FY ${fyMatch[1]}-${fyMatch[2]}` };
  }

  // ── Q1/Q2/Q3/Q4 YYYY ──────────────────────────────────────────────────────
  const qMatch = t.match(/q([1-4])\s*(\d{4})?/);
  if (qMatch) {
    const quarter    = parseInt(qMatch[1]);
    const { fyStartYear } = qMatch[2]
      ? { fyStartYear: parseInt(qMatch[2]) }
      : currentFiscalYear(config, today);
    return fiscalQuarterRange(quarter, fyStartYear, fyMonth);
  }

  // ── Month YYYY ─────────────────────────────────────────────────────────────
  const monthMatch = t.match(/([a-z]+)\s+(\d{4})/);
  if (monthMatch) {
    const monthNum = MONTH_NAMES[monthMatch[1]];
    if (monthNum) {
      const year = parseInt(monthMatch[2]);
      return {
        startDate: startOfMonth(year, monthNum),
        endDate:   endOfMonth(year, monthNum),
        label:     `${monthMatch[1].charAt(0).toUpperCase()}${monthMatch[1].slice(1)} ${year}`,
      };
    }
  }

  // ── Relative expressions ──────────────────────────────────────────────────
  const { fyStart, fyEnd, fyStartYear } = currentFiscalYear(config, today);

  if (t.includes("ytd") || t.includes("year to date")) {
    return { startDate: fyStart, endDate: today, label: "YTD" };
  }

  if (t === "this year" || t === "current year") {
    return { startDate: fyStart, endDate: fyEnd, label: `FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}` };
  }

  if (t === "last year" || t === "previous year") {
    const { fyStart: ps, fyEnd: pe } = getFiscalYear(fyStartYear - 1, fyMonth);
    return { startDate: ps, endDate: pe, label: `FY ${fyStartYear - 1}-${String(fyStartYear).slice(-2)}` };
  }

  if (t === "this quarter" || t === "current quarter") {
    const q = currentFiscalQuarter(config, today);
    return fiscalQuarterRange(q, fyStartYear, fyMonth);
  }

  if (t === "last quarter" || t === "previous quarter") {
    let q = currentFiscalQuarter(config, today) - 1;
    let y = fyStartYear;
    if (q < 1) { q = 4; y--; }
    return fiscalQuarterRange(q, y, fyMonth);
  }

  if (t === "this month" || t === "current month") {
    const m = today.getMonth() + 1;
    return {
      startDate: startOfMonth(today.getFullYear(), m),
      endDate:   endOfMonth(today.getFullYear(), m),
      label:     "This month",
    };
  }

  if (t === "last month" || t === "previous month") {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const m = d.getMonth() + 1;
    return {
      startDate: startOfMonth(d.getFullYear(), m),
      endDate:   endOfMonth(d.getFullYear(), m),
      label:     "Last month",
    };
  }

  throw new Error(`Cannot parse period: "${text}"`);
}
