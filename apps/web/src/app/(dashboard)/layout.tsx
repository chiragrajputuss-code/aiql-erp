import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@aiql/db";
import AppShell from "@/components/app-shell";
import { AlertCircle, Zap } from "lucide-react";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const org = await prisma.organisation.findUnique({
    where: { id: user.orgId },
    select: {
      name: true,
      queriesUsed: true,
      queryLimit: true,
      trialEndsAt: true,
      subscriptionStatus: true,
      razorpaySubscriptionId: true,
    },
  });

  if (!org) redirect("/login");

  const now = new Date();
  const isTrialActive = org.trialEndsAt ? org.trialEndsAt > now : false;
  const trialDaysLeft = org.trialEndsAt
    ? Math.max(0, Math.ceil((org.trialEndsAt.getTime() - now.getTime()) / 86_400_000))
    : 0;
  const isSubscriptionActive = org.subscriptionStatus === "active";
  const trialExpired = !isTrialActive && !isSubscriptionActive;

  return (
    <AppShell user={user} org={org}>
      {/* Trial / expiry banner */}
      {trialExpired && (
        <div className="bg-red-600 text-white px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="font-medium">Your free trial has ended.</span>
            <span className="opacity-90">Subscribe to continue querying your GL data.</span>
          </div>
          <Link
            href="/billing"
            className="bg-white text-red-600 px-4 py-1.5 rounded-lg font-semibold text-xs hover:bg-red-50 shrink-0"
          >
            Upgrade now
          </Link>
        </div>
      )}
      {isTrialActive && trialDaysLeft <= 5 && (
        <div className="bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 shrink-0" />
            <span className="font-medium">
              {trialDaysLeft === 0
                ? "Your trial ends today."
                : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your trial.`}
            </span>
            <span className="opacity-90">Upgrade to keep uninterrupted access.</span>
          </div>
          <Link
            href="/billing"
            className="bg-white text-amber-600 px-4 py-1.5 rounded-lg font-semibold text-xs hover:bg-amber-50 shrink-0"
          >
            View plans
          </Link>
        </div>
      )}
      {children}
    </AppShell>
  );
}
