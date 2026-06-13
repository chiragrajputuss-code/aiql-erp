/**
 * Replace all tokens in `text` with their original values.
 *
 * Tokens are replaced longest-first to prevent partial matches
 * (e.g. VENDOR_T001 must not accidentally match inside VENDOR_T0010).
 *
 * Quotes are naturally preserved — we only replace the token text itself,
 * so 'VENDOR_T001' becomes 'Acme Corp' with the SQL quotes intact.
 */
export function detokenise(text: string, tokenMap: Map<string, string>): string {
  if (tokenMap.size === 0) return text;

  // Longest token first — prevents VENDOR_T001 matching inside VENDOR_T0011
  const sorted = Array.from(tokenMap.keys()).sort((a, b) => b.length - a.length);

  let result = text;
  for (const token of sorted) {
    const original = tokenMap.get(token);
    if (original === undefined) continue;

    // replaceAll handles multiple occurrences of the same token in one query
    result = result.split(token).join(original);
  }
  return result;
}

/**
 * Convenience: detokenise using a TokenMap instance directly.
 */
export function detokeniseFromMap(
  text: string,
  tokenMap: { getMap(): Map<string, string> }
): string {
  return detokenise(text, tokenMap.getMap());
}
