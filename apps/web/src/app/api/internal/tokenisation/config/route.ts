import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";

const schema = z.object({
  tokeniseVendors:   z.boolean().optional(),
  tokeniseCustomers: z.boolean().optional(),
  tokeniseEmployees: z.boolean().optional(),
  tokeniseAmounts:   z.boolean().optional(),
  tokeniseAccounts:  z.boolean().optional(),
  tokeniseProjects:  z.boolean().optional(),
  sensitivityLevel:  z.enum(["STANDARD", "HIGH", "MAXIMUM"]).optional(),
  accountPattern:    z.string().nullish(),
  customEntities:    z.array(z.string()).optional(),
  customStripList:   z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const config = await prisma.tokenisationConfig.upsert({
    where:  { orgId: user.orgId },
    create: { orgId: user.orgId, ...parsed.data },
    update: parsed.data,
  });

  return NextResponse.json(config);
}

export async function GET(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const config = await prisma.tokenisationConfig.findUnique({
    where: { orgId: user.orgId },
  });

  return NextResponse.json(config ?? {});
}
