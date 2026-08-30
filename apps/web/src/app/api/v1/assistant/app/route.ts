import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { checkGuardrails } from "@aiql/query-engine";
import { matchAppAnswer, resolveAnswer, APP_ANSWERS, type AppState } from "@/lib/assistant/app-answers";

// POST /api/v1/assistant/app — the in-app help assistant.
//
// Authenticated sibling of /api/assistant (the anonymous marketing-site one).
// Two differences that matter:
//   1. It answers from the task-oriented app-answers corpus ("how do I run an
//      investigation") rather than the domain corpus ("what is Rule 37A").
//   2. It is STATE-AWARE — it loads a small summary of the caller's own org
//      so "why are there no ITC findings?" can answer with the actual reason
//      (no GSTR-2B uploaded) instead of a generic explanation.
//
// Still zero LLM calls: matching is regex-scored and an unmatched question
// gets an honest refusal. No rate limit here — the caller is authenticated
// and each request is a couple of indexed counts, not an LLM call.

const MAX_QUESTION_LENGTH = 500;

const NO_MATCH_ANSWER =
  "I don't have an answer for that one. The quickest way to get unstuck is to reach us directly — we usually reply the same day.";
const NO_MATCH_CTA = { label: "Contact us", href: "/contact" };

const TOO_SHORT_ANSWER =
  'Ask a full question, like "How do I run an investigation?" or "Why are there no findings?"';

const SMALL_TALK_PATTERN = /^(hi|hello|hey|yo|ok|okay|k|kk|thanks|thank you|thx|ty|cool|great|nice|got it|gotcha|sure|yes|no|bye|goodbye)[.!]?$/i;
const SMALL_TALK_REPLY =
  'Happy to help. Ask me how to do something here — for example "How do I upload a client\'s books?" or "Why are there no findings?"';

const FOLLOWUP_PATTERN = /^(explain|why|more|elaborate|details?|go on|tell me more|how|what)[?.!]?$/i;
const FOLLOWUP_REPLY =
  'I don\'t keep track of earlier questions, so ask the full thing — e.g. "Why are there no ITC findings?" rather than just "why".';

/**
 * A small, cheap snapshot of what this org actually has. Three indexed
 * aggregates, deliberately not the full connection/finding payload — the
 * corpus only ever branches on presence/absence and counts.
 */
async function loadState(orgId: string): Promise<AppState> {
  const [glCount, gstr2bCount, latestRun] = await Promise.all([
    prisma.erpConnection.count({
      where: { orgId, status: "ACTIVE", uploadedFile: { documentType: "GL" } },
    }),
    prisma.erpConnection.count({
      where: { orgId, status: "ACTIVE", uploadedFile: { documentType: "GSTR_2B" } },
    }),
    prisma.investigationRun.findFirst({
      where:   { orgId, status: "CURRENT" },
      orderBy: { startedAt: "desc" },
      select:  { _count: { select: { findings: true } } },
    }),
  ]);

  return {
    glCount,
    hasAnyGstr2b:   gstr2bCount > 0,
    hasAnyRun:      latestRun !== null,
    latestFindings: latestRun?._count.findings ?? null,
  };
}

export async function POST(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question : "";
  const trimmed = question.trim();

  if (SMALL_TALK_PATTERN.test(trimmed)) {
    return NextResponse.json({ matched: true, answer: SMALL_TALK_REPLY });
  }

  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ matched: false, answer: NO_MATCH_ANSWER, cta: NO_MATCH_CTA });
  }

  // Injection regex still runs (a signed-in user is not automatically a
  // trusted input source), but LLM classification is skipped — nothing here
  // reaches a model, so there is nothing to classify for.
  const guard = await checkGuardrails(question, { llmClassify: false });
  if (!guard.pass) {
    const answer = guard.reason === "off_topic" ? TOO_SHORT_ANSWER : guard.message;
    return NextResponse.json({ matched: false, answer, refusalReason: guard.reason });
  }

  const match = matchAppAnswer(question);
  if (!match) {
    if (FOLLOWUP_PATTERN.test(trimmed)) {
      return NextResponse.json({ matched: false, answer: FOLLOWUP_REPLY });
    }
    return NextResponse.json({ matched: false, answer: NO_MATCH_ANSWER, cta: NO_MATCH_CTA });
  }

  const state = await loadState(user.orgId);
  return NextResponse.json({
    matched: true,
    answer:  resolveAnswer(match, state),
    ...(match.cta ? { cta: match.cta } : {}),
  });
}

// GET — suggestion chips, chosen from the caller's actual state so a brand-new
// user is offered "How do I get started?" while someone mid-flow is offered
// questions about reading the output.
export async function GET() {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const state = await loadState(user.orgId);

  let ids: string[];
  if (state.glCount === 0)          ids = ["how-start", "how-upload", "what-checks", "cost"];
  else if (!state.hasAnyGstr2b)     ids = ["gstr2b-separate", "no-itc-findings", "how-run", "what-checks"];
  else if (!state.hasAnyRun)        ids = ["how-run", "what-checks", "read-only", "evidence"];
  else                              ids = ["no-findings", "evidence", "new-carried", "pdf-export", "multiple-clients"];

  const suggestions = ids
    .map((id) => APP_ANSWERS.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .map((a) => a.question);

  return NextResponse.json({ suggestions });
}
