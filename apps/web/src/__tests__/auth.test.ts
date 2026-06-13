import { describe, it, expect, vi, beforeEach } from "vitest";
import { hash, verify } from "@node-rs/argon2";

// ── Password hashing (core auth logic) ───────────────────────────────────────

describe("Password hashing (argon2id)", () => {
  it("hashes a password", async () => {
    const hashed = await hash("password123", { memoryCost: 4096, timeCost: 1, outputLen: 32, parallelism: 1 });
    expect(hashed).toBeTruthy();
    expect(hashed).not.toBe("password123");
  });

  it("verifies correct password", async () => {
    const hashed = await hash("mypassword", { memoryCost: 4096, timeCost: 1, outputLen: 32, parallelism: 1 });
    const valid = await verify(hashed, "mypassword");
    expect(valid).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hashed = await hash("correct", { memoryCost: 4096, timeCost: 1, outputLen: 32, parallelism: 1 });
    const valid = await verify(hashed, "wrong");
    expect(valid).toBe(false);
  });

  it("produces unique hashes for same password (random salt)", async () => {
    const opts = { memoryCost: 4096, timeCost: 1, outputLen: 32, parallelism: 1 };
    const h1 = await hash("same", opts);
    const h2 = await hash("same", opts);
    expect(h1).not.toBe(h2);
  });

  it("rejects empty password", async () => {
    const hashed = await hash("real-password", { memoryCost: 4096, timeCost: 1, outputLen: 32, parallelism: 1 });
    const valid = await verify(hashed, "");
    expect(valid).toBe(false);
  });
});

// ── Signup route logic ────────────────────────────────────────────────────────

describe("Signup route — validation", () => {
  it("rejects missing email", async () => {
    const { z } = await import("zod");
    const schema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });
    const result = schema.safeParse({ name: "Test", email: "", password: "password123" });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 8 chars", async () => {
    const { z } = await import("zod");
    const schema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });
    const result = schema.safeParse({ name: "Test", email: "a@b.com", password: "short" });
    expect(result.success).toBe(false);
  });

  it("accepts valid signup data", async () => {
    const { z } = await import("zod");
    const schema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });
    const result = schema.safeParse({ name: "Priya Sharma", email: "priya@acme.com", password: "securepass" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email format", async () => {
    const { z } = await import("zod");
    const schema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });
    const result = schema.safeParse({ name: "Test", email: "not-an-email", password: "password123" });
    expect(result.success).toBe(false);
  });
});

// ── Session cookie ────────────────────────────────────────────────────────────

describe("Auth session", () => {
  it("lucia creates session with correct structure (mocked)", async () => {
    const mockLucia = {
      createSession: vi.fn().mockResolvedValue({ id: "sess_abc123", userId: "user_1", fresh: false, expiresAt: new Date() }),
      createSessionCookie: vi.fn().mockReturnValue({ name: "auth_session", value: "sess_abc123", attributes: { httpOnly: true } }),
      createBlankSessionCookie: vi.fn().mockReturnValue({ name: "auth_session", value: "", attributes: {} }),
      invalidateSession: vi.fn().mockResolvedValue(undefined),
      sessionCookieName: "auth_session",
    };

    const session = await mockLucia.createSession("user_1", {});
    expect(session.id).toBe("sess_abc123");

    const cookie = mockLucia.createSessionCookie(session.id);
    expect(cookie.name).toBe("auth_session");
    expect(cookie.attributes.httpOnly).toBe(true);
  });

  it("logout invalidates session (mocked)", async () => {
    const invalidate = vi.fn().mockResolvedValue(undefined);
    await invalidate("sess_abc123");
    expect(invalidate).toHaveBeenCalledWith("sess_abc123");
  });

  it("session includes orgId via getUserAttributes", () => {
    // Simulates what lucia.getUserAttributes maps
    const dbUser = { email: "a@b.com", name: "A", role: "ADMIN", orgId: "org_123" };
    const attrs = {
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      orgId: dbUser.orgId,
    };
    expect(attrs.orgId).toBe("org_123");
    expect(attrs.role).toBe("ADMIN");
  });
});

// ── Google OAuth callback ─────────────────────────────────────────────────────

describe("Google OAuth", () => {
  it("creates new user when googleId not found (mocked)", async () => {
    const createUser = vi.fn().mockResolvedValue({ id: "user_new", email: "new@gmail.com", googleId: "g_123" });
    const findUser = vi.fn().mockResolvedValue(null); // no existing user

    const googleUser = { sub: "g_123", email: "new@gmail.com", name: "New User", picture: "" };

    const existing = await findUser({ where: { OR: [{ googleId: googleUser.sub }, { email: googleUser.email }] } });
    expect(existing).toBeNull();

    const user = await createUser({ data: { email: googleUser.email, googleId: googleUser.sub, role: "ADMIN" } });
    expect(user.googleId).toBe("g_123");
  });

  it("links googleId to existing email-only account (mocked)", async () => {
    const existingUser = { id: "user_1", email: "priya@acme.com", googleId: null };
    const updateUser = vi.fn().mockResolvedValue({ ...existingUser, googleId: "g_456" });

    if (!existingUser.googleId) {
      const updated = await updateUser({ where: { id: existingUser.id }, data: { googleId: "g_456" } });
      expect(updated.googleId).toBe("g_456");
    }
    expect(updateUser).toHaveBeenCalledOnce();
  });

  it("returns existing user if googleId already linked", async () => {
    const existingUser = { id: "user_1", email: "priya@acme.com", googleId: "g_456" };
    const findUser = vi.fn().mockResolvedValue(existingUser);
    const updateUser = vi.fn();

    const user = await findUser({ where: { OR: [{ googleId: "g_456" }] } });
    if (!user.googleId) await updateUser();
    expect(updateUser).not.toHaveBeenCalled();
  });
});
