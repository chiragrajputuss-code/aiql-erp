import { Lucia } from "lucia";
import { PrismaAdapter } from "@lucia-auth/adapter-prisma";
import { prisma } from "@aiql/db";
import { cookies } from "next/headers";
import { cache } from "react";

const adapter = new PrismaAdapter(prisma.session, prisma.user);

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    attributes: {
      secure: process.env.NODE_ENV === "production",
    },
  },
  getUserAttributes: (attributes) => ({
    email:              attributes.email,
    name:               attributes.name,
    role:               attributes.role,
    orgId:              attributes.orgId,
    onboardingComplete: attributes.onboardingComplete,
  }),
});

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      email:              string;
      name:               string | null;
      role:               string;
      orgId:              string;
      onboardingComplete: boolean;
    };
  }
}

export const validateRequest = cache(async () => {
  const sessionId = cookies().get(lucia.sessionCookieName)?.value ?? null;
  if (!sessionId) return { user: null, session: null };

  const result = await lucia.validateSession(sessionId);
  try {
    if (result.session?.fresh) {
      const cookie = lucia.createSessionCookie(result.session.id);
      cookies().set(cookie.name, cookie.value, cookie.attributes);
    }
    if (!result.session) {
      const cookie = lucia.createBlankSessionCookie();
      cookies().set(cookie.name, cookie.value, cookie.attributes);
    }
  } catch {}

  return result;
});

export async function getCurrentUser() {
  const { user } = await validateRequest();
  return user;
}
