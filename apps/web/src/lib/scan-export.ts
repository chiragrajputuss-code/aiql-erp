/**
 * Scan-finding exporters. Two formats:
 *   - CSV  — client renders this directly from React state (no server call needed).
 *   - PDF  — server endpoint generates a formatted A4 report via pdfkit.
 *
 * The shape is intentionally tied to the ScanResult type so we can extend
 * both formats together if we add new fields.
 */

import PDFDocument from "pdfkit";
import type { ScanResult, Issue } from "@aiql/close-engine";

// ─── CSV ──────────────────────────────────────────────────────────────────────

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Wrap in quotes if it contains delimiter, quote, newline, or leading/trailing space
  if (/[",\n\r]/.test(s) || /^\s|\s$/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a CSV string from a ScanResult. Each issue becomes one row.
 * Columns: severity, code, category, title, affected_rows, exposure_inr, description.
 */
export function scanResultToCsv(scan: ScanResult, connectionName: string): string {
  const headers = [
    "severity", "code", "category", "title",
    "affected_rows", "exposure_inr", "description",
  ];

  const rows: string[][] = scan.issues.map((i) => [
    i.severity,
    i.code,
    i.category,
    i.title,
    String(i.affectedRows),
    String(i.exposure ?? 0),
    i.description,
  ]);

  const lines = [
    `# AIQL Scan Report — ${connectionName}`,
    `# Period: ${scan.startDate.toISOString().slice(0,10)} to ${scan.endDate.toISOString().slice(0,10)}`,
    `# Scanned at: ${scan.scannedAt.toISOString()}`,
    `# Total issues: ${scan.totalIssues} · Total exposure: ₹${Math.round(scan.totalExposure).toLocaleString("en-IN")}`,
    "",
    headers.join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
  ];
  return lines.join("\n");
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

const COLORS = {
  brand:    "#1B3A5C",
  critical: "#DC2626",
  review:   "#D97706",
  info:     "#0284C7",
  slate900: "#0F172A",
  slate600: "#475569",
  slate400: "#94A3B8",
  slate100: "#F1F5F9",
};

function formatRupees(n: number): string {
  if (!isFinite(n) || n === 0) return "₹0";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

/**
 * Generate a polished A4 PDF of the scan findings. Returns a Promise<Buffer>
 * (pdfkit is stream-based, we collect chunks and concat at the end).
 */
export function scanResultToPdf(scan: ScanResult, connectionName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 50, left: 50, right: 50 } });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: Error) => reject(err));

    // ── Header ───────────────────────────────────────────────────────────────
    doc.fillColor(COLORS.brand)
       .fontSize(22).font("Helvetica-Bold")
       .text("AIQL Scan Report", { align: "left" });

    doc.moveDown(0.3);
    doc.fillColor(COLORS.slate600).fontSize(11).font("Helvetica")
       .text(connectionName);
    doc.fillColor(COLORS.slate400).fontSize(9)
       .text(`Period: ${scan.startDate.toISOString().slice(0,10)} to ${scan.endDate.toISOString().slice(0,10)}`)
       .text(`Generated: ${scan.scannedAt.toISOString().slice(0,19).replace("T", " ")} UTC`);

    doc.moveDown(1);

    // ── Summary box ──────────────────────────────────────────────────────────
    const boxY = doc.y;
    doc.rect(50, boxY, 495, 60).fillColor(COLORS.slate100).fill();

    const colWidth = 165;
    doc.fillColor(COLORS.slate600).fontSize(9).font("Helvetica")
       .text("TOTAL ISSUES",   60, boxY + 10, { width: colWidth, characterSpacing: 1 });
    doc.fillColor(COLORS.slate900).fontSize(20).font("Helvetica-Bold")
       .text(String(scan.totalIssues), 60, boxY + 25, { width: colWidth });

    doc.fillColor(COLORS.slate600).fontSize(9).font("Helvetica")
       .text("EXPOSURE FLAGGED", 60 + colWidth, boxY + 10, { width: colWidth, characterSpacing: 1 });
    doc.fillColor(COLORS.slate900).fontSize(20).font("Helvetica-Bold")
       .text(formatRupees(scan.totalExposure), 60 + colWidth, boxY + 25, { width: colWidth });

    doc.fillColor(COLORS.slate600).fontSize(9).font("Helvetica")
       .text("CRITICAL / REVIEW / INFO", 60 + colWidth * 2, boxY + 10, { width: colWidth, characterSpacing: 1 });
    doc.fillColor(COLORS.slate900).fontSize(20).font("Helvetica-Bold")
       .text(`${scan.bySeverity.critical} / ${scan.bySeverity.review} / ${scan.bySeverity.info}`,
             60 + colWidth * 2, boxY + 25, { width: colWidth });

    doc.y = boxY + 75;

    // ── Issues list ──────────────────────────────────────────────────────────
    doc.fillColor(COLORS.slate900).fontSize(13).font("Helvetica-Bold")
       .text("Findings", { underline: false });

    if (scan.issues.length === 0) {
      doc.moveDown(0.5);
      doc.fillColor(COLORS.slate600).fontSize(11).font("Helvetica")
         .text("No issues found in this scan.");
    } else {
      for (const issue of scan.issues) {
        renderIssue(doc, issue);
      }
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.moveDown(2);
    doc.fillColor(COLORS.slate400).fontSize(8).font("Helvetica-Oblique")
       .text("This report was generated automatically by AIQL ERP. Each finding is a signal to review — not a confirmed error. Verify against source documents before taking action.",
             { align: "center", width: 495 });

    doc.end();
  });
}

function renderIssue(doc: PDFKit.PDFDocument, issue: Issue): void {
  if (doc.y > 720) doc.addPage();

  const severityColor = issue.severity === "critical" ? COLORS.critical
                     : issue.severity === "review"   ? COLORS.review
                     : COLORS.info;

  doc.moveDown(0.6);

  // Severity tag + title row
  const titleY = doc.y;
  doc.rect(50, titleY + 2, 4, 14).fillColor(severityColor).fill();

  doc.fillColor(severityColor).fontSize(8).font("Helvetica-Bold")
     .text(issue.severity.toUpperCase(), 60, titleY + 4, { width: 60, characterSpacing: 0.5 });

  doc.fillColor(COLORS.slate900).fontSize(11).font("Helvetica-Bold")
     .text(issue.title, 120, titleY, { width: 425 });

  // Description
  doc.fillColor(COLORS.slate600).fontSize(9).font("Helvetica")
     .text(issue.description, 120, doc.y + 2, { width: 425, lineGap: 1 });

  // Footer metadata row
  doc.fillColor(COLORS.slate400).fontSize(8).font("Helvetica")
     .text(
       `${issue.affectedRows} affected · ${issue.exposure ? formatRupees(issue.exposure) + " exposure · " : ""}category: ${issue.category} · code: ${issue.code}`,
       120, doc.y + 3, { width: 425 },
     );

  doc.moveDown(0.3);

  // Examples (top 3, if present)
  if (issue.examples && issue.examples.length > 0) {
    const examplesText = issue.examples.slice(0, 3)
      .map((ex) => formatExample(ex))
      .filter(Boolean)
      .join("  |  ");
    if (examplesText) {
      doc.fillColor(COLORS.slate600).fontSize(8).font("Helvetica")
         .text(`Examples: ${examplesText}`, 120, doc.y, { width: 425 });
    }
  }
}

function formatExample(ex: Record<string, unknown>): string {
  // Pick the most useful keys to display
  const keys = ["reference_number", "party", "party_name", "vendor_name",
                "account_name", "amount", "exposure", "transaction_date", "dt"];
  const parts: string[] = [];
  for (const k of keys) {
    if (ex[k] !== undefined && ex[k] !== null && ex[k] !== "") {
      let v = ex[k];
      if (v instanceof Date) v = v.toISOString().slice(0, 10);
      else if (typeof v === "number") v = formatRupees(v);
      parts.push(String(v));
      if (parts.length >= 3) break;
    }
  }
  return parts.join(" / ");
}
