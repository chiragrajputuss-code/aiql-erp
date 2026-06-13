/** Extract an array from a Tally COLLECTION response object. */
export function extractCollection<T>(
  parsed: Record<string, unknown>,
  collectionKey: string
): T[] {
  const envelope = (parsed as { ENVELOPE?: Record<string, unknown> }).ENVELOPE;
  if (!envelope) return [];
  const body       = (envelope.BODY       as Record<string, unknown>) ?? {};
  const data       = (body.DATA           as Record<string, unknown>) ?? {};
  const collection = (data.COLLECTION     as Record<string, unknown>) ?? {};
  const val        = collection[collectionKey];
  if (!val) return [];
  return Array.isArray(val) ? (val as T[]) : [val as T];
}
