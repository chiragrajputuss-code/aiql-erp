# AIQL End-to-End Validation Report

> Real ingestion, real scanner, real task generator. Run against production DB schema.
> Generated: 2026-05-16T06:25:12.416Z

## Headline

| Metric | Value |
|---|---|
| Companies tested | 10 |
| Pipeline successful end-to-end | **10/10** |
| Total rows ingested | 27,490 |
| Total anomalies surfaced | **45** |
| Total ₹ exposure flagged | **₹4,91,28,905** |

## Per-company summary

| Company | Rows | Cols mapped | Scan | Issues | Exposure | Std tasks | Adapt tasks | Party | Recons OK |
|---|--:|--:|---|--:|--:|--:|--:|--:|---|
| apollo_diag | 2542 | 8/8 | ✓ | 3 | ₹3,850 | 12 | 12 | 0 | 4/4 |
| buildpro | 2538 | 8/9 | ✓ | 6 | ₹98,92,336 | 14 | 14 | 0 | 4/4 |
| kumar_textiles | 3586 | 7/8 | ✓ | 6 | ₹1,09,89,529 | 14 | 15 | 1 | 5/5 |
| learnright | 2082 | 7/7 | ✓ | 3 | ₹1,04,837 | 11 | 11 | 0 | 3/3 |
| patel_distributors | 4192 | 8/8 | ✓ | 3 | ₹1,54,789 | 12 | 12 | 0 | 4/4 |
| sharma_electronics | 2912 | 8/8 | ✓ | 3 | ₹79,904 | 12 | 13 | 1 | 5/5 |
| speedy_cargo | 2650 | 8/8 | ✓ | 6 | ₹70,96,794 | 13 | 13 | 0 | 3/3 |
| spice_garden | 2250 | 7/7 | ✓ | 6 | ₹95,32,346 | 13 | 13 | 0 | 3/3 |
| steelco | 3380 | 7/7 | ✓ | 6 | ₹1,11,46,895 | 15 | 15 | 0 | 5/5 |
| techvista | 1358 | 7/7 | ✓ | 3 | ₹1,27,625 | 12 | 12 | 0 | 4/4 |

---

## apollo_diag.csv

**Duration:** 9372ms · **Rows:** 2542 · **Table:** `upload_validate_test_org_validate_test_file_apollo_diag_csv`

### Ingestion
- Headers: 8
- Mapped: 8, Unmapped: 0, Dropped: 0

| Original column | Canonical | Method | Confidence |
|---|---|---|--:|
| transaction_date | transaction_date | exact | 100% |
| reference_number | reference_number | exact | 100% |
| voucher_type | voucher_type | exact | 100% |
| account_name | account_name | exact | 100% |
| party_name | party_name | exact | 100% |
| debit_amount | debit_amount | exact | 100% |
| credit_amount | credit_amount | exact | 100% |
| description | description | exact | 100% |

### Scanner
✓ Ran in 1013ms · 3 issues · ₹3,850 exposure

| Severity | Title | Rows | Exposure |
|---|---|--:|--:|
| critical | 1 voucher where Debit ≠ Credit | 1 | ₹3,850 |
| critical | Period coverage looks incomplete | 4 | ₹0 |
| review | 527 entries dated outside the period | 527 | ₹0 |

### Intent parser
Source: `heuristic` · Confidence: 90%
- Focus areas: ar, ap

### Task generator — STANDARD profile
✓ Generated 12 tasks
- Verify Opening Balances
- Resolve 1 voucher where Dr ≠ Cr
- Verify period coverage — uploaded data may be incomplete
- Verify 527 entries dated outside the period
- Bank Reconciliation (2 accounts)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- GST Reconciliation (4 tax accounts)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Task generator — ADAPTIVE profile (with intent)
✓ Generated 12 tasks (0 party deep-dive tasks)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- Verify Opening Balances
- Resolve 1 voucher where Dr ≠ Cr
- Verify period coverage — uploaded data may be incomplete
- Verify 527 entries dated outside the period
- Bank Reconciliation (2 accounts)
- GST Reconciliation (4 tax accounts)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Reconciliations
✓ 4/4 executed successfully

| Recon | Status | Source balance | Target balance | Variance |
|---|---|--:|--:|--:|
| AP Control vs Vendor Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |
| AR Control vs Customer Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |
| Bank Internal Consistency Check | ✓ | ₹0 | ₹0 | ₹0 |
| GST Output vs Sales-Implied | ✓ | ₹0 | ₹0 | ₹0 |

---

## buildpro.csv

**Duration:** 3929ms · **Rows:** 2538 · **Table:** `upload_validate_test_org_validate_test_file_buildpro_csv`

### Ingestion
- Headers: 9
- Mapped: 8, Unmapped: 1, Dropped: 0

| Original column | Canonical | Method | Confidence |
|---|---|---|--:|
| Posting Date | transaction_date | exact | 100% |
| Document No | reference_number | exact | 100% |
| Document Type | voucher_type | exact | 100% |
| GL Account | account_name | exact | 100% |
| Vendor | vendor_name | exact | 100% |
| Customer | customer_name | exact | 100% |
| Dr Amt | debit_amount | exact | 100% |
| Cr Amt | credit_amount | exact | 100% |
| Text | — | unmapped | 0% |

### Scanner
✓ Ran in 426ms · 6 issues · ₹98,92,336 exposure

| Severity | Title | Rows | Exposure |
|---|---|--:|--:|
| critical | 50 vouchers where Debit ≠ Credit | 50 | ₹81,86,917 |
| critical | 14 possible duplicate transactions | 14 | ₹17,05,419 |
| critical | 4 entries with missing critical fields | 4 | ₹0 |
| review | 3 entries dated outside the period | 3 | ₹0 |
| review | Period coverage looks incomplete | 2 | ₹0 |
| info | 5 unclassified accounts | 5 | ₹0 |

### Intent parser
Source: `heuristic` · Confidence: 60%
- Focus areas: bank, ar, ap, loans

### Task generator — STANDARD profile
✓ Generated 14 tasks
- Verify Opening Balances
- Resolve 50 vouchers where Dr ≠ Cr
- Review 14 possible duplicate transactions
- Fill in 4 entries with missing fields
- Verify 3 entries dated outside the period
- Verify period coverage — uploaded data may be incomplete
- Bank Reconciliation (3 accounts)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- GST Reconciliation (4 tax accounts)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Task generator — ADAPTIVE profile (with intent)
✓ Generated 14 tasks (0 party deep-dive tasks)
- Bank Reconciliation (3 accounts)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- Verify Opening Balances
- Resolve 50 vouchers where Dr ≠ Cr
- Review 14 possible duplicate transactions
- Fill in 4 entries with missing fields
- Verify 3 entries dated outside the period
- Verify period coverage — uploaded data may be incomplete
- GST Reconciliation (4 tax accounts)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Reconciliations
✓ 4/4 executed successfully

| Recon | Status | Source balance | Target balance | Variance |
|---|---|--:|--:|--:|
| Bank Internal Consistency Check | ✓ | ₹0 | ₹0 | ₹0 |
| AP Control vs Vendor Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |
| AR Control vs Customer Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |
| GST Output vs Sales-Implied | ✓ | ₹0 | ₹0 | ₹0 |

---

## kumar_textiles.csv

**Duration:** 5816ms · **Rows:** 3586 · **Table:** `upload_validate_test_org_validate_test_file_kumar_textiles_csv`

### Ingestion
- Headers: 8
- Mapped: 7, Unmapped: 1, Dropped: 0

| Original column | Canonical | Method | Confidence |
|---|---|---|--:|
| Dt | transaction_date | exact | 100% |
| VchNo | reference_number | exact | 100% |
| VchTyp | voucher_type | exact | 100% |
| Acct | account_name | exact | 100% |
| Party | party_name | exact | 100% |
| Dr | debit_amount | exact | 100% |
| Cr | credit_amount | exact | 100% |
| Narr | — | unmapped | 0% |

### Scanner
✓ Ran in 359ms · 6 issues · ₹1,09,89,529 exposure

| Severity | Title | Rows | Exposure |
|---|---|--:|--:|
| critical | 50 vouchers where Debit ≠ Credit | 50 | ₹96,16,832 |
| critical | 12 possible duplicate transactions | 12 | ₹13,72,697 |
| critical | 2 entries with missing critical fields | 2 | ₹0 |
| review | 3 entries dated outside the period | 3 | ₹0 |
| review | Period coverage looks incomplete | 2 | ₹0 |
| info | 6 unclassified accounts | 6 | ₹0 |

### Intent parser
Source: `heuristic` · Confidence: 60%
- Focus areas: ar, ap, gst
- **Watch parties: Ganesh Traders Pvt Ltd**

### Task generator — STANDARD profile
✓ Generated 14 tasks
- Verify Opening Balances
- Resolve 50 vouchers where Dr ≠ Cr
- Review 12 possible duplicate transactions
- Fill in 2 entries with missing fields
- Verify 3 entries dated outside the period
- Verify period coverage — uploaded data may be incomplete
- Bank Reconciliation (4 accounts)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- GST Reconciliation (4 tax accounts)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Task generator — ADAPTIVE profile (with intent)
✓ Generated 15 tasks (1 party deep-dive tasks)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- GST Reconciliation (4 tax accounts)
- Deep-dive: Ganesh Traders Pvt Ltd
- Verify Opening Balances
- Resolve 50 vouchers where Dr ≠ Cr
- Review 12 possible duplicate transactions
- Fill in 2 entries with missing fields
- Verify 3 entries dated outside the period
- Verify period coverage — uploaded data may be incomplete
- Bank Reconciliation (4 accounts)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Reconciliations
✓ 5/5 executed successfully

| Recon | Status | Source balance | Target balance | Variance |
|---|---|--:|--:|--:|
| AP Control vs Vendor Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |
| AR Control vs Customer Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |
| GST Output vs Sales-Implied | ✓ | ₹0 | ₹0 | ₹0 |
| Party deep-dive: Ganesh Traders Pvt Ltd | ✓ | ₹0 | ₹0 | ₹0 |
| Bank Internal Consistency Check | ✓ | ₹0 | ₹0 | ₹0 |

---

## learnright.csv

**Duration:** 3720ms · **Rows:** 2082 · **Table:** `upload_validate_test_org_validate_test_file_learnright_csv`

### Ingestion
- Headers: 7
- Mapped: 7, Unmapped: 0, Dropped: 0

| Original column | Canonical | Method | Confidence |
|---|---|---|--:|
| दिनांक | transaction_date | exact | 100% |
| Vch No | reference_number | exact | 100% |
| Voucher Type | voucher_type | exact | 100% |
| Account Name | account_name | exact | 100% |
| उधार | debit_amount | exact | 100% |
| जमा | credit_amount | exact | 100% |
| Narration | description | exact | 100% |

### Scanner
✓ Ran in 391ms · 3 issues · ₹1,04,837 exposure

| Severity | Title | Rows | Exposure |
|---|---|--:|--:|
| critical | 2 vouchers where Debit ≠ Credit | 2 | ₹1,04,837 |
| critical | Period coverage looks incomplete | 4 | ₹0 |
| review | 470 entries dated outside the period | 470 | ₹0 |

### Intent parser
Source: `heuristic` · Confidence: 60%
- Focus areas: ap

### Task generator — STANDARD profile
✓ Generated 11 tasks
- Verify Opening Balances
- Resolve 2 vouchers where Dr ≠ Cr
- Verify period coverage — uploaded data may be incomplete
- Verify 470 entries dated outside the period
- Bank Reconciliation (2 accounts)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Task generator — ADAPTIVE profile (with intent)
✓ Generated 11 tasks (0 party deep-dive tasks)
- AP Subledger Reconciliation (1 account)
- Verify Opening Balances
- Resolve 2 vouchers where Dr ≠ Cr
- Verify period coverage — uploaded data may be incomplete
- Verify 470 entries dated outside the period
- Bank Reconciliation (2 accounts)
- AR Subledger Reconciliation (1 account)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Reconciliations
✓ 3/3 executed successfully

| Recon | Status | Source balance | Target balance | Variance |
|---|---|--:|--:|--:|
| AP Control vs Vendor Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |
| Bank Internal Consistency Check | ✓ | ₹0 | ₹0 | ₹0 |
| AR Control vs Customer Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |

---

## patel_distributors.csv

**Duration:** 5599ms · **Rows:** 4192 · **Table:** `upload_validate_test_org_validate_test_file_patel_distributors_cs`

### Ingestion
- Headers: 8
- Mapped: 8, Unmapped: 0, Dropped: 0

| Original column | Canonical | Method | Confidence |
|---|---|---|--:|
| Date | transaction_date | exact | 100% |
| Vch No | reference_number | exact | 100% |
| Vch Type | voucher_type | exact | 100% |
| Account | account_name | exact | 100% |
| Party | party_name | exact | 100% |
| Debit | debit_amount | exact | 100% |
| Credit | credit_amount | exact | 100% |
| Narration | description | exact | 100% |

### Scanner
✓ Ran in 434ms · 3 issues · ₹1,54,789 exposure

| Severity | Title | Rows | Exposure |
|---|---|--:|--:|
| critical | 1 voucher where Debit ≠ Credit | 1 | ₹1,54,789 |
| critical | Period coverage looks incomplete | 4 | ₹0 |
| review | 871 entries dated outside the period | 871 | ₹0 |

### Intent parser
Source: `heuristic` · Confidence: 60%
- Focus areas: ar, ap, gst

### Task generator — STANDARD profile
✓ Generated 12 tasks
- Verify Opening Balances
- Resolve 1 voucher where Dr ≠ Cr
- Verify period coverage — uploaded data may be incomplete
- Verify 871 entries dated outside the period
- Bank Reconciliation (3 accounts)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- GST Reconciliation (4 tax accounts)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Task generator — ADAPTIVE profile (with intent)
✓ Generated 12 tasks (0 party deep-dive tasks)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- GST Reconciliation (4 tax accounts)
- Verify Opening Balances
- Resolve 1 voucher where Dr ≠ Cr
- Verify period coverage — uploaded data may be incomplete
- Verify 871 entries dated outside the period
- Bank Reconciliation (3 accounts)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Reconciliations
✓ 4/4 executed successfully

| Recon | Status | Source balance | Target balance | Variance |
|---|---|--:|--:|--:|
| AP Control vs Vendor Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |
| AR Control vs Customer Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |
| GST Output vs Sales-Implied | ✓ | ₹0 | ₹0 | ₹0 |
| Bank Internal Consistency Check | ✓ | ₹0 | ₹0 | ₹0 |

---

## sharma_electronics.csv

**Duration:** 4799ms · **Rows:** 2912 · **Table:** `upload_validate_test_org_validate_test_file_sharma_electronics_cs`

### Ingestion
- Headers: 8
- Mapped: 8, Unmapped: 0, Dropped: 0

| Original column | Canonical | Method | Confidence |
|---|---|---|--:|
| Voucher Date | transaction_date | exact | 100% |
| Reference No | reference_number | exact | 100% |
| Voucher Type | voucher_type | exact | 100% |
| Account Head | account_name | exact | 100% |
| Party Name | party_name | exact | 100% |
| Dr Amount | debit_amount | exact | 100% |
| Cr Amount | credit_amount | exact | 100% |
| Description | description | exact | 100% |

### Scanner
✓ Ran in 356ms · 3 issues · ₹79,904 exposure

| Severity | Title | Rows | Exposure |
|---|---|--:|--:|
| critical | 1 voucher where Debit ≠ Credit | 1 | ₹79,904 |
| critical | Period coverage looks incomplete | 4 | ₹0 |
| review | 549 entries dated outside the period | 549 | ₹0 |

### Intent parser
Source: `heuristic` · Confidence: 60%
- Focus areas: ar, ap
- **Watch parties: Sharma**

### Task generator — STANDARD profile
✓ Generated 12 tasks
- Verify Opening Balances
- Resolve 1 voucher where Dr ≠ Cr
- Verify period coverage — uploaded data may be incomplete
- Verify 549 entries dated outside the period
- Bank Reconciliation (3 accounts)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- GST Reconciliation (4 tax accounts)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Task generator — ADAPTIVE profile (with intent)
✓ Generated 13 tasks (1 party deep-dive tasks)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- Deep-dive: Sharma
- Verify Opening Balances
- Resolve 1 voucher where Dr ≠ Cr
- Verify period coverage — uploaded data may be incomplete
- Verify 549 entries dated outside the period
- Bank Reconciliation (3 accounts)
- GST Reconciliation (4 tax accounts)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Reconciliations
✓ 5/5 executed successfully

| Recon | Status | Source balance | Target balance | Variance |
|---|---|--:|--:|--:|
| AP Control vs Vendor Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |
| AR Control vs Customer Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |
| Party deep-dive: Sharma | ✓ | ₹0 | ₹0 | ₹0 |
| Bank Internal Consistency Check | ✓ | ₹0 | ₹0 | ₹0 |
| GST Output vs Sales-Implied | ✓ | ₹0 | ₹0 | ₹0 |

---

## speedy_cargo.csv

**Duration:** 4559ms · **Rows:** 2650 · **Table:** `upload_validate_test_org_validate_test_file_speedy_cargo_csv`

### Ingestion
- Headers: 8
- Mapped: 8, Unmapped: 0, Dropped: 0

| Original column | Canonical | Method | Confidence |
|---|---|---|--:|
| Voucher Date | transaction_date | exact | 100% |
| Reference No | reference_number | exact | 100% |
| Voucher Type | voucher_type | exact | 100% |
| Account Head | account_name | exact | 100% |
| Party Name | party_name | exact | 100% |
| Dr Amount | debit_amount | exact | 100% |
| Cr Amount | credit_amount | exact | 100% |
| Description | description | exact | 100% |

### Scanner
✓ Ran in 381ms · 6 issues · ₹70,96,794 exposure

| Severity | Title | Rows | Exposure |
|---|---|--:|--:|
| critical | 50 vouchers where Debit ≠ Credit | 50 | ₹54,33,628 |
| critical | 6 possible duplicate transactions | 6 | ₹16,63,166 |
| critical | 4 entries with missing critical fields | 4 | ₹0 |
| review | 2 entries dated outside the period | 2 | ₹0 |
| review | Period coverage looks incomplete | 2 | ₹0 |
| info | 4 unclassified accounts | 4 | ₹0 |

### Intent parser
Source: `heuristic` · Confidence: 60%
- Focus areas: ar

### Task generator — STANDARD profile
✓ Generated 13 tasks
- Verify Opening Balances
- Resolve 50 vouchers where Dr ≠ Cr
- Review 6 possible duplicate transactions
- Fill in 4 entries with missing fields
- Verify 2 entries dated outside the period
- Verify period coverage — uploaded data may be incomplete
- Bank Reconciliation (3 accounts)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Task generator — ADAPTIVE profile (with intent)
✓ Generated 13 tasks (0 party deep-dive tasks)
- AR Subledger Reconciliation (1 account)
- Verify Opening Balances
- Resolve 50 vouchers where Dr ≠ Cr
- Review 6 possible duplicate transactions
- Fill in 4 entries with missing fields
- Verify 2 entries dated outside the period
- Verify period coverage — uploaded data may be incomplete
- Bank Reconciliation (3 accounts)
- AP Subledger Reconciliation (1 account)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Reconciliations
✓ 3/3 executed successfully

| Recon | Status | Source balance | Target balance | Variance |
|---|---|--:|--:|--:|
| AR Control vs Customer Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |
| Bank Internal Consistency Check | ✓ | ₹0 | ₹0 | ₹0 |
| AP Control vs Vendor Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |

---

## spice_garden.csv

**Duration:** 4333ms · **Rows:** 2250 · **Table:** `upload_validate_test_org_validate_test_file_spice_garden_csv`

### Ingestion
- Headers: 7
- Mapped: 7, Unmapped: 0, Dropped: 0

| Original column | Canonical | Method | Confidence |
|---|---|---|--:|
| Date | transaction_date | exact | 100% |
| Vch No | reference_number | exact | 100% |
| Vch Type | voucher_type | exact | 100% |
| Particulars | account_name | exact | 100% |
| Debit | debit_amount | exact | 100% |
| Credit | credit_amount | exact | 100% |
| Narration | description | exact | 100% |

### Scanner
✓ Ran in 367ms · 6 issues · ₹95,32,346 exposure

| Severity | Title | Rows | Exposure |
|---|---|--:|--:|
| critical | 50 vouchers where Debit ≠ Credit | 50 | ₹76,65,016 |
| critical | 14 possible duplicate transactions | 14 | ₹18,67,330 |
| critical | 4 entries with missing critical fields | 4 | ₹0 |
| review | 3 entries dated outside the period | 3 | ₹0 |
| review | Period coverage looks incomplete | 2 | ₹0 |
| info | 4 unclassified accounts | 4 | ₹0 |

### Intent parser
Source: `heuristic` · Confidence: 60%
- Focus areas: cash

### Task generator — STANDARD profile
✓ Generated 13 tasks
- Verify Opening Balances
- Resolve 50 vouchers where Dr ≠ Cr
- Review 14 possible duplicate transactions
- Fill in 4 entries with missing fields
- Verify 3 entries dated outside the period
- Verify period coverage — uploaded data may be incomplete
- Bank Reconciliation (2 accounts)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Task generator — ADAPTIVE profile (with intent)
✓ Generated 13 tasks (0 party deep-dive tasks)
- Verify Opening Balances
- Resolve 50 vouchers where Dr ≠ Cr
- Review 14 possible duplicate transactions
- Fill in 4 entries with missing fields
- Verify 3 entries dated outside the period
- Verify period coverage — uploaded data may be incomplete
- Bank Reconciliation (2 accounts)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Reconciliations
✓ 3/3 executed successfully

| Recon | Status | Source balance | Target balance | Variance |
|---|---|--:|--:|--:|
| Bank Internal Consistency Check | ✓ | ₹0 | ₹0 | ₹0 |
| AP Control vs Vendor Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |
| AR Control vs Customer Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |

---

## steelco.csv

**Duration:** 5306ms · **Rows:** 3380 · **Table:** `upload_validate_test_org_validate_test_file_steelco_csv`

### Ingestion
- Headers: 7
- Mapped: 7, Unmapped: 0, Dropped: 0

| Original column | Canonical | Method | Confidence |
|---|---|---|--:|
| Date | transaction_date | exact | 100% |
| Vch No | reference_number | exact | 100% |
| Vch Type | voucher_type | exact | 100% |
| Particulars | account_name | exact | 100% |
| Debit | debit_amount | exact | 100% |
| Credit | credit_amount | exact | 100% |
| Narration | description | exact | 100% |

### Scanner
✓ Ran in 389ms · 6 issues · ₹1,11,46,895 exposure

| Severity | Title | Rows | Exposure |
|---|---|--:|--:|
| critical | 50 vouchers where Debit ≠ Credit | 50 | ₹1,04,28,809 |
| critical | 12 possible duplicate transactions | 12 | ₹7,18,085 |
| critical | 5 entries with missing critical fields | 5 | ₹0 |
| review | 3 entries dated outside the period | 3 | ₹0 |
| review | Period coverage looks incomplete | 2 | ₹0 |
| info | 4 unclassified accounts | 4 | ₹0 |

### Intent parser
Source: `empty` · Confidence: 0%

### Task generator — STANDARD profile
✓ Generated 15 tasks
- Verify Opening Balances
- Resolve 50 vouchers where Dr ≠ Cr
- Review 12 possible duplicate transactions
- Fill in 5 entries with missing fields
- Verify 3 entries dated outside the period
- Verify period coverage — uploaded data may be incomplete
- Bank Reconciliation (3 accounts)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- GST Reconciliation (4 tax accounts)
- Inventory Reconciliation (1 account)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Task generator — ADAPTIVE profile (with intent)
✓ Generated 15 tasks (0 party deep-dive tasks)
- Verify Opening Balances
- Resolve 50 vouchers where Dr ≠ Cr
- Review 12 possible duplicate transactions
- Fill in 5 entries with missing fields
- Verify 3 entries dated outside the period
- Verify period coverage — uploaded data may be incomplete
- Bank Reconciliation (3 accounts)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- GST Reconciliation (4 tax accounts)
- Inventory Reconciliation (1 account)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Reconciliations
✓ 5/5 executed successfully

| Recon | Status | Source balance | Target balance | Variance |
|---|---|--:|--:|--:|
| Bank Internal Consistency Check | ✓ | ₹0 | ₹0 | ₹0 |
| AP Control vs Vendor Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |
| AR Control vs Customer Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |
| GST Output vs Sales-Implied | ✓ | ₹0 | ₹0 | ₹0 |
| Inventory Movement vs Purchase-Sales Net | ✓ | ₹0 | ₹0 | ₹0 |

---

## techvista.csv

**Duration:** 3419ms · **Rows:** 1358 · **Table:** `upload_validate_test_org_validate_test_file_techvista_csv`

### Ingestion
- Headers: 7
- Mapped: 7, Unmapped: 0, Dropped: 0

| Original column | Canonical | Method | Confidence |
|---|---|---|--:|
| दिनांक | transaction_date | exact | 100% |
| Vch No | reference_number | exact | 100% |
| Voucher Type | voucher_type | exact | 100% |
| Account Name | account_name | exact | 100% |
| उधार | debit_amount | exact | 100% |
| जमा | credit_amount | exact | 100% |
| Narration | description | exact | 100% |

### Scanner
✓ Ran in 356ms · 3 issues · ₹1,27,625 exposure

| Severity | Title | Rows | Exposure |
|---|---|--:|--:|
| critical | 1 voucher where Debit ≠ Credit | 1 | ₹1,27,625 |
| critical | Period coverage looks incomplete | 4 | ₹0 |
| review | 243 entries dated outside the period | 243 | ₹0 |

### Intent parser
Source: `heuristic` · Confidence: 60%
- Focus areas: expenses

### Task generator — STANDARD profile
✓ Generated 12 tasks
- Verify Opening Balances
- Resolve 1 voucher where Dr ≠ Cr
- Verify period coverage — uploaded data may be incomplete
- Verify 243 entries dated outside the period
- Bank Reconciliation (3 accounts)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- GST Reconciliation (4 tax accounts)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Task generator — ADAPTIVE profile (with intent)
✓ Generated 12 tasks (0 party deep-dive tasks)
- Verify Opening Balances
- Resolve 1 voucher where Dr ≠ Cr
- Verify period coverage — uploaded data may be incomplete
- Verify 243 entries dated outside the period
- Bank Reconciliation (3 accounts)
- AP Subledger Reconciliation (1 account)
- AR Subledger Reconciliation (1 account)
- GST Reconciliation (4 tax accounts)
- P&L Review
- Balance Sheet Review
- Flux Analysis
- CFO Sign-off

### Reconciliations
✓ 4/4 executed successfully

| Recon | Status | Source balance | Target balance | Variance |
|---|---|--:|--:|--:|
| Bank Internal Consistency Check | ✓ | ₹0 | ₹0 | ₹0 |
| AP Control vs Vendor Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |
| AR Control vs Customer Subsidiary | ✓ | ₹0 | ₹0 | ₹0 |
| GST Output vs Sales-Implied | ✓ | ₹0 | ₹0 | ₹0 |
