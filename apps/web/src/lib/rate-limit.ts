// In-memory sliding window rate limiter.
// Correct for single-instance deployments.
// Multi-instance horizontal scale needs Redis INCR + EXPIRE instead.

const windows = new Map<string, number[]>();

// Clean stale entries when map grows too large
function maybePrune(windowMs: number) {
  if (windows.size < 10_000) return;
  const cutoff = Date.now() - windowMs;
  for (const [k, ts] of windows) {
    if (ts.every((t) => t < cutoff)) windows.delete(k);
  }
}

export function checkRateLimit(
  key:         string,
  maxRequests: number,
  windowMs:    number,
): { allowed: boolean; remaining: number; resetAt: Date } {
  const now    = Date.now();
  const cutoff = now - windowMs;

  const prev = (windows.get(key) ?? []).filter((t) => t > cutoff);

  if (prev.length >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: new Date(prev[0] + windowMs) };
  }

  prev.push(now);
  windows.set(key, prev);
  maybePrune(windowMs);

  return {
    allowed:   true,
    remaining: maxRequests - prev.length,
    resetAt:   new Date(now + windowMs),
  };
}
