import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@aiql/db";
import AppShell from "@/components/app-shell";

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
    </AppShell>
  );
}
