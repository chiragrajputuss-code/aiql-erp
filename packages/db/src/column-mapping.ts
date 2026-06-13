import { prisma } from "./index";

export interface ColumnMappingInput {
  sourceColumnName: string;
  canonicalField: string;
}

/**
 * Persist one or more column mappings for an org.
 * Uses upsert so re-confirming the same column just updates updatedAt.
 */
export async function upsertOrgMappings(
  orgId: string,
  mappings: ColumnMappingInput[]
): Promise<void> {
  await Promise.all(
    mappings.map((m) =>
      prisma.orgColumnMapping.upsert({
        where: {
          orgId_sourceColumnName: {
            orgId,
            sourceColumnName: m.sourceColumnName,
          },
        },
        update: {
          canonicalField: m.canonicalField,
        },
        create: {
          orgId,
          sourceColumnName: m.sourceColumnName,
          canonicalField:   m.canonicalField,
        },
      })
    )
  );
}

/**
 * Load all saved column mappings for an org as a plain lookup map.
 * Returns: { "Dr Amt" → "debit_amount", "Cr Amt" → "credit_amount", ... }
 */
export async function getOrgMappings(orgId: string): Promise<Record<string, string>> {
  const rows = await prisma.orgColumnMapping.findMany({
    where: { orgId },
    select: { sourceColumnName: true, canonicalField: true },
  });

  return Object.fromEntries(rows.map((r) => [r.sourceColumnName, r.canonicalField]));
}

/**
 * Delete all mappings for an org (used when the org re-uploads with a different schema).
 */
export async function clearOrgMappings(orgId: string): Promise<void> {
  await prisma.orgColumnMapping.deleteMany({ where: { orgId } });
}
