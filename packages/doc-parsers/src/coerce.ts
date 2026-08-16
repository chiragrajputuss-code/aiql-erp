// ─── Robust value coercion for real-world Indian accounting exports ──────────
//
// Tally, Busy and the GSTN portal produce messy values that naive
// `Number(...)` / `new Date(...)` mis-handle — often SILENTLY and WRONGLY:
//   - "₹1,05,020.00"   → NaN            (currency symbol / Indian grouping)
//   - "1,05,020 Dr"    → NaN            (Tally Dr/Cr suffix)
//   - "(5,000)"        → NaN            (accounting negative)
//   - "07/05/2026"     → US 5 Jul       (day-first read as month-first)
//   - "1-Apr-2026"     → wrong / a day off (Tally's default date format + TZ)
//
// These helpers parse the way an Indian accountant means them. Used by every
// parser so the whole pipeline shares one correct interpretation.

/** Parse a rupee amount from any real-world export string. Returns 0 if unusable. */
export function parseNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;

  // Accounting negative: (5,000) → -5000
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  // A leading minus also means negative.
  if (/^-/.test(s.replace(/[₹rs.\s]/gi, ""))) neg = true;

  // Strip everything that isn't a digit or decimal point. This removes ₹, "Rs",
  // commas (Indian grouping), spaces, NBSP, and Dr/Cr suffixes in one pass.
  s = s.replace(/[^0-9.]/g, "");
  if (s === "" || s === ".") return 0;
  // Guard against multiple dots (e.g. "1.05.020") → treat as unusable.
  if ((s.match(/\./g) || []).length > 1) return 0;

  const n = Number(s);
  if (isNaN(n)) return 0;
  return neg ? -Math.abs(n) : n;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Build a date-only value at local midnight (no timezone shift). */
function ymd(y: number, mZero: number, d: number): Date | null {
  if (mZero < 0 || mZero > 11 || d < 1 || d > 31 || y < 1900 || y > 3000) return null;
  const dt = new Date(y, mZero, d);
  // Reject rollovers like 31 Feb → 3 Mar.
  if (dt.getFullYear() !== y || dt.getMonth() !== mZero || dt.getDate() !== d) return null;
  return dt;
}

/**
 * Parse a date the way Indian exports write them — DAY-FIRST, and including
 * Tally's "d-Mon-yyyy" format. Never falls back to `new Date(string)`, whose
 * locale/timezone behaviour is the source of the silent bugs above.
 */
export function parseIndianDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  if (!s) return null;

  // ISO: yyyy-mm-dd (what our own canonical DB storage produces)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]|$)/);
  if (m) return ymd(+m[1], +m[2] - 1, +m[3]);

  // Tally alphabetic: d-Mon-yyyy / d Mon yy / d/Mon/yyyy
  m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{2,4})$/);
  if (m) {
    const mm = MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (mm === undefined) return null;
    let y = +m[3];
    if (y < 100) y += 2000;
    return ymd(y, mm, +m[1]);
  }

  // Numeric day-first: dd/mm/yyyy or dd-mm-yyyy (Indian convention)
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return ymd(y, +m[2] - 1, +m[1]);
  }

  return null;
}
