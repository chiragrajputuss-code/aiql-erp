import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";

export async function GET() {
  const { user } = await validateRequest();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Only allow chirag's account (hardcoded admin guard)
  if (user.email !== "chirag.rajput070991@gmail.com") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [orgs, totalQueries, recentLogs] = await Promise.all([
    prisma.organisation.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        createdAt: true,
        trialEndsAt: true,
        queriesUsed: true,
        lifetimeQueriesUsed: true,
        closeRunsUsed: true,
        subscriptionStatus: true,
        signupIp: true,
        users: { select: { email: true, name: true, createdAt: true }, take: 1 },
      },
    }),
    prisma.queryLog.count(),
    prisma.queryLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { question: true, status: true, createdAt: true, orgId: true },
    }),
  ]);

  return NextResponse.json({ orgs, totalQueries, recentLogs });
}
