import { NextRequest, NextResponse } from "next/server";
import { google } from "@/lib/oauth";
import { lucia } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { cookies } from "next/headers";
import { generateIdFromEntropySize } from "lucia";

interface GoogleUser {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const storedState = cookies().get("google_oauth_state")?.value;
  const codeVerifier = cookies().get("google_code_verifier")?.value;

  if (!code || !state || state !== storedState || !codeVerifier) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
  }

  try {
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const googleUser: GoogleUser = await res.json();

    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId: googleUser.sub }, { email: googleUser.email }] },
    });

    if (!user) {
      const now = new Date();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      const orgName = `${googleUser.name}'s Organization`;
      const slug = slugify(orgName) + "-" + Date.now().toString(36);

      const org = await prisma.organisation.create({
        data: { name: orgName, slug, queriesResetAt: endOfMonth, tokenisationConfig: { create: {} } },
      });

      user = await prisma.user.create({
        data: {
          id: generateIdFromEntropySize(10),
          email: googleUser.email,
          name: googleUser.name,
          googleId: googleUser.sub,
          role: "ADMIN",
          orgId: org.id,
        },
      });
    } else if (!user.googleId) {
      await prisma.user.update({ where: { id: user.id }, data: { googleId: googleUser.sub } });
    }

    const session = await lucia.createSession(user.id, {});
    const cookie = lucia.createSessionCookie(session.id);
    cookies().set(cookie.name, cookie.value, cookie.attributes);

    return NextResponse.redirect(new URL("/", req.url));
  } catch {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", req.url));
  }
}

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}
