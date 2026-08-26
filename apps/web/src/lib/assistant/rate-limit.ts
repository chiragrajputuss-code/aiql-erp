// ─── Assistant rate limiting (Phase 6) ───────────────────────────────────────
//
// Per-IP, 20 requests/hour, in-memory. A single instance is fine at this
// stage (see docs/PLAN-PRACTICE-MODE.md 6.4) — this resets on deploy/restart,
// which is an acceptable trade-off for an unauthenticated marketing-page
// widget with zero LLM cost per request.

const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
// Bounds memory for a pathological number of distinct IPs — evicts the
// oldest-inserted entry (Map preserves insertion order) rather than growing
// unbounded. Not a strict LRU, but the "single instance, this stage" note
// above means it doesn't need to be.
const MAX_TRACKED_IPS = 5000;

interface Bucket { count: number; windowStart: number }

const buckets = new Map<string, Bucket>();

/** Returns true if the request is allowed, false if the IP is over quota. */
export function checkAssistantRateLimit(ip: string): boolean {
  const now = Date.now();
  const existing = buckets.get(ip);

  if (!existing || now - existing.windowStart >= WINDOW_MS) {
    if (!buckets.has(ip) && buckets.size >= MAX_TRACKED_IPS) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) buckets.delete(oldestKey);
    }
    buckets.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (existing.count >= MAX_REQUESTS_PER_WINDOW) return false;

  existing.count += 1;
  return true;
}

/** Test-only: clears all tracked state. */
export function __resetAssistantRateLimitForTests(): void {
  buckets.clear();
}
