import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "@node-rs/argon2";
import { generateIdFromEntropySize } from "lucia";
import { prisma } from "@aiql/db";
import { lucia } from "@/lib/auth";
import { cookies } from "next/headers";

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const passwordHash = await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });

  const orgName = deriveOrgName(name, email);
  const slug = await uniqueSlug(orgName);
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const org = await prisma.organisation.create({
    data: {
      name: orgName,
      slug,
      queriesResetAt: endOfMonth,
      tokenisationConfig: { create: {} },
    },
  });

  const userId = generateIdFromEntropySize(10);
  await prisma.user.create({
    data: {
      id: userId,
      email,
      name,
      passwordHash,
      role: "ADMIN",
      orgId: org.id,
    },
  });

  const session = await lucia.createSession(userId, {});
  const cookie = lucia.createSessionCookie(session.id);
  cookies().set(cookie.name, cookie.value, cookie.attributes);

  return NextResponse.json({ ok: true }, { status: 201 });
}

function deriveOrgName(name: string, email: string): string {
  if (name.trim()) return `${name.trim()}'s Organization`;
  const domain = email.split("@")[1]?.split(".")[0] ?? "My";
  return `${domain.charAt(0).toUpperCase() + domain.slice(1)} Organization`;
}

async function uniqueSlug(orgName: string): Promise<string> {
  const base = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  let slug = base;
  let i = 1;
  while (await prisma.organisation.findUnique({ where: { slug } })) {
    slug = `${base}-${i++}`;
  }
  return slug;
}
