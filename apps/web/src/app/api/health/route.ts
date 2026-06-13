import { NextResponse } from "next/server";
import { prisma } from "@aiql/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Lightweight DB ping — just checks connection is alive
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded", db: "error" }, { status: 503 });
  }
}
