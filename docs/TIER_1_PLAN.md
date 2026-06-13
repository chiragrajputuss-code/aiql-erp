# Tier 1 Development Plan

**Goal:** A production-ready AI query product for Indian SMEs, CSV/Excel upload only, with one killer workflow (Cash Dashboard).
**Team:** Solo developer
**Timeline:** 6 weeks of development + 1 week polish/deploy = **7 weeks total**
**Definition of Done:** Deployed, tested with real sample data, ready to onboard first 5 users.

---

## Scope

### In Scope
- CSV / Excel upload with intelligent column mapping
- Column mapping registry (learns per-org, pre-fills future uploads)
- Query Studio with 50 financial templates
- 3-layer query pipeline: Template → RAG → LLM (already architected)
- Query history + re-run
- Cash Dashboard (pinned queries + scheduled daily snapshot)
- Freemium tier with abuse prevention (email OTP + rate limits)
- Production deployment

### Deferred to Tier 1.5 (post first paying customer)
- Zoho Books connector
- Tally connector
- Payment Reminders workflow
- Razorpay payment integration
- WhatsApp notifications
- Scheduled email reports (just dashboard in Tier 1)

### Out of Scope (Tier 2+)
- Close Engine
- Reconciliation Engine
- Multi-company consolidation
- Advanced analytics / forecasting
- Mobile app

---

## Current State (from audit)

| Component | Status |
|-----------|--------|
| File upload + parsing | ✅ DONE |
| Canonical schema (24 fields) | ✅ DONE — good enough |
| Column mapping UI (review/edit) | ✅ DONE |
| Column mapping **persistence** across uploads | ❌ MISSING |
| Template library (5/50) | ⚠️ PARTIAL |
| Query pipeline (template→RAG→LLM) | ✅ DONE (RAG just added) |
| Query Studio UI | ✅ DONE |
| Query history page | ❌ MISSING |
| Cash Dashboard | ❌ MISSING |
| Saved/scheduled queries | ❌ MISSING |
| Abuse prevention (OTP, rate limits) | ❌ MISSING |
| Dashboard with real data | ⚠️ PARTIAL (hardcoded empty states) |
| Production deployment | ❌ NOT STARTED |

**The good news:** Core plumbing is done. Tier 1 is mostly about filling gaps + polish.

---

## Architecture Decisions (Locked)

1. **CSV/Excel only.** No ERP connectors in Tier 1.
2. **Query pipeline:** Template (free, instant) → RAG text similarity (free) → LLM (Groq default, Claude fallback). RAG stored as text similarity on QueryLog for now — vector embeddings in Tier 2.
3. **Canonical schema:** 24 fields covers Indian GL well. Expand only if templates need it.
4. **Column mapping registry:** New model `OrgColumnMapping` — stores per-org mapping choices, pre-fills next upload.
5. **Cash Dashboard:** Static set of pinned queries (cash, AR/AP outstanding, top vendors/customers, monthly summary). No user-customisable dashboards in Tier 1.
6. **Freemium:** 50 queries + 5 documents per org, free forever. Paid tier (₹1,499/mo) = unlimited. Abuse prevention via email OTP + IP rate limits. **No phone OTP in Tier 1** — MSG91 costs and integration not worth it for 5 beta users. Add in Tier 1.5.
7. **Deployment:** Vercel (web) + existing AWS RDS (database). Custom domain via Cloudflare.
8. **No analytics/tracking in Tier 1** except server-side query counts. Posthog/Mixpanel in Tier 1.5.

---

## Week-By-Week Plan

### Week 1 — Mapping Persistence + Templates Foundation

**Goal:** Column mappings stick across uploads. Start template expansion.

**Day 1 (Mon)**
- [ ] Add `OrgColumnMapping` Prisma model (orgId, sourceColumnName, canonicalField, confirmedAt)
- [ ] Run migration
- [ ] Write `upsertOrgMapping()` helper

**Day 2 (Tue)**
- [ ] Modify `/api/internal/connections/confirm-upload` to save each confirmed mapping per org
- [ ] Modify file upload detection to check `OrgColumnMapping` first, fall back to `mapColumn()`
- [ ] Test: upload same file twice → second time should auto-fill from prior mappings

**Day 3 (Wed)**
- [ ] Add 8 Tier 1 templates to `template-matcher.ts`:
  - `cash-balance`
  - `overdue-debtors-30-60-90`
  - `gst-summary`
  - `vendor-ledger`
  - `customer-ledger`
  - `purchase-register`
  - `sales-register`
  - `payroll-summary`

**Day 4 (Thu)**
- [ ] Add 7 more templates:
  - `profit-loss-summary`
  - `balance-sheet-snapshot`
  - `expense-by-voucher-type`
  - `tds-summary`
  - `bank-reconciliation`
  - `advance-payments-outstanding`
  - `top-customers`

**Day 5 (Fri)**
- [ ] Add 10 more templates (focus: date-range + cost-centre variants):
  - `sales-last-quarter`, `expenses-last-quarter`, `cash-flow-monthly`
  - `cost-centre-revenue`, `cost-centre-expenses`
  - `yoy-comparison-monthly`
  - `gst-input-vs-output`
  - `creditors-top-10`, `debtors-top-10`
  - `zero-balance-accounts`

**Week 1 total: 25 new templates (5 + 25 = 30 live templates)**

---

### Week 2 — Template Library Completion + Query History

**Goal:** 50 templates live. Query history page working.

**Day 6-7 (Mon-Tue)**
- [ ] Add final 20 templates covering Indian finance edge cases:
  - Journal entries, contra entries, provisions, write-offs
  - Multi-currency: conversion summary, unrealized gains/losses
  - Ratio queries: current ratio, debt-equity, working capital
  - Budget variance, forecast vs actual
  - Fixed asset summary, depreciation schedule
- [ ] Write unit tests for all 50 templates (pattern matching + SQL generation)

**Day 8 (Wed)**
- [x] Create `/api/v1/queries` GET endpoint — list recent QueryLogs for org
- [x] Filters: status (completed/failed), date range, verdict

**Day 9-10 (Thu-Fri)**
- [x] Build Query History page `/history`
- [x] Show: question, status badge, date, provider (template/rag/llm), cost
- [x] Click row → opens Query Studio with that question pre-filled
- [x] "Re-run" button → re-executes with latest data
- [x] Pagination (20 per page)

---

### Week 3 — Cash Dashboard

**Goal:** The retention feature. Auto-generated dashboard showing key numbers.

**Day 11 (Mon)**
- [x] Add `PinnedQuery` Prisma model (orgId, connectionId, templateId, position, createdAt)
- [x] Seed 6 default pinned queries per connection on creation:
  - Cash & Bank Balance
  - Outstanding Receivables (Top 10)
  - Outstanding Payables (Top 10)
  - Monthly Revenue Trend (last 6 months)
  - Top Expenses This Month
  - Cost Centre Summary

**Day 12-13 (Tue-Wed)**
- [x] Build Cash Dashboard page `/dashboard` (replacing current stub)
- [x] Grid of 6 cards, each runs its pinned query on page load
- [x] Each card: title, single key number, sparkline (if time series), "View details" → Query Studio
- [x] Auto-refresh every page load (for now, no cron yet)

**Day 14 (Thu)**
- [x] Empty state when no connection: "Upload a file to see your dashboard"
- [x] Loading skeleton per card
- [x] Error state per card (one card fails doesn't break others)

**Day 15 (Fri)**
- [x] Polish: colors, spacing, typography. This is the page owners will see first — needs to look professional.
- [x] Mobile responsive (dashboard viewed on phones a lot)

---

### Week 4 — Abuse Prevention + Query Limits + Onboarding

**Goal:** Safe freemium. Clean first-time experience.

**Day 16 (Mon)**
- [ ] Email OTP verification on signup (use existing Gmail/nodemailer)
- [ ] `EmailOtp` Prisma model (email, code, expiresAt, consumed)
- [ ] Block login until email verified

**Day 17 (Tue)**
- [ ] IP-based rate limit on signup (max 3 signups per IP per day)
- [ ] Use Upstash Redis free tier or simple in-memory with Redis later
- [ ] Add Cloudflare Turnstile on signup form (free, invisible)

**Day 18 (Wed)**
- [ ] Enforce query limit: check `org.queriesUsed < org.queryLimit` in `/api/v1/query`
- [ ] Show remaining queries in UI header
- [ ] Block at 50 queries for free tier + show upgrade CTA
- [ ] Monthly reset via Vercel cron (1st of month)

**Day 19 (Thu)**
- [ ] Document upload limit: max 5 active connections per org on free tier
- [ ] Show upload count in Connections page

**Day 20 (Fri)**
- [ ] Onboarding flow for new signups:
  - Step 1: Welcome screen
  - Step 2: Upload first CSV (with AIQL_GL_Sample.csv as option to try first)
  - Step 3: Column mapping walkthrough with tooltips
  - Step 4: Dashboard unlocked + "Try a query" prompt
- [ ] Track completion via `User.onboardingComplete` (field already exists)

---

### Week 5 — LLM Quality + Error Handling + Polish

**Goal:** Query engine accuracy. Good error messages. Mobile polish.

**Day 21 (Mon)**
- [ ] Execution feedback loop: if SQL fails DB execution, retry once with error context
- [ ] Cap retries at 1 to control cost
- [ ] Test against deliberately tricky queries

**Day 22 (Tue)**
- [ ] Result shape validation:
  - Expected 1 row, got 10000 → warn
  - Expected number, got nulls → retry
  - Expected table, got 0 rows → different error ("no data matches")

**Day 23 (Wed)**
- [ ] Improve clarification flow: when verdict = `needs_clarification`, show 3 suggested rephrasings based on closest template patterns
- [ ] "Did you mean: AP aging? Overdue payables? Vendor balance?"
- [ ] Click → re-runs with new question

**Day 24 (Thu)**
- [ ] Tokenisation audit — make sure token map never persists (memory only during request)
- [ ] Add telemetry: log when token map is created/destroyed, verify in test

**Day 25 (Fri)**
- [ ] Mobile responsive pass across all pages (Query Studio, Dashboard, Upload, History, Connections)
- [ ] Test on actual iPhone Safari + Chrome Android

---

### Week 6 — Production Polish + Landing Page

**Goal:** Deploy-ready product. Public-facing landing page.

**Day 26 (Mon)**
- [ ] Landing page `/` (public, no auth):
  - Hero: "Ask your financial data anything"
  - 1-minute demo video (you record screen using AIQL_GL_Sample.csv)
  - 3 feature sections: Upload → Ask → Dashboard
  - Pricing: Free (50 queries) / Pro (₹1,499/mo unlimited)
  - "Request early access" → email capture form
- [ ] Separate this from `(dashboard)` route group

**Day 27 (Tue)**
- [ ] Privacy policy page `/privacy` (required for email collection, Razorpay later)
- [ ] Terms of service page `/terms`
- [ ] Both can use standard templates — just accurate, not beautiful

**Day 28 (Wed)**
- [ ] Error monitoring: Sentry free tier
- [ ] Log aggregation: Vercel built-in logs OK for now
- [ ] Health check endpoint `/api/health`

**Day 29 (Thu)**
- [ ] Backup strategy: ensure RDS automated snapshots enabled (daily)
- [ ] Environment setup: separate `.env.production` with all required keys
- [ ] Secrets checklist:
  - DATABASE_URL (production)
  - GROQ_API_KEY, ANTHROPIC_API_KEY
  - GMAIL credentials for OTP
  - CREDENTIAL_ENCRYPTION_KEY (generate real one)

**Day 30 (Fri)**
- [ ] Final QA pass end-to-end with AIQL_GL_Sample.csv:
  - Signup → OTP → login → upload → map → dashboard → query → history → re-run
- [ ] Fix bugs found
- [ ] Write `README.md` for your future self

---

### Week 7 — Deploy + Smoke Test + First User Prep

**Day 31 (Mon)**
- [ ] Deploy to Vercel (connect GitHub repo)
- [ ] Point custom domain (aiql.in or similar)
- [ ] SSL via Cloudflare

**Day 32 (Tue)**
- [ ] Production smoke test: full signup to query flow on live URL
- [ ] Performance check: first query should complete < 5s
- [ ] Load test: ~10 concurrent queries without falling over (use hey or k6)

**Day 33 (Wed)**
- [ ] Create 2-3 ready-to-share demo accounts with pre-uploaded data
- [ ] Screenshots for eventual marketing (don't need marketing now, but capture these while product looks fresh)

**Day 34 (Thu)**
- [ ] Final production tweaks based on smoke test
- [ ] Write a 1-page "how to use AIQL" guide (internal, for when you onboard first user)

**Day 35 (Fri)**
- [ ] 🚀 **LAUNCH READINESS COMPLETE**
- [ ] Take the weekend off. Seriously.

---

## Development Markdown (Technical Details)

### New Prisma Models Needed

```prisma
model OrgColumnMapping {
  id               String   @id @default(cuid())
  orgId            String
  sourceColumnName String   // e.g. "Dr Amt"
  canonicalField   String   // e.g. "debit_amount"
  confirmedAt      DateTime @default(now())
  org              Organisation @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([orgId, sourceColumnName])
  @@map("org_column_mappings")
}

model PinnedQuery {
  id           String   @id @default(cuid())
  orgId        String
  connectionId String
  templateId   String   // references a template id
  title        String
  position     Int      @default(0)
  createdAt    DateTime @default(now())
  org          Organisation  @relation(fields: [orgId], references: [id], onDelete: Cascade)
  connection   ErpConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)

  @@map("pinned_queries")
}

model EmailOtp {
  id        String   @id @default(cuid())
  email     String
  code      String   // 6 digit
  expiresAt DateTime
  consumed  Boolean  @default(false)
  createdAt DateTime @default(now())

  @@index([email, code])
  @@map("email_otps")
}
```

### API Routes to Add

- `GET  /api/v1/queries` — list query history (pagination, filters)
- `POST /api/v1/queries/:id/rerun` — re-execute past query
- `GET  /api/v1/dashboard` — run all pinned queries for a connection
- `POST /api/v1/dashboard/pin` — pin a query to dashboard
- `POST /api/auth/otp/send` — email OTP on signup
- `POST /api/auth/otp/verify` — verify code + complete signup
- `GET  /api/health` — for uptime monitoring

### Pages to Add/Modify

| Path | Status | Action |
|------|--------|--------|
| `/` | MISSING | Build landing page |
| `/signup` | EXISTS | Add OTP step + Turnstile |
| `/dashboard` | STUB | Replace with real Cash Dashboard |
| `/history` | MISSING | Build Query History page |
| `/query` | DONE | Polish only |
| `/connections` | DONE | Polish only |
| `/privacy` | MISSING | Standard template |
| `/terms` | MISSING | Standard template |

### Template Naming Convention

All 50 templates follow the pattern:
```
<category>-<metric>-<optional-grouping>

Examples:
ap-aging          → payables outstanding by vendor
ar-aging-30-60-90 → receivables bucketed by age
sales-last-quarter → sales grouped by week
top-vendors-spend → top 10 by SUM(debit_amount)
```

Each template defined as:
```typescript
{
  id: "cash-balance",
  patterns: [/\bcash\s+balance\b/i, /\bcash\s+(and|&)\s+bank\b/i, /\bbank\s+balance\b/i],
  buildSql: (tableName, cols) => { /* ... */ },
  requiredFields: ["account_name", "debit_amount", "credit_amount"],
  description: "Current cash and bank account balances",
}
```

### Freemium Limits

```typescript
const FREE_TIER_LIMITS = {
  queriesPerMonth: 50,
  activeConnections: 5,
  documentSizeMb: 50,
  queryHistoryDays: 30,
};

const PAID_TIER = {
  price: 1499, // INR / month
  queriesPerMonth: Infinity,
  activeConnections: 20,
  documentSizeMb: 200,
  queryHistoryDays: 365,
};
```

### Cost Projection (per free-tier user per month)

Assume 50 queries/month, distribution: 70% template, 20% RAG, 10% LLM.
- Templates: 35 queries × ₹0 = ₹0
- RAG (text similarity, no embeddings): 10 queries × ₹0 = ₹0
- LLM: 5 queries × avg ₹0.5 (Groq free / Haiku) = ₹2.5

**Cost per free user: ~₹2.5/month. Essentially free.**
Paid user at 500 queries: ~₹25/month cost, ₹1,474 margin. 98% gross margin.

---

## Acceptance Criteria (Definition of Done for Tier 1)

A user can:
- [x] Visit landing page, sign up with email + OTP
- [x] Upload a CSV/Excel file (tested with AIQL_GL_Sample.csv)
- [x] Review auto-detected column mappings, fix any wrong ones, confirm
- [x] See a populated Cash Dashboard within 5 seconds of upload
- [x] Ask a natural-language question in English or Hinglish
- [x] Get accurate SQL + results in under 5 seconds
- [x] See confidence badge and tokenisation audit
- [x] Re-run any past query from history
- [x] Upload a second file — mapping pre-fills from first upload
- [x] See "X of 50 queries used" in header
- [x] Hit 50-query limit, see upgrade CTA (even if Razorpay isn't wired yet)

Product metrics on launch:
- [ ] First query completes in under 5s for 95% of requests
- [ ] Zero crashes on the AIQL_GL_Sample.csv demo data
- [ ] Template hit rate ≥ 60% (measure via QueryLog `layer` field)
- [ ] LLM cost per completed query < ₹1 on average

---

## User Research Commitment (Non-Negotiable)

During Week 4 (while building abuse prevention), spend **2 hours total** to do:
- 3 × 20-min calls with real D2C / small business founders
- Show them Query Studio (not full product yet)
- Ask: "What reports do you pull weekly?", "Would this save you time?", "What's missing?"
- Adjust Week 5 polish priorities based on what they say

You do not need to sell anything. Just watch their face when they see a question turn into data. That tells you everything.

---

## What Happens After Tier 1

**Week 8-10 (Tier 1.5):**
- Onboard first 3-5 users (manual outreach, personal network)
- Collect usage data, fix top 5 complaints
- Build Razorpay integration
- Build Payment Reminders workflow
- Close first paying customer

**Week 11-14 (Tier 2):**
- Zoho Books connector
- Scheduled email reports
- Multi-user per org (team invites)

**Week 15+ (Tier 3):**
- Tally connector (once you have Windows access)
- Close Engine
- Advanced features based on customer feedback
