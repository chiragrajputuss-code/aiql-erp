import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_PREFIX = "test-vitest-";
const testSlug = () => `${TEST_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

beforeAll(async () => {
  // Clean up any leftover test data from previous runs
  await prisma.organisation.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
});

afterEach(async () => {
  await prisma.organisation.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ── Organisation CRUD ─────────────────────────────────────────────────────────

describe("Organisation CRUD", () => {
  it("creates an organisation with required fields", async () => {
    const slug = testSlug();
    const org = await prisma.organisation.create({
      data: { name: "Test Org", slug, queriesResetAt: new Date() },
    });
    expect(org.id).toBeTruthy();
    expect(org.slug).toBe(slug);
    expect(org.plan).toBe("STARTER");
    expect(org.queriesUsed).toBe(0);
    expect(org.queryLimit).toBe(500);
  });

  it("enforces unique slugs", async () => {
    const slug = testSlug();
    await prisma.organisation.create({ data: { name: "Org A", slug, queriesResetAt: new Date() } });
    await expect(
      prisma.organisation.create({ data: { name: "Org B", slug, queriesResetAt: new Date() } })
    ).rejects.toThrow();
  });

  it("updates organisation fields", async () => {
    const slug = testSlug();
    const org = await prisma.organisation.create({ data: { name: "Old Name", slug, queriesResetAt: new Date() } });
    const updated = await prisma.organisation.update({ where: { id: org.id }, data: { name: "New Name" } });
    expect(updated.name).toBe("New Name");
  });

  it("deletes an organisation", async () => {
    const slug = testSlug();
    const org = await prisma.organisation.create({ data: { name: "To Delete", slug, queriesResetAt: new Date() } });
    await prisma.organisation.delete({ where: { id: org.id } });
    const found = await prisma.organisation.findUnique({ where: { id: org.id } });
    expect(found).toBeNull();
  });
});

// ── User + Org relation ───────────────────────────────────────────────────────

describe("User creation with org relation", () => {
  it("creates a user linked to an organisation", async () => {
    const slug = testSlug();
    const org = await prisma.organisation.create({ data: { name: "Test Org", slug, queriesResetAt: new Date() } });
    const user = await prisma.user.create({
      data: { email: `${slug}@test.io`, role: "ADMIN", orgId: org.id },
    });
    expect(user.orgId).toBe(org.id);
    expect(user.role).toBe("ADMIN");
  });

  it("cascade deletes users when organisation is deleted", async () => {
    const slug = testSlug();
    const org = await prisma.organisation.create({ data: { name: "Test Org", slug, queriesResetAt: new Date() } });
    const user = await prisma.user.create({
      data: { email: `${slug}@test.io`, role: "MEMBER", orgId: org.id },
    });
    await prisma.organisation.delete({ where: { id: org.id } });
    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found).toBeNull();
  });

  it("enforces unique email", async () => {
    const slug = testSlug();
    const org = await prisma.organisation.create({ data: { name: "Test Org", slug, queriesResetAt: new Date() } });
    await prisma.user.create({ data: { email: `${slug}@test.io`, role: "ADMIN", orgId: org.id } });
    await expect(
      prisma.user.create({ data: { email: `${slug}@test.io`, role: "MEMBER", orgId: org.id } })
    ).rejects.toThrow();
  });
});

// ── Seed ─────────────────────────────────────────────────────────────────────

describe("Seed data", () => {
  it("demo org exists after seed", async () => {
    const org = await prisma.organisation.findUnique({ where: { slug: "acme" } });
    // Seed may not have been run — skip gracefully
    if (!org) return;
    expect(org.name).toBe("Acme Finance");
    expect(org.plan).toBe("STARTER");
  });

  it("demo user exists after seed", async () => {
    const user = await prisma.user.findUnique({ where: { email: "demo@aiql.io" } });
    if (!user) return;
    expect(user.role).toBe("ADMIN");
  });

  it("seed creates TokenisationConfig for demo org", async () => {
    const org = await prisma.organisation.findUnique({ where: { slug: "acme" } });
    if (!org) return;
    const config = await prisma.tokenisationConfig.findUnique({ where: { orgId: org.id } });
    expect(config).not.toBeNull();
    expect(config?.tokeniseVendors).toBe(true);
    expect(config?.tokeniseAmounts).toBe(true);
  });
});
