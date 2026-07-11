/**
 * Robustly extract JSON from an LLM text response.
 * Handles: bare JSON, markdown code blocks, JSON with trailing text.
 */
export function parseLLMJson(text) {
    // Strip markdown code fences if present
    let cleaned = text
        .replace(/^```(?:json)?\s*/im, "")
        .replace(/\s*```\s*$/im, "")
        .trim();
    // Try to find the outermost JSON object
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
        cleaned = cleaned.slice(start, end + 1);
    }
    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    }
    catch {
        // Last resort: extract sql with regex
        const sqlMatch = cleaned.match(/"sql"\s*:\s*"([\s\S]*?)(?<!\\)"/);
        return {
            sql: sqlMatch ? sqlMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') : "",
            confidence: 0.3,
            explanation: "Could not parse LLM response as JSON",
            assumptions: [],
            clarificationsNeeded: ["Response format was invalid — please rephrase your question"],
            tokensIn: 0,
            tokensOut: 0,
        };
    }
    const clarifications = parsed.clarifications_needed ??
        parsed.clarificationsNeeded ??
        [];
    return {
        sql: String(parsed.sql ?? ""),
        confidence: Number(parsed.confidence ?? 0.5),
        explanation: String(parsed.explanation ?? ""),
        assumptions: parsed.assumptions ?? [],
        clarificationsNeeded: clarifications,
        tokensIn: 0, // filled in by provider
        tokensOut: 0,
    };
}
