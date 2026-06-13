/**
 * Helpers for the OrgClosePreferences memory layer.
 *
 * These are extracted from the periods POST handler so they can be unit-tested
 * without spinning up the full Next.js + Prisma stack.
 */

import type { CloseProfile } from "@aiql/db";

export interface RecurringPattern {
  pattern:    string;
  count:      number;
  lastSeenAt: string;  // ISO date
}

/**
 * Increment the per-profile usage counter. Tolerates missing / malformed input.
 */
export function bumpUsage(
  existingJson: string | undefined | null,
  profile: CloseProfile
): string {
  let counts: Record<string, number> = {};
  if (existingJson) {
    try { counts = JSON.parse(existingJson) as Record<string, number>; } catch { counts = {}; }
  }
  counts[profile] = (counts[profile] ?? 0) + 1;
  return JSON.stringify(counts);
}

/**
 * Update the recurring-patterns map by incrementing counts for watch items
 * that appeared this close. Items not seen this close are left untouched
 * (they age out naturally because new items dominate sort).
 *
 * The "count ≥ 2" threshold is what we use downstream to surface a pattern —
 * we don't want to suggest something the user only mentioned once.
 *
 * Capped at 50 entries to keep the JSON small.
 */
export function updateRecurringPatterns(
  existingJson: string | undefined | null,
  watchItemsThisClose: string[],
  nowIso: string = new Date().toISOString()
): string {
  let patterns: RecurringPattern[] = [];
  if (existingJson) {
    try {
      const parsed = JSON.parse(existingJson) as unknown;
      if (Array.isArray(parsed)) {
        patterns = parsed.filter(isRecurringPattern);
      }
    } catch { patterns = []; }
  }

  const byKey = new Map<string, RecurringPattern>(
    patterns.map((p) => [p.pattern.toLowerCase(), p])
  );

  for (const raw of watchItemsThisClose) {
    const key = raw.toLowerCase().trim();
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) {
      existing.count     += 1;
      existing.lastSeenAt = nowIso;
    } else {
      byKey.set(key, { pattern: raw, count: 1, lastSeenAt: nowIso });
    }
  }

  const sorted = Array.from(byKey.values())
    .sort((a, b) => b.count - a.count || b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, 50);

  return JSON.stringify(sorted);
}

function isRecurringPattern(p: unknown): p is RecurringPattern {
  return (
    typeof p === "object" && p !== null &&
    typeof (p as { pattern: unknown }).pattern === "string" &&
    typeof (p as { count: unknown }).count === "number"
  );
}
