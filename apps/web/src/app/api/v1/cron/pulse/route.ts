import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@aiql/db";
import {
  generateComplianceAlerts,
  computeSnapshotFromRows,
  computeTdsAlerts,
  computeVendorComplianceAlerts,
  type WorkspaceContext,
} from "@aiql/pulse-engine";
import { sendPulseEmail, type PulseEmailVariant } from "@/lib/pulse-email/send";

// ─── Security ────────────────────────────────────────────────────────────────

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

// ─── GL data helpers ─────────────────────────────────────────────────────────

async function fetchGlRows(
  tableName: string,
  limitRows = 5000,
): Promise<Record<string, unknown>[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM "${tableName}" LIMIT ${limitRows}`,
    );
    return rows;
  } catch {
    return [];
  }
}

async function fetchPaymentRows(tableName: string): Promise<Record<string, unknown>[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
      SELECT * FROM "${tableName}"
      WHERE lower(voucher_type) IN ('payment','bank payment','cash payment')
      LIMIT 2000
    `);
    return rows;
  } catch {
    return [];
  }
}

// ─── One subscription run ─────────────────────────────────────────────────────

async function runForSubscription(
  subscriptionId: string,
  today: Date,
  baseUrl: string,
): Promise<{ ok: boolean; connectionId: string; alertCount: number }> {
  const sub = await prisma.pulseSubscription.findUnique({
    where:   { id: subscriptionId },
    include: {
      connection: {
        include: { uploadedFile: true },
      },
      org: {
        include: { users: { where: { role: "ADMIN" } } },
      },
    },
  });

  if (!sub || !sub.isActive) return { ok: false, connectionId: subscriptionId, alertCount: 0 };

  // Idempotency: skip if already sent today
  const startOfDay = new Date(today);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const existing = await prisma.pulseDigest.findFirst({
    where: {
      subscriptionId,
      generatedAt: { gte: startOfDay },
    },
  });
  if (existing) return { ok: true, connectionId: sub.connectionId, alertCount: 0 };

  // Cadence check — WEEKLY only runs on Monday (day 1)
  if (sub.cadence === "WEEKLY" && today.getDay() !== 1) {
    return { ok: true, connectionId: sub.connectionId, alertCount: 0 };
  }

  const { connection } = sub;
  const uploadedFile   = connection.uploadedFile;
  const tableName      = uploadedFile?.tableName ?? null;

  const ctx: WorkspaceContext = {
    connectionId:      connection.id,
    connectionName:    connection.displayName,
    orgId:             sub.orgId,
    documentTypes:     uploadedFile ? [(uploadedFile.documentType as "GL")] : [],
    dataIntent:        uploadedFile?.dataIntent === "HISTORICAL" ? "HISTORICAL" : "CURRENT_OPERATIONAL",
    glMaxDate:         uploadedFile?.periodEnd?.toISOString().slice(0, 10) ?? null,
    glTableName:       tableName,
    snoozedCategories: sub.snoozedCategories,
  };

  // Generate alerts
  const complianceAlerts = generateComplianceAlerts(today, ctx);

  let snapshot = null;
  let tdsAlerts: Awaited<ReturnType<typeof computeTdsAlerts>> = [];

  if (tableName && ctx.dataIntent === "CURRENT_OPERATIONAL") {
    const [allRows, paymentRows] = await Promise.all([
      fetchGlRows(tableName),
      fetchPaymentRows(tableName),
    ]);

    if (allRows.length > 0) {
      const raw = computeSnapshotFromRows(allRows);
      snapshot = {
        ...raw,
        glPeriodStart: uploadedFile?.periodStart?.toISOString().slice(0, 10) ?? null,
        glPeriodEnd:   uploadedFile?.periodEnd?.toISOString().slice(0, 10) ?? null,
        computedAt:    new Date().toISOString(),
      };
    }
    if (paymentRows.length > 0) {
      tdsAlerts = computeTdsAlerts(paymentRows, connection.id, today);
    }
  }

  // Vendor GST-filing compliance — survives even after the source GSTR-2B
  // table has expired, since it reads from the persisted VendorComplianceRecord.
  let vendorAlerts: ReturnType<typeof computeVendorComplianceAlerts> = [];
  const latestVendorRecord = await prisma.vendorComplianceRecord.findFirst({
    where: { connectionId: connection.id },
    orderBy: { createdAt: "desc" },
  });
  if (latestVendorRecord) {
    const latestPeriodRecords = await prisma.vendorComplianceRecord.findMany({
      where: { connectionId: connection.id, period: latestVendorRecord.period },
    });
    vendorAlerts = computeVendorComplianceAlerts(latestPeriodRecords, today);
  }

  const allAlerts = [...complianceAlerts, ...tdsAlerts, ...vendorAlerts];

  // Determine email variant
  const isFirstTime = uploadedFile
    ? (today.getTime() - new Date(uploadedFile.createdAt ?? today).getTime()) < 24 * 60 * 60 * 1000
    : false;
  const isHistorical = ctx.dataIntent === "HISTORICAL";
  const emailVariant: PulseEmailVariant =
    isHistorical ? "historical" : isFirstTime ? "welcome" : "standard";

  // Quiet day: no alerts and no snapshot → skip email but still persist in-app digest
  const quietDay = allAlerts.length === 0 && !snapshot;

  // Persist digest
  const digest = await prisma.pulseDigest.create({
    data: {
      subscriptionId,
      connectionId: connection.id,
      digestJson: JSON.stringify({ alerts: allAlerts, snapshot, generatedAt: today.toISOString() }),
      alerts: {
        create: allAlerts.map((a) => ({
          connectionId: connection.id,
          category:     a.category,
          severity:     a.severity,
          title:        a.title,
          detail:       a.detail ?? null,
          actionUrl:    a.actionUrl ?? null,
          detailJson:   a.detailJson ? JSON.stringify(a.detailJson) : null,
        })),
      },
    },
  });

  // Send email if enabled — suppress on quiet days (no alerts, no snapshot)
  if (sub.emailEnabled && sub.org.users.length > 0 && !quietDay) {
    const adminEmail = sub.org.users[0].email;
    const recipientName = sub.org.users[0].name ?? sub.org.name;

    try {
      await sendPulseEmail(adminEmail, {
        recipientName,
        connectionName: connection.displayName,
        alerts:         allAlerts,
        snapshot:       snapshot ?? undefined,
        shareToken:     digest.shareToken,
        baseUrl,
        today,
        variant:        emailVariant,
      });

      await prisma.pulseDigest.update({
        where: { id: digest.id },
        data:  { emailSentAt: new Date(), emailDelivered: true },
      });
    } catch (err) {
      console.error(`[Pulse] Email failed for subscription ${subscriptionId}:`, err);
    }
  }

  // Update lastSentAt
  await prisma.pulseSubscription.update({
    where: { id: subscriptionId },
    data:  { lastSentAt: new Date() },
  });

  return { ok: true, connectionId: sub.connectionId, alertCount: allAlerts.length };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const today   = new Date();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.aiql.in";

  // Fetch all active DAILY/WEEKLY subscriptions
  const subscriptions = await prisma.pulseSubscription.findMany({
    where:  { isActive: true, cadence: { not: "OFF" } },
    select: { id: true },
  });

  const results = await Promise.allSettled(
    subscriptions.map((s) => runForSubscription(s.id, today, baseUrl)),
  );

  const summary = results.map((r, i) => ({
    subscriptionId: subscriptions[i].id,
    status: r.status,
    ...(r.status === "fulfilled" ? r.value : { error: String((r as PromiseRejectedResult).reason) }),
  }));

  const failures = summary.filter((s) => s.status === "rejected").length;
  console.log(`[Pulse Cron] Processed ${subscriptions.length} subscriptions, ${failures} failures`);

  return NextResponse.json({ processed: subscriptions.length, failures, summary });
}
