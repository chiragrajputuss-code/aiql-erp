import type { ExtractedPeriod } from "./types";

// ─── Indian fiscal year helpers ───────────────────────────────────────────────

// FY25 = Apr 2024 – Mar 2025 → { start: 2024-04-01, end: 2025-03-31 }
function fyToRange(fy: number): { start: Date; end: Date } {
  return {
    start: new Date(fy - 1, 3, 1),       // April 1 of prior calendar year
    end:   new Date(fy, 2, 31),           // March 31 of the FY year
  };
}

// Quarter within Indian FY (Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar)
function fyQuarterToRange(fy: number, q: number): { start: Date; end: Date } {
  const months: [number, number][] = [
    [3, 5],   // Q1: Apr–Jun   (month indices 0-based: 3,4,5 → end day 30)
    [6, 8],   // Q2: Jul–Sep
    [9, 11],  // Q3: Oct–Dec
    [0, 2],   // Q4: Jan–Mar  (next calendar year)
  ];
  const [startM, endM] = months[q - 1] ?? [3, 5];
  const calYear = q === 4 ? fy : fy - 1;
  const endDate = new Date(calYear, endM + 1, 0); // Last day of end month
  return {
    start: new Date(calYear, startM, 1),
    end:   endDate,
  };
}

// ─── Filename patterns ────────────────────────────────────────────────────────

interface FilenameMatch {
  start: Date;
  end:   Date;
  hint:  string;
}

const FY_PATTERNS: Array<{ re: RegExp; extract: (m: RegExpMatchArray) => FilenameMatch | null }> = [
  // "FY25", "FY2025", "FY 25", "FY-25"
  {
    re: /FY[\s\-_]?(\d{2,4})/i,
    extract: (m) => {
      const raw = parseInt(m[1], 10);
      const fy  = raw < 100 ? 2000 + raw : raw;
      const r   = fyToRange(fy);
      return { ...r, hint: m[0] };
    },
  },
  // "Apr-Mar 2024-25", "Apr 24 - Mar 25"
  {
    re: /Apr[\s\-_]*(?:\d{2,4}[\s\-_]*)?Mar[\s\-_]*(\d{2,4})/i,
    extract: (m) => {
      const raw = parseInt(m[1], 10);
      const fy  = raw < 100 ? 2000 + raw : raw;
      const r   = fyToRange(fy);
      return { ...r, hint: m[0] };
    },
  },
  // "Q1FY25", "Q2 FY25", "Q3-FY2025"
  {
    re: /Q([1-4])[\s\-_]?FY[\s\-_]?(\d{2,4})/i,
    extract: (m) => {
      const q   = parseInt(m[1], 10);
      const raw = parseInt(m[2], 10);
      const fy  = raw < 100 ? 2000 + raw : raw;
      const r   = fyQuarterToRange(fy, q);
      return { ...r, hint: m[0] };
    },
  },
  // "2024-25" or "2024-2025"
  {
    re: /(\d{4})[\-_](\d{2,4})/,
    extract: (m) => {
      const startY = parseInt(m[1], 10);
      const raw2   = parseInt(m[2], 10);
      const endY   = raw2 < 100 ? 2000 + raw2 : raw2;
      if (endY !== startY + 1) return null;
      return {
        start: new Date(startY, 3, 1),
        end:   new Date(endY, 2, 31),
        hint:  m[0],
      };
    },
  },
];

function fromFilename(filename: string): FilenameMatch | null {
  for (const { re, extract } of FY_PATTERNS) {
    const m = filename.match(re);
    if (m) {
      const result = extract(m);
      if (result) return result;
    }
  }
  return null;
}

// ─── Date column scanning ─────────────────────────────────────────────────────

const DATE_COL_PATTERNS = [
  "transaction_date", "date", "posting_date", "journal_date",
  "invoice_date", "challan_date", "payment_date", "voucher_date",
];

function colMatchesDatePattern(col: string): boolean {
  const norm = col.toLowerCase().replace(/[\s_\-]/g, "");
  return DATE_COL_PATTERNS.some((p) => norm.includes(p.replace(/_/g, "")));
}

// Summarise min/max from a sample of date string values
function minMaxFromSample(values: string[]): { min: Date; max: Date } | null {
  const dates: Date[] = [];
  for (const v of values) {
    if (!v) continue;
    const d = new Date(v);
    if (!isNaN(d.getTime())) dates.push(d);
  }
  if (dates.length === 0) return null;
  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  return { min, max };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface PeriodExtractionInput {
  filename:   string;
  columns:    string[];
  // Optional: sample of date column values for scanning (up to 500 rows)
  dateSample?: Record<string, string[]>;
}

export function extractPeriod(input: PeriodExtractionInput): ExtractedPeriod {
  const { filename, columns, dateSample } = input;

  // Priority 1: Filename (most explicit)
  const fromFile = fromFilename(filename);
  if (fromFile) {
    return {
      periodStart: fromFile.start,
      periodEnd:   fromFile.end,
      source:      "filename",
      confidence:  0.9,
      rawHint:     fromFile.hint,
    };
  }

  // Priority 2: Date column min/max scan
  if (dateSample) {
    const dateCols = columns.filter(colMatchesDatePattern);
    for (const col of dateCols) {
      const vals  = dateSample[col] ?? [];
      const range = minMaxFromSample(vals);
      if (range) {
        return {
          periodStart: range.min,
          periodEnd:   range.max,
          source:      "date_column",
          confidence:  0.75,
          rawHint:     `min/max of ${col}`,
        };
      }
    }
  }

  // No period found
  return {
    periodStart: null,
    periodEnd:   null,
    source:      "user",
    confidence:  0,
    rawHint:     null,
  };
}
