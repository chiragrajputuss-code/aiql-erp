/** Extract an array from a Tally COLLECTION response object. */
export function extractCollection(parsed, collectionKey) {
    const envelope = parsed.ENVELOPE;
    if (!envelope)
        return [];
    const body = envelope.BODY ?? {};
    const data = body.DATA ?? {};
    const collection = data.COLLECTION ?? {};
    const val = collection[collectionKey];
    if (!val)
        return [];
    return Array.isArray(val) ? val : [val];
}
