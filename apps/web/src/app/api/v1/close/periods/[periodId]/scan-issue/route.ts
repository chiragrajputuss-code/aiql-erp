import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";

type Ctx = { params: { periodId: string } };

interface ScanIssue {
  code:         string;
  severity:     string;
  category:     string;
  title:        string;
  description:  string;
  affectedRows: number;
  exposure:     number | null;
  examples:     Record<string, unknown>[];
}

// GET /api/v1/close/periods/:periodId/scan-issue?code=voucher_imbalance
// Returns the scan issue details (saved at period creation in adaptive mode)
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { periodId } = ctx.params;
    const code = req.nextUrl.searchParams.get("code");
    if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

    const period = await prisma.closePeriod.findFirst({
      where: { id: periodId, orgId: user.orgId },
      select: { scanResultJson: true },
    });
    if (!period) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!period.scanResultJson) return NextResponse.json({ issue: null });

    const scan = JSON.parse(period.scanResultJson) as { issues?: ScanIssue[] };
    const issue = (scan.issues ?? []).find((i) => i.code === code);

    return NextResponse.json({ issue: issue ?? null });
  } catch (err) {
    console.error("[scan-issue GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
