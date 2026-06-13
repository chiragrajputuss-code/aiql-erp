# Pulse Engine — How Compliance Rules Work

## What is Pulse?

The Daily Pulse is a proactive digest that surfaces compliance deadlines, TDS liability gaps, and financial snapshot numbers to the founder/CFO every morning at 8 AM IST. It runs as a Vercel Cron job and sends email + in-app notifications.

## Architecture

```
Vercel Cron (2:30 AM UTC = 8 AM IST)
     │
     ▼
/api/v1/cron/pulse
     │
     ├── For each active PulseSubscription:
     │   ├── Idempotency check (already ran today?)
     │   ├── Cadence gate (WEEKLY only on Mondays)
     │   ├── generateComplianceAlerts()   ← compliance-calendar.ts
     │   ├── computeTdsAlerts()           ← tds-calculator.ts
     │   ├── computeSnapshotFromRows()    ← snapshot.ts
     │   ├── Persist PulseDigest + PulseAlert rows
     │   └── sendPulseEmail() if emailEnabled && !quietDay
     │
     └── Return { processed, failures, summary }
```

## Package: `@aiql/pulse-engine`

**Location:** `packages/pulse-engine/src/`

| File | Exports | Purpose |
|------|---------|---------|
| `types.ts` | `AlertSeverity`, `AlertCategory`, `PulseAlertPayload`, `WorkspaceContext`, `FinancialSnapshot` | Core types |
| `compliance-calendar.ts` | `generateComplianceAlerts(today, ctx)` | Deadline-driven alerts |
| `tds-calculator.ts` | `computeTdsAlerts(rows, connectionId, today)` | Vendor payment TDS gap detection |
| `snapshot.ts` | `computeSnapshotFromRows(rows)`, `formatINR(n)` | Financial snapshot computation |

## Compliance Calendar Rules

All dates follow the Indian fiscal year (Apr–Mar). Alerts fire within a lead+grace window around each due date.

| Rule | Due Date | Lead | Grace | Severity |
|------|----------|------|-------|----------|
| TDS deposit | 7th of each month | 6 days | 2 days | critical if overdue, review if upcoming |
| GSTR-1 | 10th of each month | 2 days | 1 day | critical if overdue |
| GSTR-3B | 20th of each month | 2 days | 1 day | critical if overdue |
| Advance Tax Q1 | 15 Jun | 7 days | 2 days | review |
| Advance Tax Q2 | 15 Sep | 7 days | 2 days | review |
| Advance Tax Q3 | 15 Dec | 7 days | 2 days | review |
| Advance Tax Q4 | 15 Mar (next calendar year if in Apr–Dec) | 7 days | 2 days | review |
| ITR | 31 Jul | 14 days | 3 days | critical if overdue |

### Alert window formula

```typescript
function isInAlertWindow(dueDate, today, leadDays, graceDays): boolean {
  const daysBefore = Math.ceil((dueDate - today) / 86400000);
  const daysAfter  = Math.floor((today - dueDate) / 86400000);
  return daysBefore <= leadDays && daysAfter <= graceDays;
}
```

### Guards that suppress compliance alerts

1. `ctx.dataIntent === "HISTORICAL"` → skip all deadline alerts (past data, not operational)
2. GL data stale >90 days → skip (data is too old to be relevant)
3. `ctx.snoozedCategories` includes the category → skip

### Advance tax year calculation (important)

The March advance tax instalment is the last instalment of the Indian fiscal year. If we're in April–December (i.e., the new fiscal year has started), March falls in the **next** calendar year:

```typescript
const instYear = inst.month === 2 && month >= 3 ? year + 1 : year;
```

Example: Today = 1 May 2026 (FY27). March 15 instalment → 15 March 2027.

## TDS Calculator (`tds-calculator.ts`)

Detects vendor payments above ₹30,000 in the current month that have no TDS recorded. Uses category `"tds_calculator"` (distinct from `"tds_deadline"` which is the monthly deposit reminder).

**Algorithm:**
1. Group payment rows by vendor (`vendor_name` / `party_name` / `account_name`)
2. For each vendor: sum `net_amount` / `debit_amount` / `credit_amount`
3. Flag vendors where `totalPaid >= 30,000` AND `tds_amount == 0`
4. Estimate 2% TDS (Section 194C rate for companies) as indicative amount
5. Return one alert with list of up to 3 vendor names + count

**Important:** This is an indicator, not a legal determination. The alert says "may be pending" — it uses the heuristic 194C rate. Actual liability depends on vendor type, Section, and exemption certificates.

## Financial Snapshot (`snapshot.ts`)

Reads all GL rows and pattern-matches account names to classify balances:

| Category | Match patterns |
|----------|----------------|
| Cash & Bank | `cash`, `bank`, `current account`, `savings` |
| Receivables | `receivable`, `debtor`, `trade receivable`, `accounts receivable` |
| Payables | `payable`, `creditor`, `trade payable`, `accounts payable` |

Sums debit and credit for each category and returns the net balance.

## Email variants

| Variant | Trigger | Subject | Greeting |
|---------|---------|---------|---------|
| `welcome` | File uploaded within last 24h | "Welcome to AIQL Pulse · GL snapshot ready" | "Your GL data is loaded…" |
| `historical` | `dataIntent === "HISTORICAL"` | "AIQL · Open issues from your historical books" | "Here are the open issues…" |
| `standard` | Everything else | "🚨 AIQL Pulse · N things to do · Date" | Count of items |

**Quiet day suppression:** If no alerts AND no snapshot, the email is NOT sent. The in-app digest is still created and shows "All clear".

## How to add a new compliance rule

1. Add the category to `AlertCategory` in `packages/pulse-engine/src/types.ts`
2. Add the alert-generating logic to `compliance-calendar.ts` or create a new calculator file
3. Export the new function from `packages/pulse-engine/src/index.ts`
4. Call it in the cron route: `apps/web/src/app/api/v1/cron/pulse/route.ts`
5. Add to the mute list in `apps/web/src/components/connections/pulse-settings-form.tsx`

## How to add a new alert category to the mute list

In `pulse-settings-form.tsx`:
```typescript
const CATEGORIES = [
  // ... existing
  { key: "your_category", label: "Your Alert Name", desc: "When it fires" },
] as const;
```

The key must exactly match the `AlertCategory` string used in `PulseAlertPayload.category`.

## Subscription model

Each workspace has one `PulseSubscription`:
- `cadence`: `DAILY` | `WEEKLY` | `OFF`
- `emailEnabled`: send email digest
- `inAppEnabled`: show in Pulse page (always shown when in-app, regardless of email)
- `snoozedCategories`: array of category strings permanently muted
- `isActive`: master kill switch

The cron reads all active subscriptions where `cadence != OFF`.

## Database models

```
PulseSubscription (one per connection/workspace)
  └─ PulseDigest (one per cron run)
       └─ PulseAlert (one per triggered rule in that run)
```

`PulseDigest.digestJson` stores the full serialized payload (alerts + snapshot) for in-app rendering without re-querying the GL table.
