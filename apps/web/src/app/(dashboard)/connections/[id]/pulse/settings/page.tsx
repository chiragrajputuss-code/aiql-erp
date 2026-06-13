import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PulseSettingsForm } from "@/components/connections/pulse-settings-form";

export default async function PulseSettingsPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const connection = await prisma.erpConnection.findFirst({
    where: { id: params.id, orgId: user.orgId },
  });
  if (!connection) notFound();

  const sub = await prisma.pulseSubscription.upsert({
    where:  { connectionId: params.id },
    update: {},
    create: { orgId: user.orgId, connectionId: params.id },
  });

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link href={`/connections/${params.id}/pulse`}>
            <ArrowLeft className="h-4 w-4" />Daily Pulse
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Pulse Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{connection.displayName}</p>
      </div>

      <PulseSettingsForm
        connectionId={params.id}
        initialCadence={sub.cadence}
        initialEmailEnabled={sub.emailEnabled}
        initialInAppEnabled={sub.inAppEnabled}
        initialIsActive={sub.isActive}
        initialSnoozedCategories={sub.snoozedCategories}
      />
    </div>
  );
}
