# AIQL ERP — Conversational Chat + Daily Pulse + Document Type System

**Master Plan v1.0 — Frozen Scope**
Created: 2026-05-31
Owner: Chirag Rajput

---

## Executive Summary

Building three interlocking systems on top of the existing AIQL ERP platform:

1. **Document Type System** — Hybrid auto-detect + confirm classification for uploaded financial documents (GL, Form 26Q, GSTR-1, GSTR-3B, ITR). Workspace model groups multiple typed documents under one connection.

2. **GL Conversational Chat** — Natural-language query interface on uploaded GL data, with multi-layer pipeline (templates → RAG → LLM), full guardrails, conversation context, and trust-building UX features.

3. **Daily Pulse** — Deadline-driven and issue-driven daily/weekly digest delivered via email and in-app. Compliance calendar awareness (TDS, GSTR, Advance Tax, ITR). Personalized to user's data and configurable per category.

**Timeline:** v1 = 6 weeks (30 working days). v2 = 4 weeks. v3 = 4 weeks. Total ~14 weeks to feature-complete.

**Key differentiator:** This is the only finance tool that combines tokenised AI chat, cross-document compliance reconciliation, and proactive deadline alerting on the same data. Neither ChatGPT (no data access) nor traditional ERPs (no AI) can match this combination.

---

## Architecture Decisions (Captured)

These decisions were locked in during design discussions. Recorded here so we don't relitigate.

### Decision 1 — Document type categorization
**Decision:** Have explicit `documentType` per upload. Use hybrid auto-detect + user-confirm pattern, never blackbox LLM classification.

**Why:** Finance documents have legally defined structures (Form 26Q, GSTR-1, ITR). Blackbox LLM classification produces silent wrong answers when scanners and pulse rules run on misclassified data — catastrophic for trust in a finance tool. Auto-detect with deterministic heuristics + one-click confirm gives us the magic UX without the hallucination risk.

### Decision 2 — Connection model: Workspace pattern (Option B)
**Decision:** Refactor `ErpConnection` to be a `Workspace` that contains multiple typed `Document` records. One workspace per fiscal year / business unit.

**Why:** Unlocks cross-document reconciliation (GL ↔ Form 26Q, GL ↔ Bank Statement). Without this, the killer feature is impossible. 2-3 days extra investment now vs months of refactoring later.

### Decision 3 — Current vs Historical data
**Decision:** Ask user at upload time. Pulse logic branches accordingly.

**Why:** Auto-detection from data dates is unreliable when users upload past data for audit prep. User intent is clearest signal.

### Decision 4 — Compliance calendar scope for v1
**Decision:** Include TDS + GSTR-1 + GSTR-3B + Advance Tax + ITR. All driven by uploaded document types.

### Decision 5 — Pulse delivery
**Decision:** Email + in-app banner for v1. WhatsApp deferred to v3 (requires Meta Business API approval).

### Decision 6 — Pulse cadence
**Decision:** Weekly default with daily during compliance windows (1st-7th for TDS, 8th-10th for GSTR-1, 18th-20th for GSTR-3B, around quarterly advance tax dates). Configurable from admin.

### Decision 7 — Pulse personalization
**Decision:** Per-category snooze. Founder-friendly tone (punchy, action-oriented, terse).

### Decision 8 — Knowledge base learning quality
**Decision:** Store learnings only when ALL pass:
- `verdict = "execute"`
- `rowCount > 0`
- `layer = "llm"` (template hits don't need re-learning)
- `confidence.final >= 0.70`

Plus: dedup before store, 6-month TTL, connection-scoped retrieval, exclude `feedback = 'negative'` entries.

### Decision 9 — Hallucination protection
**Decision:** All answer sentences (totals, counts, averages) computed server-side from actual rows. LLM authors SQL only, never the human summary.

### Decision 10 — Trust-building UX
**Decision:** Always show source badge (Template / Learned / AI), assumptions, query summary card (parsed from SQL), and click-through to GL lister for source verification.

### Decision 11 — v1 scope freeze
**Decision:** 5 document types auto-detect for v1, but only GL fully wired. Other types' parsers, scanners, and pulse rules deferred to v2. This prevents scope creep killing the ship date.

---

## v1 Scope — Frozen

### IN v1 (will build):

**Foundation:**
- [ ] Workspace data model (refactor ErpConnection)
- [ ] Document model with type, period, version, schema fingerprint
- [ ] DocumentType enum (5 types)
- [ ] Auto-detect heuristics for 5 types
- [ ] Upload UI with type detection + confirm + current/historical
- [ ] Migration of existing FILE_UPLOAD connections

**Knowledge Base Guardrails:**
- [ ] PrismaRagStore: connection-scoped, TTL filter, exclude negative feedback
- [ ] Quality gate on storage
- [ ] Dedup before store
- [ ] Per-user rate limit (20/hr)
- [ ] Table name abstraction ({{GL_TABLE}})
- [ ] Feedback field on QueryLog
- [ ] Type-aware tokeniser refactor

**GL Conversational Chat:**
- [ ] `/api/v1/connections/[connectionId]/chat` route
- [ ] `/connections/[id]/chat` page + GlChat component
- [ ] Multi-stage loading (Template → Past → AI)
- [ ] Source badges
- [ ] Query summary card (SQL-parsed)
- [ ] Server-side answer sentence
- [ ] Date + fiscal year context injection
- [ ] Conversation context (last 3 turns)
- [ ] Follow-up question detection
- [ ] Suggested questions from scan results
- [ ] Clarification chips
- [ ] 👍/👎 feedback per result
- [ ] Click row → GL lister filter
- [ ] Data freshness badge
- [ ] Text-bar chart for aggregated results
- [ ] Smart error recovery messages
- [ ] Assumptions surfaced

**Daily Pulse:**
- [ ] PulseDigest, PulseSubscription, PulseAlert DB models
- [ ] Cron infrastructure (Vercel Cron, daily 8 AM IST)
- [ ] Compliance calendar engine
- [ ] TDS liability calculation from GL
- [ ] Snapshot section (cash, receivables, payables)
- [ ] Scan integration (unresolved issues)
- [ ] Email template + delivery
- [ ] /connections/[id]/pulse page
- [ ] History view (last 30 days)
- [ ] Admin settings (cadence, per-category snooze, channels)
- [ ] Historical data variant
- [ ] First-time welcome state
- [ ] Founder-friendly tone

### NOT in v1 (deferred to v2/v3):

**v2:**
- Form 26Q, GSTR-1, GSTR-3B, ITR parsers + scanners + pulse rules
- Cross-document reconciliation engine (GL ↔ Form 26Q first)
- Audit trail page (org admin view)
- Drill-into-row action
- Personalized onboarding (read actual GL for suggestions)
- Chat-as-primary-surface hub restructure
- Cross-period comparison templates

**v3:**
- Vector embeddings (pgvector)
- Anomaly detection in pulse
- Saved queries / Recurring reports
- WhatsApp share / delivery
- Mobile chat optimization
- Voice input

---

## v1 Day-by-Day Plan (30 working days = 6 weeks)

Each day has: **Goal** · **Tasks** · **Files touched** · **Acceptance criteria**

---

### Phase 1.A — Foundation & Data Model (Days 1-5)

#### Day 1 — Prisma schema changes
**Goal:** Establish data model for Workspace + Document + Pulse models.

**Tasks:**
- Add `Workspace` model (or rename ErpConnection)
- Add `Document` model with: `id`, `workspaceId`, `documentType`, `periodStart`, `periodEnd`, `version`, `schemaFingerprintJson`, `uploadedFileId`, `isHistorical`, `detectedConfidence`, `userConfirmed`
- Add `DocumentType` enum: `GL`, `TDS_RETURN_26Q`, `GSTR_1`, `GSTR_3B`, `ITR`, `OTHER`
- Add `feedback` field to `QueryLog` (nullable: `"positive" | "negative"`)
- Add `PulseSubscription` model: `id`, `userId`, `workspaceId`, `cadence`, `channels`, `snoozedCategories`, `lastSentAt`
- Add `PulseDigest` model: `id`, `workspaceId`, `generatedAt`, `digestJson`, `emailSentAt`, `shareToken`
- Add `PulseAlert` model: `id`, `workspaceId`, `category`, `severity`, `title`, `detailJson`, `createdAt`, `resolvedAt`
- Write migration using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (NEVER `prisma db push` per CLAUDE.md)

**Files touched:**
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/<timestamp>_workspace_pulse/migration.sql`

**Acceptance:**
- Migration runs cleanly on dev DB
- Existing data preserved (no FILE_UPLOAD connections lost)
- All new models have proper indexes (`@@index([orgId])`, `@@index([workspaceId])`)

---

#### Day 2 — Document Type Registry
**Goal:** Create the type definition system that drives detection, scanning, and pulse rules.

**Tasks:**
- Create `packages/document-types/` package
- Define `DocumentTypeDefinition` interface:
  ```typescript
  {
    id: string;                    // "GL", "TDS_RETURN_26Q"
    displayName: string;           // "General Ledger"
    description: string;           // Plain-English for users
    detectionHeuristics: {
      requiredColumns: string[];   // Must have all of these
      discriminatorColumns: string[]; // Unique to this type
      excludeIfColumns: string[];  // Anti-signals
    };
    schemaVersions: { version: string; columns: string[] }[];
    scannerRulesPackage: string;   // Reference to scanner rules
    pulseRulesPackage: string;     // Reference to pulse rules
    tokenisationOverrides: Partial<TokenisationConfig>;
  }
  ```
- Implement 5 type definitions (GL fully populated, others have detection + minimal scanner stub)
- Unit tests for each type definition

**Files created:**
- `packages/document-types/package.json`
- `packages/document-types/src/index.ts`
- `packages/document-types/src/types/gl.ts`
- `packages/document-types/src/types/tds-26q.ts`
- `packages/document-types/src/types/gstr-1.ts`
- `packages/document-types/src/types/gstr-3b.ts`
- `packages/document-types/src/types/itr.ts`
- `packages/document-types/src/registry.ts`

**Acceptance:**
- All 5 types registered, importable
- Each has minimal detection signature defined
- Tests pass for type definition loading

---

#### Day 3 — Auto-Detect Heuristics
**Goal:** Implement deterministic column-based detection from uploaded files.

**Tasks:**
- Implement `detectDocumentType(columns: string[]): DetectionResult[]`
- Score each type by: (matched discriminators × weight) - (excluded columns × penalty)
- Return sorted list of candidates with confidence (0-1)
- Handle ambiguous cases (multiple high-confidence matches)
- Handle no-match case (return `OTHER` with low confidence)
- Multi-sheet Excel: detect per sheet, return per-sheet results
- Period extraction from filename + content (regex for FY/Q patterns, date columns scan)

**Files created:**
- `packages/document-types/src/detect.ts`
- `packages/document-types/src/extract-period.ts`
- `packages/document-types/src/__tests__/detect.test.ts`

**Acceptance:**
- Hand-crafted test fixtures for 5 type signatures detect correctly
- Edge case: column with both GL and TDS markers returns both, ranked
- Multi-sheet XLSX returns per-sheet detections
- Period extracted from "GL_Apr-Mar_FY25.xlsx" as `{ start: 2024-04-01, end: 2025-03-31 }`

---

#### Day 4 — Upload UI changes
**Goal:** Wire detection into the upload flow with confirm UX.

**Tasks:**
- Modify upload endpoint to call `detectDocumentType` after file parsing
- Return detected type(s) + matched columns + confidence in upload response
- Update upload UI component:
  - Show "We think this is a [Type]" with confidence
  - Show "Matched: [discriminator columns]" for transparency
  - Provide [Confirm] [Change Type ▾] [Other] actions
  - Current vs Historical toggle ("Is this current operational data or historical?")
  - Multi-sheet: show each sheet with its detected type, user confirms per sheet
- On confirm, create Document record with `userConfirmed = true`

**Files touched:**
- `apps/web/src/app/api/v1/upload/route.ts` (or wherever upload lives)
- `apps/web/src/components/connections/upload-form.tsx` (or wherever)
- Possibly: `apps/web/src/components/connections/document-type-confirm.tsx` (new)

**Acceptance:**
- Upload an Excel file → see detected type → confirm → document created with correct type
- Override flow works
- Current/Historical flag stored on Workspace
- Multi-sheet files create multiple Document records

---

#### Day 5 — Migration of existing data
**Goal:** Backfill existing FILE_UPLOAD connections cleanly.

**Tasks:**
- Write migration script:
  - For each existing `ErpConnection` with `erpType = 'FILE_UPLOAD'`:
    - Create `Workspace` wrapper
    - Create `Document` with `documentType = 'GL'` (assumption)
    - Mark `userConfirmed = false` (so user can override later)
- Test on dev DB
- Document production rollback plan
- Verify GL lister, scanner, and chat still work post-migration

**Files created:**
- `packages/db/scripts/migrate-to-workspace.ts`
- `PLAN-CHAT-PULSE-MIGRATION.md` (rollback steps)

**Acceptance:**
- All existing connections accessible after migration
- Scanner runs on migrated connections
- No data lost (uploaded file references intact)

---

### Phase 1.B — Knowledge Base Hardening (Days 6-8)

#### Day 6 — PrismaRagStore upgrades (Part 1)
**Goal:** Add connection scope, TTL, negative feedback exclusion.

**Tasks:**
- Modify `PrismaRagStore` constructor: accept `connectionId` in addition to `orgId`
- Two-pass retrieval in `findSimilar()`:
  - Pass 1: `where: { orgId, connectionId, ... }` — same connection
  - Pass 2: if < 3 results, widen to `where: { orgId, ... }`
- Add TTL: `createdAt: { gt: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) }`
- Exclude negative feedback: `feedback: { not: 'negative' }`

**Files touched:**
- `apps/web/src/app/api/v1/query/route.ts` (lines 16-48)

**Acceptance:**
- Unit tests for two-pass retrieval
- Manual test: query with same connection learns; query with different connection sees fallback only
- Old QueryLog entries (>6 months) excluded from RAG

---

#### Day 7 — PrismaRagStore upgrades (Part 2)
**Goal:** Quality gate, dedup, table name abstraction, rate limit.

**Tasks:**
- Quality gate before QueryLog store (in route handler):
  - Skip store if `rowCount === 0`
  - Skip store if `verdict !== 'execute'`
  - Skip store if `layer !== 'llm'`
  - Skip store if `confidence.final < 0.70`
- Dedup check before store:
  - Query last 500 entries for same orgId+connectionId
  - If `textSimilarity(newQ, existingQ) > 0.90` → skip store, optionally update timestamp
- Table name abstraction:
  - Before storing `generatedSql`: replace `"${tableName}"` with `{{GL_TABLE}}`
  - In `findSimilar()`: replace `{{GL_TABLE}}` with current connection's table name
- Per-user rate limit:
  - Module-scope `Map<userId, number[]>` for sliding window
  - 20 requests per rolling hour
  - 429 response when exceeded
  - Auto-cleanup of old timestamps on each request

**Files touched:**
- `apps/web/src/app/api/v1/query/route.ts`
- Maybe: `apps/web/src/lib/rate-limit.ts` (new utility)

**Acceptance:**
- 0-row queries don't pollute RAG
- Same question stored once even if asked 50 times
- Stored SQL portable across connections
- 21st request in an hour returns 429

---

#### Day 8 — Type-aware tokeniser
**Goal:** Refactor tokeniser to support per-document-type configs.

**Tasks:**
- Refactor `@aiql/tokeniser`:
  - Accept `documentType` in `TokenisationConfig`
  - Per-type overrides registry (e.g., Form 26Q masks `deductee_pan` always)
  - Per-type entity recognition (which columns are vendor names vs employee names)
- Update `previewTokenisation` to use type-aware config
- Update `buildPrompt` to receive document type and apply correct tokenisation
- For v1: only GL config is fully populated; other types use safe defaults
- Tests for each type's tokenisation behavior

**Files touched:**
- `packages/tokeniser/src/index.ts`
- `packages/tokeniser/src/configs/` (new directory)
- `packages/query-engine/src/prompt-builder.ts`
- `apps/web/src/app/api/v1/query/route.ts`

**Acceptance:**
- GL queries tokenise vendor names → `VENDOR_T001`
- Future Form 26Q queries (when wired) would mask `deductee_pan`
- No regression in existing GL tokenisation tests

---

### Phase 1.C — Chat API (Days 9-12)

#### Day 9 — Chat API route foundation
**Goal:** Standalone chat endpoint, wired to existing pipeline.

**Tasks:**
- Create `/apps/web/src/app/api/v1/connections/[connectionId]/chat/route.ts`
- Request schema:
  ```typescript
  { question: string (max 500); history?: ConversationTurn[] (max 3) }
  ```
- Auth: `validateRequest` → user.orgId
- Load connection + workspace + document (assert document type = GL)
- Build PrismaRagStore with `(orgId, connectionId)`
- Apply per-user rate limit (reuse from Day 7)
- Call `executeQuery` with `executeQuery: true`
- Return structured response (rows, columns, source, confidence, warnings, executionTimeMs)
- Persist QueryLog (with quality gate applied)

**Files created:**
- `apps/web/src/app/api/v1/connections/[connectionId]/chat/route.ts`

**Acceptance:**
- POST with valid question returns rows + columns
- Rate-limited user gets 429
- Cross-org access blocked (404 if connection not in user's org)

---

#### Day 10 — Date + fiscal year context injection
**Goal:** Pipeline understands "this month", "Q1", "FY25" correctly.

**Tasks:**
- Modify `executeQuery` to accept optional `dateContext`:
  ```typescript
  {
    today: string;            // ISO date
    glPeriodStart: string;
    glPeriodEnd: string;
    fiscalYearStartMonth: number; // 4 for India (April)
  }
  ```
- Modify `buildPrompt` to inject these as system prompt facts
- Add fiscal year definition to system prompt:
  - "Indian fiscal year: April 1 to March 31"
  - "Q1 = April-June, Q2 = July-Sep, Q3 = Oct-Dec, Q4 = Jan-March"
- Chat API route fetches GL min/max dates (already done in data/page.tsx) and passes to executeQuery

**Files touched:**
- `packages/query-engine/src/execute-query.ts`
- `packages/query-engine/src/prompt-builder.ts`
- `apps/web/src/app/api/v1/connections/[connectionId]/chat/route.ts`

**Acceptance:**
- Question "Show this month's sales" produces SQL with current month, not Jan
- Question "Show Q1 sales" produces April-June, not Jan-March
- GL period range visible in system prompt

---

#### Day 11 — Conversation context for follow-ups
**Goal:** Handle "which of those don't have TDS?" style follow-ups.

**Tasks:**
- Define `ConversationTurn` interface
- Follow-up detection heuristics in chat route:
  - Contains pronoun: "those", "them", "these", "that", "it", "they"
  - Starts with: "and", "also", "but", "now", "what about", "how about"
  - Under 40 chars with no financial keyword
  - Action verbs: "sort by", "filter by", "exclude", "show only"
- When detected, inject into system prompt:
  ```
  CONVERSATION CONTEXT:
  User previously asked: "{prev}"
  That produced SQL: {prevSql}
  The result had N rows with columns: [...]
  Answer the follow-up using this context.
  ```
- Pass last 3 turns max

**Files touched:**
- `packages/query-engine/src/execute-query.ts` (accept conversationContext)
- `packages/query-engine/src/prompt-builder.ts` (inject)
- `apps/web/src/app/api/v1/connections/[connectionId]/chat/route.ts` (detect + pass)

**Acceptance:**
- Q1: "Show payments to Sharma Electricals" → 4 rows
- Q2: "Which of those don't have TDS?" → filters previous 4, returns 2

---

#### Day 12 — Server-side answer sentence + assumptions
**Goal:** Hallucination protection — never let LLM author totals/counts.

**Tasks:**
- In chat route, after `executeQuery` returns:
  - Compute `count = rows.length`
  - Compute `sum` over numeric columns named like `amount`, `debit`, `credit`, `total`
  - Build human answer sentence: `"{count} transactions · ₹{fmtAmount(sum)} total"`
  - For aggregated single-row results: `"Total: ₹{value}"`
  - For empty results: `"No transactions match. Try different criteria."`
- Surface `assumptions` array from QueryResponse in chat response
- Surface `warnings` array
- Surface `source` (template/rag/llm) based on `layer` field

**Files touched:**
- `apps/web/src/app/api/v1/connections/[connectionId]/chat/route.ts`

**Acceptance:**
- Numeric totals always match sum of returned rows
- Assumptions surfaced when LLM made them
- Source badge data ready for UI

---

### Phase 1.D — Chat UI (Days 13-17)

#### Day 13 — Chat page + basic component
**Goal:** Functional chat with message history and basic table rendering.

**Tasks:**
- Create `/apps/web/src/app/(dashboard)/connections/[id]/chat/page.tsx` (server component)
  - Load connection + workspace + document
  - Fetch GL min/max dates for context
  - Pass to GlChat
- Create `/apps/web/src/components/connections/gl-chat.tsx` (client component)
  - Message list state: `Array<{ id, role, content, rows?, columns?, source?, ... }>`
  - Textarea input + send button (shadcn)
  - POST to `/chat` API
  - Render messages: user bubble + assistant bubble
  - Basic table for `rows` (reuse styling from GL lister where possible)
  - Source badges: green Template / indigo Learned / blue AI

**Files created:**
- `apps/web/src/app/(dashboard)/connections/[id]/chat/page.tsx`
- `apps/web/src/components/connections/gl-chat.tsx`

**Acceptance:**
- Navigate to /connections/[id]/chat → see empty state
- Type question → see loading → see result
- Source badge visible

---

#### Day 14 — Multi-stage loading + query summary card
**Goal:** Transparency about pipeline stages and what was computed.

**Tasks:**
- Multi-stage loading state in GlChat:
  - Show 3-step progress: "Checking templates… → Searching past queries… → Asking AI…"
  - Progressive reveal based on response time (simple time-based since pipeline is fast for first 2)
  - When response arrives, replace with result
- Query summary card component:
  - Parse SQL WHERE clause client-side or in chat route
  - Extract: date range, filter columns/values, voucher type filter, etc.
  - Render as small card above results:
    ```
    Searched: vendor payments to Sharma Electricals
    Period: All available
    Filter: voucher_type = 'Payment'
    ```

**Files touched:**
- `apps/web/src/components/connections/gl-chat.tsx`
- New: `apps/web/src/components/connections/query-summary-card.tsx`
- Possibly: `packages/query-engine/src/sql-parser.ts` (lightweight regex parser)

**Acceptance:**
- Loading state cycles through 3 stages
- Every AI/Learned response shows summary card
- Summary card accurately reflects SQL WHERE clauses

---

#### Day 15 — Suggested questions + assumptions display
**Goal:** Context-aware suggestions on empty state. Surface AI assumptions.

**Tasks:**
- Read scan overlay from localStorage (key: `gl-scan-v1-${connectionId}`)
- For each scan issue category, generate a suggested question:
  - `tds_potentially_missed` → "Show vendor payments above ₹30,000 without TDS deducted"
  - `duplicate_transactions` → "Show all duplicate transactions in this period"
  - `debtors_overdue` → "Show customers with outstanding amount older than 60 days"
  - `gst_mismatch` → "Show vouchers where GST amount differs from expected"
  - `sign_anomalies` → "Show sales entries posted with negative amounts"
- Default suggestions if no scan: "Top 10 vendors by spend", "Sales by month", "Cash balance"
- Render as clickable chip buttons on empty state
- Clicking chip pre-fills input + submits
- Assumptions section per AI response: collapsible "What this query assumed" with bullet list

**Files touched:**
- `apps/web/src/components/connections/gl-chat.tsx`
- New: `apps/web/src/components/connections/suggested-questions.tsx`

**Acceptance:**
- Empty state shows scan-derived suggestions if scan exists
- Clicking chip fires the question
- Assumptions visible (collapsed by default)

---

#### Day 16 — Clarification chips + thumbs feedback
**Goal:** Dead-end recovery via disambiguation + active learning loop.

**Tasks:**
- When response has `verdict: "needs_clarification"`:
  - Render `clarificationsNeeded[]` as clickable chips
  - Each chip pre-fills + submits a refined question
- Add 👍 / 👎 buttons to every AI/Learned response (not Template — they're authoritative)
- POST to new endpoint `/api/v1/query-feedback`:
  - Updates `QueryLog.feedback = 'positive' | 'negative'`
  - Idempotent (can toggle)
- After negative feedback, modal: "Tell us what was wrong? (optional)"
- Negative-feedback entries excluded from RAG (already in Day 6)

**Files touched:**
- `apps/web/src/components/connections/gl-chat.tsx`
- New: `apps/web/src/app/api/v1/query-feedback/route.ts`

**Acceptance:**
- Ambiguous question → see chips → click → get refined answer
- Thumbs down on a wrong answer → next similar question doesn't surface that learning

---

#### Day 17 — Click-row + freshness + text-bar + smart errors
**Goal:** Trust signals and graceful failures.

**Tasks:**
- Each result row becomes clickable:
  - If row has `reference_number` → link to `/connections/[id]/data?refNos=${ref}`
  - GL lister already supports this filter
- Data freshness badge in chat header:
  - Compute days since `uploadedFile.createdAt`
  - If > 14 days: warning "GL data last updated {N} days ago"
  - If > 60 days: amber alert
- Text-bar chart for aggregated results:
  - Detect: result has 2 columns (label + amount), more than 1 row
  - Render as ranked list with percentage bars
  - CSS width based on percentage, no charting library
- Smart error recovery:
  - Parse DB errors from `executionTimeMs > 0` but `rowCount === 0` with error
  - Map common errors to human messages:
    - `column "X" does not exist` → "Your GL doesn't have a {X} column. Try asking about {alternative}."
    - `invalid input syntax for type date` → "Date format wasn't recognized. Try '1 April 2025' or '2025-04-01'."

**Files touched:**
- `apps/web/src/components/connections/gl-chat.tsx`
- New: `apps/web/src/components/connections/text-bar-chart.tsx`
- New: `apps/web/src/lib/parse-db-error.ts`

**Acceptance:**
- Click row → land on lister filtered to that voucher
- Stale GL → see badge
- "Top vendors" returns ranked list with bars
- Wrong column query → see helpful message, not raw error

---

### Phase 1.E — Daily Pulse Infrastructure (Days 18-22)

#### Day 18 — PulseDigest model verification + cron setup
**Goal:** Scheduled execution infrastructure ready.

**Tasks:**
- Verify Day 1 models (PulseDigest, PulseSubscription, PulseAlert) work
- Create `/apps/web/src/app/api/v1/cron/pulse/route.ts`
- Configure Vercel Cron in `vercel.json`:
  ```json
  {
    "crons": [{
      "path": "/api/v1/cron/pulse",
      "schedule": "30 2 * * *"   // 2:30 AM UTC = 8:00 AM IST
    }]
  }
  ```
- Secure cron endpoint with `CRON_SECRET` env var check
- Basic execution: iterate active PulseSubscription records, dispatch jobs
- Idempotency: skip if PulseDigest for today already exists

**Files created:**
- `apps/web/src/app/api/v1/cron/pulse/route.ts`
- `vercel.json` (if doesn't exist, otherwise modify)

**Files touched:**
- `.env.example` (add CRON_SECRET)

**Acceptance:**
- Cron endpoint manually triggerable in dev (with secret header)
- Iterates active subscriptions correctly
- Doesn't double-send for same day

---

#### Day 19 — Compliance calendar engine
**Goal:** Generate deadline alerts based on today's date and uploaded document types.

**Tasks:**
- Create `packages/pulse-engine/` package
- Implement `generateComplianceEvents(today, workspace)`:
  - TDS deposit: due 7th of next month → alert from 1st to 7th
  - GSTR-1: due 10th of next month → alert from 8th to 10th
  - GSTR-3B: due 20th of next month → alert from 18th to 20th
  - Advance Tax: 15 Jun (15%), 15 Sep (45%), 15 Dec (75%), 15 Mar (100%) → alert week before
  - ITR filing: 31 July (individual), 30 Sep (audit cases) → alert week before
- Each event has: category, severity, title, detail, action URL
- Historical data guard: if `workspace.isHistorical = true` or `glMaxDate < today - 90 days`, skip deadline alerts
- For documents the user has: tailor alerts (if has GSTR-1 uploaded, alert about filing it)

**Files created:**
- `packages/pulse-engine/package.json`
- `packages/pulse-engine/src/index.ts`
- `packages/pulse-engine/src/compliance-calendar.ts`
- `packages/pulse-engine/src/types.ts`

**Acceptance:**
- On June 3, 2026 → returns TDS deposit alert (due June 7)
- On June 8, 2026 → returns GSTR-1 alert (due June 10) + TDS still listed if not snoozed
- Historical workspace → no deadline alerts

---

#### Day 20 — TDS liability calculation per document type
**Goal:** Compute "₹X.XL TDS pending deposit" from actual data.

**Tasks:**
- For GL document:
  - Query: sum of `tds_amount` or equivalent column for current month transactions where no challan reference exists
  - Group by section (194C, 194J, 194I)
  - Format breakdown
- For workspace also containing Form 26Q (v2 — stub for now):
  - Cross-check declared vs deposited
- Add to alert: `detailJson: { totalPending, byCategory: [...] }`

**Files touched:**
- `packages/pulse-engine/src/tds-calculator.ts`

**Acceptance:**
- GL upload with TDS transactions → alert shows correct pending amount
- Empty TDS → no alert (or "₹0 pending — all caught up" if user prefers)

---

#### Day 21 — Snapshot + scan integration
**Goal:** Always-present footer with current state + unresolved issues.

**Tasks:**
- Snapshot computation (per workspace's GL document):
  - Cash + bank balance (sum of accounts categorized as bank/cash)
  - Total receivables (sum of debtor accounts)
  - Total payables (sum of creditor accounts)
  - Quick P&L if scanner has computed (or skip if not)
- Scan integration:
  - Read latest scan overlay from DB (need to verify where it's stored — currently localStorage only)
  - **Sub-task:** If scan is localStorage-only, persist to DB too (PulseAlert with category="scan_unresolved")
  - List critical + review issues that aren't marked resolved
- Include in PulseDigest

**Files touched:**
- `packages/pulse-engine/src/snapshot.ts`
- `packages/pulse-engine/src/scan-integration.ts`
- Possibly: persist scanOverlay to DB (new endpoint `/api/v1/connections/[id]/scan-overlay` POST)
- `apps/web/src/components/connections/gl-lister.tsx` (push scan results to server)

**Acceptance:**
- Snapshot accurate against GL data
- Unresolved scan issues from previous scans appear in pulse
- Resolved issues don't appear

---

#### Day 22 — Email template + delivery
**Goal:** Beautiful, mobile-first email lands in inbox.

**Tasks:**
- HTML email template:
  - Plain HTML (no CSS frameworks — email clients hate them)
  - Mobile-first (single column, ≥14px font)
  - Sections: header → critical alerts → unresolved issues → snapshot → CTA
  - Each item has action link (drills to chat with pre-filled question or to lister)
  - Footer: unsubscribe + manage alerts + shareToken view link
- Tone: founder-friendly (punchy, terse, no fluff)
- Subject line dynamic: "AIQL Pulse · N things to do · DDD MMM"
- Use existing nodemailer infra (per next.config.js externals)
- Send via cron job (Day 18)
- Persist `emailSentAt` on PulseDigest

**Files created:**
- `apps/web/src/lib/pulse-email/template.tsx` (React Email or plain HTML string builder)
- `apps/web/src/lib/pulse-email/send.ts`

**Acceptance:**
- Manual trigger sends real email to user
- Email renders correctly on mobile Gmail, Outlook, Apple Mail
- Links work (drill to chat/lister)

---

### Phase 1.F — Pulse UI + Admin (Days 23-25)

#### Day 23 — Pulse page
**Goal:** In-app view of today's pulse + history.

**Tasks:**
- Create `/apps/web/src/app/(dashboard)/connections/[id]/pulse/page.tsx`
- Server: fetch latest PulseDigest + last 30 days history
- Render today's pulse same structure as email
- History section: collapsible list of past pulses, click to expand
- Empty state: "Your first pulse will arrive tomorrow morning"
- Add link to connection hub

**Files created:**
- `apps/web/src/app/(dashboard)/connections/[id]/pulse/page.tsx`
- `apps/web/src/components/connections/pulse-view.tsx`
- `apps/web/src/components/connections/pulse-history.tsx`

**Acceptance:**
- Page renders today's pulse
- History shows past pulses
- Drillable links work

---

#### Day 24 — Admin settings
**Goal:** User controls over cadence, channels, and per-category snooze.

**Tasks:**
- Create `/apps/web/src/app/(dashboard)/connections/[id]/pulse/settings/page.tsx`
- Settings UI:
  - **Cadence:** Daily / Weekly / Off (default: Weekly + daily during compliance windows)
  - **Channels:** Email ☑ · In-app ☑ · WhatsApp ☐ (disabled, v3)
  - **Snooze categories** (each toggleable):
    - TDS reminders
    - GSTR-1 reminders
    - GSTR-3B reminders
    - Advance Tax reminders
    - ITR reminders
    - Anomaly alerts
    - Unresolved scan issues
  - **Quiet hours:** Don't send between 8 PM and 7 AM (default on)
- Admin-only access (check user role)
- POST settings to update PulseSubscription
- Manage Alerts link in email footer points here

**Files created:**
- `apps/web/src/app/(dashboard)/connections/[id]/pulse/settings/page.tsx`
- `apps/web/src/components/connections/pulse-settings-form.tsx`
- `apps/web/src/app/api/v1/connections/[connectionId]/pulse-subscription/route.ts`

**Acceptance:**
- Admin can toggle cadence
- Per-category snooze works (snoozed category doesn't appear in pulse)
- Non-admin gets 403

---

#### Day 25 — Edge cases + tone polish
**Goal:** Quiet days, first-time uploads, founder-friendly copy.

**Tasks:**
- Quiet day handling: if no alerts, no deadlines, no unresolved issues → don't send email, but show "Nothing to flag today" on in-app page
- First-time pulse (within 24h of first upload):
  - Welcome subject: "Welcome to AIQL Pulse · Your GL snapshot"
  - Focus on snapshot + scan summary
  - Skip deadline alerts (give them time to settle in)
- Historical workspace pulse:
  - Subject: "AIQL · Open issues from your historical books"
  - Skip current deadlines
  - Focus on unresolved issues + scan findings
- Tone review pass:
  - Cut "Please" and "Kindly" — direct verbs
  - Numbers first ("₹2.8L TDS pending" not "There is ₹2.8L TDS pending")
  - Action verbs: "Show breakdown", "Mark filed", "Send reminder"
- Connect pulse to connection hub: prominent CTA on hub page

**Files touched:**
- `apps/web/src/lib/pulse-email/template.tsx`
- `apps/web/src/components/connections/pulse-view.tsx`
- `apps/web/src/app/(dashboard)/connections/[id]/page.tsx` (add Pulse link)

**Acceptance:**
- Quiet day → no spam
- First-time user gets welcome variant
- Historical user gets historical variant
- Tone consistently punchy throughout

---

### Phase 1.G — Polish + Ship (Days 26-30)

#### Day 26 — End-to-end testing
**Goal:** Manual + automated smoke tests across the full v1.

**Tasks:**
- Test matrix:
  - Upload Excel as new user → type detected → confirm → workspace created
  - Re-upload as different type → override works
  - Chat on uploaded GL → 5 different question types → all return correct results
  - Follow-up question → context preserved
  - Thumbs down → next similar question doesn't surface that learning
  - Trigger pulse manually → email arrives → links work
  - Snooze category → next pulse skips it
  - Historical workspace → pulse skips deadlines
- Document bugs in `BUGS-V1.md`
- Fix critical bugs same day

**Files created:**
- `BUGS-V1.md` (tracking)
- Possibly Playwright tests: `apps/web/tests/e2e/chat-pulse.spec.ts`

**Acceptance:**
- All test matrix items pass or have logged bugs

---

#### Day 27 — Production migration execution
**Goal:** Backfill existing connections without breaking anything.

**Tasks:**
- Run migration script on staging (mirror of prod) first
- Verify scanner, chat, lister all work on migrated data
- Schedule maintenance window
- Run on production
- Verify post-migration
- Monitor logs for errors

**Files touched:**
- `packages/db/scripts/migrate-to-workspace.ts` (production run)

**Acceptance:**
- All existing customers' connections accessible
- No support tickets opened in 24h post-migration

---

#### Day 28 — Bug fixes from testing
**Goal:** Address all critical and high-priority bugs found in Day 26 testing.

**Tasks:** Iterate through `BUGS-V1.md` in priority order.

**Acceptance:** No critical bugs open. P1 bugs reduced to <3.

---

#### Day 29 — Documentation
**Goal:** Internal docs so anyone can pick up and extend.

**Tasks:**
- Update `CLAUDE.md` with new architecture overview
- Create `docs/document-types.md` — how to add a new type
- Create `docs/pulse-engine.md` — how compliance rules work
- Create `docs/knowledge-base.md` — RAG architecture + guardrails
- Update `README.md` with new features

**Files created:**
- `docs/document-types.md`
- `docs/pulse-engine.md`
- `docs/knowledge-base.md`

**Files touched:**
- `CLAUDE.md`
- `README.md`

**Acceptance:** A new dev can read docs and add a new document type without asking.

---

#### Day 30 — Ship + monitor
**Goal:** Release v1 to all customers, watch for issues.

**Tasks:**
- Feature flag rollout (10% → 50% → 100% if no issues)
- Announcement (in-app banner + email to existing customers)
- Set up alerts for: pulse email delivery failures, chat 5xx rate, classification error rate
- On-call rotation for 48h post-launch
- Collect feedback proactively (Intercom message to first 50 users)

**Acceptance:**
- v1 live for all customers
- Error rate <0.5% for first 24h
- First user feedback collected

---

## v2 Day-by-Day Plan (20 working days = 4 weeks)

### Phase 2.A — Document Type Parsers + Scanners (Days 31-37)

**Day 31-32 — Form 26Q parser + schema**
- Parse Form 26Q Excel/TXT format
- Map to canonical schema (deductee, section, amount, challan, BSR)
- Persist as Document records under workspace

**Day 33-34 — Form 26Q scanner rules**
- Validation rules: challan amounts match deposits, BSR codes valid, PANs format-valid
- Cross-check: total deductions = total deposited
- Surface as ScanIssue records (reuse close-engine patterns)

**Day 35 — GSTR-1 parser + schema**
- Parse GSTR-1 JSON/Excel
- Map to canonical schema (invoice, counterparty GSTIN, taxable value, tax amounts)

**Day 36 — GSTR-1 scanner rules**
- GSTIN format validation
- HSN code validity
- Tax calculation correctness (CGST+SGST intra-state, IGST inter-state)

**Day 37 — GSTR-3B + ITR basic parsers**
- Read-only parsers for both (scanner minimal)
- Surface key totals (tax liability, refund due) for pulse use

---

### Phase 2.B — Cross-Document Reconciliation (Days 38-42)

**Day 38 — Reconciliation engine architecture**
- Define `Reconciliation` interface: pair of document types + matching rules + tolerance
- Persist `ReconciliationResult` model

**Day 39 — GL ↔ Form 26Q reconciliation**
- Match TDS deductions in GL against challan deposits in Form 26Q
- Surface gaps: "GL shows ₹2.8L deducted, Form 26Q shows ₹2.5L deposited — ₹30K gap"
- Drill-through to specific vouchers

**Day 40 — Reconciliation UI page**
- Create `/workspaces/[id]/reconciliation` page
- Show all reconciliations for the workspace
- Each with: status (matched/gap), gap amount, drill links

**Day 41 — Cross-document pulse alerts**
- Add reconciliation gap to pulse alerts
- "₹30K gap between GL TDS and Form 26Q — review before deposit deadline"

**Day 42 — GL ↔ GSTR-1 reconciliation**
- Match sales invoices in GL against filed GSTR-1 entries
- Flag missing invoices or mismatched amounts

---

### Phase 2.C — Chat & UX Enhancements (Days 43-48)

**Day 43 — Drill-into-row action**
- Each chat result row has "→ Drill" button
- Auto-fires next logical question (e.g., for voucher PUR-1021: "Show all entries related to PUR-1021")

**Day 44 — Personalized onboarding**
- Read actual GL voucher types, date range, top vendors on first chat visit
- Generate suggestions referencing real data
- "Your GL has 3,847 transactions across Purchase, Payment, Sales vouchers. Try…"

**Day 45 — Chat-as-primary-surface restructure**
- Restructure connection hub
- "Ask your GL →" becomes primary CTA
- Other tools (lister, scan, mapping) become secondary

**Day 46 — Cross-period comparison templates**
- Add 5-7 cross-period templates to library:
  - "Sales: this month vs last month"
  - "Vendor X spend: this year vs last year"
  - "Top expense categories: this quarter vs previous quarter"
- YoY/MoM badges on monthly aggregate results

**Day 47 — Audit trail page (org admin)**
- `/admin/queries` page (org admin only)
- All queries across the org, who asked, when, what answer
- Filter by user, date range, connection
- Export to PDF for year-end audit

**Day 48 — Polish + bug fixes**

---

### Phase 2.D — Ship v2 (Days 49-50)
- Day 49: E2E testing
- Day 50: Ship + monitor

---

## v3 Day-by-Day Plan (20 working days = 4 weeks)

### Phase 3.A — Vector Embeddings (Days 51-55)

**Day 51 — pgvector installation + Prisma support**
- Add pgvector extension to Postgres
- Add `Vector` type support via Prisma
- New model: `QueryEmbedding { id, queryLogId, embedding, model, dim }`

**Day 52 — Embedding generation**
- Use Ollama nomic-embed-text (free) or OpenAI text-embedding-3-small (cheap)
- Generate on QueryLog insert (async, not blocking)
- Backfill existing entries

**Day 53 — Embedding-based retrieval**
- New `findSimilarByEmbedding` method in PrismaRagStore
- Use cosine similarity (pgvector `<=>` operator)
- Combine with text similarity as fallback

**Day 54 — Integrate with PrismaRagStore**
- Primary: embedding similarity
- Fallback: text similarity
- A/B test: measure RAG accuracy improvement

**Day 55 — Migration of existing data**
- Backfill embeddings for last 90 days of QueryLog
- Schedule background job for older entries

---

### Phase 3.B — Anomaly Detection in Pulse (Days 56-60)

**Day 56 — Statistical baseline computation**
- Compute per-vendor, per-account, per-voucher-type baseline (avg, stddev) over past 6 months
- Persist as `MetricBaseline` model

**Day 57 — Anomaly detection**
- Compare today's value vs baseline
- Flag if > 2σ deviation
- "Vendor X paid ₹15L this month — 3x typical monthly amount"

**Day 58 — Alert generation**
- New PulseAlert category: "anomaly"
- Critical if > 3σ, review if > 2σ

**Day 59 — Integration into pulse**
- Include anomalies in daily digest
- "📈 ATTENTION: Sales of HSN 8471 dropped 40% vs typical"

**Day 60 — Tuning + false positive reduction**
- Adjust thresholds based on first 2 weeks of user feedback
- Suppress noisy categories

---

### Phase 3.C — Reports + Power Features (Days 61-65)

**Day 61 — Saved queries model**
- `SavedQuery { id, userId, workspaceId, question, schedule, lastRunAt, alertOnDelta }`
- Save chat queries as "Reports"

**Day 62 — Scheduled report execution**
- Cron runs each report on schedule (daily/weekly/monthly)
- Email result to user
- Alert if result deviates > 20% from last run

**Day 63 — WhatsApp share**
- Meta WhatsApp Business API setup
- Templated message for sharing query results
- Per-org WhatsApp opt-in

**Day 64 — Mobile chat UI optimization**
- Responsive chat interface
- Bottom-sheet input on mobile
- Touch-friendly suggestion chips

**Day 65 — Voice input**
- Web Speech API integration
- "Hold to speak" button
- Hindi + English speech recognition

---

### Phase 3.D — Ship v3 (Days 66-70)
- Days 66-69: Polish, bug fixes, beta testing
- Day 70: Ship

---

## Risks & Mitigations

### Risk 1 — Scope creep mid-build
**Mitigation:** This document is the frozen scope for v1. New ideas go in `IDEAS-V2.md` (don't yet exist), not into v1 plan. Mid-build changes require explicit re-scoping discussion.

### Risk 2 — Heuristic accuracy
**Mitigation:** Hand-built fixtures per type. Track classification accuracy in production. Allow user override always. Treat heuristics as data, update without deploys.

### Risk 3 — Email deliverability
**Mitigation:** Use established email provider (SendGrid/Postmark/AWS SES). Implement SPF/DKIM. Monitor bounce rates. Allow in-app fallback if email fails.

### Risk 4 — Cron reliability
**Mitigation:** Vercel Cron is reliable but log all runs. Manual trigger endpoint for on-call. Idempotency prevents duplicate sends.

### Risk 5 — Migration breaking existing data
**Mitigation:** Test on staging first. Rollback plan ready. Migration is additive (new tables) — old code paths still work during transition.

### Risk 6 — LLM cost explosion
**Mitigation:** Template library covers 70%+ of queries. RAG covers another 20%. Per-user rate limit caps abuse. Monitor cost per org weekly.

### Risk 7 — Type misclassification at scale
**Mitigation:** Confirm step never skipped. "Change type" flow recovers cleanly. Track misclassification rate as KPI.

### Risk 8 — Conversation context drift
**Mitigation:** Last 3 turns only. No long context accumulation. User can always start fresh.

### Risk 9 — Pulse fatigue
**Mitigation:** Quiet days = no email. Per-category snooze. Weekly default cadence. Founder-friendly tone (terse, action-focused).

### Risk 10 — Build runs over 6 weeks
**Mitigation:** Each day has explicit acceptance criteria. If a day slips, decide: defer to v2 or extend by 1-2 days. Hard cap: 8 weeks for v1.

---

## Open Questions for Future Discussion

These are NOT v1 blockers but should be discussed before v2:

1. **WhatsApp Business API approval timeline** — Meta approval can take 2-4 weeks. Start early.
2. **Multi-currency support** — All Indian SME = INR, but enterprise customers may need multi-currency. v3 scope?
3. **Multi-user workspace permissions** — Today admin/user roles are coarse. Need finer-grained per-document permissions?
4. **CA / accountant external access** — Should CAs have read-only access without seeing PII?
5. **Voice for Hindi queries** — Speech recognition quality varies by language. Acceptable accuracy for Hinglish?
6. **Pulse for live ERPs** — When Tally/Zoho live connections come, pulse becomes change-driven. Schema needs forward compatibility.
7. **Data residency for enterprise** — Some enterprises may require strict India-only LLM hosting. Self-hosted Llama option?

---

## Appendix A — Files Touched Summary

### New files (v1):
- `packages/db/prisma/migrations/*/migration.sql`
- `packages/document-types/**`
- `packages/pulse-engine/**`
- `apps/web/src/app/api/v1/connections/[connectionId]/chat/route.ts`
- `apps/web/src/app/api/v1/connections/[connectionId]/pulse-subscription/route.ts`
- `apps/web/src/app/api/v1/cron/pulse/route.ts`
- `apps/web/src/app/api/v1/query-feedback/route.ts`
- `apps/web/src/app/(dashboard)/connections/[id]/chat/page.tsx`
- `apps/web/src/app/(dashboard)/connections/[id]/pulse/page.tsx`
- `apps/web/src/app/(dashboard)/connections/[id]/pulse/settings/page.tsx`
- `apps/web/src/components/connections/gl-chat.tsx`
- `apps/web/src/components/connections/document-type-confirm.tsx`
- `apps/web/src/components/connections/query-summary-card.tsx`
- `apps/web/src/components/connections/suggested-questions.tsx`
- `apps/web/src/components/connections/text-bar-chart.tsx`
- `apps/web/src/components/connections/pulse-view.tsx`
- `apps/web/src/components/connections/pulse-history.tsx`
- `apps/web/src/components/connections/pulse-settings-form.tsx`
- `apps/web/src/lib/pulse-email/template.tsx`
- `apps/web/src/lib/pulse-email/send.ts`
- `apps/web/src/lib/rate-limit.ts`
- `apps/web/src/lib/parse-db-error.ts`
- `vercel.json` (or update existing)

### Modified files (v1):
- `packages/db/prisma/schema.prisma`
- `packages/tokeniser/src/index.ts` (type-aware refactor)
- `packages/query-engine/src/execute-query.ts` (dateContext + conversationContext)
- `packages/query-engine/src/prompt-builder.ts` (inject contexts)
- `apps/web/next.config.js` (transpile new packages)
- `apps/web/src/app/api/v1/query/route.ts` (guardrails)
- `apps/web/src/app/(dashboard)/connections/[id]/page.tsx` (add Chat + Pulse links)
- `apps/web/src/app/(dashboard)/connections/[id]/data/page.tsx` (pass GL dates)
- `apps/web/src/components/connections/gl-lister.tsx` (persist scan to DB)
- `apps/web/src/components/connections/upload-form.tsx` (type detection)
- `apps/web/src/app/api/v1/upload/route.ts` (call detect)
- `CLAUDE.md`
- `README.md`

---

## Appendix B — KPIs to Track Post-Launch

**Engagement:**
- Daily active chat users
- Avg questions per user per week
- Pulse email open rate
- Pulse email click-through rate (links)
- Time spent on chat page

**Quality:**
- % chat queries answered without LLM (template + RAG hit rate)
- % chat queries with thumbs-up feedback
- % chat queries with thumbs-down
- Avg confidence score
- Misclassification rate (user overrides at upload)

**Cost:**
- AI cost per org per month
- Pulse email delivery cost
- Cron execution cost

**Business:**
- New user activation (uploaded + asked first question)
- Day-7 retention
- Day-30 retention
- NPS post-pulse delivery

---

## Status Log

| Date | Phase | Status | Notes |
|---|---|---|---|
| 2026-05-31 | Planning | Complete | Plan v1.0 created and frozen |
| 2026-05-31 | Phase 1.A Day 1 | Complete | Prisma schema: DocumentType/UploadDataIntent/PulseCadence enums, WorkspaceDocument, PulseSubscription, PulseDigest, PulseAlert models, feedback field on QueryLog |
| 2026-05-31 | Phase 1.A Day 2 | Complete | document-types package created: types.ts, definitions (gl/tds-26q/gstr-1/gstr-3b/itr), registry.ts, index.ts |
| 2026-05-31 | Phase 1.A Day 3 | Complete | detect.ts (scoring algorithm, isAmbiguous), extract-period.ts (FY patterns, date column scan), safe migration SQL |
| 2026-05-31 | Phase 1.A Day 4 | Complete | Upload wizard: DocTypeCard UI card with type override/period/intent toggle. confirm-upload route stores documentType, dataIntent, userConfirmedType, periodStart, periodEnd |
| 2026-05-31 | Phase 1.A Day 5 | Complete | Backfill script: packages/db/scripts/backfill-document-types.ts — sets detectedType=GL, detectedConfidence=1.0 on pre-existing rows |
| 2026-05-31 | Phase 1.B Days 6-7 | Complete | PrismaRagStore: connection-scoped, two-pass, TTL 6mo, quality gate 0.7, rowCount>0 filter, thumbs_down exclusion, {{GL_TABLE}} abstraction, rate-limit.ts (20/hr sliding window) |
| 2026-05-31 | Phase 1.B Day 8 | Complete | TokenisationConfig: added documentType field (TokenisableDocumentType) — type-aware stub, no GL regression |
| 2026-05-31 | Phase 1.C Days 9-12 | Complete | Chat API route: /api/v1/connections/[connectionId]/chat — auth, GL-type guard, rate limit, date context (Indian FY/quarter), follow-up detection, server-side answer sentence, {{GL_TABLE}} abstraction, QueryLog persist |
| 2026-05-31 | Phase 1.D Days 13-17 | Complete | GlChat component (multi-stage loading, source badges, text-bar chart, thumbs feedback, clarification chips, freshness badge, click-row), query-feedback API, chat page, "Ask AI" button on connection detail |
| 2026-05-31 | Phase 1.E Days 18-22 | Complete | pulse-engine package (types, compliance-calendar, snapshot, tds-calculator), email template (template.ts, send.ts, variant support), cron route /api/v1/cron/pulse (idempotency, cadence, quiet-day suppression), vercel.json (2:30 AM UTC), pulse-subscription CRUD API |
| 2026-05-31 | Phase 1.F Days 23-25 | Complete | Pulse page (/connections/[id]/pulse), PulseDigestView component (per-alert snooze, snapshot), PulseSettingsForm (cadence/email/in-app toggles, per-category mute), settings page, "Daily Pulse" button on connection detail, welcome/historical/quiet-day email variants |
| - | Phase 1.G | Not started | - |

---

**Document version:** 1.0
**Last updated:** 2026-05-31
**Next review:** After Phase 1.A completion
