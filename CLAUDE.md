# AIQL ERP

AI-powered financial query platform for Indian SMEs. Connects to Tally, Zoho Books, and uploaded GL files. Lets finance teams query their ERP in plain English/Hindi/Hinglish.

---

## Query Pipeline Architecture

**Core principle: LLM is the last resort, not the engine.**

Every query passes through 3 layers in order. Each layer is cheaper and faster than the next. A query stops at the first layer that can answer it confidently.

```
User question
      │
      ▼
┌─────────────────────────────────────────────────────┐
│  Layer 1 — Template Engine                          │
│  ~50-100 hand-written SQL templates                 │
│  Matched by keyword/intent patterns                 │
│  Cost: ₹0 · Latency: <50ms · Accuracy: 100%        │
│  Target: 70% of all queries                         │
└──────────────────┬──────────────────────────────────┘
                   │ no match
                   ▼
┌─────────────────────────────────────────────────────┐
│  Layer 2 — RAG (Retrieval Augmented Generation)     │
│  Vector/text similarity search on past Q→SQL pairs  │
│  Injects top 3 matches as few-shot examples to LLM  │
│  Cost: ~₹0.001/query (embedding only)               │
│  Latency: 100-200ms · Accuracy: 90%+ for seen       │
│  Target: 20% of queries (LLM + good context)        │
└──────────────────┬──────────────────────────────────┘
                   │ LLM called with few-shot context
                   ▼
┌─────────────────────────────────────────────────────┐
│  Layer 3 — LLM (last resort)                        │
│  Groq Llama 3.3 70B (free) for simple queries       │
│  Claude Haiku for complex queries                   │
│  Cost: ₹0.5-2/query · Latency: 1-3s                │
│  Target: <10% of queries over time                  │
│  Result stored → feeds Layer 2 for next time        │
└──────────────────┬──────────────────────────────────┘
                   │ on DB error
                   ▼
┌─────────────────────────────────────────────────────┐
│  Layer 4 — Execution Feedback Loop                  │
│  SQL fails → send DB error back to LLM → retry once │
│  Catches column name mismatches, syntax errors      │
└─────────────────────────────────────────────────────┘
```

**Why this matters for the business:**
- Cost per query decreases as usage grows (RAG learns from every query)
- Template library is proprietary IP — hard to replicate
- LLM cost becomes negligible at scale

---

## RAG Implementation Phases

### Phase 1 — Text similarity (current)
- Store every successful Q→SQL in `QueryLog`
- Retrieve by keyword/token overlap (no embeddings needed)
- Use as few-shot examples in LLM prompt
- ~60-70% of embedding quality, zero extra cost

### Phase 2 — Vector embeddings (next sprint)
- Add `questionEmbedding` to `QueryEmbedding` table
- Use `text-embedding-3-small` (OpenAI) or `nomic-embed-text` (Ollama, free)
- pgvector extension on Postgres for cosine similarity search
- Jump to ~95% RAG accuracy

### Phase 3 — Direct RAG answer (future)
- If similarity > 0.95 AND same org AND same schema → serve directly without LLM
- LLM cost drops to near zero for established customers

---

## Template Library — Priority Order

Currently: 50+ templates. Target: 50 templates covering Indian SME finance — ✅ REACHED.

**Tier 1 — ✅ All done**
- [x] Cash & bank balance
- [x] Overdue debtors (30/60/90 day buckets)
- [x] GST summary (CGST/SGST/IGST)
- [x] Vendor ledger (all transactions for one vendor)
- [x] Customer ledger (all transactions for one customer)
- [x] Purchase register by date range
- [x] Sales register by date range
- [x] Salary & payroll summary

**Tier 2 — ✅ All done**
- [x] Profit & Loss summary
- [x] Balance sheet snapshot
- [x] Expense by voucher type
- [x] TDS summary
- [x] Bank reconciliation summary
- [x] Advance payments outstanding

---

## Key Design Decisions

**RagStore is injected, not hardcoded**
`executeQuery()` accepts `ragStore?: RagStore` interface. The web app provides
the Prisma implementation. Query-engine package stays database-agnostic.

**LLM fires only when RAG confidence is below threshold**
`RAG_CONFIDENCE_THRESHOLD = 0.75` — if no past query scores above this,
fall through to LLM. LLM results always stored back for future RAG use.

**Schema stored as RawSchemaData, normalised at query time**
FILE_UPLOAD connections store `RawSchemaData` (from `buildUploadSchema`).
The query route normalises it to `ERPSchema` shape with safe defaults before
passing to the pipeline.

**Tokenisation is always Layer 0**
Before any layer runs, PII/entities are masked. The LLM never sees real
vendor names, customer names, or amounts — only tokens like `VENDOR_T001`.
Token map is held in memory for the request duration only, never persisted.

---

## Investigation Engine (the Financial Investigation Platform layer)

AccountIQ is evolving from an "AI Query Platform" (user must ask) into a
**Financial Investigation Platform** (the system proactively investigates and
surfaces findings + evidence + recommended actions). The Query Engine becomes a
drill-down capability, not the front door.

`packages/investigation-engine` is **pure** (no DB, no network) — like
`pulse-engine`. The web app injects the context resolver (Prisma-backed,
`apps/web/src/lib/investigations/context-resolver.ts`), persistence
(`persist.ts`), and the LLM function (`llm-fn.ts`, wrapping `safeLlmCall`).

**Eight frozen architecture principles — every investigation must obey these:**
1. Business Context is resolved before execution begins
2. Investigations declare **capabilities** (`Capability` enum), not connectors
3. The **Runner** resolves dependencies, not the investigations
4. Every investigation runs against an **immutable snapshot** (memoized accessors)
5. The LLM **explains** evidence — it never generates it. `Finding.llmSummary` is
   the ONLY LLM-written field; `run()` must never call the LLM or write to the DB
6. Evidence is **materialized** at run time (`Evidence.rows`), not referenced —
   so a Finding survives the 90-day raw-table expiry
7. Findings are **superseded, never deleted** (`InvestigationRunStatus`: a new
   run for the same org+period marks the prior CURRENT run SUPERSEDED)
8. Every Finding declares its **resolution condition** (`resolvesWhen`)

**Five-question rule (production gate):** a Finding is not ready unless it answers
(1) business question, (2) evidence, (3) ₹ impact (`impactRs`; `null` = real but
unquantifiable, `0` = no ₹ impact), (4) recommendation, (5) verification steps.
The `Finding` type makes all five required — an incomplete finding won't compile.

Adding an investigation = one file in `src/investigations/`, registered in
`registry.ts` and added to a profile in `profiles.ts`. The runner and UI need no
changes. First investigation: `gst-vendor-itc` (wraps `reconcileGlGstr2B`).

---

## Package Structure

```
packages/
  query-engine/        — Core pipeline (template → RAG → LLM)
  investigation-engine/— Pure financial-investigation framework (findings/evidence)
  tokeniser/           — PII masking, Hindi/Hinglish preprocessing
  schema-intel/        — ERP schema introspection and normalisation
  erp-connectors/      — Tally, Zoho Books, file upload connectors
  db/                  — Prisma schema and client

apps/
  web/               — Next.js 14 app (dashboard + API routes)
```

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...

# LLM — at least one required
GROQ_API_KEY=           # Free, Llama 3.3 70B — primary provider
ANTHROPIC_API_KEY=      # Claude — fallback for complex queries
CLAUDE_MODEL=claude-haiku-4-5-20251001   # cheapest, swap anytime

# Optional
GROQ_MODEL=llama-3.3-70b-versatile
AIQL_GROQ_CONFIDENCE_RETRY_THRESHOLD=0.75
AIQL_RAG_CONFIDENCE_THRESHOLD=0.75
```
