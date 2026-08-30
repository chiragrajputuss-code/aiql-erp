// ─── In-app help corpus ──────────────────────────────────────────────────────
//
// Task-oriented "how do I / why is this happening" answers for a signed-in
// user, deliberately separate from the marketing-site corpus in answers.ts
// (which answers "what is Rule 37A" for an anonymous visitor). Someone who
// has already signed up and is staring at an empty screen needs to be
// un-stuck, not sold to.
//
// Zero LLM calls, same as the site assistant: matching is regex scoring only,
// and an unmatched question gets an honest refusal rather than an invented
// answer. A wrong instruction ("click the button that isn't there") wastes
// more of a CA's time than admitting there's no answer.
//
// STATE-AWARE: some answers are functions of the user's actual account state
// (see AppState), so "why are there no ITC findings?" can answer with the
// real reason — no GSTR-2B uploaded for that period — instead of a generic
// explanation the user then has to map onto their own situation.

export interface AppState {
  /** ACTIVE connections holding a GL upload — i.e. client books. */
  glCount:        number;
  /** Any GSTR-2B uploaded at all, across the org. */
  hasAnyGstr2b:   boolean;
  /** Has any investigation ever been run for this org. */
  hasAnyRun:      boolean;
  /** Findings on the most recent CURRENT run, if any. */
  latestFindings: number | null;
}

export interface AppAnswer {
  id:       string;
  patterns: RegExp[];
  question: string;
  /** Static text, or a function of account state for a situational answer. */
  answer:   string | ((s: AppState) => string);
  /** Optional in-app destination. */
  cta?:     { label: string; href: string };
}

export const APP_ANSWERS: AppAnswer[] = [
  // ── Getting started ──────────────────────────────────────────────────────
  {
    id: "how-start",
    patterns: [/how (do i |to )?(get )?start/i, /what (do i do|should i do) (first|now)/i, /^help$/i, /where (do i|to) begin/i],
    question: "How do I get started?",
    answer: (s) => {
      if (s.glCount === 0) {
        return "Start by uploading a client's General Ledger — an Excel or CSV export from Tally, Zoho or any accounting system. Go to Connections, click 'Add connection', and pick the file. Column headings are detected and mapped for you, so nothing needs renaming first. Once that's in, upload the same client's GSTR-2B for the period and run an investigation.";
      }
      if (!s.hasAnyGstr2b) {
        return `You've got ${s.glCount === 1 ? "a General Ledger" : `${s.glCount} client books`} loaded, so the duplicate-payment checks will already work. To also get the GST/ITC findings, upload a GSTR-2B for the same period from Connections — the ITC checks need both files to compare against each other.`;
      }
      if (!s.hasAnyRun) {
        return "Both files are in, so you're ready. Open Investigations, pick the client book at the top, and click 'Run Investigation'. It takes under a minute and returns findings with the evidence rows attached.";
      }
      return "You've already run an investigation, so open Investigations to read the findings. Each one carries the rupee amount involved, the vouchers behind it, and a recommended action. Use 'Download PDF' to export it as a working paper for the client.";
    },
    cta: { label: "Go to Connections", href: "/connections" },
  },
  {
    id: "how-upload",
    patterns: [/how (do i )?upload/i, /upload (a |my )?(file|gl|ledger|data)/i, /add (a )?(client|connection|book)/i, /which file.*(need|upload)/i, /what file/i],
    question: "How do I upload a client's books?",
    answer: "Go to Connections and click 'Add connection'. Pick a General Ledger export — Excel or CSV, straight out of Tally, Zoho or any other system. You'll see the detected column mapping before anything is loaded, so you can correct anything that looks wrong. Each file you upload becomes its own client book.",
    cta: { label: "Add a connection", href: "/connections/new" },
  },
  {
    id: "how-run",
    patterns: [/how (do i )?run/i, /run (an? )?(investigation|check|scan)/i, /start (an? )?investigation/i],
    question: "How do I run an investigation?",
    answer: (s) => {
      if (s.glCount === 0) {
        return "You'll need a General Ledger uploaded first — there's nothing to investigate yet. Add one from Connections, then come back to Investigations and click 'Run Investigation'.";
      }
      return "Open Investigations, pick the client book from the dropdown at the top, and click 'Run Investigation'. It reads that client's GL against their GSTR-2B and comes back in under a minute with findings, evidence rows, and a recommended action for each one.";
    },
    cta: { label: "Go to Investigations", href: "/investigations" },
  },

  // ── Why is nothing showing ───────────────────────────────────────────────
  {
    id: "no-findings",
    patterns: [/no (findings|results|issues)/i, /nothing (is |was )?(showing|found|appear|there)/i, /(empty|blank) (report|screen|page)/i, /why.*(no|zero).*(finding|result)/i, /didn'?t find anything/i, /can'?t see any(thing| finding)/i],
    question: "Why am I not seeing any findings?",
    answer: (s) => {
      if (s.glCount === 0) {
        return "There's no General Ledger uploaded yet, so there's nothing to check. Add one from Connections and the findings will appear after your first run.";
      }
      if (!s.hasAnyRun) {
        return "No investigation has been run yet — uploading a file doesn't check it automatically. Open Investigations, pick the client book, and click 'Run Investigation'.";
      }
      if (!s.hasAnyGstr2b) {
        return "You haven't uploaded a GSTR-2B, so only the duplicate-payment check ran. The GST/ITC findings need a GSTR-2B to compare your booked purchases against — upload one for the same period from Connections and run again.";
      }
      if (s.latestFindings === 0) {
        return "The run completed and genuinely found nothing — no missing invoices, no duplicate payments in that period. That's a real result, not an error. Worth confirming the GL and GSTR-2B cover the same month, since a period mismatch can also produce a clean report.";
      }
      return "Findings should be on the Investigations page. If it looks empty, check the client book selected at the top — each client's findings are separate, and you may be looking at a different one than you expect.";
    },
  },
  {
    id: "no-itc-findings",
    patterns: [/no (itc|gst) (finding|result|check)/i, /(itc|gst).*(not|isn'?t) (showing|running|working)/i, /why.*no.*itc/i],
    question: "Why are the GST/ITC checks not running?",
    answer: (s) =>
      s.hasAnyGstr2b
        ? "The ITC checks need a GSTR-2B covering the same period as the GL. If you've uploaded one but still see no ITC findings, check that its period matches the ledger's — a GSTR-2B for a different month won't be paired with it."
        : "The ITC checks need a GSTR-2B to compare your booked purchases against, and there isn't one uploaded yet. Add it from Connections as a separate upload, for the same period as the ledger, then run the investigation again.",
    cta: { label: "Upload a GSTR-2B", href: "/connections/new" },
  },
  {
    id: "gstr2b-separate",
    patterns: [/(gstr.?2b|2b).*(upload|add|where|how)/i, /where.*(gstr|2b)/i, /both files/i],
    question: "Where do I upload the GSTR-2B?",
    answer: "Same place as the ledger — Connections, 'Add connection'. It's a separate upload from the GL, so a client with both will show two entries. Upload the GSTR-2B for the same period as the ledger and the ITC checks pair them up automatically on the next run.",
    cta: { label: "Add a connection", href: "/connections/new" },
  },

  // ── Understanding the output ─────────────────────────────────────────────
  {
    id: "what-checks",
    patterns: [/what (does|do) (it|this|acctqai)( actually)? check/i, /what (investigations?|checks?)/i, /what can (it|this) (do|find)/i],
    question: "What does AcctQAI actually check?",
    answer: "Two investigations run today. First, GST vendor ITC risk: purchase invoices booked in your GL that never appear in GSTR-2B, meaning that credit is at risk — and it tells apart a vendor who habitually files late from one who genuinely hasn't filed. Second, duplicate payments: the same bill paid twice, across ledgers and across months, including cases where the invoice reference was typed differently. Every finding carries the evidence rows and a recommended action.",
  },
  {
    id: "evidence",
    patterns: [/(see|view|show|find).*(evidence|proof|rows|voucher)/i, /where.*evidence/i, /how.*verify/i, /can i trust/i],
    question: "How do I see the evidence behind a finding?",
    answer: "Every finding has a 'Show evidence' toggle underneath it. That opens the actual rows the finding was computed from — voucher numbers, dates, amounts — plus the verification steps for checking it against your own records. Nothing is asserted without the underlying data attached.",
  },
  {
    id: "new-carried",
    patterns: [/(new|carried).*(badge|label|tag|mean)/i, /what does (new|carried) mean/i, /carried since/i],
    question: "What do the NEW and CARRIED badges mean?",
    answer: "NEW means the finding first appeared in this run. CARRIED means it was already there in an earlier period and still hasn't been resolved — the badge shows the month it first showed up, so you can see how long something has been outstanding. Findings that were there last time and have now gone appear separately under 'No longer appearing'.",
  },
  {
    id: "no-longer-appearing",
    patterns: [/no longer appear/i, /resolved (finding|issue)/i, /(recovered|not an issue) button/i, /disposition/i],
    question: "What is the 'No longer appearing' section?",
    answer: "Findings that were open in the previous run and are absent from this one. AcctQAI can prove an issue is gone from the books; it can't prove money actually reached a bank account, which is why it says 'no longer appears' rather than 'recovered'. Mark each one 'Recovered' or 'Was not an issue' yourself to keep an honest record.",
  },
  {
    id: "late-vs-nonfiler",
    patterns: [/(late|habitual).*(filer|filing)/i, /expected next period/i, /gst.?itc.?006/i, /why.*not.*at risk/i],
    question: "What does 'expected next period' mean on a finding?",
    answer: "It means that vendor has a track record of filing after the due date, so their invoice reliably turns up in a later GSTR-2B rather than never arriving. It's flagged for information, not as a risk — and specifically so you don't reject a genuine invoice in IMS while waiting. This needs a few months of GSTR-2B history to work out, so it only appears once you've uploaded several periods.",
  },

  // ── Multi-client ─────────────────────────────────────────────────────────
  {
    id: "multiple-clients",
    patterns: [/multiple client|many clients|all (my )?clients|several clients/i, /practice (dashboard|view|page)/i, /switch client/i, /per.?client/i, /across.*clients/i],
    question: "How do I work across several clients?",
    answer: (s) =>
      s.glCount > 1
        ? `You have ${s.glCount} client books loaded. The Practice page gives you one row per client, sorted by what needs attention first — critical findings, then rupees at risk. Use it to see which clients need work this month, then click through to any one of them.`
        : "Each file you upload becomes its own client book, and you can switch between them from the dropdown on the Investigations page. Once you have more than three, the Practice page becomes your landing screen — one row per client, sorted by what needs attention first.",
    cta: { label: "Open Practice", href: "/practice" },
  },
  {
    id: "pdf-export",
    patterns: [/\b(pdf|export|download|working paper)\b/i, /send.*client/i, /share.*finding/i],
    question: "How do I export a report for a client?",
    answer: "'Download PDF' on the Investigations page produces the working-paper version — the findings, the rupee impact, the evidence annexure and the recommended actions. It's the document you'd forward to a client or keep on file. It's free on your plan, nothing is held back.",
  },

  // ── Trust / safety ───────────────────────────────────────────────────────
  {
    id: "read-only",
    patterns: [/(change|modify|write|edit|affect|damage).*(tally|books|data|ledger|file)/i, /read.?only/i, /is (it|this) safe/i],
    question: "Can this change my client's books?",
    answer: "No. AcctQAI is strictly read-only — it never writes back to Tally, your GL export, or any source system. It reads what you upload, analyses it, and reports. Every action it recommends is one you carry out yourself.",
  },
  {
    id: "privacy",
    patterns: [/(privacy|masked|tokenis|anonymi|ai see|data (safe|stored|secure))/i, /where.*data.*stored/i],
    question: "What does the AI see of my client's data?",
    answer: "Never the real names or amounts. Vendor names, customer names, references and amounts are masked and replaced with tokens before anything reaches an AI model — and the AI is only used to phrase the summary sentence, never to calculate a finding. Your data is stored in AWS Mumbai, isolated per organisation.",
  },
  {
    id: "cost",
    // Word-boundaried deliberately: an unanchored /pay/ also matches
    // "payment" and "payroll", so "how do I find duplicate payments" used to
    // return the pricing answer. Same for /bill/ vs "billable".
    patterns: [/\b(cost|costs|price|pricing|charged?|free|subscription|invoice me)\b/i, /\bdo i (have to )?pay\b/i, /\bwhat.*\bplan\b/i],
    question: "What does this cost me?",
    answer: "Nothing through 2027 — unlimited client books, unlimited investigations, the PDF export included, no card required. Pricing comes after that, and you'll get advance notice and preferential terms as an early user. Nothing is gated in the meantime.",
  },
  {
    id: "deterministic",
    patterns: [/\b(consistent|reliable|accurate|deterministic|trustworthy)\b/i, /run.*twice/i, /\bis (it|this) ai\b/i, /hallucinat/i, /same (answer|result|number)/i],
    question: "Are the findings reliable?",
    answer: "Every finding is computed by fixed reconciliation rules, not generated. Run the same file twice and you get the same numbers, to the rupee. AI only phrases the plain-English summary — it never calculates an amount or decides whether something is a finding, and the report works with the AI switched off entirely.",
  },
];

// ─── Matching ────────────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/** Highest-scoring answer with at least one pattern hit; ties break by
 *  earliest position. Same deterministic approach as the site assistant. */
export function matchAppAnswer(question: string): AppAnswer | null {
  const q = normalise(question);
  if (!q) return null;

  let best: AppAnswer | null = null;
  let bestScore = 0;

  for (const candidate of APP_ANSWERS) {
    const score = candidate.patterns.reduce((n, p) => n + (p.test(q) ? 1 : 0), 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** Resolve a possibly state-dependent answer to display text. */
export function resolveAnswer(a: AppAnswer, state: AppState): string {
  return typeof a.answer === "function" ? a.answer(state) : a.answer;
}
