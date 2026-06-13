import type { ERPSchema, SchemaTable, SchemaColumn, SchemaRelationship } from "@aiql/schema-intel";
import { preprocessHinglish, tokenise, type TokenisationConfig, type EntityDictionary } from "@aiql/tokeniser";
import type { DateContext, ConversationTurn } from "./execute-query";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt:   string;
  /** The tokenised question passed to the LLM (PII-safe) */
  tokenisedQuestion: string;
  /** Token map for detokenising the LLM-generated SQL */
  tokenMap: Map<string, string>;
}

export interface FewShotExample {
  question: string;
  sql:      string;
}

export interface BuildPromptOptions {
  schema:               ERPSchema;
  rawQuestion:          string;
  erpType:              string;
  sqlDialect?:          "postgresql" | "mysql" | "sqlite";
  config?:              Partial<TokenisationConfig>;
  dictionary?:          EntityDictionary;
  /** RAG: similar past queries injected as few-shot examples */
  fewShotExamples?:     FewShotExample[];
  /** Date + fiscal year context for resolving relative time references */
  dateContext?:         DateContext;
  /** Last ≤3 turns of conversation for follow-up handling */
  conversationContext?: ConversationTurn[];
}

// ─── Hindi/Hinglish language instruction ─────────────────────────────────────

const LANGUAGE_INSTRUCTION = `LANGUAGE: The user may ask in English, Hindi, or Hinglish (mixed Hindi-English).
Interpret all queries correctly regardless of language. Examples:
- English:  Show AP aging by vendor
- Hindi:    vendor wise outstanding dikhao
- Hinglish: pichle mahine ka revenue batao by department
- Hinglish: Sharma Enterprises ka total kitna hai
- Hinglish: sabhi vendors ka baaki amount dikhao jo 5 lakh se upar hai

Common Hindi financial terms you must understand:
dikhao=show, batao=tell, kitna=how much, kul=total, baaki=outstanding/pending,
mahine=month, saal=year, pichle=last, agle=next, se=from, tak=to,
khata=account, raashi=amount, baki=balance, jama=credit, udhar=debit,
bikri=sales, khareed=purchase, karod=crore, hazaar=thousand,
sabhi=all, upar=above, neeche=below, party=vendor
Always generate SQL in English regardless of input language.`.trim();

// ─── Schema formatter ─────────────────────────────────────────────────────────

/** Column categories that are always included (high signal-to-noise). */
const PRIORITY_CATEGORIES = new Set(["date", "currency", "id", "string"]);

function shouldIncludeColumn(col: SchemaColumn): boolean {
  if (col.isPrimaryKey || col.isForeignKey) return true;
  if (col.isAmount || col.isDate || col.isName) return true;
  if (PRIORITY_CATEGORIES.has(col.dataType)) return true;
  return false;
}

function formatTableLine(table: SchemaTable): string {
  const priorityCols = table.columns.filter(shouldIncludeColumn);
  // If few columns, include all; otherwise limit to 8 priority columns
  const cols = priorityCols.length <= 12 ? table.columns : priorityCols.slice(0, 8);

  const colStr = cols
    .map((c) => {
      const flags = [
        c.isPrimaryKey ? "PK" : "",
        c.isForeignKey ? "FK" : "",
        c.nullable ? "" : "NOT NULL",
      ]
        .filter(Boolean)
        .join(",");
      return flags ? `${c.name}:${c.dataType}(${flags})` : `${c.name}:${c.dataType}`;
    })
    .join(", ");

  const category = table.category ? ` [${table.category}]` : "";
  return `${table.name}${category} — ${colStr}`;
}

function formatRelationLine(rel: SchemaRelationship): string {
  return `${rel.fromTable}.${rel.fromColumn} → ${rel.toTable}.${rel.toColumn}`;
}

/**
 * Format schema as compact text for the LLM prompt.
 * Target: under ~1500 tokens (≈ 6000 chars).
 */
export function formatSchemaForPrompt(schema: ERPSchema): string {
  const lines: string[] = ["TABLES:"];

  for (const table of schema.tables) {
    lines.push(`  ${formatTableLine(table)}`);
  }

  if (schema.relationships.length > 0) {
    lines.push("\nRELATIONSHIPS:");
    for (const rel of schema.relationships) {
      lines.push(`  ${formatRelationLine(rel)}`);
    }
  }

  if (Object.keys(schema.accountTypeMap).length > 0) {
    lines.push("\nACCOUNT TYPES (sample):");
    // Show up to 20 entries — enough for context without blowing token budget
    const entries = Object.entries(schema.accountTypeMap).slice(0, 20);
    for (const [name, type] of entries) {
      lines.push(`  ${name} → ${type}`);
    }
    if (Object.keys(schema.accountTypeMap).length > 20) {
      lines.push(`  ... (${Object.keys(schema.accountTypeMap).length - 20} more)`);
    }
  }

  if (schema.dimensions.length > 0) {
    lines.push(`\nDIMENSIONS: ${schema.dimensions.join(", ")}`);
  }

  const text = lines.join("\n");
  // Hard cap at ~6000 chars (~1500 tokens) to leave room for question + response
  return text.length > 6000 ? text.slice(0, 5997) + "..." : text;
}

// ─── Date context block ───────────────────────────────────────────────────────

function buildDateBlock(ctx: DateContext): string {
  const lines = [
    `TODAY: ${ctx.today}`,
    `INDIAN FISCAL YEAR: April 1 – March 31.`,
    `Quarter definitions: Q1=Apr–Jun, Q2=Jul–Sep, Q3=Oct–Dec, Q4=Jan–Mar.`,
    `Current fiscal year: ${ctx.currentFY} (${ctx.currentFYStart} to ${ctx.currentFYEnd})`,
    `Current quarter: ${ctx.currentQuarter} (${ctx.currentQuarterStart} to ${ctx.currentQuarterEnd})`,
  ];
  if (ctx.glPeriodStart && ctx.glPeriodEnd) {
    lines.push(`GL data covers: ${ctx.glPeriodStart} to ${ctx.glPeriodEnd} — stay within this range.`);
  }
  return lines.join("\n");
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(
  schema:       ERPSchema,
  erpType:      string,
  sqlDialect:   string,
  dateContext?: DateContext,
): string {
  const schemaText = formatSchemaForPrompt(schema);
  const currency   = schema.currency.baseCurrency ?? "INR";
  const locale     = schema.currency.locale       ?? "en-IN";
  const dateBlock  = dateContext ? `\nDATE CONTEXT:\n${buildDateBlock(dateContext)}\n` : "";

  return `You are an expert SQL analyst for ${erpType} ERP systems.
Your job is to convert natural language financial queries into precise, read-only SQL SELECT statements.

${LANGUAGE_INSTRUCTION}

SQL DIALECT: ${sqlDialect.toUpperCase()}
ERP: ${erpType}
CURRENCY: ${currency} (format numbers with locale ${locale})
${dateBlock}
RULES:
1. Generate ONLY SELECT statements — never INSERT, UPDATE, DELETE, DROP, or CREATE.
2. Always qualify column names with table name/alias to avoid ambiguity.
3. For monetary amounts, use SUM() and round to 2 decimal places.
4. For date filtering, use ISO format dates (YYYY-MM-DD).
5. When the question contains tokens like VENDOR_T001 or AMOUNT_T001, use them exactly as given — they will be detokenised after.
6. If you cannot answer confidently, set confidence below 0.7 and list clarifications_needed.
7. Return ONLY valid JSON matching the response schema — no markdown, no explanation outside JSON.
8. ${sqlDialect.toUpperCase()} DIALECT ONLY. The query runs against PostgreSQL — do NOT use MySQL-specific syntax. Specifically AVOID:
   - \`WITH ROLLUP\` → use \`GROUP BY ROLLUP(col)\` instead
   - \`LIMIT offset, count\` → use \`LIMIT count OFFSET offset\` instead
   - Backtick-quoted identifiers like \`col_name\` → use double quotes "col_name"
   - \`IFNULL(a, b)\` → use \`COALESCE(a, b)\`
   - \`DATE_FORMAT()\`, \`STR_TO_DATE()\` → use \`TO_CHAR()\`, \`TO_DATE()\`
   - \`GROUP_CONCAT()\` → use \`STRING_AGG()\`

SCHEMA:
${schemaText}

RESPONSE FORMAT (strict JSON):
{
  "sql": "SELECT ...",
  "confidence": 0.0-1.0,
  "explanation": "one sentence",
  "assumptions": ["any assumptions made"],
  "clarifications_needed": ["questions if unclear"]
}`.trim();
}

// ─── Query preprocessing pipeline ────────────────────────────────────────────

/**
 * Three-step preprocessing before the query reaches the LLM:
 *  1. preprocessHinglish  — translate Hindi keywords to English
 *  2. tokenise            — mask entities, amounts, PII
 *  3. buildPrompt         — assemble system + user prompts
 */
function preprocessQuery(
  rawQuestion: string,
  config:      Partial<TokenisationConfig>,
  dictionary?: EntityDictionary
): { preprocessed: string; tokenised: string; tokenMap: Map<string, string> } {
  // Step 1: Hindi → English keyword substitution
  const preprocessed = preprocessHinglish(rawQuestion);

  // Step 2: Tokenise entities / amounts / PII
  const result = tokenise(preprocessed, config, dictionary);

  return {
    preprocessed,
    tokenised: result.tokenised,
    tokenMap:  result.tokenMap,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildPrompt(options: BuildPromptOptions): BuiltPrompt {
  const {
    schema,
    rawQuestion,
    erpType,
    sqlDialect          = "postgresql",
    config              = {},
    dictionary,
    fewShotExamples     = [],
    dateContext,
    conversationContext = [],
  } = options;

  const { preprocessed: _preprocessed, tokenised, tokenMap } = preprocessQuery(
    rawQuestion,
    config,
    dictionary
  );

  const systemPrompt = buildSystemPrompt(schema, erpType, sqlDialect, dateContext);

  // RAG few-shot examples — LLM copies proven patterns from same org
  const examplesBlock = fewShotExamples.length > 0
    ? "\n\nEXAMPLES FROM THIS ORGANISATION (use as style reference):\n" +
      fewShotExamples
        .map((e, i) => `Example ${i + 1}:\nQ: ${e.question}\nSQL: ${e.sql}`)
        .join("\n\n")
    : "";

  // Conversation context — inject last ≤3 turns for follow-up handling
  const conversationBlock = conversationContext.length > 0
    ? "\n\nCONVERSATION CONTEXT (most recent first):\n" +
      conversationContext
        .slice(-3)
        .map((t, i) => {
          const rowInfo = t.rowCount !== undefined ? `, ${t.rowCount} rows` : "";
          const colInfo = t.columns?.length ? ` [${t.columns.slice(0, 6).join(", ")}]` : "";
          const sqlInfo = t.sql ? `\n   SQL: ${t.sql.slice(0, 300)}` : "";
          return `Turn ${i + 1}: "${t.question}"${rowInfo}${colInfo}${sqlInfo}`;
        })
        .join("\n") +
      "\nUse this context to resolve follow-up pronouns (those, them, etc.)."
    : "";

  const userPrompt = `${examplesBlock}${conversationBlock}\n\nQuestion: ${tokenised}`.trimStart();

  return { systemPrompt, userPrompt, tokenisedQuestion: tokenised, tokenMap };
}
