import type {
  DocumentType,
  DetectionCandidate,
  DetectionResult,
  SheetDetection,
} from "./types";
import { REGISTRY } from "./registry";

// Normalise a column name for comparison:
// lower-case, strip spaces/underscores/hyphens, remove common prefixes
function normalise(col: string): string {
  return col
    .toLowerCase()
    .replace(/[\s_\-]/g, "")
    .replace(/^(col_|fld_|field_)/, "");
}

function normaliseAll(cols: string[]): Set<string> {
  return new Set(cols.map(normalise));
}

// Score a set of uploaded columns against one type definition
function scoreType(
  uploadedNorm: Set<string>,
  def: (typeof REGISTRY)[number]
): DetectionCandidate {
  const { detection } = def;

  // Discriminator score — how many discriminators matched (weighted)
  const discNorm      = normaliseAll(detection.discriminatorColumns);
  const matched       = detection.discriminatorColumns.filter((c) =>
    uploadedNorm.has(normalise(c))
  );
  const discScore     = discNorm.size > 0 ? matched.length / discNorm.size : 0;

  // Anti-signal penalty — reduce confidence when strongly off-type columns are present
  const antiMatches   = detection.antiSignalColumns.filter((c) =>
    uploadedNorm.has(normalise(c))
  );
  const antiPenalty   = antiMatches.length > 0
    ? Math.min(0.35, antiMatches.length * 0.12)
    : 0;

  // Required columns check — any missing required column hard-caps confidence at 0.3
  const requiredNorm  = normaliseAll(detection.requiredColumns);
  const missingReq    = detection.requiredColumns.filter(
    (c) => !uploadedNorm.has(normalise(c))
  );
  const reqPenalty    = requiredNorm.size > 0 && missingReq.length > 0 ? 0.4 : 0;

  const confidence    = Math.max(0, Math.min(1, discScore - antiPenalty - reqPenalty));

  // Schema version detection — find the first version whose unique columns match
  let schemaVersion: string | null = null;
  for (const sv of detection.schemaVersions) {
    const versionMatch = sv.uniqueColumns.every((c) => uploadedNorm.has(normalise(c)));
    if (versionMatch) { schemaVersion = sv.version; break; }
  }

  return {
    type:            def.id,
    confidence,
    matchedColumns:  matched,
    missingRequired: missingReq,
    schemaVersion,
  };
}

function OTHER_CANDIDATE(): DetectionCandidate {
  return {
    type:            "OTHER",
    confidence:      0.1,
    matchedColumns:  [],
    missingRequired: [],
    schemaVersion:   null,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function detectDocumentType(
  columns: string[],
  sheetName?: string
): DetectionResult {
  const uploadedNorm = normaliseAll(columns);

  // Score every registered type
  const candidates = REGISTRY
    .map((def) => scoreType(uploadedNorm, def))
    .filter((c) => c.confidence > 0.05)       // drop near-zero scores
    .sort((a, b) => b.confidence - a.confidence);

  const best = candidates[0] ?? OTHER_CANDIDATE();

  // Ambiguity: second-best within 0.15 of best
  const isAmbiguous =
    candidates.length >= 2 &&
    best.confidence - candidates[1].confidence < 0.15;

  return {
    candidates,
    best,
    isAmbiguous,
    sheets: sheetName
      ? [{ sheetName, rowCount: 0, candidates, best }]
      : [],
  };
}

// Detect across multiple sheets (each sheet gets its own detection)
export function detectMultiSheet(
  sheets: Array<{ name: string; columns: string[]; rowCount: number }>
): SheetDetection[] {
  return sheets.map(({ name, columns, rowCount }) => {
    const uploadedNorm = normaliseAll(columns);
    const candidates = REGISTRY
      .map((def) => scoreType(uploadedNorm, def))
      .filter((c) => c.confidence > 0.05)
      .sort((a, b) => b.confidence - a.confidence);
    const best = candidates[0] ?? OTHER_CANDIDATE();
    return { sheetName: name, rowCount, candidates, best };
  });
}
