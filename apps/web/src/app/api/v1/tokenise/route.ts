import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tokenise } from "@aiql/tokeniser";

const schema = z.object({
  text: z.string().min(1).max(10000),
  entityDictionary: z
    .object({
      vendors:   z.array(z.string()).default([]),
      customers: z.array(z.string()).default([]),
      employees: z.array(z.string()).default([]),
    })
    .optional(),
  options: z
    .object({
      tokeniseVendors:   z.boolean().optional(),
      tokeniseCustomers: z.boolean().optional(),
      tokeniseEmployees: z.boolean().optional(),
      tokeniseAmounts:   z.boolean().optional(),
      tokeniseAccounts:  z.boolean().optional(),
      tokeniseProjects:  z.boolean().optional(),
    })
    .optional(),
});

// No auth for now — API key auth added in Sprint 8
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { text, entityDictionary, options } = parsed.data;
  const result = tokenise(text, options ?? {}, entityDictionary);

  return NextResponse.json({
    tokenised: result.tokenised,
    stats:     result.stats,
    auditLog:  result.auditLog,
    tokenMap:  Object.fromEntries(result.tokenMap),
  });
}
