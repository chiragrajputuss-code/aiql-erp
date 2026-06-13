/**
 * Per-org tokenisation config loader.
 *
 * Loads the org's `TokenisationConfig` row and returns the shape expected by
 * `@aiql/tokeniser`'s `tokenise()` function. If no row exists, returns
 * defaults (everything enabled, STANDARD sensitivity).
 *
 * Cached per-process for the lifetime of a request — fetching the row is
 * cheap, but multiple LLM calls in one request shouldn't hit the DB twice.
 */

import { prisma } from "@aiql/db";
import type { TokenisationConfig as TokeniseConfig } from "@aiql/tokeniser";

const DEFAULT_CONFIG: TokeniseConfig = {
  tokeniseVendors:   true,
  tokeniseCustomers: true,
  tokeniseEmployees: true,
  tokeniseAmounts:   true,
  tokeniseAccounts:  true,
  tokeniseProjects:  true,
  sensitivityLevel:  "STANDARD",
  customEntities:    [],
  customStripList:   [],
};

export async function getOrgTokenisationConfig(orgId: string): Promise<TokeniseConfig> {
  const row = await prisma.tokenisationConfig.findUnique({ where: { orgId } });
  if (!row) return DEFAULT_CONFIG;

  return {
    tokeniseVendors:   row.tokeniseVendors,
    tokeniseCustomers: row.tokeniseCustomers,
    tokeniseEmployees: row.tokeniseEmployees,
    tokeniseAmounts:   row.tokeniseAmounts,
    tokeniseAccounts:  row.tokeniseAccounts,
    tokeniseProjects:  row.tokeniseProjects,
    sensitivityLevel:  row.sensitivityLevel,
    accountPattern:    row.accountPattern ?? undefined,
    customEntities:    row.customEntities,
    customStripList:   row.customStripList,
  };
}
