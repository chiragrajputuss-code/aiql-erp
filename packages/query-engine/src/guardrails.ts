/**
 * Layer 0 — Guardrails
 *
 * Two-phase check before template / RAG / LLM:
 *   1. Injection  — regex, deterministic, ~0ms, no API call
 *   2. Relevance  — LLM classifier (Groq llama-3.1-8b-instant), ~200ms
 *                   Falls back to permissive if Groq is unavailable.
 */

export type GuardrailResult =
  | { pass: true }
  | { pass: false; reason: "injection" | "off_topic"; message: string };

// ─── 1. Injection patterns (regex — LLMs can be tricked, regex cannot) ────────

const INJECTION_PATTERNS: RegExp[] = [
  // Classic prompt injection
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|above|earlier|your)/i,
  /forget\s+(all\s+)?(previous|prior|above|your|the)\s+(instructions?|prompts?|context|rules?|training)/i,
  /new\s+instructions?:/i,
  /override\s+(your\s+)?(instructions?|rules?|constraints?|guidelines?)/i,
  /you\s+are\s+now\s+(?!asking|going|about|in)/i,
  /pretend\s+(to\s+be|you\s+are|that\s+you)/i,
  /act\s+as\s+(a\s+|an\s+)?(different|another|new|unrestricted|unfiltered)/i,
  /roleplay\s+as/i,
  /from\s+now\s+on\s+(you\s+are|ignore|forget|act)/i,
  /your\s+(true\s+)?(purpose|goal|mission|task|job)\s+is\s+(?!to\s+answer)/i,
  /system\s*:\s*you\s+are/i,

  // LLM formatting tokens
  /\[INST\]/i,
  /<<SYS>>/i,
  /<\|system\|>/i,
  /<\|user\|>/i,
  /<\|assistant\|>/i,

  // Jailbreak keywords
  /\bDAN\b/,
  /developer\s+mode/i,
  /jailbreak/i,
  /unrestricted\s+mode/i,
  /no\s+restrictions?/i,
  /bypass\s+(your\s+)?(safety|filter|guardrail|rule|restriction|limit)/i,

  // SQL injection in question text
  /'\s*(?:or|and)\s+'?\s*'?1'?\s*=\s*'?1/i,
  /;\s*(?:DROP|DELETE|INSERT|UPDATE|ALTER|TRUNCATE|CREATE)\s+/i,
  /UNION\s+(?:ALL\s+)?SELECT/i,
  /--\s*(?:password|admin|select|drop|delete)/i,

  // Instruction exfiltration
  /(?:repeat|print|output|reveal|show|tell\s+me)\s+(your\s+)?(system\s+)?prompt/i,
  /(?:what\s+(?:are|were)\s+your|tell\s+me\s+your)\s+instructions?/i,
  /(?:leak|expose|extract)\s+(your\s+)?(system|instructions?|prompt|context)/i,
];

// ─── 2. Financial keyword fast-pass (no LLM call needed for clear queries) ────

const FINANCIAL_TERMS: RegExp[] = [
  /\b(?:balance|debit|credit|ledger|journal|account|accounts?)\b/i,
  /\b(?:transaction|entry|entries|voucher|posting)\b/i,
  /\b(?:invoice|bill|receipt|payment|payable|receivable)\b/i,
  /\b(?:vendor|supplier|creditor|debtor|customer|client|party)\b/i,
  /\b(?:revenue|income|expense|cost|profit|loss|margin)\b/i,
  /\b(?:cash|bank|fund|liquidity|balance\s+sheet)\b/i,
  /\b(?:asset|liability|equity|capital|reserve|provision)\b/i,
  /\b(?:report|summary|statement|register|schedule|breakdown|analysis|drill)\b/i,
  /\b(?:aging|outstanding|overdue|pending|dues?)\b/i,
  /\b(?:budget|forecast|variance|actual|target|projection)\b/i,
  /\b(?:reconcil|recon)\b/i,
  /\b(?:depreciation|amortis|write.?off)\b/i,
  /\b(?:monthly|quarterly|annual|yearly|fiscal|period|year.?end|month.?end|quarter)\b/i,
  /\b(?:GST|CGST|SGST|IGST|TDS|TCS|PAN|MSME|ITR)\b/,
  /\b(?:lakh|crore|INR|rupee)\b/i,
  /\b(?:purchase|sales?|debtors?|creditors?|payroll|salary|salaries|wage)\b/i,
  /\b(?:cost\s+cent(?:er|re)|department|branch|project|division)\b/i,
  /\b(?:fixed\s+asset|working\s+capital|current\s+ratio|debt.?equity)\b/i,
  /\b(?:intercompany|multi.?currency|exchange\s+rate|forex)\b/i,
  // Hindi / Hinglish
  /\b(?:khata|bakaya|vyapari|grahak|kharcha|aay|munafa|nuksaan|nakad)\b/i,
  /\b(?:lenadar|denadaar|tankhwah|bikri|kharid|vibhag|milaan|rajaswa)\b/i,
  /\b(?:sampatti|mulya|hrass|saalon|mahine|timahi|saal)\b/i,
  /\b(?:dikhao|batao|kitna|kitne|pichli|sabse|baaki)\b/i,
];

// ─── 3. LLM classifier — fires only when no financial keyword matched ─────────

const CLASSIFIER_SYSTEM = `You are a query classifier for a financial ERP data analysis tool.

Users upload their accounting data — GL entries, journal vouchers, invoices, payments,
vendor/customer records, etc. — and ask questions to get SQL-powered reports and analytics.

Your sole job: decide if the user's question is asking for financial or accounting information
from their uploaded data. Be permissive — if it could plausibly be a finance query, allow it.

Block questions that are clearly about something else entirely:
general knowledge, weather, cooking, entertainment, sports, creative writing,
translation, arithmetic unrelated to finance, greetings, or small talk.

Respond with JSON only — no other text:
{"allowed": true} or {"allowed": false, "reason": "one short sentence"}`;

const OFF_TOPIC_MESSAGE =
  "This doesn't look like a financial query. I can only answer questions about your " +
  "uploaded GL data — for example:\n" +
  '• "Show AP aging by vendor"\n' +
  '• "Top 10 customers by revenue"\n' +
  '• "Cash balance this month"\n' +
  '• "GST summary for this quarter"';

async function classifyWithLLM(question: string): Promise<GuardrailResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { pass: true }; // no key → fail open, let pipeline decide

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model:           "llama-3.1-8b-instant",
        messages:        [
          { role: "system", content: CLASSIFIER_SYSTEM },
          { role: "user",   content: question },
        ],
        response_format: { type: "json_object" },
        temperature:     0,
        max_tokens:      80,
      }),
      signal: AbortSignal.timeout(3000), // 3s hard cap
    });

    if (!res.ok) return { pass: true }; // API error → fail open

    const data     = await res.json() as { choices?: { message?: { content?: string } }[] };
    const content  = data.choices?.[0]?.message?.content ?? "{}";
    const parsed   = JSON.parse(content) as { allowed?: boolean };

    if (parsed.allowed === false) {
      return { pass: false, reason: "off_topic", message: OFF_TOPIC_MESSAGE };
    }
    return { pass: true };
  } catch {
    return { pass: true }; // classifier error → fail open, never break the pipeline
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function checkGuardrails(question: string): Promise<GuardrailResult> {
  const q = question.trim();

  // Too short to be meaningful
  if (q.length < 3) {
    return {
      pass:    false,
      reason:  "off_topic",
      message: "Please ask a question about your financial data — for example: 'Show AP aging by vendor' or 'What is the cash balance?'",
    };
  }

  // ── Phase 1: Injection check (regex, ~0ms, no API call) ───────────────────
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(q)) {
      return {
        pass:    false,
        reason:  "injection",
        message: "This query contains patterns that look like an injection attempt and cannot be processed. Please ask a straightforward question about your financial data.",
      };
    }
  }

  // ── Phase 2a: Financial keyword fast-pass (no LLM needed) ────────────────
  for (const pattern of FINANCIAL_TERMS) {
    if (pattern.test(q)) return { pass: true };
  }

  // ── Phase 3: LLM classifier for everything else ───────────────────────────
  return classifyWithLLM(q);
}
