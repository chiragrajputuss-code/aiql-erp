import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";

const schema = z.object({
  disposition: z.enum(["recovered", "not_an_issue"]),
});

// POST /api/v1/investigations/findings/:id/disposition
// A human's own confirmation on a RESOLVED finding — AcctQAI can prove a
// finding no longer appears, never that money reached a bank account (see
// docs/PLAN-PRACTICE-MODE.md 3.7's wording discipline). Only settable once;
// re-submitting the same or a different disposition is a 409, not a silent
// overwrite, so this stays an honest human record rather than something a
// retry can quietly flip.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const finding = await prisma.investigationFinding.findFirst({
    where:  { id: params.id, run: { orgId: user.orgId } },
    select: { id: true, status: true, disposition: true },
  });
  if (!finding) return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  if (finding.status !== "resolved") {
    return NextResponse.json({ error: "Only a resolved finding can be dispositioned" }, { status: 400 });
  }
  if (finding.disposition) {
    return NextResponse.json({ error: `Already marked "${finding.disposition}"` }, { status: 409 });
  }

  const updated = await prisma.investigationFinding.update({
    where: { id: finding.id },
    data:  { disposition: parsed.data.disposition, dispositionAt: new Date() },
    select: { id: true, disposition: true, dispositionAt: true },
  });

  return NextResponse.json({
    id: updated.id, disposition: updated.disposition,
    dispositionAt: updated.dispositionAt?.toISOString() ?? null,
  });
}
