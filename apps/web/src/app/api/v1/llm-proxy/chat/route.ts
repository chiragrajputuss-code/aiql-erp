import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { decrypt } from "@/lib/crypto";
import { tokenise, detokeniseFromMap } from "@aiql/tokeniser";
import { callProvider, ProxyError, type Provider } from "@/lib/llm-proxy";
import { telemetryStart } from "@/lib/telemetry";
import { buildKnowledgeContext } from "@/lib/knowledge-context";
import { getOrgTokenisationConfig } from "@/lib/org-tokenisation";

/**
 * POST /api/v1/llm-proxy/chat
 *
 * The CA-demo centerpiece. Accepts an OpenAI-compatible chat-completion
 * request, tokenises every user/assistant turn, forwards to the customer's
 * chosen provider with their stored key, detokenises the response, and
 * writes an audit log row.
 *
 * Pipeline:
 *   1. Auth check + body validate
 *   2. Look up active key for (orgId, provider)
 *   3. Decrypt key (in-memory only)
 *   4. Tokenise each non-system message content (system stays intact —
 *      it's the user's instructions, not customer data)
 *   5. Call provider with tokenised payload
 *   6. Detokenise response content
 *   7. Audit log + bump key usage
 *
 * Streaming is NOT supported — the demo is non-streaming. Customers who
 * need streaming can call providers directly (and lose privacy guarantees).
 */

const requestSchema = z.object({
  provider:       z.enum(["OPENAI", "ANTHROPIC", "GROQ", "AZURE_OPENAI"]),
  /** Optional — when omitted, the most-recent active key for this provider is used */
  keyId:          z.string().optional(),
  model:          z.string().min(1).max(100),
  messages:       z.array(z.object({
    role:    z.enum(["system", "user", "assistant"]),
    content: z.string().max(50_000),
  })).min(1),
  temperature:    z.number().min(0).max(2).optional(),
  max_tokens:     z.number().int().min(1).max(8192).optional(),
  response_format: z.object({ type: z.literal("json_object") }).optional(),
  /** Set to false to skip auto-injecting org knowledge as context. Default true. */
  injectKnowledge: z.boolean().optional(),
  /**
   * Tokenise system message content too. Default false — system is treated as
   * "our prompt, not customer data." Set true if the customer's system prompt
   * contains PII (e.g., they reference vendor names in instructions).
   */
  tokeniseSystem: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const t = telemetryStart("llm_proxy.chat");
  const startedAt = Date.now();

  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }
    t.tag({ orgId: user.orgId });

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      t.done({ status: 400 });
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const {
      provider, keyId, model, messages,
      temperature, max_tokens, response_format,
      injectKnowledge = true, tokeniseSystem = false,
    } = parsed.data;
    t.tag({ provider, model, tokeniseSystem });

    // ── Knowledge auto-injection ─────────────────────────────────────────
    // Pull this org's accumulated wisdom and prepend it as a system message.
    // The most recent user message drives the retrieval keyword set.
    let knowledgeApplied = 0;
    let messagesWithContext = messages;
    if (injectKnowledge) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (lastUser) {
        const ctx = await buildKnowledgeContext(user.orgId, lastUser.content, { topN: 5 });
        if (ctx.systemAddendum) {
          knowledgeApplied = ctx.items.length;
          // Append to existing system message if present, else prepend a new one.
          const sysIdx = messages.findIndex((m) => m.role === "system");
          if (sysIdx >= 0) {
            messagesWithContext = messages.map((m, i) =>
              i === sysIdx ? { ...m, content: `${m.content}\n${ctx.systemAddendum}` } : m
            );
          } else {
            messagesWithContext = [
              { role: "system", content: ctx.systemAddendum.trim() },
              ...messages,
            ];
          }
          t.tag({ knowledgeApplied });
        }
      }
    }

    // ── Look up the customer's stored key ────────────────────────────────
    const keyRow = await prisma.llmProxyApiKey.findFirst({
      where: {
        orgId:    user.orgId,
        provider,
        isActive: true,
        ...(keyId ? { id: keyId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    if (!keyRow) {
      t.done({ status: 412, reason: "no_active_key" });
      return NextResponse.json(
        { error: `No active ${provider} key registered. Add one in Settings → API Keys.`, code: "NO_KEY" },
        { status: 412 }
      );
    }

    // Decrypt — plaintext lives in this function scope only.
    let plaintextKey: string;
    try { plaintextKey = decrypt(keyRow.encryptedKey); }
    catch (err) {
      t.done({ status: 500, reason: "decrypt_failed" });
      console.error("[llm-proxy/chat] decrypt failed:", (err as Error).message);
      return NextResponse.json({ error: "Stored key could not be decrypted. Re-add it." }, { status: 500 });
    }

    // ── Tokenise message content (org config + per-call flag) ────────────
    // We use a SINGLE TokenMap across all messages so the same vendor in
    // different turns gets the same token (consistent context for the LLM).
    //
    // tokeniseSystem flag:
    //   false (default) → system messages stay plaintext (treated as "our prompt")
    //   true            → system messages also tokenised (PII in user system prompt)
    //
    // Org config governs WHICH categories get tokenised + custom entities/strip
    // list specific to this customer.
    const orgTokConfig = await getOrgTokenisationConfig(user.orgId);

    const aggregateAudit = new Map<string, number>();
    const tokenisedMessages: typeof messagesWithContext = [];

    const SEP = "\n\n<<<MSG_BOUNDARY>>>\n\n";
    const eligible = tokeniseSystem
      ? messagesWithContext
      : messagesWithContext.filter((m) => m.role !== "system");
    const concatenated = eligible.map((m) => m.content).join(SEP);
    const tk = tokenise(concatenated, orgTokConfig);
    for (const a of tk.auditLog) {
      const cat = a.category ?? "UNKNOWN";
      aggregateAudit.set(cat, (aggregateAudit.get(cat) ?? 0) + 1);
    }

    const tokenisedParts = tk.tokenised.split(SEP);
    let eligibleIdx = 0;
    for (const m of messagesWithContext) {
      const isSystem = m.role === "system";
      if (!tokeniseSystem && isSystem) {
        tokenisedMessages.push(m);  // system passes through plaintext
      } else {
        tokenisedMessages.push({
          role:    m.role,
          content: tokenisedParts[eligibleIdx] ?? m.content,
        });
        eligibleIdx++;
      }
    }

    // ── Call upstream provider ───────────────────────────────────────────
    let response;
    try {
      response = await callProvider({
        provider:  provider as Provider,
        apiKey:    plaintextKey,
        request:   {
          model,
          messages: tokenisedMessages,
          temperature,
          max_tokens,
          response_format,
        },
      });
    } catch (err) {
      const status = err instanceof ProxyError ? err.upstreamStatus : 502;
      const message = err instanceof Error ? err.message : "Upstream error";
      // Audit the failed call too — customer wants to see this happened
      await writeAudit({
        orgId:        user.orgId,
        provider,
        model,
        masked:       Object.fromEntries(aggregateAudit),
        promptChars:  concatenated.length,
        responseChars: 0,
        tokensIn:     0,
        tokensOut:    0,
        upstreamStatus: status,
        knowledgeApplied,
        durationMs:   Date.now() - startedAt,
        errorMessage: message,
      });
      t.done({ status, upstreamFailed: true });
      return NextResponse.json({ error: message, upstreamStatus: status }, { status });
    }

    // ── Detokenise the response content ──────────────────────────────────
    const detokenised = detokeniseFromMap(response.content, { getMap: () => tk.tokenMap });

    // ── Audit log + key usage bump ───────────────────────────────────────
    await writeAudit({
      orgId:        user.orgId,
      provider,
      model:        response.modelUsed,
      masked:       Object.fromEntries(aggregateAudit),
      promptChars:  concatenated.length,
      responseChars: detokenised.length,
      tokensIn:     response.promptTokens,
      tokensOut:    response.completionTokens,
      upstreamStatus: response.upstreamStatus,
      knowledgeApplied: 0,
      durationMs:   Date.now() - startedAt,
      errorMessage: null,
    });

    await prisma.llmProxyApiKey.update({
      where: { id: keyRow.id },
      data:  { lastUsedAt: new Date(), callCount: { increment: 1 } },
    });

    // ── Return OpenAI-compatible response shape ──────────────────────────
    t.done({
      status:        200,
      maskedTotal:   Array.from(aggregateAudit.values()).reduce((a, b) => a + b, 0),
      tokensIn:      response.promptTokens,
      tokensOut:     response.completionTokens,
    });
    return NextResponse.json({
      id:      `aiql-proxy-${keyRow.id.slice(-8)}-${Date.now().toString(36)}`,
      object:  "chat.completion",
      model:   response.modelUsed,
      choices: [{
        index:    0,
        message:  { role: "assistant", content: detokenised },
        finish_reason: "stop",
      }],
      usage: {
        prompt_tokens:     response.promptTokens,
        completion_tokens: response.completionTokens,
        total_tokens:      response.promptTokens + response.completionTokens,
      },
      // AIQL-specific addendum: what we masked
      _aiql: {
        masked: Object.fromEntries(aggregateAudit),
        provider,
      },
    });
  } catch (err) {
    t.fail(err, { status: 500 });
    console.error("[llm-proxy/chat POST]", err);
    return NextResponse.json({ error: "Internal server error", detail: (err as Error).message }, { status: 500 });
  }
}

// ─── Audit log writer ───────────────────────────────────────────────────────

interface AuditPayload {
  orgId:           string;
  provider:        "OPENAI" | "ANTHROPIC" | "GROQ" | "AZURE_OPENAI";
  model:           string;
  masked:          Record<string, number>;
  promptChars:     number;
  responseChars:   number;
  tokensIn:        number;
  tokensOut:       number;
  upstreamStatus:  number;
  knowledgeApplied: number;
  durationMs:      number;
  errorMessage:    string | null;
}

async function writeAudit(p: AuditPayload): Promise<void> {
  try {
    await prisma.llmProxyAuditLog.create({
      data: {
        orgId:        p.orgId,
        provider:     p.provider,
        model:        p.model,
        maskedJson:   JSON.stringify(
          Object.entries(p.masked).map(([category, count]) => ({ category, count }))
        ),
        promptChars:  p.promptChars,
        responseChars: p.responseChars,
        tokensIn:     p.tokensIn,
        tokensOut:    p.tokensOut,
        upstreamStatus: p.upstreamStatus,
        knowledgeApplied: p.knowledgeApplied,
        durationMs:   p.durationMs,
        errorMessage: p.errorMessage,
      },
    });
  } catch (err) {
    // Never let audit failure block the response
    console.warn("[llm-proxy/chat] audit write failed:", (err as Error).message);
  }
}
