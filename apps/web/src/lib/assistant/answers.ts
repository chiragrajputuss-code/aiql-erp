// ─── Curated site-assistant corpus (Phase 6) ─────────────────────────────────
//
// Zero-LLM answers for a CA landing on the marketing site with a real
// question. Specificity is what reads as intelligent — a hedge like "it
// depends on various factors" reads as generic, so every answer is either
// concrete or the assistant refuses. See docs/PLAN-PRACTICE-MODE.md 6.2.
//
// Content rules (non-negotiable):
//   1. Never give tax advice — every "domain" answer explains what the rule
//      IS, ends with a disclaimer, never tells someone what to do about
//      their own case.
//   2. Never state a product capability that does not exist — cross-checked
//      against packages/investigation-engine/src/registry.ts and the
//      homepage's own honest capability list.
//   3. No hedging filler.

export type AnswerTopic = "product" | "domain" | "objection" | "privacy";

export interface CuratedAnswer {
  id:       string;
  topic:    AnswerTopic;
  patterns: RegExp[];
  question: string;
  answer:   string;
  cta?:     { label: string; href: string };
}

const CA_DISCLAIMER = "This is general information; your CA decides the treatment for a specific case.";

export const ANSWERS: CuratedAnswer[] = [
  // ── product ──────────────────────────────────────────────────────────────
  {
    id: "product-what-checks", topic: "product",
    patterns: [/what does (it|acctqai|this)( actually)? (check|do|cover)/i, /what (investigations?|checks?).*(run|do you)/i, /how does (it|this) work/i],
    question: "What does AcctQAI actually check?",
    answer: "Today AcctQAI runs two investigations on your uploaded GL and GSTR-2B: GST vendor ITC risk (which suppliers are putting your input tax credit at risk, and why) and duplicate payment detection across your ledger. Every finding comes with the underlying evidence rows and a recommended action, not just a flag. Month-end close and flux analysis run alongside these on the same uploaded data.",
  },
  {
    id: "product-replace-tally", topic: "product",
    patterns: [/replace.*(tally|zoho|erp|accounting software|my books)/i, /instead of tally/i],
    question: "Does AcctQAI replace Tally or my accounting software?",
    answer: "No. AcctQAI reads the files you export from Tally, Zoho or any other GL — it never replaces your books or your accounting software. Think of it as a second pair of eyes that goes through every entry, not a sample, and tells you what needs attention.",
  },
  {
    id: "product-read-only", topic: "product",
    patterns: [/read.only/i, /does it (change|modify|edit|write to|touch) my (data|books|ledger|gl)/i],
    question: "Is AcctQAI read-only? Can it change my data?",
    answer: "Yes, strictly read-only. AcctQAI never writes back to your GL, your Tally file or any source system — it only reads what you upload, analyses it, and shows you findings. Every recommended action is something you or your team carries out yourselves.",
  },
  {
    id: "product-what-files", topic: "product",
    patterns: [/what files? (do i need|are required|to upload)/i, /which (files|formats?)/i, /csv|excel.*upload/i],
    question: "What files do I need to upload?",
    answer: "A General Ledger export (Excel or CSV, from Tally, Zoho or any accounting system) is the minimum. Add a GSTR-2B download from the GST portal and AcctQAI can reconcile ITC across the two automatically. Column headers don't need to match anything exact — AcctQAI detects and maps them for you.",
  },
  {
    id: "product-how-long", topic: "product",
    patterns: [/how long (does it take|to (run|get results))/i, /how fast/i, /how much time/i],
    question: "How long does it take to get results?",
    answer: "Uploading and mapping a file takes about two minutes. Running an investigation on it — checking every entry against GSTR-2B and against itself for duplicates — takes seconds to a couple of minutes, not hours.",
  },
  {
    id: "product-cost", topic: "product",
    patterns: [/what does (it|this|acctqai) cost/i, /(price|pricing|how much).*(cost|acctqai)/i, /is it free/i],
    question: "What does AcctQAI cost?",
    answer: "AcctQAI is free for founding firms through 2027 — every finding, every client book, full evidence, nothing held back. We'll introduce pricing after that, and founding firms will get advance notice and preferential terms before anything changes.",
    cta: { label: "See pricing", href: "/pricing" },
  },
  {
    id: "product-who-for", topic: "product",
    patterns: [/who is (it|this|acctqai) for/i, /is this for (me|ca|accountants|smes)/i],
    question: "Who is AcctQAI for?",
    answer: "Chartered accountants and finance teams handling GST compliance and month-end close — practising CAs running multiple client books, and in-house finance teams at Indian SMEs managing their own GL. If you reconcile GSTR-2B by hand today, this is built for exactly that job.",
  },
  {
    id: "product-export", topic: "product",
    patterns: [/export.*(findings|report|pdf)/i, /download.*(report|pdf|findings)/i],
    question: "Can I export the findings?",
    answer: "Yes. Every investigation produces a working-paper PDF with the findings, the evidence behind each one, and the recommended action — the same document you'd forward to a client or keep for your own records.",
    cta: { label: "See a sample report", href: "/sample-report" },
  },
  {
    id: "product-install", topic: "product",
    patterns: [/(need to |do i )install/i, /download.*(software|app|desktop)/i],
    question: "Do I need to install anything?",
    answer: "No. AcctQAI runs entirely in your browser — upload a file, and you're looking at findings. There's nothing to install on your machine or your client's.",
  },
  {
    id: "product-multiple-clients", topic: "product",
    patterns: [/multiple client|practice.*(dashboard|view)|across.*(clients|firms)/i, /run.*(more than one|several) (client|business)/i],
    question: "Can I run this across multiple client books?",
    answer: "Yes. Each client's GL is its own connection, and the Practice dashboard gives you one row per client sorted by what needs attention first — critical findings and rupees at risk. That's the screen a CA managing several clients actually opens each week.",
  },

  // ── domain ───────────────────────────────────────────────────────────────
  {
    id: "domain-what-is-itc", topic: "domain",
    patterns: [/what is (input tax credit|itc)/i, /(itc|input tax credit) mean/i],
    question: "What is Input Tax Credit (ITC)?",
    answer: `Input Tax Credit is the GST you paid on a business purchase, which you're allowed to set off against the GST you owe on your own sales. It only becomes usable once it shows up in your GSTR-2B, which depends on your supplier actually filing their GSTR-1. ${CA_DISCLAIMER}`,
  },
  {
    id: "domain-supplier-not-filed", topic: "domain",
    patterns: [/supplier.*(doesn't|does not|hasn't|has not) filed?/i, /vendor.*(not filed|missing).*(gstr.?1|return)/i],
    question: "What happens if my supplier doesn't file GSTR-1?",
    answer: `If a supplier hasn't filed their GSTR-1, the invoice never appears in your GSTR-2B, and the ITC on that purchase isn't available to claim — even though you've booked and paid for it. Whether that's a genuine non-filer or just a supplier who habitually files late is exactly the kind of pattern AcctQAI's filing-history check is built to tell apart. ${CA_DISCLAIMER}`,
  },
  {
    id: "domain-rule-37a", topic: "domain",
    patterns: [/rule 37a/i, /37.?a\b/i],
    question: "What is Rule 37A?",
    answer: `Rule 37A requires you to reverse ITC by 30 November if your supplier hasn't filed their GSTR-3B by 30 September of the following financial year, even if the invoice appeared in your GSTR-2B earlier. Miss the reversal and you owe interest at 18% under Section 50 from the date you originally claimed it. ${CA_DISCLAIMER}`,
  },
  {
    id: "domain-section-16-4", topic: "domain",
    patterns: [/section 16\s?\(?4\)?/i, /16.4 cutoff/i],
    question: "What is the Section 16(4) cutoff for claiming ITC?",
    answer: `Section 16(4) sets a hard deadline for claiming ITC on an invoice: the earlier of 30 November following the end of the financial year, or the date you file your annual return for that year. Miss it and the credit is gone for good, regardless of whether the invoice is genuine. ${CA_DISCLAIMER}`,
  },
  {
    id: "domain-rule-37", topic: "domain",
    patterns: [/rule 37\b(?!a)/i, /180.?day rule/i],
    question: "What is Rule 37 (the 180-day rule)?",
    answer: `Rule 37 requires you to reverse the ITC you claimed on a purchase if you haven't paid the supplier within 180 days of the invoice date. You can reclaim it once you do pay — but until then, interest applies on the amount reversed. ${CA_DISCLAIMER}`,
  },
  {
    id: "domain-what-is-gstr2b", topic: "domain",
    patterns: [/what is gstr.?2b/i, /gstr.?2b mean/i],
    question: "What is GSTR-2B?",
    answer: `GSTR-2B is the auto-generated, static statement GSTN produces each month showing exactly which ITC is available to you, based on what your suppliers have filed. Unlike GSTR-2A, it doesn't change after generation for that period — it's the reference document for claiming ITC in your GSTR-3B. ${CA_DISCLAIMER}`,
  },
  {
    id: "domain-what-is-ims", topic: "domain",
    patterns: [/what is ims/i, /invoice management system/i, /no action.*ims/i],
    question: "What is IMS and what does 'no action' mean?",
    answer: `IMS, the Invoice Management System, lets you accept, reject or keep pending each invoice your suppliers report before it flows into your GSTR-2B. "No action" means an invoice is treated as deemed accepted by default — so an invoice you should have rejected still becomes claimable ITC unless you actively act on it. ${CA_DISCLAIMER}`,
  },
  {
    id: "domain-section-43b-h", topic: "domain",
    patterns: [/section 43b/i, /43b\s?\(?h\)?/i],
    question: "What is Section 43B(h)?",
    answer: `Section 43B(h) of the Income Tax Act disallows a deduction for any payment due to a micro or small enterprise registered under MSME unless it's actually paid within the timeline in the MSME Act — 45 days if there's a written agreement, 15 days otherwise. Miss it and the expense is disallowed that year, taxable only in the year you eventually pay. ${CA_DISCLAIMER}`,
  },
  {
    id: "domain-clause-44", topic: "domain",
    patterns: [/clause 44/i],
    question: "What is Clause 44 of the tax audit report?",
    answer: `Clause 44 requires a tax audit report to break down total expenditure by GST registration status — what was paid to GST-registered and unregistered entities, and what falls outside GST altogether. It exists to cross-check whether input tax credit claimed lines up with what was actually reported to GSTN. ${CA_DISCLAIMER}`,
  },

  // ── objection ────────────────────────────────────────────────────────────
  {
    id: "objection-is-chatgpt", topic: "objection",
    patterns: [/(chatgpt|gpt|ai wrapper|just an? (llm|ai))/i, /is this ai/i],
    question: "Is this just ChatGPT with a logo on it?",
    answer: "No. Every finding is computed by fixed accounting rules — run the same file through AcctQAI twice and you get the same numbers, to the rupee. AI is only used to phrase the plain-English summary of a finding; it never calculates a number, and the report works even with the AI switched off.",
  },
  {
    id: "objection-different-from-free", topic: "objection",
    patterns: [/different from (free|other|excel)/i, /why not (just )?use excel/i, /compared to (other tools|excel|manual)/i],
    question: "How is this different from free reconciliation tools?",
    answer: "Most free tools stop at matching invoice numbers between your GL and GSTR-2B. AcctQAI goes further — it tells you why an invoice is missing (filed late versus genuinely not filed), where duplicate payments happened, and what to actually do about each one, with the evidence attached.",
    cta: { label: "See a sample investigation", href: "/sample-report" },
  },
  {
    id: "objection-replace-judgement", topic: "objection",
    patterns: [/replace.*(judgement|judgment)/i, /replace (me|a ca|an accountant)/i],
    question: "Will this replace my professional judgement?",
    answer: "No — it's built to inform your judgement, not replace it. AcctQAI surfaces what deserves attention and the evidence behind it; every recommendation includes verification steps, because the final call on any client's specific facts is yours.",
  },
  {
    id: "objection-see-client-data", topic: "objection",
    patterns: [/do you see (my|client)/i, /who (sees|has access to) my data/i],
    question: "Do you see my client's data?",
    answer: "Your uploaded data is stored in AWS Mumbai, isolated per organisation, and never shared across firms. Before anything is sent to any AI model, vendor names, customer names, references and amounts are masked and replaced with tokens — the model only ever sees tokens, never your client's real data.",
  },
  {
    id: "objection-accuracy", topic: "objection",
    patterns: [/how (accurate|reliable) is (it|this)/i, /can i trust (it|the findings)/i, /how do i know.*(accurate|findings)/i],
    question: "How do I know the findings are accurate?",
    answer: "Every finding is deterministic — computed by the same reconciliation logic every time, not generated or guessed. Each one comes with the underlying evidence rows and a verification step, so you can check it against the source documents yourself before relying on it.",
  },

  // ── privacy ──────────────────────────────────────────────────────────────
  {
    id: "privacy-where-stored", topic: "privacy",
    patterns: [/where is (my|the) data stored/i, /data (location|residency)/i, /stored in india/i],
    question: "Where is my data stored?",
    answer: "In AWS Mumbai (ap-south-1), isolated per organisation — your data never leaves India and is never accessible to another firm's account.",
  },
  {
    id: "privacy-ai-sees", topic: "privacy",
    patterns: [/what does the ai( actually)? see/i, /does the ai see (my|real) (data|names)/i],
    question: "What does the AI actually see?",
    answer: "Never your real vendor names, customer names, references or amounts. Everything sensitive is masked and replaced with tokens before it reaches any AI model — the model reasons over tokens like VENDOR_T001, not your client's actual data, and the token map is held only for the length of that request.",
  },
  {
    id: "privacy-how-long-kept", topic: "privacy",
    patterns: [/how long.*(kept|retained|stored)/i, /data retention/i],
    question: "How long is my data kept?",
    answer: "Uploaded files are retained for 90 days from upload. If you cancel your account, your data is retained for a further 30 days so you can export it, then permanently deleted.",
  },
  {
    id: "privacy-read-only", topic: "privacy",
    patterns: [/is my data safe/i, /can (it|acctqai) modify/i],
    question: "Is my data safe — can AcctQAI modify it?",
    answer: "AcctQAI is strictly read-only against every source system. It never writes back to Tally, your GL export or any accounting software — the only thing it produces is a report.",
  },
];

// ─── Matching ─────────────────────────────────────────────────────────────────

// Collapse whitespace only — every pattern already carries the /i flag, and
// each uses `?`-optional punctuation (e.g. "16\s?\(?4\)?") so it matches
// whether or not the question includes parentheses. No fuzzy/embedding
// matching in this phase — deterministic and free.
function normalise(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/**
 * Score each answer by how many of its patterns match the normalised
 * question. Returns the highest-scoring answer with at least one match;
 * ties break by earliest array position (Array.reduce with strict `>`
 * preserves the first candidate on a tie).
 */
export function matchAnswer(question: string): CuratedAnswer | null {
  const q = normalise(question);
  if (!q) return null;

  let best: CuratedAnswer | null = null;
  let bestScore = 0;

  for (const candidate of ANSWERS) {
    const score = candidate.patterns.reduce((n, p) => n + (p.test(q) ? 1 : 0), 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}
