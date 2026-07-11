# Sample Data Files

Test data for AccountIQ — realistic Indian auto-ancillary SME (Maharashtra-based manufacturer).

---

## Files

### 1. `gl-full-fy2025-26.csv`
**Use for: GL upload → Query Studio (Ask AI)**

Full year General Ledger for FY 2025-26 (April 2025 – March 2026).

- ~110 rows across Sales, Purchases, Payments, Receipts, Journal entries
- 6 customers: Rajesh Auto, Bharat Forge, Mahindra Component, Tata AutoComp, Krishna Trading, export customers
- 10 vendors: Mehta Steel, Gupta Metal, Sharma Packaging, Kumar Electrical, TechNova, Speedway Logistics, Ravi Electricals, Pixel Ads, Joshi Engineering, Desai & Associates
- Includes GST payable journals, TDS deducted entries, salary, advance tax

**Upload as:** GL  
**Test queries:**
- "cash balance" → shows SBI + HDFC account balances
- "overdue debtors" → aging report by customer
- "GST summary" → CGST/SGST/IGST totals
- "sales last quarter" → Q4 Jan–Mar 2026
- "top vendors by spend"
- "payroll summary"
- "profit and loss"

---

### 2. `gl-purchases-may-2026.csv`
**Use for: GL upload → Reconcile against GSTR-2B**

Purchase-only GL for May 2026 (14 rows).

**Upload as:** GL

---

### 3. `gstr2b-may-2026.csv`
**Use for: GSTR-2B upload → Reconcile against GL purchases**

GSTR-2B statement for May 2026 (12 rows from 12 suppliers).

**Upload as:** GSTR-2B (ITC)

---

## Reconciliation gaps (GL purchases vs GSTR-2B)

Run reconcile on the connection where both files are uploaded. These gaps will appear:

| Gap code | Severity | What it is |
|---|---|---|
| **G2BGL-002** | critical | `Agarwal Stationery Mart` (INV AGW-B2026-88, ₹4,200) — in GL, missing from GSTR-2B. Vendor hasn't filed. |
| **G2BGL-002** | critical | `Sindhwani Rubber Products` (SRP-2026-0091, ₹9,400) — in GL, missing from GSTR-2B. Vendor hasn't filed. |
| **G2BGL-003** | review | `Vishwas Trading Company` (VTC-MAY-2026-12, ₹25,000) — in GSTR-2B, not booked in GL. ITC available but unclaimed. |
| **G2BGL-004** | review | `Ravi Electricals` (RE-INV-2026-19, ₹8,500) — matched, but `itc_eligibility = No` because supplier return not filed for previous period. |
| **G2BGL-005** | review | `Pixel Ads Agency` (GL) vs `Pixel Ad Agency` (GSTR-2B) — minor name mismatch on INV-PAA-0209. |
| **G2BGL-001** | info | Small overall variance due to the above gaps. |

After reconcile, the **Vendor ITC Scorecard** (`/connections/[id]/vendor-compliance`) will show:
- Agarwal Stationery Mart — amber/red
- Sindhwani Rubber Products — amber/red
- Ravi Electricals — amber (ITC blocked)

---

## How to use

1. Go to `/connections/new`
2. Upload `gl-purchases-may-2026.csv` → select **GL**
3. Upload `gstr2b-may-2026.csv` → select **GSTR-2B (ITC)**
4. On the GL connection, go to **Reconcile** tab → select the GSTR-2B document → Run
5. View gaps in the reconcile page
6. Go to connection detail → click **Vendor ITC Scorecard**

For Query Studio:
1. Upload `gl-full-fy2025-26.csv` → select **GL**
2. Go to the connection → click **Ask AI**
3. Try any of the test queries listed above
