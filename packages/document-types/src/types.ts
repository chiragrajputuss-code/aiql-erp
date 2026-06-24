// ─── DocumentType ────────────────────────────────────────────────────────────
// Mirrors the Prisma enum. Kept separate so packages that don't depend on
// @aiql/db can still import the type.

export type DocumentType =
  | "GL"
  | "TDS_RETURN_26Q"
  | "GSTR_1"
  | "GSTR_2B"
  | "GSTR_3B"
  | "ITR"
  | "OTHER";

export type UploadDataIntent = "CURRENT_OPERATIONAL" | "HISTORICAL";

// ─── Detection result ─────────────────────────────────────────────────────────

export interface DetectionCandidate {
  type:               DocumentType;
  confidence:         number;          // 0–1
  matchedColumns:     string[];        // Discriminator columns found in file
  missingRequired:    string[];        // Required columns that were absent
  schemaVersion:      string | null;   // Detected schema version (e.g. "FY24")
}

export interface DetectionResult {
  candidates:   DetectionCandidate[];  // Sorted by confidence desc
  best:         DetectionCandidate;    // Top candidate
  isAmbiguous:  boolean;               // true when 2+ candidates within 0.15 of each other
  sheets:       SheetDetection[];      // Per-sheet results for multi-sheet XLSX
}

export interface SheetDetection {
  sheetName:  string;
  rowCount:   number;
  candidates: DetectionCandidate[];
  best:       DetectionCandidate;
}

// ─── Period extraction result ─────────────────────────────────────────────────

export interface ExtractedPeriod {
  periodStart:   Date | null;
  periodEnd:     Date | null;
  source:        "filename" | "date_column" | "user";
  confidence:    number;               // 0–1
  rawHint:       string | null;        // Original string that was parsed
}

// ─── Type definition ──────────────────────────────────────────────────────────

export interface DocumentTypeDefinition {
  id:           DocumentType;
  displayName:  string;
  description:  string;               // Plain-English shown to users at upload
  icon:         string;               // Emoji for UI use

  detection: {
    // ALL of these must be present for the type to be considered
    requiredColumns:      string[];
    // At least ONE of these must be present (strong discriminators unique to this type)
    discriminatorColumns: string[];
    // If ANY of these are present AND the score is close, reduce confidence
    antiSignalColumns:    string[];
    // Known schema versions with their unique column signatures
    schemaVersions:       Array<{ version: string; uniqueColumns: string[] }>;
  };

  // Human-readable examples shown in the "why we detected this" panel
  exampleColumns: string[];

  // Pulse categories that activate when this document type is present
  activePulseCategories: string[];

  // Whether this type supports row-level queries via the chat pipeline
  chatEnabled: boolean;
}
