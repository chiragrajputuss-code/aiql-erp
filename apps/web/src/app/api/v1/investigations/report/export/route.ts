import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { buildAuditPdf, type AuditFindingInput } from "@/lib/audit-report-pdf";
import { getOrgBillingState, PDF_EXPORT_PLANS } from "@/lib/billing";

// GET /api/v1/investigations/report/export
// Renders the latest CURRENT investigation run as the client-facing
// "Financial Health Check" PDF — the deliverable a CA forwards after a run.

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function periodLabel(mmYyyy: string): string {
  const m = mmYyyy.match(/^(\d{1,2})-(\d{4})$/);
  if (!m) return mmYyyy;
  const mi = parseInt(m[1], 10) - 1;
  return `${MONTHS[mi] ?? m[1]} ${m[2]}`;
}

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

export async function GET(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const connectionId = new URL(req.url).searchParams.get("connectionId");
  if (connectionId) {
    const owned = await prisma.erpConnection.findFirst({
      where:  { id: connectionId, orgId: user.orgId },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  // The working-paper PDF is the Firm-plan artefact. Findings and evidence are
  // always visible in the app on every plan — only the exported document is
  // gated. (Test accounts resolve to ENTERPRISE inside getOrgBillingState.)
  const billing = await getOrgBillingState(user.orgId);
  if (!billing || !PDF_EXPORT_PLANS.has(billing.plan)) {
    return NextResponse.json(
      {
        error: "PDF export is part of the Firm plan",
        message:
          "All findings and evidence stay fully visible on the Free plan. The downloadable working-paper PDF (with evidence annexure) is included in the Firm plan — ₹30,000/year for your whole practice, unlimited clients.",
        upgrade: "/settings/billing",
      },
      { status: 402 },
    );
  }

  const [run, org] = await Promise.all([
    prisma.investigationRun.findFirst({
      where:   { orgId: user.orgId, status: "CURRENT", ...(connectionId ? { connectionId } : {}) },
      orderBy: { startedAt: "desc" },
      include: { findings: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.organisation.findUnique({ where: { id: user.orgId }, select: { name: true } }),
  ]);

  if (!run) return NextResponse.json({ error: "No investigation has been run yet." }, { status: 404 });

  const severityOrder: Record<string, number> = { critical: 0, warning: 1, opportunity: 2, info: 3 };

  const findings: AuditFindingInput[] = run.findings
    .map((f) => {
      const rec = safeParse<{ action?: string } | null>(f.recommendationJson, null);
      const evidence = safeParse<Array<{ rows?: unknown[] }>>(f.evidenceJson, []);
      const verify = safeParse<string[]>(f.verificationJson, []);
      const evidenceRows = evidence.reduce((n, e) => n + (Array.isArray(e.rows) ? e.rows.length : 0), 0);
      return {
        code:         f.code,
        severity:     f.severity,
        category:     f.category,
        title:        f.title,
        impactRs:     f.impactRs,
        conclusion:   f.conclusion,
        action:       rec?.action,
        evidenceRows,
        verifyFirst:  verify[0],
      };
    })
    .sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9) || (b.impactRs ?? 0) - (a.impactRs ?? 0));

  const totalAtRiskRs = findings
    .filter((f) => f.severity !== "opportunity")
    .reduce((s, f) => s + (f.impactRs && f.impactRs > 0 ? f.impactRs : 0), 0);
  const totalOpportunityRs = findings
    .filter((f) => f.severity === "opportunity")
    .reduce((s, f) => s + (f.impactRs && f.impactRs > 0 ? f.impactRs : 0), 0);

  const board = safeParse<{ narratedSummary?: string } | null>(run.boardBriefJson, null);
  const summary = board?.narratedSummary || run.executiveSummary ||
    `For ${periodLabel(run.period)}: ${findings.length} finding${findings.length === 1 ? "" : "s"} identified across your books.`;

  const pdf = await buildAuditPdf({
    preparedFor:        org?.name || undefined,
    periodLabel:        periodLabel(run.period),
    healthScore:        run.healthScore ?? 0,
    totalAtRiskRs,
    totalOpportunityRs,
    summary,
    findings,
    generatedOn:        new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
  });

  const filename = `AcctQAI-Health-Check-${run.period}.pdf`;
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
