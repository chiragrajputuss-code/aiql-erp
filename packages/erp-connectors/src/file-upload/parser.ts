import { parse as csvParseSync } from "csv-parse/sync";
import * as XLSX from "xlsx";

// ─── Result type ──────────────────────────────────────────────────────────────

export interface ParsedFile {
  headers:           string[];
  rows:              Record<string, unknown>[];
  rowCount:          number;
  sheetName?:        string;
  detectedDelimiter?: string;
}

// ─── Indian number format ─────────────────────────────────────────────────────

/** Parse Indian lakh-crore formatted numbers: "1,23,456.78" or "₹5,00,000" */
function parseIndianNumber(value: string): number | null {
  const cleaned = value.replace(/[₹$€£\s]/g, "").replace(/,/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** Convert Excel serial date to JS Date (Indian format awareness) */
function xlsxCellToValue(cell: XLSX.CellObject | undefined): unknown {
  if (!cell) return "";
  if (cell.t === "d" && cell.v instanceof Date) return cell.v;
  if (cell.t === "n" && cell.w) return cell.w; // use formatted string
  return cell.v ?? "";
}

// ─── Excel parser ─────────────────────────────────────────────────────────────

export function parseExcel(buffer: Buffer, sheetIndex = 0): ParsedFile {
  const workbook = XLSX.read(buffer, {
    type:      "buffer",
    cellDates: true,    // convert serial dates to Date objects
    cellNF:    true,    // preserve number formats
    cellText:  true,    // preserve formatted text (for Indian number formats)
    raw:       false,   // use formatted output
  });

  const sheetName = workbook.SheetNames[sheetIndex] ?? workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel file has no sheets");

  const worksheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");

  // Extract headers from row 0
  const headers: string[] = [];
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: col })];
    headers.push(String(xlsxCellToValue(cell) ?? `Column${col + 1}`).trim());
  }

  // Extract data rows
  const rows: Record<string, unknown>[] = [];
  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const rowData: Record<string, unknown> = {};
    let hasData = false;
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
      const val = xlsxCellToValue(cell);
      const header = headers[col - range.s.c] ?? `Column${col + 1}`;
      rowData[header] = val;
      if (val !== "" && val !== null && val !== undefined) hasData = true;
    }
    if (hasData) rows.push(rowData);
  }

  return { headers, rows, rowCount: rows.length, sheetName };
}

// ─── CSV/TSV auto-delimiter detection ────────────────────────────────────────

function detectDelimiter(content: string): string {
  const sample = content.slice(0, 2000);
  const counts: Record<string, number> = {
    ",": (sample.match(/,/g) ?? []).length,
    "\t": (sample.match(/\t/g) ?? []).length,
    ";": (sample.match(/;/g) ?? []).length,
    "|": (sample.match(/\|/g) ?? []).length,
  };
  return Object.entries(counts).sort(([, a], [, b]) => b - a)[0][0];
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

export function parseCsv(buffer: Buffer): ParsedFile {
  const content = buffer.toString("utf-8").replace(/^\uFEFF/, ""); // strip BOM
  const delimiter = detectDelimiter(content);

  const records = csvParseSync(content, {
    columns:          true,
    skip_empty_lines: true,
    trim:             true,
    delimiter,
    relax_column_count: true,
  }) as Record<string, string>[];

  if (records.length === 0) return { headers: [], rows: [], rowCount: 0, detectedDelimiter: delimiter };

  const headers = Object.keys(records[0]);

  // Normalise values: parse Indian numbers, keep dates as strings
  const rows: Record<string, unknown>[] = records.map((record) => {
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) {
      row[k] = v; // keep as string — column-mapper handles type inference
    }
    return row;
  });

  return { headers, rows, rowCount: rows.length, detectedDelimiter: delimiter };
}
