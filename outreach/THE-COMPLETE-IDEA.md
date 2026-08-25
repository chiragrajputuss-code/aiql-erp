# AcctQAI — The Complete Idea

*Living strategy doc. Last updated: 12 August 2026. This supersedes the older docs in `/docs` (pitch deck, tier-1 plan, dev plan), which predate the decisions below.*

---

## 1. One line

**AcctQAI reads a business's books and finds the money quietly leaking out of them — blocked GST input tax credit and duplicate payments — with the evidence and the exact rupee amount, so it can be recovered before it's gone.**

---

## 2. The problem (real, validated by first-hand data)

Indian businesses lose real money to two invisible leaks:

1. **Blocked ITC.** You buy something, pay the GST, and assume the input tax credit is yours. But ITC only becomes valid if your *supplier* files their GSTR-1 so the invoice appears in your GSTR-2B (Section 16(2)(aa)). If they don't file, the credit dies — you did nothing wrong and still lose the cash, usually discovered months later at filing time.
2. **Duplicate payments.** The same bill paid twice — once from site cash, once from head-office bank; or entered twice with a slightly different reference. Tally never warns you. Each payment looks legitimate on its own.

Neither shows up as a line item. Both are found too late. On one real sample month, the engine found **~₹1.3 lakh** of these across a single business's books.

---

## 3. What it is — and what it is NOT

**Is:** a read-only *investigation* layer that sits on top of the books you already keep. Upload a purchase register (GL) + GSTR-2B → get a prioritised report of findings, each with the supporting invoices, the ₹ impact, and a recommended action.

**Is NOT:**
- ❌ Accounting software — it does not replace Tally. You keep working exactly as before.
- ❌ A replacement for the CA — only a CA can file and sign. It makes the CA faster.
- ❌ A tool that touches your books — read-only, always. Sensitive names/amounts are masked before any processing.
- ❌ Auto-close, receivables, or cash-flow forecasting — **not built.** Say "not yet," never pretend.

**The philosophy (also the honest positioning):** it's a tireless junior that does the checking and hands the professional the evidence. **The judgment always stays with the human.** That's literally how it's built — findings are computed deterministically, evidence is attached, the LLM only narrates.

---

## 4. The customer

- **The CA is the channel.** One CA firm handles 50–200 SME clients on Tally, already holds their books, and already has their trust. One conversation = many client books. Reachable (50 CAs), unlike 5,000 SMEs.
- **The SME is the beneficiary** — they feel the pain (they lose the money), but they're hard to reach one by one.
- **So: sell the SME's pain, through the CA's door.** And pitch the CA on *protection* ("never be the one who missed the ITC") + *new billable revenue* ("charge each client for a health check"), not on pain relief — the CA doesn't feel the pain, the client does.

*Caveat: the CA channel is a reasoned hypothesis, not validated. Test SME-direct in parallel during the first 20 conversations and watch which one leans in.*

---

## 5. The wedge & why it can win

- **Reconciliation is a commodity** (Tally, ClearTax, etc. all do GST reconciliation). We do NOT win there.
- **Duplicate-payment detection at SME price is genuine whitespace** — the enterprise tools (AppZen, Tipalti) are unaffordable; nobody does it cheap for Indian SMEs. This is the differentiator. Lead with it.
- **Cross-ERP neutrality** — we analyse whatever you export; incumbents want lock-in and won't.
- **The winner is decided by distribution + trust, not features.** The code is not the moat (see §7).

---

## 6. Why now

LLMs make the *narration* of findings cheap and the product buildable by one person. But the engine is deterministic — AI explains, never invents. GST's structural dependency on suppliers filing (GSTR-2B) is the external anchor that makes reconciliation findings possible; that anchor exists only in India, which is why this is an India-first product.

---

## 7. The honest competitive reality (no illusions)

- **The code is not a moat.** A competent dev + AI could clone the visible product in ~a week. We verified this thinking explicitly.
- **TallyPrime has built-in GSTR-2B reconciliation.** The single biggest open question: do CAs actually use it, or still do it in Excel? *Unanswered — must be validated with real CAs.*
- **ClearTax + content farms (e.g. aiaccountant.com) own the GST SERPs.** SEO will not win head terms; long-tail only.
- **AccountsIQ** (Irish mid-market GL) is a different product/market — not a competitor, but the reason we renamed from "AccountIQ" (trademark proximity).

**What IS the moat (all earned, not built):**
1. A corpus of real, messy client books → robustness a cloner can't replicate without the data.
2. A confirmed-outcomes dataset ("this duplicate was real, recovered ₹X") → precision + proof.
3. Owned CA relationships / distribution.
4. Trust as "safe to hand my books to."
All four come from one motion: real client books flowing through it via CAs.

---

## 8. Go-to-market (the actual plan)

**Positioning line: "Computed, not generated."**
AcctQAI must never present as an AI-wrapper. The truthful claims that separate it
from LLM-wrapper tools (and from AI-cost risk):
- Findings come from deterministic rules — same input, same report, to the rupee.
  An auditor can re-perform it. (Honesty note: Audcrix/CORAA also market
  determinism — this is table-stakes trust copy in the audit niche, NOT a moat.)
- AI writes exactly one field (the narration). It never calculates a number and
  never sees real names/amounts (masked first). The report renders with the AI
  switched off — verified in tests.
- Therefore: no AI credits, no per-query metering, ever — and AI COGS is a
  rounding error (~₹50–200/customer/yr), so token-price shocks hurt LLM-in-the-
  loop competitors, not us. Free hosted/open-source models are a tailwind (swap
  via safeLlmCall), not a threat — customers buy checks + evidence + deadlines +
  accountability, not a model.

**The motion: give away an audit, don't sell software.**
> "Send me one client's purchase register + GSTR-2B. I'll send back every invoice where ITC is at risk and any bill paid twice. Free, no signup. If it finds nothing, you've lost ten minutes."

**Rules that protect credibility (untested on real CA data — see §11):**
1. Position as *early / design partner / free* — honesty is the pitch.
2. **Run the first ~5 files yourself and verify every finding before the CA sees it.** A crash is forgivable; a wrong number is not.
3. Ask for one *simple* client first.
4. Never promise the ₹1.3L number — "yours might find more, less, or nothing."
5. **End every conversation with: "Who are 2 other CAs you'd suggest I talk to?"** — the referral engine that turns 50 into a chain.

**Funnel:** ~50 CAs reached → ~30 conversations → ~18 agree → ~12 send a file → **10 onboarded.** Works only if the 50 are warm (referral-heavy).

**Channels:** own network first → referrals → LinkedIn (city CAs) → CA WhatsApp groups → CAclubindia/TaxGuru (be useful, don't pitch) → ICAI local branch → cold email to CA firms.

**The one metric:** ₹ found per client book. Consistently ₹50k+ = a business. ~₹0 on real books = the most valuable thing you could learn, fast.

---

## 9. Pricing

- **₹15,000–30,000 / year**, per CA practice tiered by number of client entities (not flat per-user).
- **The close = a findings guarantee, billed as flat subscription:** "If we don't find you at least the annual fee in the first month, you pay nothing." All the risk-reversal of "only pay if it works," none of the poison of commission billing (which would incentivise over-reporting and destroy finding-credibility).
- **Not commission-based.** Decided and rejected: "found ≠ recovered," attribution fights, and it corrodes the trust that is the whole product.

---

## 10. Current status (built + verified, honest)

- ✅ Engine genuinely works end-to-end on real files: GST/ITC reconciliation (7 checks: GST-ITC-001…005) + duplicate payments (DUP-PAY-001/002). Verified ~₹1.3L found on one sample month.
- ✅ Hardened for real-world messiness: ₹/Dr/Cr/parentheses amounts, Tally & Indian day-first dates, invoice-number format differences (no more false "not filed"). Tests green.
- ✅ Live site (acctqai.com): honest copy (claims only what it does; "coming soon" stated plainly), SEO indexed, structured data, OG/favicon, contact form that persists leads.
- ✅ Renamed AccountIQ → AcctQAI (trademark-clean, matches domain).
- ✅ Client-facing **Health Check PDF** deliverable (Investigations → Download PDF).
- ✅ Founder assets: outreach playbook, pipeline tracker, LinkedIn page copy + logo + banner.
- ❌ **Zero customers. Zero real CA files run. CA channel unvalidated.** ← the only thing that matters now.

---

## 11. What could kill this (honest risks)

1. **The pain is shallow / Tally already covers it** — the #1 thing to test. Ask real CAs.
2. **CA channel wrong** — reasoned, not validated. Test SME-direct in parallel.
3. **Untested on real CA data** — first files may break or mislead. Mitigation: run-it-yourself + verify-before-send.
4. **Not sticky** — month-end tool, not daily. Watch whether CAs come back.
5. **Founder idea-hopping** — the biggest risk, named by the founder's own plan. Banking, US market, Get Paid, Axiom were all explored and correctly parked. Focus wins.

---

## 12. Explicitly deferred (not now)

Live GSTN auto-pull / continuous "watchdog" (needs a GSP); general/bank reconciliation; receivables & cash-flow investigations; auto-close; US market; banking/enterprise (procurement wall); new investigations beyond the 7 — **added only when a real CA says which pain hurts most.**

---

## The single next action

Not a feature. Not a new market. **Reach 10 CAs this week and get one real client file to run.** Everything above is ready. The only missing input is a human saying yes — and the only way to get that is volume of outreach. See `ca-outreach-playbook.md` and `ca-pipeline-tracker.csv`.
