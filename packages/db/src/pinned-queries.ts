import { prisma } from "./index";

// ─── Default dashboard cards ──────────────────────────────────────────────────

export const DEFAULT_PINNED_QUERIES = [
  { templateId: "cash-balance",         title: "Cash & Bank Balance",              position: 0 },
  { templateId: "debtors-top-10",       title: "Outstanding Receivables (Top 10)", position: 1 },
  { templateId: "creditors-top-10",     title: "Outstanding Payables (Top 10)",    position: 2 },
  { templateId: "cash-flow-monthly",    title: "Monthly Cash Flow",                position: 3 },
  { templateId: "expense-by-voucher-type", title: "Expenses by Type",              position: 4 },
  { templateId: "cost-centre-breakdown",   title: "Cost Centre Summary",           position: 5 },
] as const;

// ─── Seed 6 default pinned queries for a newly ACTIVE connection ──────────────

export async function seedDefaultPinnedQueries(
  orgId: string,
  connectionId: string,
): Promise<void> {
  await prisma.pinnedQuery.createMany({
    data: DEFAULT_PINNED_QUERIES.map((q) => ({ orgId, connectionId, ...q })),
    skipDuplicates: true,
  });
}

// ─── CRUD helpers ─────────────────────────────────────────────────────────────

export async function getPinnedQueries(orgId: string, connectionId: string) {
  return prisma.pinnedQuery.findMany({
    where:   { orgId, connectionId },
    orderBy: { position: "asc" },
  });
}

export async function pinQuery(
  orgId: string,
  connectionId: string,
  templateId: string,
  title: string,
): Promise<void> {
  const maxPosition = await prisma.pinnedQuery.aggregate({
    where: { orgId, connectionId },
    _max:  { position: true },
  });
  const next = (maxPosition._max.position ?? -1) + 1;

  await prisma.pinnedQuery.upsert({
    where:  { connectionId_templateId: { connectionId, templateId } },
    create: { orgId, connectionId, templateId, title, position: next },
    update: { title },
  });
}

export async function unpinQuery(orgId: string, connectionId: string, templateId: string): Promise<void> {
  await prisma.pinnedQuery.deleteMany({ where: { orgId, connectionId, templateId } });
}
