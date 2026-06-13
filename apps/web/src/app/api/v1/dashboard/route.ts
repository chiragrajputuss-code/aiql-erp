import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma, getPinnedQueries, seedDefaultPinnedQueries } from "@aiql/db";
import { executeUploadQuery } from "@aiql/erp-connectors";
import { getSqlForTemplate } from "@aiql/query-engine";
import type { ERPSchema } from "@aiql/schema-intel";

// ─── GET /api/v1/dashboard?connectionId=xxx ───────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const connectionId = req.nextUrl.searchParams.get("connectionId");
    if (!connectionId) return NextResponse.json({ error: "connectionId required" }, { status: 400 });

    // ── Load connection ────────────────────────────────────────────────────
    const connection = await prisma.erpConnection.findFirst({
      where:   { id: connectionId, orgId: user.orgId },
      include: { uploadedFile: true },
    });

    if (!connection)
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    if (connection.status !== "ACTIVE")
      return NextResponse.json({ error: "Connection not active" }, { status: 422 });
    if (!connection.uploadedFile?.tableName)
      return NextResponse.json({ error: "No table for this connection" }, { status: 422 });

    // ── Parse schema ──────────────────────────────────────────────────────
    let schema: ERPSchema;
    try {
      const raw     = JSON.parse(connection.schemaCacheJson ?? "{}") as Record<string, unknown>;
      const rawMeta = (raw.metadata ?? {}) as Record<string, unknown>;
      schema = {
        erpType:        (raw.erpType as string)    ?? connection.erpType,
        tables:         (raw.tables  as ERPSchema["tables"]) ?? [],
        relationships:  (raw.relationships as ERPSchema["relationships"]) ?? [],
        accountTypeMap: (raw.accountTypeMap as ERPSchema["accountTypeMap"]) ?? {},
        dimensions:     (raw.dimensions as string[]) ?? [],
        currency: (raw.currency as ERPSchema["currency"]) ?? {
          baseCurrency:    (rawMeta.currency as string) ?? "INR",
          isMultiCurrency: false,
          amountColumns:   [],
          locale:          "en-IN",
        },
        metadata:       rawMeta,
        introspectedAt: raw.introspectedAt ? new Date(raw.introspectedAt as string) : new Date(),
      };
    } catch {
      return NextResponse.json({ error: "Failed to parse schema" }, { status: 500 });
    }

    // ── Load pinned queries — auto-seed if connection predates seeding ─────
    let pinned = await getPinnedQueries(user.orgId, connectionId);
    if (pinned.length === 0) {
      await seedDefaultPinnedQueries(user.orgId, connectionId);
      pinned = await getPinnedQueries(user.orgId, connectionId);
    }

    // ── Run each card in parallel — errors isolated per card ──────────────
    const tableName = connection.uploadedFile.tableName;

    const cards = await Promise.all(
      pinned.map(async (pin) => {
        const sql = getSqlForTemplate(pin.templateId, schema);

        if (!sql) {
          return {
            templateId: pin.templateId, title: pin.title, position: pin.position,
            sql: null, result: null, error: "Template not found", executionTimeMs: 0,
          };
        }

        const t0 = Date.now();
        try {
          const result = await executeUploadQuery(tableName, sql);
          return {
            templateId: pin.templateId, title: pin.title, position: pin.position,
            sql, result, error: null, executionTimeMs: Date.now() - t0,
          };
        } catch (err) {
          return {
            templateId: pin.templateId, title: pin.title, position: pin.position,
            sql, result: null, error: (err as Error).message, executionTimeMs: Date.now() - t0,
          };
        }
      })
    );

    // Serialize: BigInt (from COUNT etc.) isn't JSON-safe — coerce to number
    const safeCards = JSON.parse(
      JSON.stringify(cards, (_k, v) => (typeof v === "bigint" ? Number(v) : v))
    ) as typeof cards;

    return NextResponse.json({ cards: safeCards, connectionId });

  } catch (err) {
    console.error("[dashboard] unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
