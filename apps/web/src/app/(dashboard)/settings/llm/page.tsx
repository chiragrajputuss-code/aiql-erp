import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { redirect } from "next/navigation";
import LLMForm from "@/components/settings/llm-form";

export default async function LLMSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const org = await prisma.organisation.findUnique({
    where: { id: user.orgId },
    select: { llmProvider: true, llmModel: true },
  });
  if (!org) redirect("/login");

  return <LLMForm currentProvider={org.llmProvider} currentModel={org.llmModel} />;
}
