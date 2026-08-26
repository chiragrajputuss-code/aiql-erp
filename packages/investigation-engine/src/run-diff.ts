// ─── Run diff — NEW / CARRIED / RESOLVED ─────────────────────────────────────
//
// Compares this run's findings against the prior run for the same client, so
// a fixed issue can be reported as resolved instead of silently vanishing,
// and an unchanged issue reads as "still open since March" instead of a fresh
// alert every month. Pure: no DB, no network, no Date.now() — the web layer
// supplies the prior run's findings and the caller (persist.ts) stamps
// resolvedAt using its own clock.
//
// Match key. A finding must be identifiable across runs without being
// byte-identical (amounts drift, wording changes). Evidence.references is a
// flat array mixing invoice numbers and party names — there is no reliable
// way to tell which position is which from the type alone — so rather than
// apply a different normaliser per field, every reference across every piece
// of evidence is normalised with normalizeInvoiceNo (safe on names too: it
// only uppercases and strips separators/leading zeros, so "Mehta Steel
// Industries" still canonicalises stably), deduplicated, sorted, and hashed.
// Prefixing with the finding's code keeps two different check types from
// colliding even if their evidence happens to reference the same invoice.

import { normalizeInvoiceNo } from "@aiql/doc-parsers";
import type { Finding } from "./types";

/** Deterministic, dependency-free string hash (djb2). Not cryptographic —
 *  this only needs to be stable and collision-resistant for a few hundred
 *  findings per run, not attacker-resistant. */
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * A stable identity for a finding, or null if it carries no reference the
 * key can be built from (e.g. an aggregate finding with empty evidence).
 * Null findings are never matched across runs — they are always "new" and
 * never marked "resolved", since without a key there is no safe way to know
 * whether a later finding is the same issue or a coincidence.
 */
export function computeMatchKey(f: Finding): string | null {
  const refs = new Set<string>();
  for (const e of f.evidence) {
    for (const r of e.references) {
      const norm = normalizeInvoiceNo(r);
      if (norm) refs.add(norm);
    }
  }
  if (refs.size === 0) return null;
  const sorted = [...refs].sort();
  return `${f.code}:${djb2(sorted.join("|"))}`;
}

/** The subset of a prior run's finding fields the diff actually needs. */
export interface PriorFindingRef {
  matchKey:        string | null;
  code:            string;
  impactRs:        number | null;
  firstSeenPeriod: string | null;
}

export interface DiffedFinding extends Finding {
  changeStatus:    "new" | "carried";
  firstSeenPeriod: string;
  matchKey:        string | null;
}

export interface ResolvedFindingRef {
  matchKey: string;
  code:     string;
  impactRs: number | null;
}

export interface RunDiff {
  findings:   DiffedFinding[];
  resolved:   ResolvedFindingRef[];
  counts:     { new: number; carried: number; resolved: number };
  resolvedRs: number;
}

/**
 * Diff this run's findings against the prior run for the same client.
 * `prior` should be empty for a client's first run — every finding then
 * comes back "new" and nothing is resolved, which is correct: there is
 * nothing to compare against yet.
 */
export function diffRuns(current: Finding[], prior: PriorFindingRef[], period: string): RunDiff {
  const priorByKey = new Map<string, PriorFindingRef>();
  for (const p of prior) {
    if (p.matchKey) priorByKey.set(p.matchKey, p);
  }
  const matchedKeys = new Set<string>();

  const findings: DiffedFinding[] = current.map((f) => {
    const matchKey = computeMatchKey(f);
    const priorMatch = matchKey ? priorByKey.get(matchKey) : undefined;

    if (priorMatch) {
      matchedKeys.add(matchKey as string);
      return {
        ...f,
        changeStatus:    "carried",
        firstSeenPeriod: priorMatch.firstSeenPeriod ?? period,
        matchKey,
      };
    }
    return { ...f, changeStatus: "new", firstSeenPeriod: period, matchKey };
  });

  const resolved: ResolvedFindingRef[] = [];
  for (const p of prior) {
    if (p.matchKey && !matchedKeys.has(p.matchKey)) {
      resolved.push({ matchKey: p.matchKey, code: p.code, impactRs: p.impactRs });
    }
  }

  const counts = {
    new:      findings.filter((f) => f.changeStatus === "new").length,
    carried:  findings.filter((f) => f.changeStatus === "carried").length,
    resolved: resolved.length,
  };
  const resolvedRs = resolved.reduce((s, r) => s + (r.impactRs ?? 0), 0);

  return { findings, resolved, counts, resolvedRs };
}
