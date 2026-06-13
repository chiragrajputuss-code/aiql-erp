# RAG Knowledge Base — Architecture & Guardrails

## The 3-Layer Pipeline

Every chat query on a GL workspace flows through three layers in order. A layer stops the chain when it answers confidently.

```
User question
     │
     ▼  Layer 1 — Template Engine (₹0, <50ms, 100% accurate)
     │  ~50 hand-written SQL templates matched by keyword/intent
     │  If matched → return result directly
     │
     ▼  Layer 2 — RAG (near-free, 100-200ms)
     │  Find past successful Q→SQL pairs with high similarity
     │  Inject top 3 as few-shot examples into LLM prompt
     │  If RAG confidence >= 0.75 → LLM has strong examples to work from
     │
     ▼  Layer 3 — LLM (₹0.5-2/query, 1-3s)
     │  Groq Llama 3.3 70B (free) or Claude Haiku (complex)
     │  Never sees real vendor/customer names (tokeniser runs first)
     │  Result stored back → feeds Layer 2 for next time
     │
     ▼  Layer 4 — Execution Feedback
        If SQL fails → send DB error back to LLM → retry once
        Catches column name mismatches, syntax errors
```

## PrismaRagStore — Two-pass retrieval

**Location:** `apps/web/src/app/api/v1/connections/[connectionId]/chat/route.ts`

The RAG store uses two-pass retrieval to balance quality and coverage:

**Pass 1 — Same-connection scope**
- Filters: `connectionId = current`, `status = COMPLETED`, `confidence >= 0.7`, `createdAt >= 6 months ago`, `rowCount != 0`, `feedback != "thumbs_down"`
- Returns top 3 by similarity score
- Best quality: SQL is already from this exact table

**Pass 2 — Org-scoped fallback**
- Filters: same connection exclusion + all other connections in same org
- Only runs if Pass 1 returns < 3 results
- SQL uses `{{GL_TABLE}}` placeholder (restored at retrieval time)

**Why two passes?**
Different connections have different table names. Storing SQL with `{{GL_TABLE}}` as a placeholder makes it portable. Pass 1 skips restoration (table name is already correct). Pass 2 requires `restoreSql()` to substitute the real table name.

## `{{GL_TABLE}}` abstraction

When a successful query is stored in `QueryLog`:
```typescript
const storedSql = abstractTableName(result.sql, tableName);
// "SELECT * FROM 'org_abc_conn_xyz_1234'" → "SELECT * FROM '{{GL_TABLE}}'"
```

When retrieved for RAG:
```typescript
const restoredSql = restoreSql(storedSql, currentTableName);
// "SELECT * FROM '{{GL_TABLE}}'" → "SELECT * FROM 'org_abc_conn_new_5678'"
```

This makes every successful query reusable as a RAG example across all connections in the org.

## Hallucination protection

The LLM **never** generates the human-readable answer. It only generates SQL. The answer sentence is computed server-side from actual returned rows:

```typescript
function buildAnswerSentence(rows, columns, isSingleAggregate): string {
  if (isSingleAggregate) return `₹${formatINR(rows[0][columns[0]])}`;
  return `${rows.length} transaction${rows.length !== 1 ? "s" : ""} · ₹${formatINR(total)} total`;
}
```

The LLM cannot fabricate numbers because it never sees the query results.

## Tokenisation — PII masking

**Package:** `@aiql/tokeniser`

Before ANY LLM call, the query is tokenised:
- Vendor names → `VENDOR_T001`, `VENDOR_T002`
- Customer names → `CUSTOMER_T001`
- Amounts → `AMOUNT_T001`
- Date ranges → preserved (dates are structural, not PII)

The token map is held in memory for the request duration only. It is never persisted. The LLM sees the tokenised query and generates SQL with token placeholders. Tokens are restored after SQL generation.

**This is not optional.** The tokeniser always runs before LLM calls. This is enforced in `execute-query.ts`.

## QueryLog — the RAG training data

Every successful SQL query is stored in `QueryLog`:

| Field | Purpose |
|-------|---------|
| `question` | Original user question (tokenised) |
| `sql` | Generated SQL with `{{GL_TABLE}}` placeholder |
| `status` | `COMPLETED` = usable for RAG |
| `confidence` | Template/RAG/LLM source confidence score |
| `rowCount` | Number of rows returned (0 = bad query, excluded from RAG) |
| `feedback` | `thumbs_up` / `thumbs_down` / null |
| `source` | `"template"` / `"rag"` / `"llm"` |

**Quality gates on retrieval:**
- `confidence >= 0.7` — low-confidence past results excluded
- `rowCount != 0` — queries that returned no data excluded
- `feedback != "thumbs_down"` — user-rejected answers excluded
- `createdAt >= 6 months` — stale learnings excluded
- `status = "COMPLETED"` — only successful queries

## Conversation context

The chat API accepts up to 3 past turns as `ConversationTurn[]`. Each turn carries:
- `role`: `"user"` or `"assistant"`
- `question`: the user's question (for user turns)
- `sql`: the generated SQL (for assistant turns)
- `rowCount` / `columns`: result shape (for assistant turns)

The prompt builder injects these as a "Recent conversation" block in the user prompt. This enables follow-up questions ("what about last month?", "show only those with GST") without re-asking context.

**Follow-up detection** is heuristic-only (no LLM):
- Pronoun set: `those`, `them`, `these`, `that`, `it`, `they`, `which of`, `what about`
- Starter set: `and`, `also`, `but`, `now`, `show only`, `filter to`, `sort by`, `group by`, `exclude`
- Short question (<60 chars) without financial keywords

If detected, the conversation history is injected; otherwise the query is treated as standalone.

## Date context injection

Every LLM call receives a structured date context block:

```
Today: 31 May 2026
Current FY: FY2026-27 (Apr 2026 – Mar 2027)
Current quarter: Q1 FY2027 (Apr–Jun 2026)
GL data period: 1 Apr 2025 – 31 Mar 2026
```

This prevents the LLM from guessing dates and ensures "last month", "this quarter", "current FY" resolve correctly for Indian finance context.

## Rate limiting

20 queries per hour per user, enforced via an in-memory sliding window. For single-instance deployments this is sufficient. For multi-instance (multiple Vercel functions), replace with a Redis-backed counter.

**Location:** `apps/web/src/lib/rate-limit.ts`

## RAG confidence threshold

`RAG_CONFIDENCE_THRESHOLD = 0.75`

If the best-matching past query scores below 0.75, the LLM is called even if RAG results exist. This threshold is the key lever for cost vs quality:
- Higher threshold → fewer LLM calls, less diverse question support
- Lower threshold → more LLM calls, handles more edge cases

Current threshold was chosen empirically. Tune via `AIQL_RAG_CONFIDENCE_THRESHOLD` env var.

## Phase 2 — Vector embeddings (planned)

The current RAG uses token/keyword overlap similarity (zero infrastructure cost). Phase 2 will replace this with:
1. `text-embedding-3-small` (OpenAI) or `nomic-embed-text` (Ollama, free) for embedding generation
2. `pgvector` extension on Postgres for cosine similarity search
3. Store `questionEmbedding vector(1536)` on `QueryEmbedding` table
4. Similarity query: `ORDER BY embedding <=> $1 LIMIT 3`

Expected jump from ~65% to ~95% RAG accuracy without changing the pipeline architecture. Everything downstream (SQL restoration, hallucination protection, answer building) remains unchanged.
