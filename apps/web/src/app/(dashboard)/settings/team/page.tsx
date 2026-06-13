import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import TeamTable from "@/components/settings/team-table";

export default async function TeamSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const members = await prisma.user.findMany({
    where: { orgId: user.orgId },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team members</CardTitle>
        <CardDescription>Manage roles and invite new members</CardDescription>
      </CardHeader>
      <CardContent>
        <TeamTable members={members} currentUserId={user.id ?? ""} />
      </CardContent>
    </Card>
  );
}
