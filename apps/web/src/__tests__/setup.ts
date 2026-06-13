import { vi } from "vitest";

// Mock next/headers globally — not available outside Next.js server context
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}));

// Mock Next.js cache
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});

// Set test env vars
// NODE_ENV is read-only in TypeScript; set via vitest config instead
process.env.CREDENTIAL_ENCRYPTION_KEY = "a".repeat(64); // 64 hex chars for AES-256
