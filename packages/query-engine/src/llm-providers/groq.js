import { parseLLMJson } from "./parse-llm-json";
const BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
export class GroqProvider {
    constructor(apiKey, model) {
        this.name = "groq";
        this.apiKey = apiKey ?? process.env.GROQ_API_KEY ?? "";
        this.model = model ?? process.env.GROQ_MODEL ?? DEFAULT_MODEL;
    }
    async generateSQL(systemPrompt, userPrompt) {
        if (!this.apiKey)
            throw new Error("GROQ_API_KEY is not set");
        let res;
        try {
            res = await fetch(BASE_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.model,
                    temperature: 0,
                    response_format: { type: "json_object" },
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt },
                    ],
                }),
                signal: AbortSignal.timeout(30000),
            });
        }
        catch (err) {
            const msg = err.message ?? "unknown";
            if (msg.includes("timeout") || msg.includes("abort")) {
                throw new Error("Groq request timed out after 30s");
            }
            throw new Error(`Groq connection error: ${msg}`);
        }
        const body = await res.json();
        if (!res.ok) {
            if (res.status === 429)
                throw new Error("Groq rate limit hit — retry after a moment");
            throw new Error(`Groq API error ${res.status}: ${body.error?.message ?? res.statusText}`);
        }
        const content = body.choices?.[0]?.message?.content ?? "";
        const parsed = parseLLMJson(content);
        return {
            ...parsed,
            tokensIn: body.usage?.prompt_tokens ?? 0,
            tokensOut: body.usage?.completion_tokens ?? 0,
        };
    }
}
