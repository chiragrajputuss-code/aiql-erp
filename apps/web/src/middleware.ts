import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "auth_session";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/api/auth",
  "/api/v1",
  "/api/webhooks",
  "/api/billing",
  "/api/health",
  "/api/contact",
  "/contact",
  "/pricing",
  "/terms",
  "/privacy",
  "/sitemap.xml",
  "/robots.txt",
  "/_next",
  "/favicon.ico",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname === "/";
  if (isPublic) return NextResponse.next();

  const session = request.cookies.get(SESSION_COOKIE);
  if (!session?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
