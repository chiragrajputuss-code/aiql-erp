import { prisma } from "./index";

export interface ColumnMappingInput {
  sourceColumnName: string;
  canonicalField: string;
}

// NOTE: OrgColumnMapping now carries an optional connectionId so a firm's
// clients can each have their own file format without one overwriting
// another's (see the unique index in the practice-mode migration). This
// module still only ever writes/reads connectionId: null — i.e. today's
// org-level-default behaviour, UNCHANGED. Threading a real connectionId
// through so a client's own mapping is preferred over the org default is
// Phase 3.5 of docs/PLAN-PRACTICE-MODE.md, not done here.

/**
 * Persist one or more column mappings for an org (optionally scoped to one
 * client's connection).
 *
 * Not a Prisma `upsert` on the compound unique key: Prisma's generated
 * compound-unique input types require every member to be a non-null string,
 * even when the underlying column (connectionId) is nullable — the DB-level
 * uniqueness for the null case is enforced by the COALESCE expression index
 * added in the practice-mode migration, not by this input type. So this does
 * an explicit find-then-write instead, which works identically whether
 * connectionId is null (today's only caller) or a real client id (Phase 3.5).
 */
export async function upsertOrgMappings(
  orgId: string,
  mappings: ColumnMappingInput[],
  connectionId: string | null = null,
): Promise<void> {
  await Promise.all(
    mappings.map(async (m) => {
      const existing = await prisma.orgColumnMapping.findFirst({
        where:  { orgId, connectionId, sourceColumnName: m.sourceColumnName },
        select: { id: true },
      });
      if (existing) {
        await prisma.orgColumnMapping.update({
          where: { id: existing.id },
          data:  { canonicalField: m.canonicalField },
        });
      } else {
        await prisma.orgColumnMapping.create({
          data: { orgId, connectionId, sourceColumnName: m.sourceColumnName, canonicalField: m.canonicalField },
        });
      }
    })
  );
}

/**
 * Load all saved column mappings for an org as a plain lookup map.
 * Returns: { "Dr Amt" → "debit_amount", "Cr Amt" → "credit_amount", ... }
 */
export async function getOrgMappings(orgId: string): Promise<Record<string, string>> {
  const rows = await prisma.orgColumnMapping.findMany({
    where: { orgId, connectionId: null },
    select: { sourceColumnName: true, canonicalField: true },
  });

  return Object.fromEntries(rows.map((r) => [r.sourceColumnName, r.canonicalField]));
}

/**
 * Delete all mappings for an org (used when the org re-uploads with a different schema).
 */
export async function clearOrgMappings(orgId: string): Promise<void> {
  await prisma.orgColumnMapping.deleteMany({ where: { orgId, connectionId: null } });
}
