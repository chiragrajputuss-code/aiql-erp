// ─── Patterns that identify non-data columns ──────────────────────────────────

const SKIP_PATTERNS: RegExp[] = [
  // Serial / row numbers
  /^sr\.?\s*no\.?$/i, /^s\.?\s*no\.?$/i, /^serial\s*(no\.?|number)?$/i,
  /^sno\.?$/i, /^row\s*(no\.?|number|#)?$/i, /^#$/i, /^sl\.?\s*no\.?$/i,
  /^sequence\s*(no\.?|number)?$/i,

  // Audit metadata — who/when created/modified
  /^created\s*(by|date|on|at)$/i, /^modified\s*(by|date|on|at)$/i,
  /^updated\s*(by|date|on|at)$/i, /^entered\s*(by|date|on|at)$/i,
  /^approved\s*(by|date|on|at)$/i, /^deleted\s*(by|date|on|at)$/i,
  /^last\s+modified/i, /^last\s+updated/i, /^audit/i,

  // UI / formatting columns
  /^row\s*(color|colour|highlight|shade|style|flag|class)$/i,
  /^(cell|column|row)\s*(format|style|class)$/i,
  /^(is_?)?(selected|checked|active|visible|hidden|locked)$/i,
  /^(row_?)?(status|state|flag)$/i,

  // Internal system fields
  /^(internal|system|auto)\s*(id|key|ref|code|note|remark)$/i,
  /^_+.*_+$/,    // wrapped in underscores e.g. __hidden__
  /^tmp_/i, /^temp_/i,
];

// ─── Skip function ────────────────────────────────────────────────────────────

export function shouldSkipColumn(
  name: string,
  sampleValues: unknown[] = []
): { skip: boolean; reason: string } {
  // 1. Name pattern match
  for (const re of SKIP_PATTERNS) {
    if (re.test(name.trim())) {
      return { skip: true, reason: `matches skip pattern: ${re}` };
    }
  }

  if (sampleValues.length === 0) return { skip: false, reason: "" };

  const nonEmpty = sampleValues.filter(
    (v) => v !== null && v !== undefined && String(v).trim() !== ""
  );

  // 2. Almost-empty column (>= 95% empty)
  const emptyRatio = 1 - nonEmpty.length / sampleValues.length;
  if (emptyRatio >= 0.95) {
    return { skip: true, reason: `${Math.round(emptyRatio * 100)}% empty` };
  }

  // 3. Single constant value (no information)
  if (nonEmpty.length >= 3) {
    const unique = new Set(nonEmpty.map((v) => String(v).trim().toLowerCase()));
    if (unique.size === 1) {
      return { skip: true, reason: "single constant value across all rows" };
    }
  }

  return { skip: false, reason: "" };
}
