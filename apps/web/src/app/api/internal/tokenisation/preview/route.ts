import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { previewTokenisation } from "@aiql/tokeniser";
import type { EntityDictionary, TokenisationConfig } from "@aiql/tokeniser";

const schema = z.object({
  text: z.string().min(1).max(10000),
});

export async function POST(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Load org's tokenisation config
  const [dbConfig, connection] = await Promise.all([
    prisma.tokenisationConfig.findUnique({ where: { orgId: user.orgId } }),
    prisma.erpConnection.findFirst({
      where: { orgId: user.orgId, status: "ACTIVE" },
      select: { entityDictionaryJson: true },
    }),
  ]);

  const config: Partial<TokenisationConfig> = dbConfig
    ? {
        tokeniseVendors:   dbConfig.tokeniseVendors,
        tokeniseCustomers: dbConfig.tokeniseCustomers,
        tokeniseEmployees: dbConfig.tokeniseEmployees,
        tokeniseAmounts:   dbConfig.tokeniseAmounts,
        tokeniseAccounts:  dbConfig.tokeniseAccounts,
        tokeniseProjects:  dbConfig.tokeniseProjects,
        sensitivityLevel:  dbConfig.sensitivityLevel as TokenisationConfig["sensitivityLevel"],
        accountPattern:    dbConfig.accountPattern ?? undefined,
        customEntities:    dbConfig.customEntities,
        customStripList:   dbConfig.customStripList,
      }
    : {};

  const dictionary: EntityDictionary | undefined = connection?.entityDictionaryJson
    ? (JSON.parse(connection.entityDictionaryJson) as EntityDictionary)
    : undefined;

  const result = previewTokenisation(parsed.data.text, config, dictionary);

  return NextResponse.json({
    original:  result.original,
    tokenised: result.tokenised,
    tokens:    result.tokens,
    stats:     result.stats,
    tokenMap:  Object.fromEntries(
      result.tokens.map((t) => [t.token, t.original])
    ),
    auditLog: result.tokens.map((t) => ({
      original: t.original,
      token:    t.token,
      category: t.category,
    })),
  });
}
