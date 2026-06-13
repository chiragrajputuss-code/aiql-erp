import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Settings, Bell, BellOff, RefreshCw } from "lucide-react";
import { PulseDigestView } from "@/components/connections/pulse-digest-view";

export default async function PulsePage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const connection = await prisma.erpConnection.findFirst({
    where:   { id: params.id, orgId: user.orgId },
    include: { uploadedFile: true },
  });
  if (!connection) notFound();

  // Load or create subscription
  const sub = await prisma.pulseSubscription.upsert({
    where:  { connectionId: params.id },
    update: {},
    create: { orgId: user.orgId, connectionId: params.id },
  });

  // Fetch the 5 most recent digests; exclude alerts in permanently muted categories
  const alertWhere = sub.snoozedCategories.length > 0
    ? { category: { notIn: sub.snoozedCategories } }
    : undefined;

  const digests = await prisma.pulseDigest.findMany({
    where:   { subscriptionId: sub.id },
    orderBy: { generatedAt: "desc" },
    take:    5,
    include: {
      alerts: {
        where:   alertWhere,
        orderBy: { severity: "asc" },
      },
    },
  });

  const latestDigest = digests[0] ?? null;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link href={`/connections/${params.id}`}><ArrowLeft className="h-4 w-4" />Back</Link>
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Bell className="h-6 w-6 text-amber-500" />
            Daily Pulse
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{connection.displayName}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href={`/connections/${params.id}/pulse/settings`}>
              <Settings className="h-4 w-4" />Settings
            </Link>
          </Button>
        </div>
      </div>

      {/* Subscription status strip */}
      {sub.cadence === "OFF" || !sub.isActive ? (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          <BellOff className="h-4 w-4 shrink-0" />
          <span>Pulse is paused for this workspace.</span>
          <Button asChild variant="link" size="sm" className="ml-auto p-0 h-auto text-sm text-amber-600">
            <Link href={`/connections/${params.id}/pulse/settings`}>Turn on →</Link>
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <Bell className="h-4 w-4 shrink-0" />
          <span>
            {sub.cadence === "DAILY" ? "Daily" : "Weekly"} digest active
            {sub.emailEnabled ? " · email on" : " · email off"}
          </span>
          <Button asChild variant="link" size="sm" className="ml-auto p-0 h-auto text-sm text-amber-600">
            <Link href={`/connections/${params.id}/pulse/settings`}>Configure →</Link>
          </Button>
        </div>
      )}

      {/* Latest digest */}
      {latestDigest ? (
        <PulseDigestView digest={latestDigest} connectionId={params.id} />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center space-y-3">
          <RefreshCw className="h-8 w-8 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-500">No digest yet</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Your first pulse will be generated tomorrow morning at 8 AM IST. Check back then, or{" "}
            <Link href={`/connections/${params.id}/pulse/settings`} className="underline underline-offset-2">
              configure settings
            </Link>.
          </p>
        </div>
      )}

      {/* History */}
      {digests.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Past digests</p>
          <div className="divide-y border rounded-lg overflow-hidden">
            {digests.slice(1).map((d) => {
              const critCount  = d.alerts.filter((a) => a.severity === "critical").length;
              const totalCount = d.alerts.length;
              return (
                <div key={d.id} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 text-sm">
                  <span className="text-slate-600">
                    {new Date(d.generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span className="text-slate-500">
                    {totalCount === 0 ? "All clear" : `${totalCount} alert${totalCount !== 1 ? "s" : ""}${critCount > 0 ? ` · ${critCount} urgent` : ""}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
