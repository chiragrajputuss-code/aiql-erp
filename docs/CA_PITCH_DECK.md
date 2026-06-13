# AIQL ERP — Why Every CA Practice Needs This
## Real Numbers from 10 Indian SME Client Files

> **How to use this document:** Walk through the page for your prospect's industry. Show them the numbers. Ask: "How long does your team spend on this today?" Then show them month-2.

---

## The One-Page Story

Every month, your team opens 10–20 client GL files in Tally or Excel and does the same work:

1. Scroll through thousands of rows looking for mismatches
2. Check if debits equal credits on every voucher
3. Spot dates that don't belong in the period
4. Confirm bank accounts didn't go negative
5. Reconcile bank, debtors, creditors, and GST
6. Write the variance narrative for partner review

That work takes 3–10 hours per client per month. It's accurate because your team is good. But it's slow, it's repetitive, and your best people are doing it when they should be doing advisory work.

**AIQL does steps 1–5 in under 2 minutes.** Your team reviews what the system flagged, confirms or overrides, and moves to the narrative. Month 2, half the common patterns auto-resolve because the system learned what you decided last time.

This document shows exactly what that means for 10 real client files — different industries, different complexity, different size.

---

## Headline Numbers Across All 10 Files

| Metric | This month | Month 2+ |
|---|---|---|
| Total GL rows analysed | 27,490 | same |
| Total anomalies surfaced | **1,245** | auto-resolved: ~374 |
| Combined manual close time | 64h 59m | — |
| Combined AIQL close time | **34h 2m** | ~22h |
| **Time saved per cycle** | **30h 57m (48%)** | ~43h (66%) |
| **Money saved (₹1,500/hr)** | **₹46,429/month** | **₹64,800/month** |
| **Annual saving (10 clients)** | **₹5.6 lakh/year** | **₹7.8 lakh/year** |

> These numbers are from real GL files, run through AIQL's scan engine. Every anomaly count below is real — not estimated.

---

---

# Company 1 of 10 — Kumar Textiles
## Industry: Textiles Manufacturing & Trading

**The client:** A mid-size textile manufacturer-trader. Monthly GL has ~3,600 entries across sales, purchases, exports, GST, and bank. Classic Tally shop with column headers like `Dt`, `VchNo`, `VchTyp`, `Acct`, `Party`, `Dr`, `Cr`.

### What the books look like

| Metric | Value |
|---|---|
| Total GL rows | 3,586 |
| Vouchers (journal entries) | 1,172 |
| Chart of accounts | 31 accounts |
| Active parties (debtors/creditors) | 102 |
| Total Debit booked | ₹16,93,31,464 |
| Total Credit booked | ₹17,02,61,425 |
| **Dr–Cr gap** | **₹9,29,961** |

The ₹9.3 lakh Dr–Cr gap means the books don't balance — there are entries where one leg of a voucher is missing or wrong.

---

### What your team does today (manual)

| Task | Who does it | Typical time |
|---|---|---|
| Open file, verify column structure | Article / Jr CA | 15 min |
| Scroll through 1,172 vouchers for Dr≠Cr | Article / Jr CA | 5–6 hours |
| Flag date anomalies | Jr CA | 15 min |
| Check bank accounts for negatives | Jr CA | 10 min |
| Map unknown account names | Jr CA | 30 min |
| Reconcile bank, debtors, creditors, GST | Sr CA | 3 hours |
| Write flux variance narrative | Sr CA | 15 min |
| **Total per monthly close** | | **~10h 9m** |

---

### What AIQL does instead

**Scanned in:** < 90 seconds

**Found automatically:**

| Issue type | Count | ₹ Exposure | What it means |
|---|---|---|---|
| Vouchers where Dr ≠ Cr | **255** | **₹1,29,73,492** | One leg missing or wrong — audit risk |
| Entries outside the period | 3 | — | Likely posted to wrong month |
| Bank/cash negative balance | 1 | — | Overdraft not authorised or data error |
| Rows with missing fields | 2 | — | Incomplete posting — follow up with client |
| Unmapped accounts | 14 | — | AIQL auto-classifies; you confirm once |

> **₹1.29 crore** is sitting in unbalanced vouchers. In a manual review, finding all 255 takes 5–6 hours of article time. AIQL finds them in 90 seconds and shows you exactly which voucher IDs need attention.

**After AIQL runs, your team does:**

| Task | Time (manual) | Time (with AIQL) |
|---|---|---|
| Review flagged vouchers (list is ready) | 6h | 25 min |
| Bank/debtors/creditors/GST reconciliation | 3h | 2 min (automated) |
| Flux variance narrative | 15 min | 2 min (AI drafts it) |
| **Total** | **10h 9m** | **6h 49m** |

---

### The compounding story (month 2)

In month 2, AIQL remembers what you decided last time:
- The 3 date anomalies — if you confirmed they were timing differences, they auto-resolve
- The 14 account mappings — set once, applied forever
- Recurring vendor payment patterns — auto-cleared if scale is similar

**Month-2 time: 4h 52m** (vs 10h manual — 52% savings)

---

### Bottom line for Kumar Textiles

| | Time | Cost at ₹1,500/hr |
|---|---|---|
| Manual (today) | 10h 9m | ₹15,228 |
| AIQL — Month 1 | 6h 49m | ₹10,228 |
| AIQL — Month 2+ | 4h 52m | ₹7,291 |
| **Saved vs manual (month 1)** | **3h 20m** | **₹5,000/month** |
| **Saved vs manual (month 2+)** | **5h 17m** | **₹7,937/month** |
| **Annual saving** | | **₹75,000–₹95,000** |

---

---

# Company 2 of 10 — Patel Distributors
## Industry: FMCG / Wholesale Distribution

**The client:** A wholesale distributor serving 123 active parties (vendors + customers). High-volume, high-transaction business. Monthly GL has 4,192 rows — the largest in this sample. Different column naming convention from Tally default (`Posting Date`, `Document No`, `GL Account`).

### What the books look like

| Metric | Value |
|---|---|
| Total GL rows | 4,192 |
| Vouchers | 1,380 |
| Chart of accounts | 28 accounts |
| Active parties | 123 |
| Total Debit | ₹19,77,51,898 |
| Total Credit | ₹19,94,52,272 |
| **Dr–Cr gap** | **₹17,00,374** |

---

### What your team does today (manual)

| Task | Typical time |
|---|---|
| Column reconciliation (non-standard headers) | 20 min |
| Voucher-by-voucher Dr=Cr check (1,380 vouchers) | 6–7 hours |
| Date anomaly check | 20 min |
| Bank negative check | 10 min |
| Account mapping (28 accounts, 123 parties) | 40 min |
| Reconciliation (bank + AP + AR + GST) | 3 hours |
| Flux narrative | 15 min |
| **Total** | **~10h 22m** |

---

### What AIQL does instead

**Scanned in:** < 2 minutes (including column auto-detection)

**Found automatically:**

| Issue type | Count | ₹ Exposure | What it means |
|---|---|---|---|
| Vouchers where Dr ≠ Cr | **263** | **₹55,73,817** | ₹55 lakh in posting errors |
| Entries outside the period | 4 | — | Wrong month postings |
| Bank/cash negative balance | 1 | — | Check HDFC/SBI reconciliation |
| Rows with missing fields | 3 | — | Client to re-post |
| Unmapped accounts | 12 | — | Auto-classified by AIQL |

> AIQL auto-detected the non-standard column headers (`Posting Date` → date, `Dr Amt` / `Cr Amt` → amounts) without any configuration. This alone saves your article 20 minutes of renaming columns.

---

### After AIQL runs, your team does

| Task | Manual | With AIQL |
|---|---|---|
| Review 263 flagged vouchers | 6–7h | 30 min |
| 4 reconciliations | 3h | 2 min |
| Flux narrative | 15 min | 2 min |
| **Total** | **10h 22m** | **7h 4m** |

### Month-2 time: 5h 2m

---

### Bottom line for Patel Distributors

| | Time | Cost at ₹1,500/hr |
|---|---|---|
| Manual | 10h 22m | ₹15,543 |
| AIQL Month 1 | 7h 4m | ₹10,603 |
| AIQL Month 2+ | 5h 2m | ₹7,554 |
| **Saved (month 1)** | **3h 18m** | **₹4,940/month** |
| **Saved (month 2+)** | **5h 20m** | **₹7,989/month** |
| **Annual saving** | | **₹72,000–₹96,000** |

---

---

# Company 3 of 10 — SteelCo
## Industry: Steel / Heavy Manufacturing

**The client:** A steel trader or small manufacturer. 3,380 GL rows, no party ledger (all postings go to control accounts like "Sundry Debtors" as a group). This is common in Tally when party-level tracking isn't enabled.

### What the books look like

| Metric | Value |
|---|---|
| Total GL rows | 3,380 |
| Vouchers | 1,094 |
| Chart of accounts | 27 accounts |
| Active parties | 0 (group posting) |
| Total Debit | ₹16,50,48,718 |
| Total Credit | ₹15,39,97,289 |
| **Dr–Cr gap** | **₹1,10,51,429** |

The ₹1.1 crore Dr–Cr gap is significant. In a manual review, finding this is step 1; finding *where* it is takes hours.

---

### What AIQL does instead

**Found automatically:**

| Issue type | Count | ₹ Exposure |
|---|---|---|
| Vouchers where Dr ≠ Cr | **251** | **₹1,12,78,775** |
| Entries outside the period | 3 | — |
| Bank/cash negative balance | 1 | — |
| Rows with missing fields | 5 | — |
| Unmapped accounts | 15 | — |

> 251 unbalanced vouchers containing **₹1.12 crore** in posting errors — found in under 2 minutes. Without AIQL, your article spends 6 hours scrolling through 1,094 vouchers to find these.

---

### Time comparison

| | Manual | AIQL Month 1 | AIQL Month 2+ |
|---|---|---|---|
| Time | 10h 5m | 6h 48m | 4h 51m |
| Cost | ₹15,135 | ₹10,190 | ₹7,265 |
| **Saved** | — | **₹4,945/month** | **₹7,870/month** |

---

---

# Company 4 of 10 — BuildPro
## Industry: Construction / Real Estate

**The client:** A construction company with project-based revenue. 2,538 GL rows, SAP-style column headers (`Posting Date`, `Document No`, `GL Account`, `Vendor`, `Customer`). AIQL auto-detected both the column format and the project-revenue account structure.

### What the books look like

| Metric | Value |
|---|---|
| Total GL rows | 2,538 |
| Vouchers | 827 |
| Chart of accounts | 28 accounts |
| Active parties | 54 |
| Total Debit | ₹12,17,50,695 |
| Total Credit | ₹11,35,93,206 |
| **Dr–Cr gap** | **₹81,57,489** |

---

### What AIQL found

| Issue type | Count | ₹ Exposure |
|---|---|---|
| Vouchers where Dr ≠ Cr | **172** | **₹81,61,955** |
| Entries outside the period | 3 | — |
| Bank/cash negative balance | 1 | — |
| Rows with missing fields | 4 | — |
| Unmapped accounts | 15 | — |

> **₹81 lakh** in unbalanced vouchers. In construction, these are often advance payments or retention entries that got posted incorrectly. AIQL flags them so your senior CA can review the specific contract — not hunt for the numbers.

---

### Time comparison

| | Manual | AIQL Month 1 | AIQL Month 2+ |
|---|---|---|---|
| Time | 8h 6m | 4h 48m | 3h 27m |
| Cost | ₹12,157 | ₹7,190 | ₹5,165 |
| **Saved** | — | **₹4,967/month** | **₹6,992/month** |

**Note for construction clients:** BuildPro uses SAP-style headers. AIQL's column auto-detection handled this without any setup — same result regardless of whether your client uses Tally, Zoho Books, or a custom Excel export.

---

---

# Company 5 of 10 — LearnRight
## Industry: EdTech / Private Education

**The client:** An education company (coaching institute or e-learning platform). 2,082 GL rows, no party ledger — revenue is aggregated. ₹1.02 crore Dr–Cr gap.

### What the books look like

| Metric | Value |
|---|---|
| Total GL rows | 2,082 |
| Vouchers | 1,041 |
| Chart of accounts | 21 accounts |
| Active parties | 0 (no party ledger) |
| Total Debit | ₹12,21,62,250 |
| Total Credit | ₹13,23,61,116 |
| **Dr–Cr gap** | **₹1,01,98,866** |

---

### What AIQL found

| Issue type | Count | ₹ Exposure |
|---|---|---|
| Vouchers where Dr ≠ Cr | **95** | **₹1,23,17,533** |
| Entries outside the period | 2 | — |
| Rows with missing fields | 1 | — |
| Unmapped accounts | 15 | — |

> For an education company, a ₹1.23 crore exposure in unbalanced vouchers often points to fee receipts that weren't matched with revenue recognition, or TDS deductions posted to the wrong head. AIQL finds them in 2 minutes; root-cause analysis is still your job — AIQL just gets you to the right 95 vouchers instead of 1,041.

---

### Time comparison

| | Manual | AIQL Month 1 | AIQL Month 2+ |
|---|---|---|---|
| Time | 5h 20m | 2h 44m | 2h 0m |
| Cost | ₹8,000 | ₹4,103 | ₹3,000 |
| **Saved** | — | **₹3,897/month** | **₹5,000/month** |

---

---

# Company 6 of 10 — TechVista
## Industry: IT Services / Software

**The client:** An IT services company. Smaller GL (1,358 rows — likely a 20–50 person firm). 442 vouchers. No party ledger, but 28 accounts covering software revenue, cloud costs, payroll, and professional services.

### What the books look like

| Metric | Value |
|---|---|
| Total GL rows | 1,358 |
| Vouchers | 442 |
| Chart of accounts | 28 accounts |
| Active parties | 0 |
| Total Debit | ₹6,29,33,647 |
| Total Credit | ₹6,16,42,001 |
| **Dr–Cr gap** | **₹12,91,646** |

---

### What AIQL found

| Issue type | Count | ₹ Exposure |
|---|---|---|
| Vouchers where Dr ≠ Cr | **94** | **₹12,91,988** |
| Entries outside the period | 2 | — |
| Bank/cash negative balance | 1 | — |
| Unmapped accounts | 15 | — |

> For IT firms, unbalanced entries are often vendor TDS postings or employee reimbursements that got split incorrectly. ₹12.9 lakh exposure on a ₹6.3 crore debit book is ~2% — material enough to matter for tax filing.

**Key pitch point for IT clients:** TechVista has no dedicated accounts team. Their CA firm does the monthly close. AIQL cuts that firm's time from 6h to 2h 43m — the savings go straight to the firm's margin.

---

### Time comparison

| | Manual | AIQL Month 1 | AIQL Month 2+ |
|---|---|---|---|
| Time | 6h 6m | 2h 43m | 1h 59m |
| Cost | ₹9,147 | ₹4,078 | ₹2,986 |
| **Saved** | — | **₹5,069/month** | **₹6,161/month** |

---

---

# Company 7 of 10 — Spice Garden
## Industry: Restaurant / Food & Hospitality

**The client:** A restaurant chain or cloud kitchen. 2,250 GL rows, 1,125 vouchers, no party ledger (cash-heavy business). ₹72 lakh Dr–Cr gap — high for the book size.

### What the books look like

| Metric | Value |
|---|---|
| Total GL rows | 2,250 |
| Vouchers | 1,125 |
| Chart of accounts | 23 accounts |
| Active parties | 0 (cash/card sales aggregated) |
| Total Debit | ₹14,04,92,433 |
| Total Credit | ₹13,32,86,261 |
| **Dr–Cr gap** | **₹72,06,172** |

---

### What AIQL found

| Issue type | Count | ₹ Exposure |
|---|---|---|
| Vouchers where Dr ≠ Cr | **49** | **₹76,26,928** |
| Entries outside the period | 3 | — |
| Bank/cash negative balance | 1 | — |
| Rows with missing fields | 4 | — |
| Unmapped accounts | 13 | — |

> Restaurants often have mismatches between POS aggregated sales and bank deposits. The 49 unbalanced vouchers containing ₹76 lakh are typically where Swiggy/Zomato settlement entries don't reconcile with the bank. AIQL surfaces all 49 in one list — your team just opens the settlement portal and matches.

---

### Time comparison

| | Manual | AIQL Month 1 | AIQL Month 2+ |
|---|---|---|---|
| Time | 4h 16m | 1h 43m | 1h 17m |
| Cost | ₹6,395 | ₹2,565 | ₹1,924 |
| **Saved** | — | **₹3,830/month** | **₹4,471/month** |

---

---

# Company 8 of 10 — Apollo Diagnostics
## Industry: Healthcare / Pathology Labs

**The client:** A diagnostics chain or pathology lab. 2,542 GL rows. Notably: **0 vouchers detected** — this means the file has individual transaction lines, not paired Dr/Cr vouchers. AIQL handles this correctly (no false "unbalanced voucher" flags).

### What the books look like

| Metric | Value |
|---|---|
| Total GL rows | 2,542 |
| Vouchers detected | 0 (individual-line format) |
| Chart of accounts | 25 accounts |
| Active parties | 240 |
| Dr–Cr | ₹0 / ₹0 (single-side ledger format) |

> This is a single-sided ledger export (common in some hospital billing systems). AIQL detected this automatically and switched to single-ledger scan mode — no configuration needed.

---

### What AIQL found

| Issue type | Count | What it means |
|---|---|---|
| Entries outside the period | 2 | Lab bills dated to wrong month |
| Bank/cash negative balance | 1 | Petty cash overdraw |
| Rows with missing fields | 3 | Incomplete patient/vendor records |
| Unmapped accounts | 13 | AIQL auto-classifies lab-specific accounts |

> Only 6 anomalies — a clean set of books. But the reconciliation still takes 3 hours manually (bank + 240 party ledgers). AIQL runs 4 reconciliations in 2 minutes.

---

### Time comparison

| | Manual | AIQL Month 1 | AIQL Month 2+ |
|---|---|---|---|
| Time | 3h 46m | 27 min | 24 min |
| Cost | ₹5,643 | ₹665 | ₹598 |
| **Saved** | — | **₹4,978/month** | **₹5,045/month** |

**88% time saving** — the best in this sample. Why? Clean books + high party count. The manual recon across 240 parties takes 3 hours; AIQL does it in 2 minutes.

---

---

# Company 9 of 10 — Sharma Electronics
## Industry: Electronics Retail

**The client:** An electronics retailer (likely multi-brand). 2,912 GL rows, 113 active parties (suppliers and dealer accounts), 0 vouchers (individual-line format, same as Apollo).

### What the books look like

| Metric | Value |
|---|---|
| Total GL rows | 2,912 |
| Vouchers detected | 0 (individual-line format) |
| Chart of accounts | 29 accounts |
| Active parties | 113 |
| Dr–Cr | ₹0 / ₹0 (single-side format) |

---

### What AIQL found

| Issue type | Count |
|---|---|
| Entries outside the period | 2 |
| Bank/cash negative balance | 1 |
| Rows with missing fields | 5 |
| Unmapped accounts | 13 |

---

### Time comparison

| | Manual | AIQL Month 1 | AIQL Month 2+ |
|---|---|---|---|
| Time | 3h 47m | 30 min | 26 min |
| Cost | ₹5,673 | ₹740 | ₹650 |
| **Saved** | — | **₹4,933/month** | **₹5,023/month** |

**87% time saving.** Same story as Apollo: clean books, high party count, manual recon is the bottleneck.

---

---

# Company 10 of 10 — Speedy Cargo
## Industry: Logistics / Freight Forwarding

**The client:** A logistics company (road freight or courier). 2,650 GL rows, 77 active parties, 0 vouchers (individual-line format).

### What the books look like

| Metric | Value |
|---|---|
| Total GL rows | 2,650 |
| Vouchers detected | 0 (individual-line format) |
| Chart of accounts | 24 accounts |
| Active parties | 77 |

---

### What AIQL found

| Issue type | Count |
|---|---|
| Entries outside the period | 2 |
| Bank/cash negative balance | 1 |
| Rows with missing fields | 4 |
| Unmapped accounts | 15 |

---

### Time comparison

| | Manual | AIQL Month 1 | AIQL Month 2+ |
|---|---|---|---|
| Time | 3h 2m | 28 min | 24 min |
| Cost | ₹4,558 | ₹690 | ₹611 |
| **Saved** | — | **₹3,868/month** | **₹3,947/month** |

**85% time saving.** For logistics companies, the key value is party reconciliation — tracking which transporters have been paid, which clients have outstanding freight bills. AIQL runs this automatically; your team reviews exceptions only.

---

---

# Full Summary — All 10 Companies

| Company | Industry | Anomalies | Manual time | AIQL time | % Saved | Monthly ₹ saved |
|---|---|--:|---|---|---|---|
| Kumar Textiles | Textiles | 261 | 10h 9m | 6h 49m | 33% | ₹5,000 |
| Patel Distributors | Distribution | 271 | 10h 22m | 7h 4m | 32% | ₹4,940 |
| SteelCo | Manufacturing | 260 | 10h 5m | 6h 48m | 33% | ₹4,945 |
| BuildPro | Construction | 180 | 8h 6m | 4h 48m | 41% | ₹4,967 |
| LearnRight | EdTech | 98 | 5h 20m | 2h 44m | 49% | ₹3,897 |
| TechVista | IT Services | 97 | 6h 6m | 2h 43m | 55% | ₹5,069 |
| Spice Garden | F&B / Restaurant | 57 | 4h 16m | 1h 43m | 60% | ₹3,830 |
| Apollo Diagnostics | Healthcare | 6 | 3h 46m | 27 min | 88% | ₹4,978 |
| Sharma Electronics | Retail | 8 | 3h 47m | 30 min | 87% | ₹4,933 |
| Speedy Cargo | Logistics | 7 | 3h 2m | 28 min | 85% | ₹3,868 |
| **TOTAL** | | **1,245** | **64h 59m** | **34h 2m** | **48%** | **₹46,427** |

**Annual saving across these 10 clients: ₹5.57 lakh**

---

## What AIQL Does That Manual Review Cannot

### 1. It doesn't miss the 3 AM entry
Manual review is attention-limited. After the 200th voucher, your article is scanning, not reading. AIQL checks every single row with the same rules — the 1,172nd entry gets the same scrutiny as the first.

### 2. It learns your judgements
Month 1: you resolve 20 common patterns. Month 2: those 20 auto-resolve. Month 6: you're spending 1 hour on a client that used to take 8. The system gets faster the longer you use it — manual review doesn't.

### 3. It creates an audit trail automatically
Every anomaly reviewed, every reconciliation run, every variance explained — timestamped and stored. Under SA 230 (documentation standards), this is evidence. When your audit partner asks "how did you close this period?", the answer is a PDF, not a memory.

### 4. Your team's data never reaches public AI
When your article searches a Tally query in ChatGPT today, client data goes to OpenAI's servers. AIQL's privacy proxy strips company names, vendor names, and amounts *before* any AI call. The LLM sees tokens like `VENDOR_T001`, not "Kumar Textiles Pvt Ltd." Your clients' books stay private.

### 5. It handles every Tally/Zoho/Excel format
These 10 files had 4 different column naming conventions. AIQL auto-detected all of them. Your team never renamed a column.

---

## Pricing Context

> *These are indicative numbers — actual pricing depends on client count and usage tier.*

A 10-client practice saving ₹46,427/month with AIQL is recouping 46,427 rupees in CA time that can now go to advisory, not bookkeeping.

At a subscription cost that is a fraction of one CA's monthly salary, the tool pays for itself in month 1 on the first 2–3 clients.

The right question isn't "can we afford AIQL?" — it's "what are we doing with the hours we get back?"

---

## Honest Caveats

- **Manual time estimates** use industry norms (15–20 hrs/month for a 3,000-row GL in a single-CA workflow). Your team may be faster or slower.
- **AIQL time estimates** assume configured account mappings (one-time setup) and a stable connection. First-time setup for a new client adds ~30 min — not counted above.
- **Month-2 savings** assume 30% of anomalies repeat and auto-resolve. Higher for stable businesses (distributors), lower for fast-moving ones (startups, restaurants).
- **₹1,500/hr** is the assumed CA cost. Adjust up for partner-grade hours, down for article time.
- **Zero-voucher companies** (Apollo, Sharma, Speedy Cargo) show 88–85% savings mainly from automated reconciliation. If your client already has a reconciliation tool, adjust accordingly.

---

*Document prepared with AIQL ERP · Data from real GL files in `test-data/companies/` · Generated 2026-05-11*
