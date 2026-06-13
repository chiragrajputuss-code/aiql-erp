import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { tokenise } from "@aiql/tokeniser";
import { buildKnowledgeContext } from "@/lib/knowledge-context";
import { telemetryStart } from "@/lib/telemetry";
import { getOrgTokenisationConfig } from "@/lib/org-tokenisation";

/**
 * POST /api/v1/llm-proxy/preview
 *
 * Returns what WOULD be sent to the upstream provider — without making the
 * call. Lets demo / debugging tools show the masking transformation in
 * isolation. No API key needed.
 */

const previewSchema = z.object({
  messages: z.array(z.object({
    role:    z.enum(["system", "user", "assistant"]),
    content: z.string().max(50_000),
  })).min(1),
  injectKnowledge: z.boolean().optional(),
  tokeniseSystem:  z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const t = telemetryStart("llm_proxy.preview");
  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

    const body = await req.json();
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) {
      t.done({ status: 400 });
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { messages, injectKnowledge = true, tokeniseSystem = false } = parsed.data;

    // Knowledge injection (same logic as the chat endpoint)
    let knowledgeApplied = 0;
    let knowledgeAddendum = "";
    let messagesWithContext = messages;
    if (injectKnowledge) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (lastUser) {
        const ctx = await buildKnowledgeContext(user.orgId, lastUser.content, { topN: 5 });
        if (ctx.systemAddendum) {
          knowledgeApplied = ctx.items.length;
          knowledgeAddendum = ctx.systemAddendum;
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
        }
      }
    }

    // Tokenise content using org config + per-call tokeniseSystem flag
    const orgTokConfig = await getOrgTokenisationConfig(user.orgId);

    const SEP = "\n\n<<<MSG_BOUNDARY>>>\n\n";
    const eligible = tokeniseSystem
      ? messagesWithContext
      : messagesWithContext.filter((m) => m.role !== "system");
    const concatenated = eligible.map((m) => m.content).join(SEP);
    const tk = tokenise(concatenated, orgTokConfig);
    const tokenisedParts = tk.tokenised.split(SEP);

    const tokenisedMessages: typeof messagesWithContext = [];
    let eligibleIdx = 0;
    for (const m of messagesWithContext) {
      const isSystem = m.role === "system";
      if (!tokeniseSystem && isSystem) {
        tokenisedMessages.push(m);
      } else {
        tokenisedMessages.push({
          role:    m.role,
          content: tokenisedParts[eligibleIdx] ?? m.content,
        });
        eligibleIdx++;
      }
    }

    // Aggregate audit by category
    const aggregateAudit: Record<string, number> = {};
    const detailedAudit: Array<{ original: string; token: string; category: string }> = [];
    for (const a of tk.auditLog) {
      const cat = a.category ?? "UNKNOWN";
      aggregateAudit[cat] = (aggregateAudit[cat] ?? 0) + 1;
      if (a.original && a.token) {
        detailedAudit.push({ original: a.original, token: a.token, category: cat });
      }
    }

    t.done({
      status: 200,
      maskedTotal: Object.values(aggregateAudit).reduce((s, c) => s + c, 0),
      knowledgeApplied,
    });

    return NextResponse.json({
      original:        messages,
      tokenised:       tokenisedMessages,
      masked:          aggregateAudit,
      detailedAudit,
      knowledgeApplied,
      knowledgeAddendum,
    });
  } catch (err) {
    t.fail(err, { status: 500 });
    console.error("[llm-proxy/preview POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
