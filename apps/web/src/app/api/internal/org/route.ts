import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";

const schema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens")
    .optional(),
  llmProvider: z.enum(["AIQL_MANAGED", "AZURE_OPENAI", "OPENAI", "GEMINI", "GROQ", "OLLAMA"]).optional(),
  llmApiKey: z.string().optional(),
  llmModel: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { slug, ...rest } = parsed.data;

  if (slug) {
    const conflict = await prisma.organisation.findFirst({
      where: { slug, NOT: { id: user.orgId } },
    });
    if (conflict) {
      return NextResponse.json({ error: { slug: ["Slug already taken"] } }, { status: 409 });
    }
  }

  const org = await prisma.organisation.update({
    where: { id: user.orgId },
    data: { ...(slug ? { slug } : {}), ...rest },
    select: { id: true, name: true, slug: true, plan: true, llmProvider: true, llmModel: true },
  });

  return NextResponse.json(org);
}
