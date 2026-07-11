/**
 * Knowledge base helpers — pattern-key derivation + lookup contract.
 *
 * The "is this normal?" feedback loop captures CA decisions about anomalies
 * and stores them as `OrgBusinessKnowledge` rows. To match a future occurrence
 * of the same anomaly to a stored answer, we derive a deterministic
 * **pattern key** from the anomaly's signature.
 *
 * Pattern keys are deliberately specific enough to be safe (we don't want
 * "salary issue in March" to auto-resolve "salary issue in October") but
 * loose enough to match recurring patterns (a salary anomaly in March 2026
 * should match the answer captured in March 2025).
 *
 * Key shapes:
 *   scan:<issueCode>                                     — same scan code, same connection
 *   recon:<reconKey>                                     — same recon template
 *   flux:<accountSlug>:<periodLabel>:<directionTag>      — same account, same calendar period, same up/down
 *   agent:<agentType>:<questionHash>                     — same agent question (content hash)
 *
 * connectionId is part of the row's uniqueness — keys don't include it.
 */
// ─── Derivers ───────────────────────────────────────────────────────────────
export function patternKeyForScanIssue(args) {
    const code = slug(args.issueCode);
    const acct = args.accountName ? `:${slug(args.accountName)}` : "";
    return {
        patternKey: `scan:${code}${acct}`,
        source: "SCAN_ISSUE",
        sourceRef: {
            issueCode: args.issueCode,
            accountName: args.accountName,
        },
    };
}
export function patternKeyForRecon(args) {
    return {
        patternKey: `recon:${slug(args.reconName)}`,
        source: "RECONCILIATION",
        sourceRef: { reconName: args.reconName },
    };
}
export function patternKeyForFlux(args) {
    const acct = slug(args.accountName);
    const month = monthLabel(args.periodEnd);
    return {
        patternKey: `flux:${acct}:${month}:${args.direction}`,
        source: "FLUX_VARIANCE",
        sourceRef: {
            accountName: args.accountName,
            periodEnd: typeof args.periodEnd === "string" ? args.periodEnd : args.periodEnd.toISOString(),
            direction: args.direction,
        },
    };
}
export function patternKeyForAgentQuestion(args) {
    return {
        patternKey: `agent:${slug(args.agentType)}:${shortHash(args.question)}`,
        source: "AGENT_QUESTION",
        sourceRef: { agentType: args.agentType, question: args.question },
    };
}
export function patternKeyForManual(args) {
    return {
        patternKey: `manual:${slug(args.topic)}`,
        source: "MANUAL",
        sourceRef: { topic: args.topic },
    };
}
// ─── Helpers ────────────────────────────────────────────────────────────────
function slug(s) {
    return s.toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "unknown";
}
const MONTHS = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];
function monthLabel(periodEnd) {
    const d = typeof periodEnd === "string" ? new Date(periodEnd) : periodEnd;
    if (isNaN(d.getTime()))
        return "unknown";
    return MONTHS[d.getUTCMonth()] ?? "unknown";
}
/**
 * Short, stable, non-cryptographic hash for free-text questions.
 * 8-char base36 fingerprint — enough collision resistance for a per-org keyspace
 * while keeping the pattern key short.
 */
export function shortHash(input) {
    let h = 0x811c9dc5; // FNV offset basis (32-bit)
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193); // FNV prime
    }
    // Force unsigned 32-bit, then base36, padded/truncated to a fixed 8 chars
    return ((h >>> 0).toString(36)).padStart(8, "0").slice(0, 8);
}
export function appendHistory(existingJson, entry, cap = 20) {
    let history = [];
    if (existingJson) {
        try {
            const parsed = JSON.parse(existingJson);
            if (Array.isArray(parsed)) {
                history = parsed.filter(isHistoryEntry);
            }
        }
        catch { /* ignore malformed */ }
    }
    history.push(entry);
    // Keep the most recent `cap` entries
    if (history.length > cap)
        history = history.slice(history.length - cap);
    return JSON.stringify(history);
}
function isHistoryEntry(v) {
    return (typeof v === "object" && v !== null &&
        typeof v.askedAt === "string" &&
        typeof v.answeredAt === "string");
}
