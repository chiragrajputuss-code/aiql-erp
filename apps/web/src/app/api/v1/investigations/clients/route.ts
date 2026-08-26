import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";

// GET /api/v1/investigations/clients
// Lists the org's client books — ACTIVE connections holding a GL upload —
// for the investigations page's client switcher. Deliberately lightweight
// (no per-connection date-range queries, unlike /api/internal/connections)
// since this only needs to populate a dropdown.
export async function GET(_req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const connections = await prisma.erpConnection.findMany({
    where: {
      orgId:  user.orgId,
      status: "ACTIVE",
      uploadedFile: { documentType: "GL" },
    },
    select: {
      id:           true,
      displayName:  true,
      uploadedFile: { select: { periodStart: true, periodEnd: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    clients: connections.map((c) => ({
      connectionId: c.id,
      displayName:  c.displayName,
      periodStart:  c.uploadedFile?.periodStart?.toISOString().slice(0, 10) ?? null,
      periodEnd:    c.uploadedFile?.periodEnd?.toISOString().slice(0, 10) ?? null,
    })),
  });
}
