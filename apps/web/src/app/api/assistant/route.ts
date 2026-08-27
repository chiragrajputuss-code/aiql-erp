import { NextRequest, NextResponse } from "next/server";
import { checkGuardrails } from "@aiql/query-engine";
import { matchAnswer } from "@/lib/assistant/answers";
import { checkAssistantRateLimit } from "@/lib/assistant/rate-limit";

// POST /api/assistant — the curated, zero-LLM site assistant (Phase 6).
// No auth, no persistence of question text — only a matched/refused/
// timestamp line so unmatched *categories* can be reviewed later without
// storing free text (docs/PLAN-PRACTICE-MODE.md 6.4).

const MAX_QUESTION_LENGTH = 500;

const NO_MATCH_ANSWER =
  "I don't have a good answer for that one. You can ask us directly at /contact, or sign up free and run it on your own file.";

// checkGuardrails' own "too short" message is written for the in-app GL-query
// pipeline ("ask a question about your financial data... 'Show AP aging'") —
// wrong context entirely for an anonymous visitor asking this widget about
// GST or the product. This widget's own wording replaces it.
const TOO_SHORT_ANSWER =
  "Ask me a full question, like \"What is Rule 37A?\" or \"What does AcctQAI cost?\"";

// Small talk — greetings and acknowledgements are always answered warmly,
// checked before the length cap so a 2-character "ok" or "hi" never falls
// into checkGuardrails' generic too-short refusal.
const SMALL_TALK_PATTERN = /^(hi|hello|hey|yo|ok|okay|k|kk|thanks|thank you|thx|ty|cool|great|nice|got it|gotcha|sure|yes|no|bye|goodbye)[.!]?$/i;
const SMALL_TALK_REPLY =
  "Happy to help. Ask me anything about GST/ITC or about AcctQAI itself, e.g. \"What is Rule 37A?\" or \"What does AcctQAI check?\"";

// A bare follow-up word ("explain", "why", "more") with no subject of its
// own — this widget has no memory of earlier questions (docs/PLAN-PRACTICE-
// MODE.md 6.7 explicitly rules conversation memory out of this phase), so
// the honest fix is to ask for the full question rather than either
// fabricating context or giving the same dead-end as a genuinely unanswerable
// question.
const FOLLOWUP_PATTERN = /^(explain|why|more|elaborate|details?|go on|tell me more|how|what)[?.!]?$/i;
const FOLLOWUP_REPLY =
  "I don't keep track of earlier questions, so ask the full thing you'd like explained, e.g. \"Explain Rule 37A\" or \"Why does ITC get blocked?\"";

// Registration gate is on ACTION, never on information (6.5) — this never
// blocks an answer, it only appends a signup nudge when the question is
// asking AcctQAI to act on the asker's own data right now.
const OWN_BOOKS_PATTERN =
  /(check|run|look at|review|analy[sz]e|scan)\b.{0,25}\b(my|our|this|client'?s?)\b.{0,20}\b(ledger|books|gl|data|file|ledgers)/i;
const OWN_BOOKS_NOTE =
  "I can't check your books from here. Sign up free and upload one file — it takes about two minutes.";
const OWN_BOOKS_CTA = { label: "Start free", href: "/signup" };

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function logQuery(entry: { matched: boolean; refusalReason?: "injection" | "off_topic" | "no_match" }): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ source: "assistant", ...entry, timestamp: new Date().toISOString() }));
}

export async function POST(req: NextRequest) {
  if (!checkAssistantRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Too many requests. Try again in a bit." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question : "";
  const trimmed = question.trim();

  // 0. Small talk — greetings/acknowledgements are real, common, and safe;
  // answer them before anything else so "hi" or "ok" never trips the length
  // or guardrail checks meant for actual questions.
  if (SMALL_TALK_PATTERN.test(trimmed)) {
    logQuery({ matched: true });
    return NextResponse.json({ matched: true, answer: SMALL_TALK_REPLY });
  }

  // 1. Length cap — an essay-length "question" is abuse or a paste, never a
  // question, so it never reaches the guardrail check at all.
  if (question.length > MAX_QUESTION_LENGTH) {
    logQuery({ matched: false, refusalReason: "no_match" });
    return NextResponse.json({ matched: false, answer: NO_MATCH_ANSWER, refusalReason: "no_match" as const });
  }

  // 2. Guardrails, regex-only (no LLM classification — zero token cost).
  // Injection is still blocked; an off-topic-but-not-injection question that
  // matches no financial keyword passes through here and falls to step 4.
  const guard = await checkGuardrails(question, { llmClassify: false });
  if (!guard.pass) {
    logQuery({ matched: false, refusalReason: guard.reason });
    // guard.reason === "off_topic" here only ever means checkGuardrails' own
    // q.length < 3 check fired (llmClassify:false skips its other off_topic
    // path) — use this widget's own wording instead of the query-pipeline's.
    const answer = guard.reason === "off_topic" ? TOO_SHORT_ANSWER : guard.message;
    return NextResponse.json({ matched: false, answer, refusalReason: guard.reason });
  }

  // 3. Curated corpus match.
  const match = matchAnswer(question);
  const askingAboutOwnBooks = OWN_BOOKS_PATTERN.test(question);

  if (match) {
    // Answer fully, then append the CTA if this ALSO reads as a request to
    // act on the asker's own data (e.g. "can you check my GST filings on my
    // books" might hit a domain answer and still want the nudge).
    const answer = askingAboutOwnBooks ? `${match.answer} ${OWN_BOOKS_NOTE}` : match.answer;
    const cta = askingAboutOwnBooks ? OWN_BOOKS_CTA : match.cta;
    logQuery({ matched: true });
    return NextResponse.json({ matched: true, answer, ...(cta ? { cta } : {}) });
  }

  // No informational corpus entry matches — but "can you check my ledger" /
  // "run this on my data" are pure action requests with no fixed fact to
  // state, so they get their own direct response rather than the generic
  // no-match refusal.
  if (askingAboutOwnBooks) {
    logQuery({ matched: true });
    return NextResponse.json({ matched: true, answer: OWN_BOOKS_NOTE, cta: OWN_BOOKS_CTA });
  }

  // A bare follow-up word ("explain", "why") with nothing to explain — the
  // widget has no conversation memory, so ask for the full question instead
  // of giving the same dead-end as a genuinely unanswerable question.
  if (FOLLOWUP_PATTERN.test(trimmed)) {
    logQuery({ matched: false, refusalReason: "no_match" });
    return NextResponse.json({ matched: false, answer: FOLLOWUP_REPLY, refusalReason: "no_match" as const });
  }

  // 4. No match.
  logQuery({ matched: false, refusalReason: "no_match" });
  return NextResponse.json({ matched: false, answer: NO_MATCH_ANSWER, refusalReason: "no_match" as const });
}
