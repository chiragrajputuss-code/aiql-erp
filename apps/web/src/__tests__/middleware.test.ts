import { describe, it, expect } from "vitest";
import { middleware } from "../middleware";

// Minimal NextRequest-shaped mock — middleware only uses nextUrl, cookies, url
function mockReq(url: string, sessionCookie?: string) {
  const parsed = new URL(url);
  return {
    nextUrl: parsed,
    url,
    cookies: {
      get: (name: string) =>
        name === "auth_session" && sessionCookie ? { value: sessionCookie } : undefined,
    },
  } as Parameters<typeof middleware>[0];
}

describe("middleware", () => {
  it("allows /login through without session", () => {
    const res = middleware(mockReq("http://localhost/login"));
    expect(res?.headers?.get?.("location")).toBeFalsy();
  });

  it("allows /signup through without session", () => {
    const res = middleware(mockReq("http://localhost/signup"));
    expect(res?.headers?.get?.("location")).toBeFalsy();
  });

  it("allows /api/auth/* through without session", () => {
    const res = middleware(mockReq("http://localhost/api/auth/login"));
    expect(res?.headers?.get?.("location")).toBeFalsy();
  });

  it("allows /api/v1/* through without session (API key auth handled separately)", () => {
    const res = middleware(mockReq("http://localhost/api/v1/query"));
    expect(res?.headers?.get?.("location")).toBeFalsy();
  });

  it("redirects unauthenticated user from protected route to /login", () => {
    const res = middleware(mockReq("http://localhost/settings/general"));
    expect(res?.status).toBe(307);
    const location = res?.headers?.get("location") ?? "";
    expect(location).toContain("/login");
  });

  it("includes redirect param in login URL", () => {
    const res = middleware(mockReq("http://localhost/settings/general"));
    const location = res?.headers?.get("location") ?? "";
    expect(location).toContain("redirect=%2Fsettings%2Fgeneral");
  });

  it("allows authenticated user through protected route", () => {
    const res = middleware(mockReq("http://localhost/settings/general", "valid-session-token"));
    expect(res?.status).not.toBe(307);
  });

  it("allows authenticated user to access dashboard", () => {
    const res = middleware(mockReq("http://localhost/", "valid-session-token"));
    expect(res?.status).not.toBe(307);
  });

  it("redirects from /usage without session", () => {
    const res = middleware(mockReq("http://localhost/usage"));
    expect(res?.status).toBe(307);
  });

  it("allows public root path through (redirect handled by layout)", () => {
    const res = middleware(mockReq("http://localhost/"));
    // Root is in PUBLIC_PATHS
    expect(res?.status).not.toBe(307);
  });
});
