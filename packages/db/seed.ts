import { PrismaClient, Plan, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const org = await prisma.organisation.upsert({
    where: { slug: "acme" },
    update: {},
    create: {
      name: "Acme Finance",
      slug: "acme",
      plan: Plan.STARTER,
      queriesUsed: 0,
      queryLimit: 500,
      queriesResetAt: endOfMonth,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "demo@aiql.io" },
    update: {},
    create: {
      email: "demo@aiql.io",
      name: "Demo Admin",
      role: Role.ADMIN,
      orgId: org.id,
    },
  });

  await prisma.tokenisationConfig.upsert({
    where: { orgId: org.id },
    update: {},
    create: {
      orgId: org.id,
      tokeniseVendors: true,
      tokeniseCustomers: true,
      tokeniseEmployees: true,
      tokeniseAmounts: true,
      tokeniseAccounts: true,
      tokeniseProjects: true,
    },
  });

  console.log("Seeded:", { org: org.slug, user: user.email });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
