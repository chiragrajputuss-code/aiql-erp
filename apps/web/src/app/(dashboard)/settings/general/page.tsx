import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { redirect } from "next/navigation";
import GeneralForm from "@/components/settings/general-form";

export default async function GeneralSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const org = await prisma.organisation.findUnique({
    where: { id: user.orgId },
    select: { name: true, slug: true, plan: true },
  });
  if (!org) redirect("/login");

  return <GeneralForm name={org.name} slug={org.slug} plan={org.plan} />;
}
