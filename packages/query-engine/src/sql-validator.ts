export interface ValidationResult {
  isValid:      boolean;
  errors:       string[];
  warnings:     string[];
  sanitisedSql: string;
}

// ─── Layer 1: Blacklisted keywords ───────────────────────────────────────────

const BLACKLIST: Array<{ re: RegExp; label: string }> = [
  { re: /\bINSERT\b/i,           label: "INSERT" },
  { re: /\bUPDATE\b/i,           label: "UPDATE" },
  { re: /\bDELETE\b/i,           label: "DELETE" },
  { re: /\bDROP\b/i,             label: "DROP" },
  { re: /\bCREATE\b/i,           label: "CREATE" },
  { re: /\bALTER\b/i,            label: "ALTER" },
  { re: /\bTRUNCATE\b/i,         label: "TRUNCATE" },
  { re: /\bEXEC(?:UTE)?\b/i,     label: "EXEC/EXECUTE" },
  { re: /\bGRANT\b/i,            label: "GRANT" },
  { re: /\bREVOKE\b/i,           label: "REVOKE" },
  { re: /\bDECLARE\b/i,          label: "DECLARE" },
  { re: /\bBULK\s+INSERT\b/i,    label: "BULK INSERT" },
  { re: /\bxp_cmdshell\b/i,      label: "xp_cmdshell" },
  { re: /\bsp_executesql\b/i,    label: "sp_executesql" },
  { re: /\bOPENROWSET\b/i,       label: "OPENROWSET" },
  { re: /\bOPENQUERY\b/i,        label: "OPENQUERY" },
  { re: /\bCOPY\s+\w+\s+FROM\b/i, label: "COPY ... FROM (file write)" },
  { re: /\bPG_READ_FILE\b/i,     label: "pg_read_file" },
  { re: /\bPG_EXECUTE_SERVER_PROGRAM\b/i, label: "pg_execute_server_program" },
];

// ─── Layer 2: Structural checks ───────────────────────────────────────────────

// SELECT ... INTO table FROM ... is data exfiltration
const SELECT_INTO_RE = /\bSELECT\b[\s\S]*?\bINTO\b[\s\S]*?\bFROM\b/i;

// Multiple statements (semicolons not inside string literals)
const MULTI_STMT_RE = /;[^'"]*(?:'[^']*'|"[^"]*")*[^'"]*\S/;

// Comment injection patterns
const COMMENT_INJECTION_RE = /--.*(?:DROP|DELETE|INSERT|UPDATE|TRUNCATE)/i;

// ─── MySQL → PostgreSQL dialect porter ────────────────────────────────────────
//
// The LLM occasionally generates MySQL-flavoured SQL even when told to target
// PostgreSQL — because MySQL syntax dominates its training data. Auto-translate
// the most common slips so a single dialect mismatch doesn't fail the whole
// query (the user just sees results, not a 500 error).
//
// Each transformation is a regex pair. Only matches OUTSIDE string literals
// are affected — `WITH ROLLUP` inside a quoted string would not be touched.

const MYSQL_TO_PG_PATTERNS: Array<{ from: RegExp; to: string; name: string }> = [
  // GROUP BY x WITH ROLLUP  →  GROUP BY ROLLUP(x)
  {
    from: /\bGROUP\s+BY\s+([^()]+?)\s+WITH\s+ROLLUP\b/gi,
    to:   "GROUP BY ROLLUP($1)",
    name: "WITH ROLLUP",
  },
  // GROUP BY x, y WITH CUBE  →  GROUP BY CUBE(x, y)
  {
    from: /\bGROUP\s+BY\s+([^()]+?)\s+WITH\s+CUBE\b/gi,
    to:   "GROUP BY CUBE($1)",
    name: "WITH CUBE",
  },
  // Backtick-quoted identifiers (MySQL) → double-quoted (PostgreSQL standard)
  // `column_name` → "column_name"
  {
    from: /`([^`]+)`/g,
    to:   '"$1"',
    name: "backtick identifiers",
  },
  // IFNULL(a, b) → COALESCE(a, b)
  {
    from: /\bIFNULL\s*\(/gi,
    to:   "COALESCE(",
    name: "IFNULL → COALESCE",
  },
  // ISNULL(x) (when used as a function with one arg) → x IS NULL
  // Skipped — ambiguous with PostgreSQL's own ISNULL semantics, more likely
  // to corrupt than fix. Leave to error if LLM uses it.

  // STR_TO_DATE(s, fmt) → TO_DATE(s, fmt) (formats differ but most common are compatible)
  {
    from: /\bSTR_TO_DATE\s*\(/gi,
    to:   "TO_DATE(",
    name: "STR_TO_DATE → TO_DATE",
  },
  // DATE_FORMAT(d, fmt) → TO_CHAR(d, fmt) (formats differ — this is best-effort)
  {
    from: /\bDATE_FORMAT\s*\(/gi,
    to:   "TO_CHAR(",
    name: "DATE_FORMAT → TO_CHAR",
  },
  // GROUP_CONCAT(x) → STRING_AGG(x::text, ',')
  // Best-effort; doesn't handle DISTINCT or SEPARATOR options.
  {
    from: /\bGROUP_CONCAT\s*\(\s*([^()]+?)\s*\)/gi,
    to:   "STRING_AGG($1::text, ',')",
    name: "GROUP_CONCAT → STRING_AGG",
  },
  // CONCAT_WS(sep, a, b, ...) → CONCAT_WS works in PG too, no change needed.
  // CONCAT also works in PG.

  // LIMIT offset, count  →  LIMIT count OFFSET offset
  // Only match digits to avoid catching LIMIT n with no comma.
  {
    from: /\bLIMIT\s+(\d+)\s*,\s*(\d+)\b/gi,
    to:   "LIMIT $2 OFFSET $1",
    name: "LIMIT a,b → LIMIT b OFFSET a",
  },
];

export function portMysqlToPostgres(sql: string): string {
  let out = sql;
  for (const { from, to } of MYSQL_TO_PG_PATTERNS) {
    out = out.replace(from, to);
  }
  return out;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function validateSql(sql: string): ValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!sql || !sql.trim()) {
    return { isValid: false, errors: ["Empty SQL"], warnings: [], sanitisedSql: "" };
  }

  // ── Sanitise: remove trailing semicolons and normalise whitespace ──────────
  let sanitised = sql.replace(/;+\s*$/, "").trim();

  // ── Auto-fix MySQL-isms that PostgreSQL rejects ────────────────────────────
  // The LLM occasionally slips into MySQL dialect because that's what's most
  // common in its training data. Auto-translate the common ones rather than
  // failing the query outright.
  const beforeFix = sanitised;
  sanitised = portMysqlToPostgres(sanitised);
  if (sanitised !== beforeFix) {
    warnings.push("Auto-converted MySQL syntax to PostgreSQL (LLM dialect slip)");
  }

  // ── Layer 1: Blacklisted keywords ─────────────────────────────────────────
  for (const { re, label } of BLACKLIST) {
    if (re.test(sanitised)) {
      errors.push(`Disallowed operation: ${label}`);
    }
  }

  // ── Layer 2: Must start with SELECT or WITH ────────────────────────────────
  const firstWord = sanitised
    .replace(/\/\*[\s\S]*?\*\//g, "") // strip block comments
    .trimStart()
    .split(/\s+/)[0]
    ?.toUpperCase();

  if (firstWord !== "SELECT" && firstWord !== "WITH") {
    errors.push(`SQL must begin with SELECT or WITH (got: ${firstWord ?? "nothing"})`);
  }

  // ── SELECT ... INTO (data exfiltration) ───────────────────────────────────
  if (SELECT_INTO_RE.test(sanitised)) {
    errors.push("SELECT ... INTO is not allowed (potential data exfiltration)");
  }

  // ── Multiple statements ───────────────────────────────────────────────────
  if (MULTI_STMT_RE.test(sanitised)) {
    errors.push("Multiple SQL statements are not allowed");
  }

  // ── Comment injection ─────────────────────────────────────────────────────
  if (COMMENT_INJECTION_RE.test(sanitised)) {
    warnings.push("SQL contains comments with suspicious keywords — review before executing");
  }

  // ── Warnings ──────────────────────────────────────────────────────────────
  if (/\bSELECT\s+\*/i.test(sanitised)) {
    warnings.push("SELECT * is inefficient — consider selecting specific columns");
  }
  if (/\bORDER\s+BY\b/i.test(sanitised) && !/\bLIMIT\b|\bFETCH\s+FIRST\b|\bTOP\b/i.test(sanitised)) {
    warnings.push("ORDER BY without LIMIT may be slow on large tables");
  }

  return {
    isValid:      errors.length === 0,
    errors,
    warnings,
    sanitisedSql: errors.length === 0 ? sanitised : "",
  };
}
