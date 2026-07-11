// ─── Board Meeting Mode ──────────────────────────────────────────────────────
//
// One-click, board-ready executive brief composed from an investigation run.
// The feature a CFO said they'd pay extra for: business summary, major risks,
// major opportunities, cash & working capital, and recommended decisions.
//
// Computed-only (Principle 5): every section and figure is composed
// deterministically from the findings. The LLM only writes the narrated summary,
// with a deterministic fallback.

import type { Finding, Priority } from "./types";
import type { LlmFn } from "./llm-summary";

export interface BriefItem {
  code:     string;
  title:    string;
  severity: string;
  impactRs: number | null;
}

export interface BoardDecision {
  action:   string;
  priority: Priority;
  benefit:  string;
}

export interface BoardBrief {
  headline: {
    period:               string;
    healthScore:          number;
    totalAtRiskRs:        number;
    totalOpportunityRs:   number;
  };
  risks:                 BriefItem[];
  opportunities:         BriefItem[];
  cashAndWorkingCapital: BriefItem[];
  recommendedDecisions:  BoardDecision[];
  narratedSummary:       string;
}

const PRIORITY_RANK: Record<Priority, number> = { today: 0, this_week: 1, this_month: 2, fyi: 3 };

function toItem(f: Finding): BriefItem {
  return { code: f.code, title: f.title, severity: f.severity, impactRs: f.impactRs };
}

function rupees(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function deterministicSummary(b: BoardBrief): string {
  if (b.risks.length === 0 && b.opportunities.length === 0) {
    return `For ${b.headline.period}, the books look clean across the checks run — no material risks or opportunities surfaced. Financial health ${b.headline.healthScore}/100.`;
  }
  const bits: string[] = [];
  if (b.risks.length) bits.push(`${b.risks.length} item${b.risks.length > 1 ? "s" : ""} need attention (${rupees(b.headline.totalAtRiskRs)} at risk)`);
  if (b.opportunities.length) bits.push(`${b.opportunities.length} opportunit${b.opportunities.length > 1 ? "ies" : "y"} worth ${rupees(b.headline.totalOpportunityRs)}`);
  return `For ${b.headline.period}: ${bits.join("; ")}. Financial health ${b.headline.healthScore}/100. Priority decisions are listed below.`;
}

export function buildBoardBrief(
  findings: Finding[],
  meta: { period: string; healthScore: number },
): BoardBrief {
  const risks = findings
    .filter((f) => f.severity === "critical" || f.severity === "warning")
    .sort((a, b) => (b.impactRs ?? 0) - (a.impactRs ?? 0))
    .map(toItem);

  const opportunities = findings
    .filter((f) => f.severity === "opportunity")
    .sort((a, b) => (b.impactRs ?? 0) - (a.impactRs ?? 0))
    .map(toItem);

  const cashAndWorkingCapital = findings
    .filter((f) => f.category === "financial_health")
    .sort((a, b) => (b.impactRs ?? 0) - (a.impactRs ?? 0))
    .map(toItem);

  const recommendedDecisions: BoardDecision[] = [...findings]
    .sort((a, b) => PRIORITY_RANK[a.recommendation.priority] - PRIORITY_RANK[b.recommendation.priority] || (b.impactRs ?? 0) - (a.impactRs ?? 0))
    .slice(0, 5)
    .map((f) => ({ action: f.recommendation.action, priority: f.recommendation.priority, benefit: f.recommendation.expectedBenefit }));

  const totalAtRiskRs      = risks.reduce((s, i) => s + (i.impactRs ?? 0), 0);
  const totalOpportunityRs = opportunities.reduce((s, i) => s + (i.impactRs ?? 0), 0);

  const brief: BoardBrief = {
    headline: { period: meta.period, healthScore: meta.healthScore, totalAtRiskRs, totalOpportunityRs },
    risks,
    opportunities,
    cashAndWorkingCapital,
    recommendedDecisions,
    narratedSummary: "",
  };
  brief.narratedSummary = deterministicSummary(brief);
  return brief;
}

// ─── Narration ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = [
  "You are a finance controller writing the opening of a board briefing for company management.",
  "You are given a JSON digest of an investigation that has ALREADY been computed.",
  "",
  "Strict rules:",
  "- Write 4-5 short, punchy bullet points, concerns first, then opportunities and the headline health.",
  "- Use ONLY the numbers and items in the digest. Never invent, estimate or recompute any figure.",
  "- Board-appropriate tone: direct, decision-oriented, no jargon, no fluff.",
  "- Amounts are Indian Rupees; keep ₹ figures exactly as given.",
  "- Return only the bullets, one per line, each starting with '• '.",
].join("\n");

export async function narrateBoardSummary(brief: BoardBrief, llmFn?: LlmFn): Promise<BoardBrief> {
  const fallback = brief.narratedSummary;
  if (!llmFn) return brief;
  const digest = {
    period:             brief.headline.period,
    healthScore:        brief.headline.healthScore,
    totalAtRiskRs:      brief.headline.totalAtRiskRs,
    totalOpportunityRs: brief.headline.totalOpportunityRs,
    topRisks:           brief.risks.slice(0, 5).map((r) => ({ title: r.title, impactRs: r.impactRs })),
    topOpportunities:   brief.opportunities.slice(0, 3).map((o) => ({ title: o.title, impactRs: o.impactRs })),
  };
  try {
    const out = await llmFn(SYSTEM_PROMPT, JSON.stringify(digest));
    const trimmed = out?.trim();
    return { ...brief, narratedSummary: trimmed && trimmed.length > 0 ? trimmed : fallback };
  } catch {
    return { ...brief, narratedSummary: fallback };
  }
}
