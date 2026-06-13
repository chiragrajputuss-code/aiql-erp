# AIQL — CA Demo Runbook

> Tuesday meeting playbook. Read top to bottom once before the meeting, keep it open during.
> Everything in **italics-quotes** is a verbatim line you can say.
> You don't need to be a CA to run this — the script does the finance translation for you.

---

## Section 0 · Pre-meeting prep (30 min before they arrive)

Run through this checklist on your laptop. If anything fails, the demo fails — fix it now, not when they're sitting there.

### 0.1 — Make sure the dev server is healthy
```bash
# In one terminal
cd "/Users/chiragrajput/AIQL ERP"
pnpm --filter web dev
```
Wait for `✓ Ready in NNNNms`. Open http://localhost:3000/login. Login should render. If you get the "Cannot find the middleware module" error, kill the process (`pkill -f "next dev"`) and restart.

### 0.2 — Have a sample GL ready
You need a CSV with **at least 200 rows** of realistic Indian SME data — vendor names, customer names, amounts, GST, TDS columns. If you don't have one, use one of the test CSVs from `tools/smoke-test/`. Realistic ≠ clean — leave a few duplicate vouchers, a couple of Dr ≠ Cr entries, one CGST ≠ SGST mistake. **The system finding these is the demo.**

### 0.3 — Pre-load the knowledge base (so "compounding" is visible)
1. Log in, upload your sample GL, complete account mapping.
2. Create one close period for **March 2026** (the prior month). Walk through it, click `Yes — normal` on at least 3 anomalies. Add a note like *"Annual bonus paid via bank transfer"* on one.
3. Now create the **April 2026** close — you'll see auto-resolve fire on the same anomalies that were confirmed in March. **This is your "compounding" demo moment.** Don't skip this prep step — without it, the knowledge dashboard shows zeros and the wow lands flat.

### 0.4 — Set up at least one BYOK key
- Go to `/settings/api-keys`
- Add your own OpenAI key (or Anthropic, Groq — whichever you have)
- Confirm it shows as `…XYZ4` in the list

If you don't have any key, the privacy demo still works (the **Preview** panel masks live without a key) — but you can't show the round-trip. Borrow a Groq key (free tier) if needed.

### 0.5 — Open these 5 tabs in the browser
1. `/close` — Close Manager
2. `/close/<your-april-period-id>` — the April period detail
3. `/llm-privacy-demo` — Privacy Demo
4. `/knowledge` — Knowledge dashboard
5. `/settings/api-keys` — for the "this is your key, your bill" point

### 0.6 — Pre-write three sample prompts to copy-paste
Don't type these live — fumbling kills momentum. Have them in a notes app:

**Prompt A (vendor + amount masking):**
```
Reliance Industries paid us ₹12,50,000 against invoice INV-2024-0892
last month. CFO Mr Kumar wants to know if this aligns with our vendor
budget. Can you check?
```

**Prompt B (real CA question — adaptive close):**
```
We paid a one-time bonus in March to the senior team and salary
expense jumped ₹8,75,000. Watch the salary accounts carefully.
GST rate also changed mid-month - check CGST/SGST for the second
half differently.
```

**Prompt C (knowledge match — to show auto-resolve):**
Whatever you confirmed in 0.3 — re-ask it via the proxy to show "your knowledge base auto-injected".

---

## Section 1 · The opening (2 min)

Sit down. Don't open the laptop yet. Look at them. Say:

> *"You spend most of your monthly close on repetitive checks — voucher balancing, ledger scrutiny, GST reconciliation. The real CA work — judgment about whether something's normal or suspicious — is maybe 30% of the time. The other 70% is mechanical."*
>
> *"AIQL automates the mechanical 70% by **remembering your judgment from last time**. And — separately — your client data never leaves your box even when we use AI. Let me show you on a real GL."*

That's it. Don't pitch features. Don't say "AI-powered ERP." Just open the laptop.

**Why this opening:** CAs hear "AI" 30 times a week. The hook isn't AI — it's "remember my judgment" and "data stays mine." Both are believable, both are demonstrable.

---

## Section 2 · Upload a real GL (3 min)

### What to do
1. Open `/connections/new`
2. Click **Upload GL file**
3. Select your sample CSV
4. Wait for parse (~10 seconds for 5,000 rows)
5. Click into **account mapping**

### What to point at
- The auto-classification table. Most rows will say `BANK / 0.95 confidence`, `RECEIVABLE / 0.91`, etc.
- **Find the weirdest local-language account** in your sample (e.g. *Adatya Vyay* for commission, *Mukhya Karyalaya* for head office). It will be classified correctly.

### What to say
> *"Look — `Adatya Vyay` is correctly tagged as commission expense. `Sundry Creditors / Local` as Payable. The system uses the account group from your Tally export, falls back to Indian-finance naming conventions, and only as a last resort hits an LLM. **Total time so far: 90 seconds. Your usual time for this in Tally: 30-45 minutes.**"*

> *"You'll notice 11% are flagged UNKNOWN — those are the ones I want you to look at, not the 89% that are obvious."*

Click through and confirm 3-4 obvious ones. Click `Confirm all` if everything looks right.

### Anticipate
- *"What about the ones it gets wrong?"* → "You override it manually, system remembers your override forever — even across closes."
- *"Does this support Tally?"* → **Be honest.** "Direct sync is on the roadmap. Today it's CSV export. Realistic time: 5 minutes per client per month."

---

## Section 3 · Create your first close period (4 min)

This is where the **adaptive profile** does the work. Spend the most time here.

### What to do
1. Click `/close` → **New Close Period**
2. Name it *"April 2026 Close — Demo"*. Pick the connection. Pick April dates.
3. Stop on the **profile picker**. Don't click yet.

### What to say at the profile picker
> *"This is the first piece you'd really care about. Four shapes:"*

Point at each card in turn:

> *"**Standard** — your usual monthly close. 8-14 tasks. P&L review, BS review, recons, flux, sign-off. Use this for 80% of months."*
>
> *"**Quick** — bank recon, criticals, sign-off. 3-6 tasks. Use this for an interim close, or when you're 90% sure nothing's weird."*
>
> *"**Year-end** — Standard plus year-end accruals, depreciation, 26AS recon, physical stock count, year-on-year flux. We auto-suggest this when your end date is March 31."*
>
> *"**Adaptive** — this is the one I want to show you."*

Click **Adaptive**. Click Next.

### The Step 2 magic
Paste your **Prompt B** (one-time bonus + GST change).

> *"In English, Hindi, or Hinglish — anything you'd tell your CA. The system parses this and adds custom watch tasks based on what you said. **Watch this.**"*

Click Next.

### What to point at on the Preview screen
- The diff banner: "+2 added, -0 removed, 7 kept vs Standard"
- Click **Show added tasks** — you'll see two new watch tasks specifically for salary accounts and GST
- Scroll down to **AI understood** chips — `focus: salary` `focus: gst` `risk: GST rate changed mid-month`

### What to say
> *"Two extra tasks were added that wouldn't be in a Standard close. Salary watch task, because you mentioned the bonus. The GST recon was bumped up in priority because you said the rate changed. **The system understood your concern in plain English and shaped the close around it.**"*

> *"This is the closest thing in the demo to magic. The reason it's not actually magic is — once you've done it for 6 months, the system stops needing the prompt. It learns the patterns of your client. We'll get to that in a minute."*

Click **Create Period**.

### Anticipate
- *"Can I edit the tasks?"* → "Today: not yet. On the roadmap based on early feedback. You can mark a task as not-applicable in 5 seconds."
- *"What if my CFO speaks Tamil/Bengali/Marathi?"* → "Heuristic patterns work for English/Hindi/Hinglish today. The LLM fallback handles anything Llama 3.3 understands — Tamil and Bengali work, just less precisely. Test on a real prompt before promising your client."

---

## Section 4 · Find what matters automatically (5 min)

This is the longest section because it's where the **time-saved-per-month** number gets real.

### What to do
1. You're on the new April close period detail page
2. Scroll past the readiness card to the **task list**
3. Click into one of the `Resolve N voucher(s) where Dr ≠ Cr` tasks (one of the auto-generated anomaly tasks)

### What to point at
- The **affected rows table** — actual voucher numbers, dates, debit/credit amounts
- The **"Is this normal?" prompt** below the table
- (For the pre-loaded scenario): some tasks should already be **auto-resolved** with notes saying *"Auto-resolved from knowledge base. Prior answer: ..."*

### What to say
> *"Eight vouchers had Dr ≠ Cr. The system found them in 30 seconds. Without this, you'd find them on day 2 of testing — **assuming you find them at all.**"*

> *"Now — here's the part that matters. Look at this task here."* [point at one of the auto-resolved ones]

> *"Last month I confirmed three similar imbalances were just data-entry typos by my junior. **I never had to look at this task in April. It auto-resolved with my prior answer attached as the note.** That's 15 minutes of investigation I didn't do this month."*

> *"But — and this is important — the system has a precision check. **If next month there are 30 imbalances instead of 3, it stops auto-resolving and shows me the prior answer with a warning: 'scale changed, please review.'** I'll never get burned by it silently rubber-stamping a bigger problem."*

Now click into a task that's NOT auto-resolved. Click **Yes — normal**. Add a note: *"Vendor invoice timing — paid same day as receipt"*

> *"That's it. 5 seconds. Saved forever. Next month, if the same pattern shows up at the same scale, it auto-resolves. **Different scale, it asks me again.**"*

### Anticipate
- *"What if I make a mistake — say something is normal when it isn't?"* → "Open `/knowledge`, find the entry, change the verdict to REJECTED. The system stops auto-applying it. Audit trail of every change is preserved."
- *"How does this work for me as an internal auditor across multiple clients?"* → **Honest:** "Today, one organisation per login. Multi-client view is high-priority on the roadmap. If that's a blocker for you, tell me — I'd ship it for design partners first."
- *"What about scan issues you didn't catch?"* → "We catch the standard ones — voucher imbalance, duplicates, date outliers, missing fields, GST mismatch, sign anomalies. We don't catch sophisticated fraud (round-tripping, related-party, Benford's). For that, you'd need a forensic specialist tool."

---

## Section 5 · The privacy moment (4 min)

This is the **second** wow. Switch to `/llm-privacy-demo`.

### What to do
1. Paste **Prompt A** in the **left column** (Reliance Industries + ₹12,50,000)
2. **Wait 1 second.** Don't click anything. Watch the middle column light up automatically.
3. Point at the middle column.

### What to say
> *"Look at the middle. Reliance Industries became `VENDOR_T0001`. ₹12,50,000 became `AMOUNT_T0001`. INV-2024-0892 became `ACCT_T0001`. Mr Kumar became `EMPLOYEE_T0001`."*
>
> *"**This is what would leave my box if I asked OpenAI this question.** Real names — gone. Real amounts — gone. Real invoice number — gone. The system prompt at the top is plaintext, but that's our prompt — there's no client data in it."*

Now click **Send through proxy**. Wait 2-3 seconds.

> *"And the response comes back **with the originals restored.** OpenAI saw `VENDOR_T0001`. I see `Reliance Industries`. They never saw the data, I got the answer."*

### The kicker — point at the audit trail at the bottom
> *"Every call goes here. What was masked, by category. Knowledge applied count. Token count. Status. **If your IT team or your client's compliance officer asks 'what data left the box this month' — this is the answer.**"*

### The financial close
> *"And here's the punchline: this is your OpenAI key. Your account. Your bill. We're not making money on the LLM call — we're the privacy layer in between."*

> *"You've probably already used ChatGPT to draft a client email or summarise a circular. **Today, the moment you paste a client's name, that's training data for OpenAI's next model.** With this, you keep using ChatGPT. The exposure ends."*

### Anticipate
- *"What if your masking misses something — say my secret project name?"* → "Best-effort masking. The audit log shows you what we caught. If something slipped through, **add it to your strip list** in `/tokenisation/config` and it gets nuked from every future call."
- *"DPDP Act compliance?"* → "I'm not your compliance officer, but the typical concern under DPDP is 'are you sending personally identifying information to third parties without explicit consent?' This wrapper says no — anything personally identifying becomes a token before it leaves."
- *"Streaming responses?"* → **Honest:** "Not yet. Today's wrapper is non-streaming. Real fix needs token-stream rewriting, that's 1-2 weeks of work."

---

## Section 6 · The compounding effect (3 min)

Switch to `/knowledge`.

### What to point at (in the prepared demo with seeded data)
- Big number 1: **knowledge entries** (e.g. "12 entries")
- Big number 2: **hit rate last 30 days** (should be 30-60% if you seeded properly)
- Big number 3: **embedded for fuzzy match** (100% if Ollama is running, else might be 0% — that's fine, fall back to keyword)

### What to say
> *"Twelve entries from this morning's seeded closes. **Hit rate of [X]% — meaning [X]% of LLM calls last month started from your accumulated answers, not from scratch.**"*

> *"The first month, this number is low — you're teaching the system. **By month 6, it's 70-80%. By year 2, it's 90%.** Your cost per LLM call drops because most queries don't need fresh inference. More importantly — this is your CA brain, captured. **If you stop using AIQL, you lose months of that brain.**"*

> *"That's not contractual lock-in — that's value lock-in. We earn our keep every month or you walk."*

### Anticipate
- *"Can I export this?"* → **Honest:** "PDF audit pack export is on the roadmap. Today it's UI + audit table. If that's a blocker for your peer review, flag it."
- *"What if the embeddings are wrong?"* → "Two-tier system: vector search via local Ollama if available, keyword fallback if not. Either way, you see the matches before they're applied — except for silent auto-resolve, which now has the scale-precision check we added in the last build."

---

## Section 7 · Honest gaps + close (3 min)

**Don't skip this.** CAs respect honesty. If you over-promise and they hit a gap, the deal dies. If you flag the gap upfront, you bank credibility.

### What to say
> *"Three honest things to flag before you go back to your office:"*
>
> *"**One.** No direct Tally sync today. CSV export every month — call it 5 minutes per client. Tally connector is on the roadmap, probably 2 weeks of work, top priority once we have a paying customer."*
>
> *"**Two.** We don't file GSTR or ITR. This is the books-closure layer, not the filing layer. You keep Winman, Genius, your portal logins. We feed them clean data."*
>
> *"**Three.** Forensic / fraud detection beyond the obvious — round-tripping, related-party patterns, Benford's law — we don't do. If you do forensic engagements, this won't replace your specialist tool. It'll feed it."*

> *"What this **does** do is the time-suck of monthly close. The repetitive scrutiny, the 'is this normal' judgment that gets repeated every month, the privacy headache when you want to use ChatGPT for a client query."*

### The ask
> *"I'm looking for two or three CAs to work with as design partners over the next 60 days. Half-price, weekly feedback calls, you shape what gets built next. **Are you in?**"*

That's the close. Don't keep talking. Wait.

---

## Appendix A · FAQ — what they'll likely ask

| Question | Honest answer |
|---|---|
| **What's the pricing?** | "Three tiers depending on use case. Privacy proxy alone for a small firm: ~₹3-5k/month. Close management + privacy for an SME (up to 5 seats): ~₹500/seat/month. Audit firm complementary tool: ~₹15-20k/seat/year. Pilot is half of any of these for 60 days." |
| **What about my data security?** | "GL data lives in our Postgres, encrypted at rest with AES-256-GCM. Your LLM keys: same. Database is on AWS RDS (ap-south-1). Single-tenant data, multi-tenant infrastructure. Soc-2 isn't done yet — being honest." |
| **Can my client see my notes?** | "Per-org scoping at every level. Your client's org is separate from your firm's org. They never see your audit notes." |
| **What if AIQL goes down?** | "Real risk for a small startup. Migration path: every knowledge entry is in your Postgres, exportable. You'd lose the auto-resolve smarts but not the data." |
| **What's your roadmap?** | Direct from my recommendation: (1) Tally connector. (2) Multi-client console. (3) Drill-down from anomaly to underlying entries. (4) Streaming proxy responses. (5) PDF audit pack export. |
| **Why should I trust the auto-resolve?** | "Three protections: (1) Only verdicts you marked NORMAL+ALWAYS get applied. (2) Scale check — if current is materially larger than what you confirmed, it pauses and asks. (3) Full audit trail — you can see every auto-resolve and reverse it." |
| **Tally / Zoho / SAP integration?** | Tally on roadmap (top priority). Zoho Books — possible, second priority. SAP — different beast, would do for a paying customer. |
| **What if I want to leave?** | "Export your knowledge base as JSON. Export audit logs. Done. No vendor lock-in beyond the value-lock of your accumulated knowledge — which honestly is replicable in any system if you have the JSON." |

---

## Appendix B · Sample data + prompts to keep ready

### Sample CSV columns (if you're generating fresh data)
- `date`, `voucher_no`, `voucher_type` (Sales / Purchase / Receipt / Payment / Journal / Contra)
- `account_name`, `account_group` (Tally-style)
- `debit_amount`, `credit_amount`
- `vendor_name`, `customer_name`, `party_name`
- `narration`, `reference_number`
- For GST scenarios: include `cgst_amount`, `sgst_amount`, `igst_amount`

### Pre-written prompts (copy these into a notes app, copy-paste during demo)

**For Section 3 (Adaptive close):**
```
We paid a one-time bonus in March to the senior team and salary expense
jumped ₹8,75,000. Watch the salary accounts carefully. GST rate also
changed mid-month — check CGST/SGST for the second half differently.
```

**For Section 5 (Privacy demo — vendor + amount):**
```
Reliance Industries paid us ₹12,50,000 against invoice INV-2024-0892
last month. CFO Mr Kumar wants to know if this aligns with our vendor
budget. Can you check?
```

**For Section 5 (Privacy demo — alternative, customer + PAN):**
```
Tata Consultancy Services has an outstanding receivable of ₹45,00,000
that's now 90 days overdue. Their PAN is ABCDE1234F. Should we escalate
to legal?
```

**For Section 6 (knowledge auto-injection):**
Whatever specific anomaly you confirmed in your prep step 0.3 — ask the
proxy a paraphrase of that question. The middle column should show
"1 piece of your knowledge base auto-injected" and the prior answer
expand-able under it.

---

## Appendix C · When something goes wrong (recovery scripts)

### "The dev server crashed mid-demo"
Don't panic. Don't restart in front of them. Say:
> *"Demo machine quirk — let me show you the audit trail directly while this comes back."*
Open the terminal off-screen, restart `pnpm web:dev`. Continue with screenshots if needed.

### "The LLM call failed"
The `/llm-privacy-demo` audit trail will show the failure (`upstreamStatus: 401` etc). Frame it as:
> *"And — this also got logged. Failed call, here's the status. Even when things break, you have the audit trail."*

### "Auto-resolve didn't fire as expected"
This means your prep step 0.3 wasn't done thoroughly. Pivot:
> *"Let me create the close from a fresh state instead — first time always shows the full anomaly list. The auto-resolve happens on the second close."*
And demo the capture flow live (Section 4).

### "The CA asks something you don't know"
**Don't make it up.** Say:
> *"Honest answer: I don't know. Let me get back to you tomorrow."*
Write it in your notes. CAs respect "I don't know" infinitely more than a confident wrong answer.

---

## Appendix D · The 60-second elevator version

If they only have 1 minute:

> *"Three things AIQL does. **One:** automates the repetitive 70% of monthly close — voucher checks, recons, anomaly detection. **Two:** remembers your judgment from one month to the next, so the second close is faster than the first. **Three:** lets you use ChatGPT or any LLM with client data, because the system masks vendor names and amounts before they ever leave the box."*
>
> *"You bring your own LLM key. Your data stays yours. Your CA wisdom compounds month over month. ₹3,000-₹5,000 per firm per month for the privacy layer; ₹500/seat for the close engine. Half-price for design partners over the next 60 days. Want a longer demo?"*

---

## Final reminder

The CAs will probably say one of:
- *"Looks impressive but I'd need to see it on real data."* → "Let's do a 60-day pilot. Bring your own client data."
- *"Tally sync is the dealbreaker."* → "Two weeks if you're a paying customer. Want to be first?"
- *"How is this different from [Tally Edge / Zoho Analytics / X]?"* → "Those are reporting. We're closure-time judgment + privacy. Different problem."

If they say "let me think about it" — that's a no. **Push for a yes/no on a pilot, or a no.** Maybes waste both your time.

Good luck Tuesday.
