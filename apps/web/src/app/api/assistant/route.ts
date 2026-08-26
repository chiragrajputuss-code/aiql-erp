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
    return NextResponse.json({ matched: false, answer: guard.message, refusalReason: guard.reason });
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

  // 4. No match.
  logQuery({ matched: false, refusalReason: "no_match" });
  return NextResponse.json({ matched: false, answer: NO_MATCH_ANSWER, refusalReason: "no_match" as const });
}
