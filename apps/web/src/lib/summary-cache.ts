/**
 * Shared in-memory cache for the /api/v1/insights/summary endpoint.
 *
 * Lives in its own module so that the load-demo and unload-demo routes can
 * invalidate the cache without circular imports — they import `clearSummaryCache`
 * while the summary route imports `CACHE` and `CACHE_TTL_MS`.
 */

export interface CachedSummaryEntry<T> {
  data:       T;
  computedAt: Date;
}

export const CACHE     = new Map<string, CachedSummaryEntry<unknown>>();
export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Drop the cached entry for one org, forcing a fresh scan on next request. */
export function clearSummaryCache(orgId: string): void {
  CACHE.delete(orgId);
}
