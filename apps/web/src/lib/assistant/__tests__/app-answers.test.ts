import { describe, it, expect } from "vitest";
import { APP_ANSWERS, matchAppAnswer, resolveAnswer, type AppState } from "../app-answers";

const FRESH: AppState      = { glCount: 0, hasAnyGstr2b: false, hasAnyRun: false, latestFindings: null };
const GL_ONLY: AppState    = { glCount: 1, hasAnyGstr2b: false, hasAnyRun: false, latestFindings: null };
const READY: AppState      = { glCount: 1, hasAnyGstr2b: true,  hasAnyRun: false, latestFindings: null };
const RUN_CLEAN: AppState  = { glCount: 2, hasAnyGstr2b: true,  hasAnyRun: true,  latestFindings: 0 };
const RUN_ISSUES: AppState = { glCount: 3, hasAnyGstr2b: true,  hasAnyRun: true,  latestFindings: 5 };

const ALL_STATES = [FRESH, GL_ONLY, READY, RUN_CLEAN, RUN_ISSUES];

describe("corpus integrity", () => {
  it("has no duplicate ids", () => {
    const ids = APP_ANSWERS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every answer resolves to non-empty text in every account state", () => {
    for (const a of APP_ANSWERS) {
      for (const s of ALL_STATES) {
        expect(resolveAnswer(a, s).trim().length, `${a.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("every answer is reachable via its own canonical question", () => {
    for (const a of APP_ANSWERS) {
      expect(matchAppAnswer(a.question)?.id, `"${a.question}" should match ${a.id}`).toBe(a.id);
    }
  });

  it("no answer uses banned hype vocabulary in any state", () => {
    const banned = /\b(seamless|empower|revolutionis|unlock|leverage|game.?changer|cutting.edge|robust|holistic)\b/i;
    for (const a of APP_ANSWERS) {
      for (const s of ALL_STATES) {
        const text = resolveAnswer(a, s);
        expect(banned.test(text), `${a.id}: "${text}"`).toBe(false);
      }
    }
  });

  it("never claims a capability the product does not have", () => {
    // Guards against the corpus drifting into describing features that were
    // discussed but never shipped.
    const forbidden = /\b(files? your (gstr|itr)|auto.?sync|tally (live )?sync|forensic|round.?tripping|benford)\b/i;
    for (const a of APP_ANSWERS) {
      for (const s of ALL_STATES) {
        const text = resolveAnswer(a, s);
        expect(forbidden.test(text), `${a.id} claims an unshipped capability: "${text}"`).toBe(false);
      }
    }
  });
});

describe("state-aware answers actually change with state", () => {
  it("'how do I get started' gives different guidance at each stage", () => {
    const a = APP_ANSWERS.find((x) => x.id === "how-start")!;
    const fresh = resolveAnswer(a, FRESH);
    const glOnly = resolveAnswer(a, GL_ONLY);
    const ready = resolveAnswer(a, READY);
    const done = resolveAnswer(a, RUN_ISSUES);

    expect(fresh).toContain("upload");
    expect(glOnly).toContain("GSTR-2B");
    expect(ready).toContain("Run Investigation");
    expect(done).toContain("Download PDF");

    // All four must be genuinely distinct, not the same string.
    expect(new Set([fresh, glOnly, ready, done]).size).toBe(4);
  });

  it("'why no findings' names the real blocker rather than a generic answer", () => {
    const a = APP_ANSWERS.find((x) => x.id === "no-findings")!;

    expect(resolveAnswer(a, FRESH)).toContain("no General Ledger uploaded");
    expect(resolveAnswer(a, READY)).toContain("No investigation has been run");
    expect(resolveAnswer(a, GL_ONLY)).toMatch(/haven't uploaded a GSTR-2B|no investigation has been run/i);
    // A clean run is a real result, not an error — it must say so.
    expect(resolveAnswer(a, RUN_CLEAN)).toContain("genuinely found nothing");
  });

  it("'why no ITC findings' distinguishes missing-2B from period-mismatch", () => {
    const a = APP_ANSWERS.find((x) => x.id === "no-itc-findings")!;
    expect(resolveAnswer(a, GL_ONLY)).toContain("isn't one uploaded yet");
    expect(resolveAnswer(a, RUN_ISSUES)).toContain("same period");
  });

  it("multi-client answer uses the real client count when there is more than one", () => {
    const a = APP_ANSWERS.find((x) => x.id === "multiple-clients")!;
    expect(resolveAnswer(a, RUN_ISSUES)).toContain("3 client books");
    expect(resolveAnswer(a, FRESH)).not.toContain("0 client books");
  });
});

describe("matchAppAnswer", () => {
  it("routes natural how-to phrasings to the right answer", () => {
    expect(matchAppAnswer("how do I upload a file?")?.id).toBe("how-upload");
    expect(matchAppAnswer("how do I run an investigation")?.id).toBe("how-run");
    expect(matchAppAnswer("can this change my books?")?.id).toBe("read-only");
    expect(matchAppAnswer("what does the AI see")?.id).toBe("privacy");
  });

  it("routes a stuck user's phrasing to the diagnostic answer", () => {
    expect(matchAppAnswer("nothing is showing")?.id).toBe("no-findings");
    expect(matchAppAnswer("why are there no findings")?.id).toBe("no-findings");
  });

  it("returns null for an unrelated question rather than a bad match", () => {
    expect(matchAppAnswer("who won the IPL")).toBeNull();
    expect(matchAppAnswer("write me a poem")).toBeNull();
  });

  it("does not let a domain word be swallowed by a loose substring pattern", () => {
    // Regression: an unanchored /pay/ in the pricing patterns matched
    // "payment" and "payroll", so a question about duplicate PAYMENTS
    // returned the PRICING answer. Word boundaries now prevent it.
    expect(matchAppAnswer("how do I find duplicate payments")?.id).not.toBe("cost");
    expect(matchAppAnswer("do you integrate with SAP payroll")).toBeNull();
    expect(matchAppAnswer("what does this cost me?")?.id).toBe("cost");
    expect(matchAppAnswer("is it free?")?.id).toBe("cost");
  });

  it("returns null for empty input", () => {
    expect(matchAppAnswer("")).toBeNull();
    expect(matchAppAnswer("   ")).toBeNull();
  });
});
