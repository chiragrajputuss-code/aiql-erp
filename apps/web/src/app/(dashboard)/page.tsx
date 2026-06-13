import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { redirect } from "next/navigation";
import { CashDashboard } from "@/components/cash-dashboard";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // First-time users go through the onboarding wizard before seeing the dashboard.
  if (!user.onboardingComplete) redirect("/onboarding");

  const [org, connections] = await Promise.all([
    prisma.organisation.findUnique({
      where:  { id: user.orgId },
      select: { queriesUsed: true, queryLimit: true, plan: true },
    }),
    prisma.erpConnection.findMany({
      where:   { orgId: user.orgId, status: "ACTIVE" },
      select:  { id: true, displayName: true, erpType: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <CashDashboard
      userName={user.name ?? null}
      queriesUsed={org?.queriesUsed ?? 0}
      queryLimit={org?.queryLimit ?? 500}
      connections={connections}
    />
  );
}
