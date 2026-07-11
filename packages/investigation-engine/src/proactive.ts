// ─── Proactive "one more thing" observation ──────────────────────────────────
//
// The moment that turns "AI interface" into "finance colleague": after the
// findings are computed, surface ONE thing the user didn't explicitly ask about
// but should know — a cross-finding correlation, an overlooked opportunity, or a
// concentration of risk.
//
// Computed-only reasoning (Principle 5): selection and every number here are
// deterministic. The LLM only phrases the result (narrateObservation), with a
// deterministic fallback so it always renders. As more investigations ship, this
// operates over their combined findings unchanged — cross-investigation for free.

import type { Finding } from "./types";
import type { LlmFn } from "./llm-summary";

export type ObservationKind = "correlation" | "opportunity" | "concentration";

export interface ProactiveObservation {
  kind:         ObservationKind;
  title:        string;
  detail:       string;
  impactRs:     number | null;
  relatedCodes: string[];        // finding codes this observation connects
  basis:        string;          // how it was computed (auditability)
  narrated?:    string;          // LLM phrasing; filled by narrateObservation
}

function rupees(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

// A finding's "party" = the first evidence reference that looks like a name
// (contains a space), e.g. "Mehta Steel Industries" — invoice numbers like
// "INV-MSI-041" have no space, so they're naturally excluded.
function findingParty(f: Finding): string | null {
  for (const e of f.evidence) {
    for (const r of e.references) {
      const t = (r ?? "").trim();
      if (t && /\s/.test(t)) return t;
    }
  }
  return null;
}

export function computeProactiveObservation(findings: Finding[]): ProactiveObservation | null {
  if (findings.length < 2) return null;

  // ── Rule 1: same party across ≥2 findings (cross-finding correlation) ──
  const byParty = new Map<string, Finding[]>();
  for (const f of findings) {
    const p = findingParty(f);
    if (!p) continue;
    (byParty.get(p) ?? byParty.set(p, []).get(p)!).push(f);
  }
  let topParty: { party: string; fs: Finding[] } | null = null;
  for (const [party, fs] of byParty) {
    if (fs.length >= 2 && (!topParty || fs.length > topParty.fs.length)) topParty = { party, fs };
  }
  if (topParty) {
    const impact = topParty.fs.reduce((s, f) => s + (f.impactRs ?? 0), 0);
    return {
      kind:         "correlation",
      title:        `${topParty.party} appears in ${topParty.fs.length} separate findings`,
      detail:       `The same party shows up across ${topParty.fs.length} issues${impact > 0 ? ` totalling ${rupees(impact)}` : ""} — worth handling together rather than one at a time.`,
      impactRs:     impact > 0 ? impact : null,
      relatedCodes: topParty.fs.map((f) => f.code),
      basis:        `Party "${topParty.party}" matched in ${topParty.fs.length} findings' evidence references.`,
    };
  }

  // ── Rule 2: an opportunity overlooked while attention is on critical risk ──
  const hasCritical = findings.some((f) => f.severity === "critical");
  const opp = [...findings.filter((f) => f.severity === "opportunity")]
    .sort((a, b) => (b.impactRs ?? 0) - (a.impactRs ?? 0))[0];
  if (hasCritical && opp) {
    const amt = opp.impactRs ?? 0;
    return {
      kind:         "opportunity",
      title:        `An opportunity is easy to miss behind the urgent items`,
      detail:       `While the critical items are risks to fix, ${amt > 0 ? `${rupees(amt)} is ` : "there is "}money available to recover: ${opp.title}.`,
      impactRs:     amt > 0 ? amt : null,
      relatedCodes: [opp.code],
      basis:        `Critical findings present alongside opportunity ${opp.code}.`,
    };
  }

  // ── Rule 3: one party concentrates most of the ₹ at risk ──
  const atRisk = findings.filter((f) => f.severity === "critical" || f.severity === "warning");
  const totalAtRisk = atRisk.reduce((s, f) => s + (f.impactRs ?? 0), 0);
  if (totalAtRisk > 0) {
    const partyTotals = new Map<string, { amt: number; codes: string[] }>();
    for (const f of atRisk) {
      const p = findingParty(f);
      if (!p) continue;
      const cur = partyTotals.get(p) ?? { amt: 0, codes: [] };
      cur.amt += f.impactRs ?? 0;
      cur.codes.push(f.code);
      partyTotals.set(p, cur);
    }
    let lead: { party: string; amt: number; codes: string[] } | null = null;
    for (const [party, v] of partyTotals) {
      if (!lead || v.amt > lead.amt) lead = { party, ...v };
    }
    if (lead && lead.amt > 0.5 * totalAtRisk) {
      return {
        kind:         "concentration",
        title:        `${lead.party} drives most of your risk this period`,
        detail:       `${rupees(lead.amt)} of the ${rupees(totalAtRisk)} at risk traces to a single party — resolving it clears the majority of the exposure.`,
        impactRs:     lead.amt,
        relatedCodes: lead.codes,
        basis:        `Party "${lead.party}" = ${Math.round((lead.amt / totalAtRisk) * 100)}% of at-risk ₹.`,
      };
    }
  }

  return null;
}

// ─── Narration (LLM phrases the computed observation) ─────────────────────────

const SYSTEM_PROMPT = [
  "You are a finance controller adding a brief 'one more thing' note at the end of an",
  "investigation, pointing out something the user didn't ask about but should know.",
  "You are given a JSON observation that has ALREADY been computed.",
  "",
  "Strict rules:",
  "- Phrase it as ONE or TWO short sentences, starting naturally (e.g. \"While reviewing this, I also noticed…\").",
  "- Use ONLY the facts and numbers in the observation. Never invent or change any figure.",
  "- Sound like an experienced colleague flagging it, not a report. No greetings, no fluff.",
  "- Amounts are Indian Rupees; keep ₹ figures exactly as given.",
].join("\n");

function deterministicNarration(obs: ProactiveObservation): string {
  return `While reviewing this, I also noticed: ${obs.detail}`;
}

export async function narrateObservation(
  obs: ProactiveObservation | null,
  llmFn?: LlmFn,
): Promise<ProactiveObservation | null> {
  if (!obs) return null;
  const fallback = deterministicNarration(obs);
  if (!llmFn) return { ...obs, narrated: fallback };
  try {
    const out = await llmFn(SYSTEM_PROMPT, JSON.stringify({ title: obs.title, detail: obs.detail, impactRs: obs.impactRs }));
    const trimmed = out?.trim();
    return { ...obs, narrated: trimmed && trimmed.length > 0 ? trimmed : fallback };
  } catch {
    return { ...obs, narrated: fallback };
  }
}
