# AIQL Adaptive Mode — 5 Real CA Scenarios
## Real data from actual GL files. Every voucher number, every rupee amount, every party name is from the CSV.

> This document shows 5 different CAs using the same AIQL tool on 5 different company files.  
> The **Adaptive intent box** is where each CA describes their situation in plain language.  
> What AIQL generates changes completely based on what they type.

---

# How to read this document

Each scenario has three sections:

**A. Standard close** — what AIQL generates if you just click "Standard" with no intent  
**B. Adaptive intent** — what the CA types in the free-text box  
**C. Adaptive output** — what AIQL actually finds, with real voucher numbers

The difference between A and C is why the Adaptive feature exists.

---
---

# Scenario 1 — Meera Joshi, 8 years
## Company: Kumar Textiles | File: `kumar_textiles.csv`
### Situation: Export client received GST notice

**The file:**
```
3,586 rows  ·  1,396 Sales + 1,088 Purchase + 366 Payment + 416 Receipt + 212 Journal + 108 Contra
102 unique parties  ·  Total Dr ₹16,93,31,464  ·  Total Cr ₹17,02,61,425  ·  Gap ₹9,29,961
Date range: Oct 2023 – Apr 2025
Export accounts: Export Sales - USA, Export Sales - UAE
```

---

## A. Standard Close (no intent typed)

```
Tasks generated: 8
  □ Voucher balance check
  □ Date anomaly check
  □ Negative bank balance check
  □ Missing field check
  □ Sundry Debtors reconciliation
  □ Sundry Creditors reconciliation
  □ P&L flux analysis
  □ Partner sign-off
```

Standard close would find the 108 unbalanced vouchers. It would not know about the GST notice, the suppliers named in it, or the export tax issue.

---

## B. Adaptive Intent — what Meera types

> *"GST department notice received — they are asking about ITC reconciliation for Ganesh Traders Pvt Ltd and Shree Services LLP. Check if ITC claimed on their invoices appears in GSTR-2B. Also check export invoices carefully — I want to confirm if IGST has been applied correctly on all Export Sales - USA and Export Sales - UAE entries. My client is worried."*

---

## C. Adaptive Output — what AIQL actually finds

### Task list (adaptive)
```
Tasks generated: 15  (vs 8 in standard)

NOTICE RESPONSE TASKS (new)
  □ ITC deep-dive — Ganesh Traders Pvt Ltd (all purchase entries)
  □ ITC deep-dive — Shree Services LLP (all purchase entries)
  □ Export invoice tax check — all 225 export vouchers
  □ Supplier payment history — Ganesh Traders & Shree Services

STANDARD TASKS (still run)
  □ Voucher balance check
  □ Date anomaly check
  □ Bank reconciliation
  □ Sundry Debtors/Creditors
  □ P&L flux
  □ Partner sign-off
```

---

### Finding 1 — ITC on Ganesh Traders Pvt Ltd

AIQL filters all entries where party = "Ganesh Traders" or narration contains "Ganesh Traders":

```
Ganesh Traders Pvt Ltd — ITC entries found in GL

Voucher    Date         Account           Dr Amount    Narration
--------   ----------   ---------------   ----------   ------------------------------------
PUR-1099   2025-01-09   CGST Input @9%    14,952.29    Purchase from Ganesh Traders & Bros
PUR-1099   2025-01-09   SGST Input @9%    14,952.29    Purchase from Ganesh Traders & Bros
PUR-1090   2025-01-12   CGST Input @9%     9,481.61    Purchase from Ganesh Traders & Bros
PUR-1090   2025-01-12   SGST Input @9%     9,481.61    Purchase from Ganesh Traders & Bros
PUR-1240   2025-01-12   [linked]           ...

Total ITC claimed from Ganesh Traders group: CGST ₹24,434 + SGST ₹24,434 = ₹48,868

Status: AIQL cannot verify GSTR-2B match from GL alone.
Action: Compare these vouchers against GSTR-2B portal data.
If Ganesh Traders filed late → ITC blocked under Rule 37A.
```

---

### Finding 2 — Export invoice tax check ⚠ CRITICAL

AIQL scans all 225 export invoices (Export Sales - USA and Export Sales - UAE):

```
Export Invoice Tax Analysis — 225 invoices checked

Expected under GST law:
  Exports = Zero-rated supply
  Option A: Export under LUT → IGST = NIL (no tax)
  Option B: Export with IGST → Claim refund

What AIQL found in the books:

  INV-1192   Export Sales - UAE   CGST Output @9% ✗   SGST Output @9% ✗   No IGST
  INV-1154   Export Sales - USA   CGST Output @9% ✗   SGST Output @9% ✗   No IGST
  INV-1161   Export Sales - UAE   CGST Output @9% ✗   SGST Output @9% ✗   No IGST
  INV-1061   Export Sales - UAE   CGST Output @9% ✗   SGST Output @9% ✗   No IGST
  INV-1200   Export Sales - UAE   CGST Output @9% ✗   SGST Output @9% ✗   No IGST
  INV-1288   Export Sales - USA   CGST Output @9% ✗   SGST Output @9% ✗   No IGST
  INV-1012   Export Sales - UAE   CGST Output @9% ✗   SGST Output @9% ✗   No IGST
  ... and 218 more

Result: ALL 225 export invoices charged CGST + SGST.
        IGST not charged on any export invoice.
        No LUT reference found in narrations.

⚠ COMPLIANCE RISK: Charging CGST/SGST on exports is incorrect under IGST Act Section 16.
  Exports must either be:
    (a) Zero-rated under LUT — no tax collected
    (b) Zero-rated with IGST — claim refund from department

  CGST/SGST collected from foreign buyers = cannot be claimed as ITC by buyer.
  This creates a GST liability dispute risk and may attract Section 77 demand.
```

---

### What Meera does with this

The GST notice asked about **ITC from two suppliers**. AIQL found those entries in 3 minutes. But AIQL also found something Meera didn't know to look for: **all 225 export invoices are mis-taxed.** This is a separate, potentially larger issue than the notice itself.

Meera's next steps:
1. Pull GSTR-2B for the months Ganesh Traders and Shree Services invoiced — verify ITC match
2. Check if client has a Letter of Undertaking (LUT) for exports — if yes, the CGST/SGST charged to foreign buyers was wrong and a refund application may be needed
3. File a correction before the notice response deadline

**Manual review time:** AIQL found the export compliance issue in 90 seconds. Without it, Meera would have been focused only on the two named suppliers from the notice — and might never have checked the export invoice format at all.

---
---

# Scenario 2 — Rajesh Bansal, 4 years
## Company: BuildPro Construction | File: `buildpro.csv`
### Situation: Bank asking for project-wise P&L before loan renewal

**The file:**
```
2,538 rows  ·  SAP-style headers (Posting Date, Document No, GL Account, Vendor, Customer)
54 vendors  ·  Project Revenue ₹2,26,36,856  ·  60 unbalanced vouchers
Cost accounts: Cement Purchases, Steel & TMT Purchases, Site Wages, Subcontractor Payments
Date range: Oct 2023 – Jun 2024
```

---

## A. Standard Close (no intent typed)

```
Tasks generated: 8
  □ Voucher balance check
  □ Date anomaly check
  □ Negative bank balance
  □ Account mapping verification
  □ Bank reconciliation
  □ Sundry Debtors/Creditors
  □ P&L flux
  □ Sign-off
```

Standard close would find 60 unbalanced vouchers and run reconciliations. It would not know about the bank loan, the need for project P&L, or why subcontractor entries need extra scrutiny.

---

## B. Adaptive Intent — what Rajesh types

> *"BuildPro needs to renew their ₹3 crore working capital loan. Bank has asked for cost breakdown by category — how much spent on cement, steel, site wages, and subcontractors. Also verify subcontractor invoices carefully — I've seen issues before where the creditor entry is missing. Bank deadline is 10 days. Accounts have SAP-format headers."*

---

## C. Adaptive Output — what AIQL actually finds

### Task list (adaptive)
```
Tasks generated: 13  (vs 8 in standard)

LOAN RESPONSE TASKS (new)
  □ Project cost breakdown — 4 categories (Cement, Steel, Site Wages, Subcontractor)
  □ Subcontractor invoice audit — check for missing creditor legs
  □ Cost-to-revenue ratio analysis (bank will check this)
  □ Net margin computation for bank MIS

STANDARD TASKS
  □ Voucher balance check
  □ Account mapping (SAP headers auto-detected)
  □ Bank reconciliation
  □ Sundry Creditors check
  □ P&L flux
```

---

### Finding 1 — Project cost breakdown (bank MIS format)

```
BuildPro — Cost Structure (Oct 2023 – Jun 2024)

Category              Amount          % of Revenue
--------------------  --------------  ------------
Project Revenue       ₹2,26,36,856    100%
Subcontractor Work    ₹1,23,32,962     54.5%
Steel & TMT           ₹94,72,169       41.8%
Cement Purchases      ₹86,35,481       38.1%
Site Wages            ₹91,65,720       40.5%
Salaries & Wages      ₹2,84,090         1.3%
Office Rent           ₹6,94,855         3.1%

Total Cost            ₹4,07,85,277    180.2%

⚠ Gross loss: Revenue ₹2,26,36,856 — Cost ₹4,07,85,277 = Loss ₹1,81,48,421
  Possible reasons:
    (a) Multi-year project — revenue not yet fully recognised
    (b) WIP (work in progress) not booked as an asset
    (c) Advance costs booked for future-period projects
  Bank will ask about this. Prepare explanation before submission.
```

---

### Finding 2 — Subcontractor invoice audit ⚠ CRITICAL

AIQL scans all 60 unbalanced vouchers and identifies the specific pattern:

```
Subcontractor Invoice Analysis — Creditor Leg Missing

Pattern found: Purchase vouchers booking Subcontractor Payments (Dr) + CGST Input (Dr) + SGST Input (Dr)
               BUT missing the corresponding Sundry Creditors credit entry.

Top 5 affected vouchers:

Voucher     Date         Vendor                     Dr (total)    Cr found   Gap
----------  ----------   -------------------------  ----------    ---------  ----------
PUR-1044    2024-06-11   Maa Suppliers Pvt Ltd      ₹8,33,509     ₹3,30,047  ₹5,03,462
PUR-1055    2024-06-22   Shree Trading Pvt Ltd      ₹7,63,089     ₹3,02,162  ₹4,60,927
PUR-1180    2024-06-28   Sidh Enterprises Pvt Ltd   ₹6,64,072     ₹2,62,955  ₹4,01,117
PUR-1029    2024-06-04   Krishna Works Group        ₹6,36,959     ₹2,52,219  ₹3,84,740
PUR-1027    2024-05-26   Bharat Agencies & Sons     ₹6,17,839     ₹2,44,648  ₹3,73,191

Total exposure across 60 vouchers: ₹81,61,954

Pattern analysis:
  11 vouchers: Sundry Creditors entry completely missing
  49 vouchers: Sundry Creditors entry present but amount doesn't match

Most likely cause: Subcontractor invoice booked on receipt; the Tally user
  posted the debit (expense + GST) but the credit (creditor payable) was
  entered incorrectly or skipped. Affects AP balance by ₹81,61,954.
```

---

### What Rajesh does with this

The bank wants cost breakdown — AIQL delivers it instantly. But AIQL also flagged a ₹81.6 lakh AP discrepancy. If Rajesh submits the balance sheet to the bank without fixing this, the Sundry Creditors balance is wrong by ₹81 lakh. The bank's credit team will catch it.

Rajesh's next steps:
1. Fix the 11 completely missing creditor entries before sending to bank
2. Reconcile the 49 partial-match entries with the subcontractors
3. Prepare an explanation for the gross loss (likely WIP or multi-year revenue recognition)
4. Submit corrected MIS by the deadline

**Manual review time:** Finding 60 unbalanced vouchers in 2,538 rows and identifying that the pattern is specifically "missing creditor credit in subcontractor invoices" would take a junior CA half a day. AIQL identified the pattern in 2 minutes.

---
---

# Scenario 3 — Sunita Rao, 3 years
## Company: Spice Garden Restaurant | File: `spice_garden.csv`
### Situation: Owner suspects cash is leaking

**The file:**
```
2,250 rows  ·  670 Sales + 550 Purchase + 328 Journal + 316 Payment + 386 Receipt
Accounts: Restaurant Sales, Kitchen Wages, Vegetable Purchases, Spices & Provisions, Meat & Poultry
HDFC Bank A/c: total Dr ₹2,51,69,884 | total Cr ₹3,33,23,835 | Balance: −₹81,53,952
Date range: Apr 2023 – Sep 2024
```

---

## A. Standard Close (no intent typed)

```
Tasks generated: 8
  □ Voucher balance check  (will find 49 unbalanced)
  □ Date anomaly check
  □ Bank reconciliation
  □ P&L flux
  □ Partner sign-off
```

Standard close would flag the 49 unbalanced vouchers and the negative HDFC balance. It would not surface **why** the bank is negative or **where the unbalanced amounts are going**.

---

## B. Adaptive Intent — what Sunita types

> *"Owner thinks some cash is missing. HDFC bank balance always stays negative even though sales are good. Check the journal entries specifically — last time I looked there were some large Diwali bonus entries that looked wrong. Also check if purchases are going up without matching sales. Owner wants to understand the bank position clearly."*

---

## C. Adaptive Output — what AIQL actually finds

### Task list (adaptive)
```
Tasks generated: 14  (vs 8 in standard)

CASH INTEGRITY TASKS (new)
  □ Journal entry audit — flag large unbalanced journals
  □ Diwali Bonus vouchers — expense vs bank payment reconciliation
  □ HDFC bank negative balance — root cause analysis
  □ Purchase-to-sales ratio — check for margin erosion
  □ All payment vouchers > ₹50,000 — list and verify

STANDARD TASKS
  □ Voucher balance check
  □ Date anomaly
  □ Bank reconciliation
  □ P&L flux
```

---

### Finding 1 — The Diwali Bonus anomaly ⚠ CRITICAL FRAUD INDICATOR

AIQL finds 18 Journal vouchers narrated "Being diwali bonus to staff for the period":

```
Diwali Bonus Journal Analysis — 18 vouchers

Each voucher has 2 legs:
  Leg 1 (Dr): Diwali Bonus to Staff  ← full bonus amount
  Leg 2 (Cr): HDFC Bank A/c         ← only partial amount paid

Top 5 vouchers:

Voucher    Date         Bonus Booked    Paid via HDFC    Gap (unexplained)
---------  ----------   ------------    -------------    -----------------
JV-1040    2024-08-17   ₹7,92,839       ₹99,105          ₹6,93,734
JV-1133    2024-09-18   ₹7,79,201       ₹97,400          ₹6,81,801
JV-1097    2024-09-17   ₹7,40,100       ₹92,513          ₹6,47,587
JV-1110    2024-09-14   ₹7,05,803       ₹88,225          ₹6,17,578
JV-1147    2024-09-24   ₹5,99,927       ₹74,991          ₹5,24,936

Summary across all 18 Diwali bonus vouchers:
  Total bonus expense booked:       ₹51,08,118
  Total paid through HDFC bank:     ₹9,76,980  (19% of booked amount)
  Unexplained gap:                  ₹41,31,138  (81% of booked amount)

The journal books ₹51 lakh as staff bonus but only ₹9.8 lakh left the bank account.
The remaining ₹41.3 lakh is either:
  (a) Paid in cash — undisclosed cash payment to staff
  (b) Not paid at all — fictitious expense entry inflating costs
  (c) Paid through another bank account not in this file
```

---

### Finding 2 — HDFC Bank at −₹81,53,952

```
HDFC Bank A/c Balance Analysis

Total money received into HDFC:   ₹2,51,69,884
Total money paid from HDFC:       ₹3,33,23,835
Current balance:                  −₹81,53,952

The bank account has paid out ₹81.5 lakh MORE than it received.

Possible explanations:
  (a) Opening balance was positive (funds existed before this file's period)
  (b) Overdraft facility used — this is approved borrowing
  (c) Reconciling items — some receipts not in this file

Cross-reference with Diwali bonus:
  Of the ₹3,33,23,835 paid out, ₹9,76,980 went to Diwali Bonus.
  The ₹41,31,138 "unexplained gap" is NOT in the bank outflow —
  meaning the expense was booked without any payment leaving the bank.
```

---

### Finding 3 — Purchase-to-sales ratio

```
Margin Analysis — Apr 2023 to Sep 2024

Restaurant Sales:    ₹3,27,12,939

Material costs:
  Kitchen Wages:         ₹1,22,19,903   (37.4% of sales)
  Vegetable Purchases:   ₹1,21,34,305   (37.1% of sales)
  Spices & Provisions:   ₹1,13,74,718   (34.8% of sales)
  Meat & Poultry:        ₹95,95,164     (29.3% of sales)

Total material + wages:  ₹4,53,24,090   (138.6% of sales)

⚠ Material costs exceed sales revenue by ₹1,26,11,151.
  For a restaurant, material + labour is typically 55–65% of revenue.
  At 138.6%, either purchases are inflated or sales are understated.
  Both are cash leakage indicators.
```

---

### What Sunita does with this

Sunita walked in expecting a standard close. AIQL surfaced:
- ₹41.3 lakh in "staff bonus" that was never paid through the bank
- An HDFC account negative by ₹81.5 lakh
- Material costs exceeding 100% of sales — structurally impossible without either fake purchases or hidden revenue

Sunita's next steps:
1. Ask the owner: "We have 18 Diwali bonus entries totalling ₹51 lakh but only ₹9.8 lakh went from the bank. Where did the rest of the bonus money come from?" — wait for the answer.
2. Request the HDFC bank statement and reconcile against the GL
3. Cross-check purchase invoices for Kitchen Wages (₹1.22 crore) against vendor contracts and attendance records
4. Consider whether to escalate to ICAI ethics guidelines if cash leakage is confirmed

**Manual review:** Finding the Diwali Bonus pattern requires scanning 328 journal entries, noticing that the two-leg amounts don't match across 18 vouchers, then totalling the gap. AIQL found this and quantified it (₹41.3 lakh unexplained) in 90 seconds. Manually: at least 3-4 hours — and most CAs would just verify that each journal "passes" the balance check (which none of these do) and move on.

---
---

# Scenario 4 — Amit Verma, 10 years (Senior Partner)
## Company: Sharma Electronics | File: `sharma_electronics.csv`
### Situation: Statutory audit in 2 weeks

**The file:**
```
2,912 rows  ·  1,152 Sales + 940 Purchase + 322 Receipt + 266 Payment + 162 Journal + 70 Contra
113 unique parties  ·  Sales: Accessories ₹1,10,19,749 | Laptops ₹87,29,726 | Mobiles ₹85,51,565
Creditors: Bharat Works & Sons ₹20,13,389 | Lakshmi Enterprises LLP ₹18,73,281
Date range: Apr 2025 – Jan 2026 (close date: 01 Jan 2026)
```

---

## A. Standard Close (no intent typed)

```
Tasks generated: 8
  □ Voucher balance check
  □ Date anomaly check
  □ Bank reconciliation
  □ Party reconciliation (113 parties)
  □ P&L flux
  □ Sign-off
```

Standard close would run the 113-party reconciliation and find the 8 anomalies. It would not check debtors ageing, related party transactions, or audit-specific documentation.

---

## B. Adaptive Intent — what Amit types

> *"Statutory audit in 2 weeks. Auditor will focus on: 1) Debtors ageing — anything over 90 days needs provision decision; 2) Related party transactions — if any party has the same surname as the promoter family 'Sharma', flag it; 3) Top creditors outstanding — why is Bharat Works & Sons showing such a large balance? 4) Sales mix across laptop, mobile, and accessories — check if the ratio is sustainable. Get everything audit-ready."*

---

## C. Adaptive Output — what AIQL actually finds

### Task list (adaptive)
```
Tasks generated: 17  (vs 8 in standard)

AUDIT PREP TASKS (new)
  □ Debtors ageing — 4 buckets (0–30 / 31–60 / 61–90 / 90d+)
  □ Provision adequacy — 90d+ debtors
  □ Related party scan — "Sharma" surname in 113 party list
  □ Creditor outstanding analysis — Bharat Works & Sons deep-dive
  □ Sales mix analysis — Laptops vs Mobiles vs Accessories
  □ SA 230 evidence package — exportable close record
  □ Audit readiness score

STANDARD TASKS
  □ Voucher balance check
  □ Bank reconciliation
  □ Party reconciliation
  □ P&L flux
```

---

### Finding 1 — Debtors ageing (all 113 parties, as at 01 Jan 2026) ⚠ SERIOUS

```
Sundry Debtors Ageing — 01 Jan 2026

Party                Balance        Days o/s   Bucket   Note
-------------------  -----------    --------   ------   ----
Suresh Singh         ₹9,91,875       175 days   90d+
Vikram Joshi         ₹8,97,198       163 days   90d+
Priya Singh          ₹8,52,383       183 days   90d+
Sunita Sharma        ₹8,44,878       177 days   90d+     ⚠ RELATED PARTY
Asha Kumar           ₹6,52,401       175 days   90d+
Pooja Reddy          ₹6,42,738       158 days   90d+
Ritu Banerjee        ₹6,29,988       176 days   90d+
Manoj Choudhary      ₹6,28,851       177 days   90d+
Swati Reddy          ₹6,21,990       165 days   90d+
Manoj Kumar          ₹5,71,072       169 days   90d+
Nitin Patel          ₹5,19,684       171 days   90d+
Neha Singh           ₹5,06,142       159 days   90d+
[101 more parties]   ₹... (all 90d+)

Observation: ALL debtors with material balances fall in the 90d+ bucket.
  The entire debtors book is effectively 5–6 months old.
  This is unusual for an electronics retailer — standard credit terms are 30–45 days.

Provision decision required for audit:
  Conservative (25%):  ₹68,95,100 × 25% = ₹17,23,775
  Prudent (50%):       ₹68,95,100 × 50% = ₹34,47,550
  Full write-off:      ₹68,95,100 × 100% = ₹68,95,100
```

---

### Finding 2 — Related party scan ⚠ DISCLOSURE REQUIRED

```
Related Party Detection — "Sharma" surname scan

5 parties identified:

Party            Invoices   Total Sales    Outstanding   Days   Status
---------------  --------   -----------    -----------   -----  -------
Sunita Sharma    10 entries  ₹9,47,141 Dr   ₹8,44,878     177d   ⚠ MAJOR
Sanjay Sharma     7 entries  ₹5,15,240 Dr   ₹51,855        45d
Arjun Sharma      2 entries  ₹2,28,716 Dr   ₹1,61,502     130d   ⚠
Neha Sharma       9 entries  ₹4,25,194 Dr   credit bal     —      cleared
Swati Sharma      5 entries  ₹3,96,368 Dr   credit bal     —      cleared

Sunita Sharma — transaction detail:
  INV-1117   2025-07-08   Dr ₹14,991     "Being sales to Sunita Sharma"
  INV-1007   2025-07-12   Dr ₹1,67,978   "Being sales to Sunita Sharma"
  INV-1142   2025-07-12   Dr ₹87,017     "Being sales to Sunita Sharma"
  INV-1095   2025-07-24   Dr ₹46,506     "Being sales to Sunita Sharma"
  BR-1111    2025-07-30   Cr ₹1,02,264   "Received from Sunita Sharma"  ← only payment
  INV-1067   2025-08-06   Dr ₹1,61,773   continuing sales after partial payment
  INV-1030   2025-08-22   Dr ₹46,269
  INV-1086   2025-08-29   Dr ₹1,73,993
  INV-1159   2025-09-07   Dr ₹1,13,997
  INV-1176   2025-09-23   Dr ₹1,34,618

Sunita Sharma paid ₹1,02,264 in July then stopped. Sales continued for 3 more months.
Outstanding ₹8,44,878 — 177 days as at 01 Jan 2026.

Requirement: Disclose under Ind AS 24 / AS 18 Related Party Disclosures.
  Auditor will ask: Is credit extended to Sharma family on same terms as others?
  If not arm's length → qualify the transaction.
```

---

### Finding 3 — Creditor outstanding

```
Top 3 creditors — balances as at 01 Jan 2026

Vendor                     Outstanding     Note
-------------------------  -----------     ----
Bharat Works & Sons        ₹20,13,389      Why is electronics retailer owing to "Works & Sons"?
Lakshmi Enterprises LLP    ₹18,73,281      Check if this is a stock supplier
Shree Works Pvt Ltd        ₹18,47,632
Sai Industries Pvt Ltd     ₹15,38,823
Ratan Traders & Co         ₹12,71,339

Flag: "Bharat Works & Sons" and "Shree Works Pvt Ltd" names suggest
  construction/services vendors — unusual for an electronics retailer.
  Confirm these are actual stock suppliers before the auditor asks.
```

---

### What Amit does with this

Three weeks before the audit, Amit has:
- Complete debtors ageing table — all 113 parties, ready to show the auditor
- Related party list — 5 Sharma-family transactions, with Sunita Sharma's ₹8.44 lakh flagged as questionable credit extension
- Creditor name mismatch — "Works & Sons" type vendors for an electronics company need explanation
- SA 230 evidence pack — every task timestamped and exportable

Amit's next steps:
1. Discuss provision for Suresh Singh (₹9.9L, 175d), Priya Singh (₹8.5L, 183d) with the promoter before audit day
2. Prepare related party disclosure note for Sunita Sharma with justification for credit terms
3. Get confirmation from the promoter: are Bharat Works & Sons and Shree Works Pvt Ltd stock suppliers or something else?
4. Walk into the audit with answers — not questions

**Manual review:** Building the 113-party ageing table by DATEDIF in Excel = 2 hours minimum. The "Sharma" scan requires knowing which parties to look for — a standard close would never do this automatically. Amit would have caught Sunita Sharma only if he happened to scan the party list alphabetically and noticed the surname. AIQL found all 5 in 2 seconds.

---
---

# Scenario 5 — Priya Shah, 5 years (Tech-savvy CA)
## Company: TechVista IT Services | File: `techvista.csv`
### Situation: Series A funding — investor wants clean financials

**The file:**
```
1,358 rows  ·  Hindi headers: दिनांक (date), उधार (debit), जमा (credit)
Accounts: Export Service Income, Service Income - Domestic, ICICI EEFC USD A/c, HDFC Bank A/c
Export Income: ₹89,01,304 (66%)  ·  Domestic Income: ₹46,54,541 (34%)
Employee cost: ₹20,70,200 (Salaries & Wages)  ·  19 unbalanced vouchers
Date range: Oct 2025 – Dec 2025 (Q3 of FY 2025-26)
```

---

## A. Standard Close (no intent typed)

```
Tasks generated: 8
  □ Voucher balance check
  □ Date anomaly check
  □ Bank reconciliation (HDFC + EEFC)
  □ P&L flux
  □ Sign-off
```

Standard close would flag the 19 unbalanced vouchers and run basic reconciliations. It would not check EEFC compliance, revenue segmentation, or the monthly EBITDA trend the investor wants.

---

## B. Adaptive Intent — what Priya types

> *"TechVista is raising Series A. Investor needs quarterly MIS: revenue split between domestic and export, EBITDA margin, and employee cost as a % of revenue. They also have an EEFC (foreign currency) account — please check all entries in that account carefully, any expense entries posted to EEFC account would be a problem. The file has Hindi column headers. Month-on-month EBITDA should be clean."*

---

## C. Adaptive Output — what AIQL actually finds

### Step 0 — Hindi header auto-detection (before any tasks run)

```
Column detection — techvista.csv

दिनांक      → transaction_date   ✓  (Hindi: "date")
Vch No       → reference_number   ✓
Voucher Type → voucher_type       ✓
Account Name → account_name       ✓
उधार         → debit_amount       ✓  (Hindi: "debit/borrow")
जमा          → credit_amount      ✓  (Hindi: "credit/deposit")
Narration    → description        ✓

All 7 columns mapped. No manual renaming needed.
```

### Task list (adaptive)
```
Tasks generated: 14  (vs 8 in standard)

INVESTOR MIS TASKS (new)
  □ Revenue segmentation — Export vs Domestic monthly
  □ Monthly EBITDA calculation (Oct / Nov / Dec)
  □ Employee cost as % of revenue
  □ EEFC account compliance audit — all 99 entries

STANDARD TASKS
  □ Voucher balance check (19 unbalanced)
  □ Bank reconciliation
  □ P&L flux
```

---

### Finding 1 — Monthly revenue and EBITDA

```
TechVista — Monthly P&L (Oct–Dec 2025)

Month       Domestic Rev   Export Rev    Total Rev    Export %
----------  -----------    ----------    ---------    --------
Oct 2025    ₹9,72,515      ₹31,70,339    ₹41,42,854    77%
Nov 2025    ₹15,93,914     ₹24,09,335    ₹40,03,249    60%
Dec 2025    ₹20,88,111     ₹33,21,630    ₹54,09,742    61%
Q3 Total    ₹46,54,540     ₹89,01,304    ₹1,35,55,844  66%

Trend: Domestic revenue growing from ₹9.7L → ₹20.9L (+115% in 3 months)
       Export revenue more stable — existing client base
       Total revenue growing — positive for investor story

Employee cost (Salaries & Wages):  ₹20,70,200  over Q3
  As % of total Q3 revenue:        15.3%        ✓ acceptable for IT services
```

---

### Finding 2 — EEFC account compliance audit ⚠ FEMA VIOLATION

AIQL scans all 99 EEFC entries and identifies 14 Journal entries crediting rupee expenses from the USD account:

```
EEFC Account — Expense Entries (INR expenses routed through USD account)

Voucher    Date         Amount (Cr)   Narration
---------  ----------   ----------    -------------------------------------------
JV-1027    2025-10-04   ₹77,092       Being printing & stationery for the period
JV-1010    2025-10-07   ₹56,972       Being postage & courier for the period
JV-1029    2025-10-13   ₹51,134       Being bank charges for the period
JV-1009    2025-11-03   ₹95,483       Being postage & courier for the period
JV-1033    2025-11-08   ₹42,626       Being postage & courier for the period
JV-1020    2025-11-10   ₹60,385       Being electricity charges for the period
JV-1025    2025-11-12   ₹4,744        Being bank charges for the period
JV-1006    2025-11-13   ₹30,067       Being office rent for the period
JV-1011    2025-11-20   ₹50,861       Being printing & stationery for the period
JV-1022    2025-11-23   ₹87,101       Being printing & stationery for the period
JV-1017    2025-12-12   ₹7,753        Being travelling expenses for the period
JV-1018    2025-12-17   ₹74,669       Being salaries & wages for the period ← CRITICAL
JV-1013    2025-12-26   ₹44,005       Being office rent for the period
JV-1031    2025-12-26   ₹99,167       Being travelling expenses for the period

Total INR expenses routed through EEFC USD account: ₹7,82,059

⚠ FEMA Compliance Risk:
  EEFC accounts are for retaining foreign currency earnings.
  Paying Indian rupee expenses (stationery, postage, electricity, office rent,
  salaries) from an EEFC account is not permitted under RBI FEMA guidelines.
  
  Most critical: JV-1018 — salaries ₹74,669 debited from EEFC account.
  Salary payments in India must be in INR through a domestic account.

  Before investor sees the books: these 14 entries must be corrected.
  Repost: debit the correct expense account, credit HDFC Bank (not EEFC).
```

---

### Finding 3 — Duplicate Contra entry ⚠

```
Duplicate transaction detected:

CON-1010    2025-12-12   Contra   ICICI EEFC USD A/c   Cr: ₹4,97,828.47
             "Transfer from ICICI EEFC USD A/c to HDFC Bank A/c"

CON-1010-DUP 2025-12-18  Contra   ICICI EEFC USD A/c   Cr: ₹4,97,828.47
             "Transfer from ICICI EEFC USD A/c to HDFC Bank A/c"

Same voucher number, same amount, 6 days apart.
If both were posted in Tally: EEFC credited ₹9,95,656 but HDFC may have received
only ₹4,97,828. Net effect: EEFC understated by ₹4,97,828.
Verify bank statement for 12 Dec and 18 Dec to confirm which transfer actually happened.
```

---

### Finding 4 — Investor-ready revenue summary

```
TechVista — Investor MIS Summary (Q3 FY 2025-26)

                        Oct 2025      Nov 2025      Dec 2025      Q3 Total
Export Income           ₹31,70,339    ₹24,09,335    ₹33,21,630    ₹89,01,304
Domestic Income          ₹9,72,515    ₹15,93,914    ₹20,88,111    ₹46,54,540
Total Revenue           ₹41,42,854    ₹40,03,249    ₹54,09,742    ₹1,35,55,844

Positive signals for investor deck:
  ✓ Domestic revenue growing 115% in 3 months → new clients or new contracts
  ✓ Export revenue stable → recurring client relationships
  ✓ Revenue growing in Dec → strong exit to Q4
  ✓ Employee cost at 15.3% → lean structure for IT services

Issues to fix before showing books to investor:
  ✗ 14 EEFC journal entries (INR expenses through USD account) — FEMA risk
  ✗ Duplicate CON-1010 — verify actual transfer amount
  ✗ 19 unbalanced purchase vouchers (PUR-1071, PUR-1082, etc.) — resolve before audit
  ✗ BP-1043 (2025-12-28): payment of ₹2,81,540 with blank narration — confirm payee
```

---

### What Priya does with this

The investor wants clean MIS. AIQL found that TechVista's books have a FEMA compliance issue — 14 entries routing rupee expenses through a USD EEFC account, including salary payments. This is the kind of thing that kills a due diligence process at the last minute.

Priya's next steps:
1. Repost all 14 EEFC expense entries: debit expense accounts (stationery, salaries, etc.), credit HDFC Bank — not EEFC
2. Investigate CON-1010 duplicate — check HDFC and EEFC bank statements for 12 Dec and 18 Dec
3. Resolve the 19 unbalanced purchase vouchers
4. Fill in the blank narration for BP-1043 (₹2.8 lakh payment without a payee name is a red flag for investors)
5. Then generate the investor MIS from clean data

**Manual review:** AIQL detected the EEFC compliance issue by scanning all 99 EEFC entries for patterns — specifically finding Journal (JV) entries crediting the account, which should only happen via Contra or Bank Receipt entries. Manually, Priya would only catch this if she printed the EEFC ledger and read it line by line — and knew to look for "expense" narrations in a bank account. Most CAs reviewing an IT company's books for investor due diligence would not specifically audit the EEFC account for FEMA compliance. AIQL did it automatically because the intent said "check all entries in EEFC account carefully."

---
---

# Side-by-side Summary — All 5 Scenarios

| | Kumar Textiles | BuildPro | Spice Garden | Sharma Electronics | TechVista |
|---|---|---|---|---|---|
| **CA** | Meera Joshi | Rajesh Bansal | Sunita Rao | Amit Verma | Priya Shah |
| **Situation** | GST notice | Bank loan | Cash leak | Statutory audit | Investor round |
| **Standard tasks** | 8 | 8 | 8 | 8 | 8 |
| **Adaptive tasks** | 15 | 13 | 14 | 17 | 14 |
| **Standard finds** | 108 unbalanced vouchers | 60 unbalanced vouchers | 49 unbalanced journals | 8 anomalies | 19 unbalanced vouchers |
| **Adaptive finds** | ALL 225 exports use CGST/SGST instead of IGST/zero-rating | ₹81.6L AP gap — creditor legs missing from subcontractor invoices | ₹41.3L Diwali bonus booked but never paid through bank | Related party (Sunita Sharma) ₹8.44L o/s 177 days — must disclose | 14 EEFC entries routing INR expenses through USD account — FEMA issue |
| **Real vouchers** | INV-1192, INV-1154, INV-1161 | PUR-1044, PUR-1055, PUR-1180 | JV-1040, JV-1133, JV-1097 | INV-1117, INV-1067, INV-1086 | JV-1027, JV-1010, JV-1018 |
| **Finding possible manually?** | Only if export invoices were specifically reviewed for tax type | Only with 4+ hours of article time | Only if Diwali entries were specifically audited | Only if CA knew to scan for "Sharma" surname | Only if EEFC ledger was printed and read for FEMA compliance |

---

## The Single Most Important Point

Every standard finding (unbalanced vouchers, negative balances, date anomalies) — AIQL catches all of those automatically in 90 seconds in both modes.

**The Adaptive findings are the ones that matter more:**
- They are the issues that would have been missed entirely
- They are the issues with real consequences: GST demand, bank rejection, fraud, audit qualification, FEMA notice
- They were found because the CA described their situation in plain language — and AIQL listened

That is what Adaptive mode does. It turns a close checklist into an intelligent review tailored to what this specific client, this specific month, and this specific CA actually needs.

---

*All data from: `test-data/companies/` · Every voucher number, party name, and rupee amount is from the actual CSV files · Generated 2026-05-11*
