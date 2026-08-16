/**
 * Audit-deliverable PDF — the "Financial Health Check" one-pager a CA sends to
 * their client after AcctQAI runs an investigation on their books.
 *
 * This is a *sales asset*, so it is deliberately clean and forward-able:
 *   - the ₹ found is the hero,
 *   - each finding shows Why + Do-this + evidence count,
 *   - an honest disclaimer (findings are computed; verify before acting).
 *
 * Stream-based (pdfkit) → collect chunks → Buffer, mirroring scan-export.ts.
 *
 * NOTE: pdfkit's built-in Helvetica cannot render the ₹ glyph (not in WinAnsi),
 * so we use "Rs " — guaranteed clean in every viewer. Never ship a tofu box on
 * a customer-facing document.
 */

import PDFDocument from "pdfkit";

const COLORS = {
  brand:    "#1B3A5C",
  critical: "#DC2626",
  warning:  "#D97706",
  opp:      "#059669",
  info:     "#0284C7",
  slate900: "#0F172A",
  slate600: "#475569",
  slate400: "#94A3B8",
  slate200: "#E2E8F0",
  slate100: "#F1F5F9",
};

type Sev = "critical" | "warning" | "opportunity" | "info" | string;

const SEV_STYLE: Record<string, { color: string; label: string }> = {
  critical:    { color: COLORS.critical, label: "CRITICAL" },
  warning:     { color: COLORS.warning,  label: "NEEDS ATTENTION" },
  opportunity: { color: COLORS.opp,      label: "OPPORTUNITY" },
  info:        { color: COLORS.info,     label: "FOR INFO" },
};

export interface AuditFindingInput {
  code:         string;
  severity:     Sev;
  category?:    string;
  title:        string;
  impactRs:     number | null;
  conclusion?:  string;   // the "Why"
  action?:      string;   // recommendation → the "Do this"
  evidenceRows?: number;  // count of materialized proof rows
  verifyFirst?: string;   // first verification step
}

export interface AuditReportInput {
  preparedFor?:       string;  // client business name (optional)
  periodLabel:        string;  // "May 2026"
  healthScore:        number;
  totalAtRiskRs:      number;
  totalOpportunityRs: number;
  summary:            string;  // board brief narratedSummary
  findings:           AuditFindingInput[];
  generatedOn:        string;  // passed in — caller stamps the date
}

function rs(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  if (n === 0) return "Rs 0";
  return "Rs " + Math.round(n).toLocaleString("en-IN");
}

function sevStyle(s: Sev) {
  return SEV_STYLE[s] ?? SEV_STYLE.info;
}

const PAGE = { w: 595.28, h: 841.89 };          // A4 points
const M = 50;                                    // margin
const CONTENT_W = PAGE.w - M * 2;

export function buildAuditPdf(input: AuditReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // bufferPages:true is REQUIRED for switchToPage() (the footer pass) to
    // target existing pages instead of appending phantom ones.
    const doc = new PDFDocument({ size: "A4", margins: { top: M, bottom: M, left: M, right: M }, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const totalFound = (input.totalAtRiskRs || 0) + (input.totalOpportunityRs || 0);

    // ── Brand header ─────────────────────────────────────────────────────────
    doc.rect(0, 0, PAGE.w, 8).fill(COLORS.brand);
    doc.fillColor(COLORS.brand).font("Helvetica-Bold").fontSize(20).text("AcctQAI", M, 34);
    doc.fillColor(COLORS.slate400).font("Helvetica").fontSize(9)
       .text("Financial Health Check", M, 58);
    doc.fillColor(COLORS.slate400).font("Helvetica").fontSize(9)
       .text(input.generatedOn, M, 34, { width: CONTENT_W, align: "right" });

    // ── Title block ──────────────────────────────────────────────────────────
    doc.moveTo(M, 78).lineTo(PAGE.w - M, 78).lineWidth(1).stroke(COLORS.slate200);
    doc.fillColor(COLORS.slate900).font("Helvetica-Bold").fontSize(17)
       .text(`Financial Health Check — ${input.periodLabel}`, M, 92);
    if (input.preparedFor) {
      doc.fillColor(COLORS.slate600).font("Helvetica").fontSize(11)
         .text(`Prepared for: ${input.preparedFor}`, M, 116);
    }

    // ── Hero KPI band ────────────────────────────────────────────────────────
    const bandY = input.preparedFor ? 140 : 124;
    doc.roundedRect(M, bandY, CONTENT_W, 74, 8).fill(COLORS.slate100);
    // Big number
    doc.fillColor(COLORS.brand).font("Helvetica-Bold").fontSize(26)
       .text(rs(totalFound), M + 20, bandY + 14);
    doc.fillColor(COLORS.slate600).font("Helvetica").fontSize(10)
       .text("identified this month", M + 20, bandY + 46);
    // Right sub-metrics
    const rightX = M + CONTENT_W - 230;
    doc.fillColor(COLORS.slate900).font("Helvetica-Bold").fontSize(12)
       .text(`${input.findings.length}`, rightX, bandY + 16, { width: 70, align: "center" });
    doc.fillColor(COLORS.slate400).font("Helvetica").fontSize(8)
       .text("FINDINGS", rightX, bandY + 34, { width: 70, align: "center" });
    doc.fillColor(COLORS.warning).font("Helvetica-Bold").fontSize(12)
       .text(rs(input.totalAtRiskRs), rightX + 78, bandY + 16, { width: 150, align: "center" });
    doc.fillColor(COLORS.slate400).font("Helvetica").fontSize(8)
       .text("AT RISK", rightX + 78, bandY + 34, { width: 150, align: "center" });

    // ── Summary line ─────────────────────────────────────────────────────────
    let y = bandY + 90;
    doc.fillColor(COLORS.slate600).font("Helvetica").fontSize(10);
    const sumH = doc.heightOfString(input.summary, { width: CONTENT_W });
    doc.text(input.summary, M, y, { width: CONTENT_W });
    y += sumH + 16;

    // ── Findings heading ─────────────────────────────────────────────────────
    doc.fillColor(COLORS.slate400).font("Helvetica-Bold").fontSize(9)
       .text("FINDINGS  ·  WORST FIRST", M, y);
    y += 18;

    // ── Finding cards ────────────────────────────────────────────────────────
    const bottomLimit = PAGE.h - 70; // leave room for footer

    for (const f of input.findings) {
      const st = sevStyle(f.severity);
      const why = f.conclusion ?? "";
      const doThis = f.action ?? "";

      // measure block height
      doc.font("Helvetica-Bold").fontSize(11);
      const titleH = doc.heightOfString(f.title, { width: CONTENT_W - 130 });
      doc.font("Helvetica").fontSize(9);
      const whyH = why ? doc.heightOfString(`Why: ${why}`, { width: CONTENT_W - 24 }) : 0;
      const doH  = doThis ? doc.heightOfString(`Do this: ${doThis}`, { width: CONTENT_W - 24 }) : 0;
      const blockH = 26 + titleH + whyH + doH + 22;

      if (y + blockH > bottomLimit) {
        doc.addPage();
        y = M;
      }

      // left severity bar
      doc.roundedRect(M, y, CONTENT_W, blockH, 6).fill("#FFFFFF").stroke(COLORS.slate200);
      doc.rect(M, y, 4, blockH).fill(st.color);

      const innerX = M + 16;
      const innerW = CONTENT_W - 28;

      // chip + amount row
      doc.fillColor(st.color).font("Helvetica-Bold").fontSize(8)
         .text(st.label, innerX, y + 10);
      doc.fillColor(st.color).font("Helvetica-Bold").fontSize(13)
         .text(f.impactRs && f.impactRs > 0 ? rs(f.impactRs) : "", innerX, y + 8, { width: innerW, align: "right" });

      // title
      let iy = y + 22;
      doc.fillColor(COLORS.slate900).font("Helvetica-Bold").fontSize(11)
         .text(f.title, innerX, iy, { width: innerW - 110 });
      iy += titleH + 4;

      // why
      if (why) {
        doc.fillColor(COLORS.slate600).font("Helvetica").fontSize(9);
        doc.font("Helvetica-Bold").text("Why: ", innerX, iy, { continued: true })
           .font("Helvetica").text(why, { width: innerW });
        iy += whyH + 2;
      }
      // do this
      if (doThis) {
        doc.fillColor(COLORS.slate900).font("Helvetica").fontSize(9);
        doc.font("Helvetica-Bold").text("Do this: ", innerX, iy, { continued: true })
           .font("Helvetica").text(doThis, { width: innerW });
        iy += doH + 2;
      }
      // evidence line
      const ev = f.evidenceRows ? `${f.evidenceRows} supporting record${f.evidenceRows === 1 ? "" : "s"} attached` : "Evidence attached";
      doc.fillColor(COLORS.slate400).font("Helvetica").fontSize(7.5)
         .text(`${f.code}  ·  ${ev}`, innerX, y + blockH - 14);

      y += blockH + 10;
    }

    // ── Footer on every page ─────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      // Footer sits below the normal bottom margin; zero the margin so pdfkit
      // does not auto-append a blank page when we write there.
      doc.page.margins.bottom = 0;
      const fy = PAGE.h - 48;
      doc.moveTo(M, fy).lineTo(PAGE.w - M, fy).lineWidth(0.5).stroke(COLORS.slate200);
      doc.fillColor(COLORS.slate400).font("Helvetica").fontSize(7.5)
         .text(
           "Findings are computed automatically from the books provided and are read-only — AcctQAI never modifies your records. " +
           "Verify each finding against source documents before acting.",
           M, fy + 8, { width: CONTENT_W - 60 },
         );
      doc.fillColor(COLORS.slate400).font("Helvetica").fontSize(8)
         .text(`Page ${i + 1} of ${range.count}`, PAGE.w - M - 60, fy + 8, { width: 60, align: "right" });
    }

    doc.end();
  });
}
