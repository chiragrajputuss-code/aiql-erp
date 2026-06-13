# Document Types — How It Works & How to Add a New Type

## Overview

Every uploaded file in AIQL gets classified into a **document type** before it enters the query pipeline. Classification is deterministic — LLM is never involved in the final decision.

```
File uploaded
     │
     ▼
┌────────────────────────────────────────┐
│  Heuristic scorer (packages/document-types) │
│  • Column name pattern matching        │
│  • Header keyword scoring             │
│  • Row value sampling                 │
│  • Returns: type + confidence (0–1)   │
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│  User confirmation UI (upload wizard)  │
│  • Shows detected type + confidence    │
│  • User can override before confirming │
│  • LLM has NO role here               │
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│  Stored on UploadedFile model          │
│  • documentType (confirmed)            │
│  • detectedType (raw detection)        │
│  • detectedConfidence                  │
│  • userConfirmedType (boolean)         │
│  • dataIntent (CURRENT_OPERATIONAL /   │
│    HISTORICAL)                         │
│  • periodStart / periodEnd             │
└────────────────────────────────────────┘
```

## Supported Types

| Type | Enum | Description |
|------|------|-------------|
| General Ledger | `GL` | Transaction-level accounting data |
| Form 26Q | `TDS_RETURN_26Q` | TDS quarterly return |
| GSTR-1 | `GSTR_1` | Outward supplies return |
| GSTR-3B | `GSTR_3B` | Summary GST return |
| ITR | `ITR` | Income tax return |
| Other | `OTHER` | Unclassified |

## Package: `@aiql/document-types`

**Location:** `packages/document-types/src/`

```
src/
  types.ts          — DocumentType, DocumentTypeDefinition interfaces
  definitions/
    gl.ts           — GL column patterns, keyword scores
    tds-26q.ts      — Form 26Q patterns
    gstr-1.ts       — GSTR-1 patterns
    gstr-3b.ts      — GSTR-3B patterns
    itr.ts          — ITR patterns
  registry.ts       — All definitions indexed by type
  detect.ts         — Scoring algorithm + isAmbiguous()
  extract-period.ts — FY period extraction from date columns
  index.ts          — Public exports
```

## How detection works (`detect.ts`)

1. **Column name matching** — each definition has `columnPatterns[]`. Each column header is lowercased and checked against patterns. Match → score += pattern weight.
2. **Header keyword matching** — first row of data is scanned for document-specific keywords.
3. **Row value sampling** — up to 50 rows sampled; value patterns (e.g. BSR codes for 26Q, GSTIN formats for GSTR) add score.
4. **Winner** — type with highest score wins. If `score < 0.4`, returns `OTHER`.
5. **Ambiguity** — `isAmbiguous()` returns true if top-2 scores are within 0.15 of each other → UI shows explicit warning.

## How to add a new document type

### Step 1 — Add the enum value

In `packages/db/prisma/schema.prisma`, add to the `DocumentType` enum:
```prisma
enum DocumentType {
  GL
  TDS_RETURN_26Q
  GSTR_1
  GSTR_3B
  ITR
  YOUR_NEW_TYPE   // ← add here
  OTHER
}
```

Run `pnpm --filter @aiql/db db:generate` (or `prisma generate`).

**Do not use `prisma db push` on RDS** — it will drop upload tables. Write a migration:
```sql
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'YOUR_NEW_TYPE';
```

### Step 2 — Create the definition file

`packages/document-types/src/definitions/your-type.ts`:

```typescript
import type { DocumentTypeDefinition } from "../types";

export const yourTypeDefinition: DocumentTypeDefinition = {
  type:        "YOUR_NEW_TYPE",
  displayName: "Your Type Name",
  description: "What this document is",

  // Column headers that strongly indicate this type
  columnPatterns: [
    { pattern: /receipt_no/i,        weight: 0.4 },
    { pattern: /assessment_year/i,   weight: 0.3 },
  ],

  // Keywords in the first row
  headerKeywords: ["assessment year", "form type"],

  // Value patterns to sample from rows
  valueSamplers: [
    {
      column:  /pan/i,
      pattern: /^[A-Z]{5}[0-9]{4}[A-Z]$/,  // PAN format
      weight:  0.2,
    },
  ],
};
```

### Step 3 — Register it

In `packages/document-types/src/registry.ts`:
```typescript
import { yourTypeDefinition } from "./definitions/your-type";

export const DOCUMENT_TYPE_REGISTRY = {
  // ... existing
  YOUR_NEW_TYPE: yourTypeDefinition,
};
```

### Step 4 — Add to the UI dropdown

In `apps/web/src/app/(dashboard)/connections/new/page.tsx`, add to `DOC_TYPES`:
```typescript
const DOC_TYPES = [
  // ... existing
  { value: "YOUR_NEW_TYPE", label: "Your Type Name", icon: "📄" },
] as const;
```

### Step 5 — Handle in the query pipeline

If this type needs different tokenisation behaviour, update `packages/tokeniser/src/types.ts`:
```typescript
export type TokenisableDocumentType = "GL" | "TDS_RETURN_26Q" | "GSTR_1" | "GSTR_3B" | "ITR" | "YOUR_NEW_TYPE";
```

Then add a case to the tokeniser config builder in `packages/tokeniser/src/index.ts`.

### Step 6 — Pulse alerts

If this type triggers specific compliance alerts, add a generator in `packages/pulse-engine/src/compliance-calendar.ts`. Add the category to `AlertCategory` in `packages/pulse-engine/src/types.ts` and to the mute list in `apps/web/src/components/connections/pulse-settings-form.tsx`.

## Guards and invariants

- **Never** use LLM to make the final classification decision
- **Always** require user confirmation before storing `documentType`
- `userConfirmedType = false` means auto-detected but not confirmed — treat as tentative
- The query pipeline checks `documentType === "GL"` before running SQL generation; other types fall through to document-specific handlers
- `dataIntent` (CURRENT_OPERATIONAL vs HISTORICAL) is independent of type — a GL can be historical
