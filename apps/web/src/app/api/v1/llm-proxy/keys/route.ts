import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { encrypt } from "@/lib/crypto";
import { telemetryStart } from "@/lib/telemetry";

/**
 * BYOK (bring-your-own-key) API key management.
 *
 *   POST /api/v1/llm-proxy/keys   register a new provider key (encrypted at rest)
 *   GET  /api/v1/llm-proxy/keys   list this org's registered keys (no plaintext)
 *
 * Plaintext keys are accepted only on POST. Once stored, they are never read
 * back — the proxy decrypts them in-memory at request time and discards.
 */

const PROVIDERS = ["OPENAI", "ANTHROPIC", "GROQ", "AZURE_OPENAI"] as const;

const createSchema = z.object({
  provider: z.enum(PROVIDERS),
  name:     z.string().min(1).max(100),
  apiKey:   z.string().min(8).max(500),
});

export async function POST(req: NextRequest) {
  const t = telemetryStart("llm_proxy.keys.create");
  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }
    t.tag({ orgId: user.orgId });

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      t.done({ status: 400 });
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { provider, name, apiKey } = parsed.data;

    // Sanity check the key shape — fail fast on accidentally-pasted-other-stuff
    if (!looksLikeApiKey(provider, apiKey)) {
      t.done({ status: 400, reason: "invalid_key_shape" });
      return NextResponse.json(
        { error: `Key does not match expected ${provider} format` },
        { status: 400 }
      );
    }

    const created = await prisma.llmProxyApiKey.create({
      data: {
        orgId:        user.orgId,
        provider,
        name:         name.trim(),
        encryptedKey: encrypt(apiKey),
        keyTail:      apiKey.slice(-4),
        isActive:     true,
      },
      // Never return encryptedKey to the client
      select: {
        id: true, provider: true, name: true, keyTail: true, isActive: true,
        callCount: true, lastUsedAt: true, createdAt: true,
      },
    });

    t.done({ status: 201, provider });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    t.fail(err, { status: 500 });
    console.error("[llm-proxy/keys POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  const t = telemetryStart("llm_proxy.keys.list");
  try {
    const { user } = await validateRequest();
    if (!user) { t.done({ status: 401 }); return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

    const keys = await prisma.llmProxyApiKey.findMany({
      where:  { orgId: user.orgId },
      select: {
        id: true, provider: true, name: true, keyTail: true, isActive: true,
        callCount: true, lastUsedAt: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    t.done({ status: 200, count: keys.length });
    return NextResponse.json({ keys });
  } catch (err) {
    t.fail(err, { status: 500 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function looksLikeApiKey(provider: typeof PROVIDERS[number], key: string): boolean {
  const trimmed = key.trim();
  if (trimmed.length < 8) return false;
  if (/\s/.test(trimmed)) return false;  // no whitespace inside
  switch (provider) {
    case "OPENAI":       return trimmed.startsWith("sk-");
    case "ANTHROPIC":    return trimmed.startsWith("sk-ant-");
    case "GROQ":         return trimmed.startsWith("gsk_");
    case "AZURE_OPENAI": return trimmed.length >= 20;  // Azure keys are 32-char hex
  }
}
