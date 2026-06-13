import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { appendHistory, type KnowledgeHistoryEntry } from "@aiql/close-engine";
import { telemetryStart } from "@/lib/telemetry";
import { embedKnowledgeRow } from "@/lib/embeddings";

/**
 * Knowledge base — capture & list endpoints.
 *
 *   POST /api/v1/knowledge   record an answer (upsert by patternKey)
 *   GET  /api/v1/knowledge   list this org's knowledge
 *
 * Pattern keys are computed client-side via the close-engine helpers
 * (`patternKeyForScanIssue`, etc.) and passed in.
 */

// ─── POST ───────────────────────────────────────────────────────────────────

const recordSchema = z.object({
  connectionId:  z.string().min(1).nullable().optional(),
  patternKey:    z.string().min(1).max(200),
  context:       z.string().min(1).max(2000),
  answer:        z.string().min(1).max(2000),
  source:        z.enum(["SCAN_ISSUE", "RECONCILIATION", "FLUX_VARIANCE", "AGENT_QUESTION", "MANUAL"]),
  sourceRef:     z.record(z.unknown()).optional(),
  verdict:       z.enum(["NORMAL", "INVESTIGATE", "ANNOTATED", "REJECTED"]).default("NORMAL"),
  annotation:    z.string().max(2000).nullable().optional(),
  autoApply:     z.enum(["ALWAYS", "ONCE", "NEVER"]).default("ALWAYS"),
  periodId:      z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const t = telemetryStart("knowledge.record");
  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }
    t.tag({ orgId: user.orgId });

    const body = await req.json();
    const parsed = recordSchema.safeParse(body);
    if (!parsed.success) {
      t.done({ status: 400, reason: "invalid_body" });
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const {
      connectionId, patternKey, context, answer,
      source, sourceRef, verdict, annotation, autoApply, periodId,
    } = parsed.data;
    t.tag({ source, verdict, autoApply, isUpdate: false });

    // Upsert by (orgId, connectionId, patternKey). Existing row → bump
    // confidence + append history; new row → insert.
    const existing = await prisma.orgBusinessKnowledge.findFirst({
      where: {
        orgId:        user.orgId,
        connectionId: connectionId ?? null,
        patternKey,
      },
    });

    const now = new Date();
    const historyEntry: KnowledgeHistoryEntry = {
      askedAt:    now.toISOString(),
      answeredAt: now.toISOString(),
      verdict,
      annotation: annotation ?? null,
      periodId,
    };

    if (existing) {
      const updated = await prisma.orgBusinessKnowledge.update({
        where: { id: existing.id },
        data: {
          context,
          answer,
          source,
          sourceRefJson:    sourceRef ? JSON.stringify(sourceRef) : existing.sourceRefJson,
          verdict,
          annotation:       annotation ?? null,
          autoApply,
          historyJson:      appendHistory(existing.historyJson, historyEntry),
          // Reaffirmation bumps confidence (capped at 1.0)
          confidence:       Math.min(1.0, existing.confidence + 0.1),
          reaffirmationCount: existing.reaffirmationCount + 1,
          lastReaffirmedAt: now,
        },
      });
      // Re-embed if context/answer/annotation changed — fire-and-forget so the
      // POST response doesn't block on Ollama. Failures will retry via backfill.
      void embedKnowledgeRow(updated.id).catch(() => { /* best-effort */ });
      t.done({ status: 200, isUpdate: true, reaffirmations: updated.reaffirmationCount });
      return NextResponse.json(updated);
    }

    const created = await prisma.orgBusinessKnowledge.create({
      data: {
        orgId:         user.orgId,
        connectionId:  connectionId ?? null,
        patternKey,
        context,
        answer,
        source,
        sourceRefJson: sourceRef ? JSON.stringify(sourceRef) : null,
        verdict,
        annotation:    annotation ?? null,
        autoApply,
        historyJson:   appendHistory(null, historyEntry),
        confidence:    1.0,
      },
    });
    void embedKnowledgeRow(created.id).catch(() => { /* best-effort */ });
    t.done({ status: 201, isUpdate: false });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    t.fail(err, { status: 500 });
    console.error("[knowledge POST]", err);
    return NextResponse.json(
      { error: "Internal server error", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const t = telemetryStart("knowledge.list");
  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }
    t.tag({ orgId: user.orgId });

    const url = new URL(req.url);
    const connectionId = url.searchParams.get("connectionId");
    const source       = url.searchParams.get("source");

    const items = await prisma.orgBusinessKnowledge.findMany({
      where: {
        orgId: user.orgId,
        ...(connectionId ? { connectionId } : {}),
        ...(source && ["SCAN_ISSUE","RECONCILIATION","FLUX_VARIANCE","AGENT_QUESTION","MANUAL"].includes(source)
          ? { source: source as "SCAN_ISSUE" | "RECONCILIATION" | "FLUX_VARIANCE" | "AGENT_QUESTION" | "MANUAL" }
          : {}),
      },
      orderBy: { lastReaffirmedAt: "desc" },
    });

    t.done({ status: 200, count: items.length });
    return NextResponse.json({ items, count: items.length });
  } catch (err) {
    t.fail(err, { status: 500 });
    console.error("[knowledge GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
