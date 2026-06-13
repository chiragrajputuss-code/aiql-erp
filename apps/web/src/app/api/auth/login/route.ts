import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verify } from "@node-rs/argon2";
import { prisma } from "@aiql/db";
import { lucia } from "@/lib/auth";
import { cookies } from "next/headers";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) {
    // Constant-time-ish rejection to prevent user enumeration
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const valid = await verify(user.passwordHash, password);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const session = await lucia.createSession(user.id, {});
  const cookie = lucia.createSessionCookie(session.id);
  cookies().set(cookie.name, cookie.value, cookie.attributes);

  return NextResponse.json({ ok: true });
}
