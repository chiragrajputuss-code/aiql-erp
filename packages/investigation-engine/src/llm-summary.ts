// ─── Executive summary (the ONLY LLM touchpoint) ─────────────────────────────
//
// Principle 5: the LLM explains evidence, it never generates it. This module
// takes a fully-computed, deterministic digest of the findings and asks the LLM
// only to phrase it as a short narrative. Every number in the prompt is already
// final — the LLM is forbidden (by instruction and by design) from inventing or
// recomputing any figure.
//
// The LLM function is INJECTED (Principle: pure engine, injected dependencies).
// The engine package never imports safeLlmCall or hits the network. If llmFn is
// absent or returns null, we fall back to a deterministic sentence so the report
// always renders.

import type { Finding } from "./types";

// Injected by the web app, wrapping safeLlmCall. Returns null on any failure.
export type LlmFn = (systemPrompt: string, userContent: string) => Promise<string | null>;

export interface SummaryDigest {
  period:           string;
  healthScore:      number;
  criticalCount:    number;
  warningCount:     number;
  opportunityCount: number;
  totalImpactRs:    number;
  topFindings:      { title: string; severity: string; impactRs: number | null }[];
}

const SYSTEM_PROMPT = [
  "You are a finance analyst writing the opening summary of an investigation report",
  "for an Indian SME's finance manager. You will be given a JSON digest of findings",
  "that have ALREADY been computed. Your job is ONLY to phrase a 2-3 sentence executive",
  "summary in plain, direct business English.",
  "",
  "Strict rules:",
  "- Use ONLY the numbers given in the digest. Never invent, estimate, or recompute any figure.",
  "- Do not add findings that are not in the digest.",
  "- Lead with what needs attention. Be concise and specific. No greetings, no fluff.",
  "- Amounts are in Indian Rupees; keep the ₹ figures exactly as given.",
].join("\n");

export function buildDeterministicSummary(d: SummaryDigest): string {
  if (d.criticalCount === 0 && d.warningCount === 0 && d.opportunityCount === 0) {
    return `No issues found for ${d.period}. Your books look clean across the checks we ran.`;
  }
  const parts: string[] = [];
  if (d.criticalCount > 0) parts.push(`${d.criticalCount} critical issue${d.criticalCount > 1 ? "s" : ""}`);
  if (d.warningCount > 0) parts.push(`${d.warningCount} warning${d.warningCount > 1 ? "s" : ""}`);
  if (d.opportunityCount > 0) parts.push(`${d.opportunityCount} opportunit${d.opportunityCount > 1 ? "ies" : "y"}`);
  const impact = d.totalImpactRs > 0
    ? ` Total financial impact identified: ₹${d.totalImpactRs.toLocaleString("en-IN", { maximumFractionDigits: 0 })}.`
    : "";
  return `For ${d.period} we found ${parts.join(", ")}.${impact}`;
}

export async function buildExecutiveSummary(
  digest: SummaryDigest,
  llmFn?: LlmFn,
): Promise<string> {
  const fallback = buildDeterministicSummary(digest);
  if (!llmFn) return fallback;
  try {
    const out = await llmFn(SYSTEM_PROMPT, JSON.stringify(digest));
    const trimmed = out?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : fallback;
  } catch {
    return fallback;
  }
}

export function toDigest(
  period: string,
  healthScore: number,
  findings: Finding[],
): SummaryDigest {
  const criticalCount    = findings.filter((f) => f.severity === "critical").length;
  const warningCount     = findings.filter((f) => f.severity === "warning").length;
  const opportunityCount = findings.filter((f) => f.severity === "opportunity").length;
  const totalImpactRs    = findings.reduce((sum, f) => sum + (f.impactRs ?? 0), 0);
  const topFindings = [...findings]
    .sort((a, b) => (b.impactRs ?? 0) - (a.impactRs ?? 0))
    .slice(0, 5)
    .map((f) => ({ title: f.title, severity: f.severity, impactRs: f.impactRs }));
  return { period, healthScore, criticalCount, warningCount, opportunityCount, totalImpactRs, topFindings };
}
