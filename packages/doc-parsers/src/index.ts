// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  IssueSeverity,
  ScanIssue,
  DocScanResult,
  Form26QRow,
  Gstr1Row,
  Gstr2BRow,
  Gstr3BSummary,
  ItrSummary,
} from "./types";

// ─── TDS / Form 26Q ──────────────────────────────────────────────────────────
export { parseForm26Q, summariseForm26Q }  from "./tds-26q/parser";
export type { Form26QSummary }             from "./tds-26q/parser";
export { scanForm26Q }                     from "./tds-26q/scanner";
export { getSection, isKnownSection, expectedTdsRate, SECTIONS } from "./tds-26q/sections";
export type { TdsSection }                 from "./tds-26q/sections";

// ─── GSTR-1 ──────────────────────────────────────────────────────────────────
export { parseGstr1 }   from "./gstr-1/parser";
export { scanGstr1 }    from "./gstr-1/scanner";

// ─── GSTR-2B ─────────────────────────────────────────────────────────────────
export { parseGstr2B }  from "./gstr-2b/parser";

// ─── GSTR-3B ─────────────────────────────────────────────────────────────────
export { parseGstr3B }  from "./gstr-3b/parser";

// ─── ITR ─────────────────────────────────────────────────────────────────────
export { parseItr }     from "./itr/parser";

// ─── Reconciliation ───────────────────────────────────────────────────────────
export type { ReconSeverity, ReconGap, ReconResult, GlRow } from "./reconciliation/types";
export { reconcileGl26Q }    from "./reconciliation/gl-26q";
export { reconcileGlGstr1 }  from "./reconciliation/gl-gstr1";
export { reconcileGlGstr2B } from "./reconciliation/gl-gstr2b";
