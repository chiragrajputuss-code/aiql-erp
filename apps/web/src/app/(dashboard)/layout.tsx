import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@aiql/db";
import AppShell from "@/components/app-shell";
import { HelpPanel } from "@/components/help/help-panel";

// Founding-free (Phase 5, see apps/web/src/lib/billing.ts checkPlanAccess /
// getOrgBillingState): this layout used to compute its own, independent
// copy of the trial-expiry/subscription check to decide whether to show a
// "Your free trial has ended — subscribe to continue" banner site-wide.
// That duplicate logic kept showing the banner even after checkPlanAccess
// itself was fixed to stop blocking queries — nobody is gated by trial
// expiry or subscription status right now, so no dashboard page should
// show a trial/upgrade banner either. Restore from git history (the commit
// that introduced this comment) alongside checkPlanAccess's bypass removal
// when pricing is actually introduced after 2027.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const org = await prisma.organisation.findUnique({
    where: { id: user.orgId },
    select: { name: true, queriesUsed: true, queryLimit: true },
  });

  if (!org) redirect("/login");

  return (
    <AppShell user={user} org={org}>
      {children}
      <HelpPanel />
    </AppShell>
  );
}
