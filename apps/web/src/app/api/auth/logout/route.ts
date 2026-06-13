import { NextResponse } from "next/server";
import { lucia, validateRequest } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST() {
  const { session } = await validateRequest();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await lucia.invalidateSession(session.id);
  const blank = lucia.createBlankSessionCookie();
  cookies().set(blank.name, blank.value, blank.attributes);

  return NextResponse.json({ ok: true });
}
