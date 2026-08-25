# AcctQAI — CA Outreach Playbook

*Rewritten 16 Aug 2026 after the market research. Three things changed: the findings guarantee is GONE from anything shown to a CA (it asks them to breach their ethics code), pricing is now per-FIRM not per-client, and the opening ask is a broken file, not a client's books.*

**Goal:** reach 50 CAs → onboard 10 as design partners.
**The golden rule:** end EVERY conversation with *"Who are 2 other CAs you'd suggest I talk to?"*

---

## ⚠️ THE THREE HARD RULES

**1. NEVER offer a contingent / success-based fee to a CA.**
Clause (10), Part I, First Schedule of the Chartered Accountants Act 1949 makes it **professional misconduct** for a CA in practice to charge fees contingent on the findings or results of an engagement. Regulation 192's exceptions do not cover this.
- ❌ Never say to a CA: *"if it doesn't find you ₹X, you don't pay."*
- ✅ A **findings-based / contingency** offer may only be made **direct to a business owner**, never through or to a CA.

**2. Your GST checks are FREE elsewhere. Never lead with them.**
Optotax and SPEQTA give CAs 2A/2B-vs-purchase-register reconciliation free. HelloBooks is ₹4,999/yr. TallyPrime's built-in reconciliation produces the same five categories inside a renewal they already pay. Leading with "I reconcile GL vs GSTR-2B" tells a CA you are selling them something they already have for nothing. **Lead with a dated deadline or a specific decision instead.**

**3. Price per FIRM, not per client.**
Market rate is ₹2,100–3,000 per audited entity, or ₹25,000–45,000 per firm for unlimited clients. Of 98,967 ICAI firms, 68,125 are proprietorships. ₹20k × 80 clients is not a number they will ever say yes to.
- ✅ **₹25,000–40,000 per firm per year, unlimited clients.**

---

## The 3 non-negotiables

1. **Honesty is the pitch.** Early / design partner / free. Never hide that it's untested on real books.
2. **Run the first ~5 files YOURSELF and verify every finding before the CA sees it.** A crash is forgivable; a wrong number presented as fact is not.
3. **Never promise a ₹ figure.** "Yours might find more, less, or nothing — that's what I want to find out."

---

# THE OPENING ASK — use this first

The single easiest yes in this entire playbook. It needs **no client data**, so there is no confidentiality objection, no DPDP exposure, and no trust required.

## MESSAGE 0 — The broken file (START HERE)

> Hi [Name] — odd request, and nothing to buy.
>
> I'm building a tool that reads accounting exports, and my problem is that real Tally/Busy files are far messier than my test data. **Would you send me your worst, most mangled export?** Any client, any period — or even a junk file you gave up on.
>
> I'll tell you what broke and send it back parsed properly. No client data needed if you'd rather scrub it. I just need real-world mess.

**Why this works:** costs them nothing, flatters their experience, needs no trust — and quietly builds your regression corpus. Follow up with the two research questions below.

---

## THE TWO QUESTIONS TO ASK EVERY CA

These decide your roadmap. Ask them in every conversation:

1. *"Have you heard of LedgerVision, CORAA, Audcrix or AssureAI? Does your firm use anything like that?"*
   → Tests whether the audit-automation category has real users or just websites. **Nobody knows the answer to this. You will.**
2. *"At tax-audit time, what do you still do by hand? What eats the hours?"*
   → Whatever they name is what to build next. Not what research guessed.

---

# OUTREACH MESSAGES

## MESSAGE 1 — Warm / referral intro

> Hi [Name] — [Referrer] suggested I reach out. I'm building a tool for CA practices and I'd value 15 minutes of your view before I build further. Not selling anything.
>
> Two things I'd love to ask: what still gets done by hand at audit time, and whether the tools in this space (LedgerVision, CORAA and so on) are actually used by firms like yours.
>
> And if it's useful — send me your messiest Tally export and I'll show you what my parser makes of it.

## MESSAGE 2 — The dated deadline offer (use Sept–Nov)

> Hi [Name] — a specific, time-bound offer, free, nothing to buy.
>
> **Before 30 November:** send me one client's purchase register and their IMS/GSTR-2B export, and I'll flag (a) pending IMS records that Section 16(4) is about to permanently delete, (b) ITC that must be reversed under Rule 37A because the supplier didn't file 3B by 30 September, and (c) invoices unpaid past 180 days needing Rule 37 reversal.
>
> You verify everything before acting — I'll send the evidence rows with it. If it's not useful, tell me and I'll stop.

*Why this beats a generic reconciliation offer: it's a dated errand already on their wall, with penalties attached, and it's the one window where free 2B tools don't help them.*

## MESSAGE 3 — Personal network (WhatsApp status / post)

> Building a tool for CA practices. Looking for accountants who'd spend 15 minutes telling me what still gets done by hand at audit time — and send me their messiest Tally export to test against. Nothing to buy. Know anyone? 🙏

## MESSAGE 4 — WhatsApp CA group (only after you're a genuine participant)

> Hi all — I'm building tooling for CA practices and I need real-world mess to test against. If anyone has a Tally/Busy export that's a formatting nightmare, send it over (scrubbed is fine) — I'll tell you what broke and send it back clean. Nothing to buy. Happy to share what I learn about IMS/Rule 37A handling.

## MESSAGE 5 — The referral ask (EVERY time)

> This was really helpful, thank you. Who are 2 other CAs you'd suggest I speak to? Same thing — no pitch, just their view.

## MESSAGE 6 — After you deliver something

> Here's what came back on [client]'s data — [N] findings, evidence rows attached for each. Please verify against your records before acting on any of it.
>
> Two questions: (1) **would this go into your working-paper file as-is, or would you have to rewrite it?** (2) what's the ONE thing that would make it more useful?

*Question (1) is the most valuable question in this playbook. It tells you whether you built a report or an audit document.*

## MESSAGE 7 — LinkedIn connection note (≤300 chars)

> Hi [Name] — building tooling for CA practices, and I'm trying to learn what still gets done manually at audit time. Not selling anything. Would value connecting and hearing your view.

## MESSAGE 8 — Cold email to a CA firm

**Subject:** Question about tax-audit work (not a sales email)

> Hi [Name],
>
> I'm building software for CA practices and I'd rather ask before I build. Two questions:
>
> 1. At tax-audit time, what still gets done by hand? Clause 44 bifurcation, 40A(3) cash testing, 269SS/T, TDS threshold checks — which of these actually eat your hours?
> 2. Does your firm use any of the automated ledger-scrutiny tools (LedgerVision, CORAA, Audcrix)? I'm trying to work out if they're genuinely used or just well-marketed.
>
> Happy to return the favour: send me your messiest Tally export and I'll tell you exactly what's wrong with it, free.

## MESSAGE 9 — CAclubindia / TaxGuru DM (after answering questions there)

> Hi [Name], I've seen your answers on GST/ITC here — you clearly do this daily. I'm building tooling for CA practices and would value 15 minutes on what still gets done manually at audit time. Nothing to sell. And if you have a mangled Tally export, I'd love a copy to test against.

---

## When they say yes — the onboarding flow

1. Ask for **one simple client**, not their biggest. Anonymised is fine.
2. **You** run it. Don't hand over the product yet.
3. **Verify every finding against the source.** Delete anything you can't stand behind.
4. Send it with evidence rows + "verify before acting."
5. Ask the working-paper question (Message 6).
6. Ask for 2 intros.

---

## Objection cheat-sheet

- **"Tally already does this."** → *"For GST reconciliation, largely yes — I'm not trying to sell you that. What I'm working on is the stuff that needs your ledger, your payment history and the portal joined together — Rule 37 180-day reversals, Clause 44 bifurcation, vendor filing patterns. Does Tally give you those?"*
- **"Is my data safe?"** → *"Read-only, names and amounts masked before processing, stored in India, auto-deleted in 90 days. Send it anonymised if you prefer — or just send me a broken file with no client data at all."*
- **"What does it cost?"** → *"Free while I'm shaping it. Later, ₹25–40k a year for your whole firm, unlimited clients — not per client."* **← NEVER add a findings guarantee here.**
- **"I'm too busy."** → *"That's the point. Send one file, I do the work, you read one page."*
- **"We already use [competitor]."** → *"Genuinely useful to know — what does it do well, and what do you still do by hand around it?"* **This is a research win, not a loss. Log it.**
- **"Is this one of those AI/ChatGPT tools?"** → *"No — and that matters for your file. Every finding is computed by fixed rules: run the same data twice, you get the same report to the rupee, so anyone can re-perform it. AI only phrases the summary — it never calculates a number and never sees real names or amounts. The report runs even with the AI switched off."* **This is the trust answer for a profession that must re-perform work — deliver it word for word.**

---

## PARALLEL SYSTEM — never wait on one person

- **A · Active outreach** — LinkedIn + cold email, 5–10 touches/day
- **B · Community presence** — answer GST questions on CAclubindia/TaxGuru, 2/day
- **C · Warm / referral** — every reply → "who are 2 more?"
- **D · One ICAI branch** — pick one, attend, offer to present on IMS/Rule 37A before 30 Nov. *Highest-durability asset in this document.*

Daily (~35 min): 5 LinkedIn + 3 cold emails + 2 forum answers → log all in the tracker.

---

## What to log (beyond the tracker columns)

For every conversation, capture:
- Which competitor tools they named (or hadn't heard of)
- What they said still gets done by hand
- Whether they'd put your output in a working-paper file
- Whether Tally's reconciliation actually works on their messy books

**That's the real deliverable of the next 30 days — not customers. Answers.**
