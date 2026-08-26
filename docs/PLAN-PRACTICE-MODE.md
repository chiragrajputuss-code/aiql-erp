# Implementation Plan — Practice Mode, Founding-Free Model, Assistant

Written 26 Aug 2026. Intended to be implemented by a coding agent (Sonnet).
Work the phases **in order**. Phase 1 is a live-site correctness fix and ships alone.

---

## Context an implementer needs before touching anything

**The core defect.** `InvestigationRun` is keyed on `(orgId, period)` and has **no
connection/client column**. `persist.ts` supersedes any prior CURRENT run for that
pair. In a CA firm where 80 clients are 80 `ErpConnection` rows under one org,
running an investigation for client B **marks client A's run SUPERSEDED**. A firm
can hold exactly one client's findings at a time. `context-resolver.ts` compounds
this: it picks *the latest* GL source for the org, so the caller cannot even choose
a client.

**Repo gotchas — read these or you will lose hours.**
- **Never run `prisma db push`.** The DB is AWS RDS. Schema changes go in a
  migration file using `ALTER TABLE ... IF NOT EXISTS` / guarded DDL, applied via
  `prisma migrate deploy`. Existing examples: `packages/db/prisma/migrations/`.
- `packages/*/src/**/*.js` compiled artifacts were just deleted and gitignored.
  **Do not commit compiled `.js` next to `.ts`** — package `main` points at
  `src/index.ts`, so stale `.js` silently shadows your edits.
- `packages/investigation-engine` is **pure** — no DB, no network, no `Date.now()`
  in run(). All I/O is injected through `BusinessContext`. Keep it that way.
- Findings are deterministic. The LLM may only write `Finding.llmSummary`.
- Pre-existing: 3 failing tests in `close-engine/src/__tests__/scanner.test.ts`.
  Not yours; leave them.
- Verify with: `pnpm --filter web build` and per-package `pnpm --filter @aiql/<pkg> test`.

---

# PHASE 1 — Correct two false claims on the live pricing page

**Why first:** the site currently promises capability that does not exist. Ship
this before any CA sees it.

**Files:** `apps/web/src/app/pricing/page.tsx`, `apps/web/src/app/page.tsx`

In the `PLANS` array (both files), the "Firm" plan lists:
- `"Unlimited client books"` — false: one run per org per period
- `"Whole-practice scan in one pass"` — false: no cross-client scan exists

**Change to** (accurate today):
- `"Unlimited uploads"`
- `"Working-paper PDF export with evidence annexure"` (keep)
- Remove the whole-practice line entirely until Phase 3 ships.

**Acceptance:** no claim on either page describes cross-client behaviour.
`pnpm --filter web build` clean.

---

# PHASE 2 — Make investigations per-client (the unlock)

Everything else in this document depends on this phase.

### 2.1 Schema

`packages/db/prisma/schema.prisma`, model `InvestigationRun`:

```prisma
  // The client book this run investigated. Null only for legacy rows created
  // before practice mode. A firm holds one CURRENT run per (org, connection,
  // period) — NOT one per (org, period).
  connectionId String?
  connection   ErpConnection? @relation(fields: [connectionId], references: [id], onDelete: Cascade)
```

Replace the index `@@index([orgId, period])` with:
```prisma
  @@index([orgId, connectionId, period])
  @@index([orgId, status])
```
Add the reverse relation field on `model ErpConnection`:
```prisma
  investigationRuns InvestigationRun[]
```

### 2.2 Migration (hand-written, RDS-safe)

New file: `packages/db/prisma/migrations/20260826000000_investigation_run_per_client/migration.sql`

```sql
ALTER TABLE "investigation_runs" ADD COLUMN IF NOT EXISTS "connectionId" TEXT;

CREATE INDEX IF NOT EXISTS "investigation_runs_orgId_connectionId_period_idx"
  ON "investigation_runs" ("orgId", "connectionId", "period");

DO $$ BEGIN
  ALTER TABLE "investigation_runs"
    ADD CONSTRAINT "investigation_runs_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "erp_connections"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```
> Confirm the real table name for `ErpConnection` via its `@@map` before writing the FK.

**Backfill:** legacy runs keep `connectionId = NULL`. They must never be returned
for a specific client — only in an "unassigned/legacy" view. Do not guess a client.

### 2.3 Engine — carry client identity on the context

`packages/investigation-engine/src/context.ts`, in `BusinessContext`:

```ts
  /** The client book under investigation. Null for legacy/single-entity runs. */
  readonly connectionId: string | null;
```
Keep the engine pure — this is a plain readonly field, no lookups. Update the test
context factories in `packages/investigation-engine/src/__tests__/` to pass it.

### 2.4 Context resolver — investigate a *chosen* client

`apps/web/src/lib/investigations/context-resolver.ts`

- `buildBusinessContext({ orgId, year, month })` → add optional `connectionId`.
- When `connectionId` is supplied: select the GL source **for that connection**
  (fail with a clear error if that connection has no GL). The GSTR-2B source
  should be matched to the same client — prefer a 2B source on the *same
  connection*; if uploads are separate connections, match on period and treat a
  cross-client 2B as an error rather than silently pairing the wrong client's data.
- When omitted: preserve today's "latest GL" behaviour (single-business users).
- Set `connectionId` on the returned frozen context.

> **Correctness risk to guard:** pairing client A's GL with client B's GSTR-2B
> would produce confidently wrong findings. Add a unit test that this throws.

### 2.5 Persistence — scope the supersede

`apps/web/src/lib/investigations/persist.ts` — the `updateMany` at ~line 21:

```ts
where: {
  orgId:        ctx.organizationId,
  connectionId: ctx.connectionId,   // ← scopes supersede to this client only
  period:       ctx.period.label,
  status:       "CURRENT",
},
```
and write `connectionId: ctx.connectionId` in `investigationRun.create`.

> With `connectionId: null` Prisma matches `IS NULL`, so legacy single-entity
> behaviour is preserved exactly.

### 2.6 API

- `POST /api/v1/investigations/run` — accept optional `connectionId` in the body
  schema; validate it belongs to `user.orgId` (**404 if not** — never trust the
  client); pass to `buildBusinessContext`.
- `GET /api/v1/investigations/report` — accept `?connectionId=`; filter
  `where: { orgId, connectionId, status: "CURRENT" }`. Without the param keep
  current behaviour (latest CURRENT run for the org).
- `GET /api/v1/investigations/report/export` — same `connectionId` param so the
  PDF is for the right client.

### 2.7 UI — client switcher

`apps/web/src/app/(dashboard)/investigations/page.tsx`

- Load the org's ACTIVE connections that have a GL upload.
- Render a select at the top ("Client book: …"), default to the last-viewed
  (localStorage) or the most recent.
- Changing it refetches the report for that `connectionId`; Run Investigation and
  Download PDF both act on the selected client.

### 2.8 Tests (required)

`apps/web` or a new integration test:
- Running client B does **not** supersede client A's CURRENT run.
- Report route with `connectionId` returns that client's run only.
- Run route with a `connectionId` from another org → 404.
- Resolver: GL from client A + 2B from client B → throws.
- Engine tests still pass with the new context field.

**Acceptance:** two clients each hold a CURRENT run for the same period
simultaneously; switching the selector shows each correctly.

---

# PHASE 3 — Practice dashboard (the weekly habit)

**This is the screen a CA opens.** One row per client book.

New route: `apps/web/src/app/(dashboard)/practice/page.tsx`
New API: `GET /api/v1/practice/overview`

Returns, for each ACTIVE connection in the org:
`connectionId, clientName, lastRunAt, period, healthScore, criticalCount,
warningCount, opportunityCount, totalImpactRs, openFindingsCount, hasGl, hasGstr2b`

Query the latest CURRENT `InvestigationRun` per connection (one grouped query —
do **not** N+1 across 200 clients).

**UI:** sortable table — default sort by `criticalCount` desc, then
`totalImpactRs` desc. Columns: Client · Last run · Critical · Needs attention ·
₹ at risk · action ("Run" if never run / stale, else "View"). Add a header strip:
total clients, clients never run, total ₹ at risk across the practice.

Add "Practice" to the dashboard nav. Make it the landing page when the org has
**more than 3** connections.

**Performance:** must be sane at 200 connections — one aggregate query, paginate at 50.

**Only after this ships** may the marketing pages say "whole-practice view."

---

# PHASE 4 — Founding-free model

**Decision:** free for founding firms **through 2027**, not "free forever" — a
surprise invoice after a silent free year is how goodwill dies.

- `apps/web/src/lib/billing.ts` — set `PLAN_CONNECTION_LIMITS.FREE` and
  `PLAN_QUERY_LIMITS.FREE` to unlimited (999999) for now. Leave the constants in
  place so limits can be reintroduced.
- `apps/web/src/app/api/v1/investigations/report/export/route.ts` — **remove the
  `PDF_EXPORT_PLANS` gate** (added prematurely). Keep the import removal clean.
- `apps/web/src/app/pricing/page.tsx` — replace the three-tier grid with a single
  founding-user panel: what's included (everything), the honest line *"Free for
  founding firms through 2027. We'll introduce pricing after that — founding
  firms will get notice and preferential terms."*, and a signup CTA. Keep the
  FAQ, updating any answer that references tiers.
- `apps/web/src/app/page.tsx` — same treatment for the `PLANS` block; keep the
  pricing anchor link working.
- `apps/web/src/app/layout.tsx` — JSON-LD `offers` → a single `price: "0"` offer.

**Acceptance:** no page promises a price that isn't being charged; no feature is
gated; `grep -ri "30,000\|₹30k" apps/web/src` returns only historical/FAQ context.

---

# PHASE 5 — Site assistant (curated first, no hallucination)

**Design rule:** this must not become the LLM wrapper the product positions
against. **Layer 1 only in this phase — no LLM call at all.**

New: `apps/web/src/lib/assistant/answers.ts`
```ts
export interface CuratedAnswer {
  id: string;
  patterns: RegExp[];   // matched against the lowercased question
  question: string;     // canonical phrasing, shown as a suggestion chip
  answer: string;       // plain text, 2–5 sentences, written by a human
  cta?: { label: string; href: string };
}
export const ANSWERS: CuratedAnswer[] = [ /* ~25 entries */ ];
export function matchAnswer(q: string): CuratedAnswer | null;
```

**Content — 25 answers across:**
*Product* (what does it check · does it replace Tally · read-only? · what files ·
how long · is my data safe · what does it cost · who is it for)
*GST/domain* (what is ITC · what happens if a supplier doesn't file GSTR-1 ·
Rule 37A dates · Section 16(4) cutoff · Rule 37 180-day · what is IMS ·
what is GSTR-2B) — **factual explanations only.**
*Objections* (is this AI/ChatGPT · how is it different from free tools ·
do you see my client data · can I export)

**Hard rules, enforced in code and content:**
1. **Never gives tax advice.** Every domain answer ends with a variant of
   *"This is general information — your CA decides the treatment for a specific
   case."* Add a unit test asserting every domain answer contains a disclaimer.
2. **No match → refuse honestly.** *"I don't have a good answer for that. You can
   ask us directly at /contact — or sign up free and run it on your own file."*
   **Never** fall through to an LLM in this phase.
3. Reuse `checkGuardrails()` from `@aiql/query-engine`
   (`packages/query-engine/src/guardrails.ts`) for injection + off-domain
   filtering before matching. It already exists and is tested.

**API:** `POST /api/assistant` — `{ question }` → `{ answer, cta, matched: boolean }`.
Rate-limit **per IP: 20/hour** (in-memory LRU is fine at this stage). No auth.

**UI:** a small launcher on the marketing pages (bottom-right), panel with 4–6
suggestion chips from `ANSWERS`. Registration gate is on **action**, not
information: answer generously, and when they ask it to check *their* books,
respond *"I can't check your books here — sign up free and upload one file."*

**Explicitly out of scope this phase:** retrieval over the articles, any LLM call,
conversation memory. Revisit once real questions have been logged.

---

# Suggested sequencing & commits

1. `fix: correct unsupported practice claims on pricing pages` (Phase 1)
2. `feat: per-client investigation runs` (Phase 2 — schema + migration + engine + API)
3. `feat: client switcher on investigations` (Phase 2.7 + tests)
4. `feat: practice dashboard` (Phase 3)
5. `feat: founding-free model` (Phase 4)
6. `feat: curated site assistant` (Phase 5)

Ship 1 immediately. 2 and 3 are the ones that make the product usable by a firm —
and they are the precondition for the free-year retention strategy, because
without per-client history there is nothing for a firm to accumulate and nothing
to lose by leaving.
