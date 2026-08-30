import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TOURS, tourForPath, getTour } from "../tours";

// ─── The invariant that actually matters ─────────────────────────────────────
//
// A tour step whose [data-tour="..."] anchor no longer exists is skipped
// silently at runtime — the user just gets a shorter tour and nobody finds
// out. This test walks the real source tree and fails the build instead.

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

function anchorsInSource(): Set<string> {
  const found = new Set<string>();
  for (const file of walk(SRC)) {
    // Skip the tour definitions themselves — they declare targets, not anchors.
    if (file.endsWith(join("lib", "help", "tours.ts"))) continue;
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/data-tour="([a-zA-Z0-9-]+)"/g)) {
      found.add(m[1]!);
    }
  }
  return found;
}

describe("tour anchors exist in the real source", () => {
  const anchors = anchorsInSource();

  for (const tour of TOURS) {
    for (const step of tour.steps) {
      it(`[${tour.id}] "${step.target}" has a data-tour anchor`, () => {
        expect(
          anchors.has(step.target),
          `Tour "${tour.id}" references [data-tour="${step.target}"], but no element in src/ declares it. ` +
          `Either restore the anchor on the element, or remove the step from tours.ts.`,
        ).toBe(true);
      });
    }
  }

  it("finds a non-trivial number of anchors (guards against the scanner silently matching nothing)", () => {
    expect(anchors.size).toBeGreaterThanOrEqual(10);
  });
});

describe("tour content quality", () => {
  it("every tour has at least two steps", () => {
    for (const t of TOURS) {
      expect(t.steps.length, `${t.id} should have >= 2 steps`).toBeGreaterThanOrEqual(2);
    }
  });

  it("no step has an empty title or body", () => {
    for (const t of TOURS) {
      for (const s of t.steps) {
        expect(s.title.trim().length, `${t.id}/${s.target} title`).toBeGreaterThan(0);
        expect(s.body.trim().length, `${t.id}/${s.target} body`).toBeGreaterThan(0);
      }
    }
  });

  it("no step body uses banned hype vocabulary", () => {
    const banned = /\b(seamless|empower|revolutionis|unlock|leverage|game.?changer|cutting.edge|robust|holistic)\b/i;
    for (const t of TOURS) {
      for (const s of t.steps) {
        expect(banned.test(s.body), `${t.id}/${s.target}: "${s.body}"`).toBe(false);
      }
    }
  });

  it("has no duplicate target within a single tour", () => {
    for (const t of TOURS) {
      const targets = t.steps.map((s) => s.target);
      expect(new Set(targets).size, `${t.id} has a duplicate target`).toBe(targets.length);
    }
  });
});

describe("tourForPath", () => {
  it("maps the three dashboard pages that have tours", () => {
    expect(tourForPath("/investigations")?.id).toBe("investigations");
    expect(tourForPath("/practice")?.id).toBe("practice");
    expect(tourForPath("/connections")?.id).toBe("connections");
  });

  it("does not leak the /connections tour onto /connections/new (exact match only)", () => {
    expect(tourForPath("/connections/new")).toBeNull();
  });

  it("returns null for a page with no tour", () => {
    expect(tourForPath("/query")).toBeNull();
    expect(tourForPath("/settings/general")).toBeNull();
  });
});

describe("getTour", () => {
  it("returns a tour by id and null for an unknown id", () => {
    expect(getTour("practice")?.id).toBe("practice");
    expect(getTour("nope")).toBeNull();
  });
});
