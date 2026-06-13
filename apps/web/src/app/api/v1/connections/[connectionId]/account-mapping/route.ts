import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { cascadeClassify } from "@aiql/schema-intel";
import { RECON_RELEVANT } from "@/lib/account-types";

type Ctx = { params: { connectionId: string } };

// ─── Label maps (kept here for reference, canonical source is @/lib/account-types) ──
const ACCOUNT_TYPE_LABELS_LOCAL: Record<string, string> = {
  BANK:              "Bank / Cash",
  CASH:              "Bank / Cash",
  RECEIVABLE:        "Accounts Receivable (Debtors)",
  PAYABLE:           "Accounts Payable (Creditors)",
  TAX:               "GST / Tax",
  INVENTORY:         "Inventory / Stock",
  FIXED_ASSET:       "Fixed Assets",
  CURRENT_ASSET:     "Current Assets",
  CURRENT_LIABILITY: "Current Liabilities",
  LONG_TERM_LIABILITY: "Long-term Liabilities",
  REVENUE:           "Revenue / Sales",
  COGS:              "Cost of Goods Sold",
  EXPENSE:           "Expenses",
  OTHER_INCOME:      "Other Income",
  EQUITY:            "Capital / Equity",
  INVESTMENT:        "Investments",
  UNKNOWN:           "Unclassified",
};


// ─── GET — scan GL table + merge with any saved mappings ─────────────────────

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { connectionId } = ctx.params;

    const connection = await prisma.erpConnection.findFirst({
      where:   { id: connectionId, orgId: user.orgId },
      include: { uploadedFile: true },
    });
    if (!connection) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!connection.uploadedFile?.tableName)
      return NextResponse.json({ error: "No GL data for this connection" }, { status: 422 });

    // 1. Auto-classification from schema introspection (done at upload time)
    const autoMap: Record<string, string> = {};
    if (connection.schemaCacheJson) {
      try {
        const schema = JSON.parse(connection.schemaCacheJson) as {
          accountTypeMap?: Record<string, string>;
        };
        Object.assign(autoMap, schema.accountTypeMap ?? {});
      } catch { /* ignore */ }
    }

    // 2. Distinct account names actually in the GL table
    const tableName = connection.uploadedFile.tableName;

    // Find actual account_name column via columnMapping
    let accountCol = "account_name";
    if (connection.uploadedFile.columnMapping) {
      const cols = JSON.parse(connection.uploadedFile.columnMapping) as {
        sourceColumnName: string; canonicalField: string;
      }[];
      const mapped = cols.find((c) => c.canonicalField === "account_name");
      if (mapped) accountCol = mapped.sourceColumnName;
    }

    let distinctAccounts: string[] = [];
    try {
      const rows = await prisma.$queryRawUnsafe<{ acct: string }[]>(
        `SELECT DISTINCT "${accountCol}" AS acct FROM "${tableName}" WHERE "${accountCol}" IS NOT NULL AND "${accountCol}" <> '' ORDER BY acct LIMIT 500`
      );
      distinctAccounts = rows.map((r) => r.acct);
    } catch {
      // Fall back to accounts from the auto map if table query fails
      distinctAccounts = Object.keys(autoMap);
    }

    // 3. Load any already-confirmed mappings for this connection
    const saved = await prisma.orgAccountMapping.findMany({
      where: { connectionId },
    });
    const savedByName = new Map(saved.map((m) => [m.accountName, m]));

    // 4. Cascade classify: group → name pattern → LLM
    // Pass autoMap as the "group-based" layer; LLM only fires for what falls through
    const { map: cascadeMap, sources, llmConfidences } = await cascadeClassify(
      distinctAccounts,
      autoMap as Record<string, never>
    );

    // 4b. Persist back to schemaCacheJson so all engines (scanner, recon, flux) benefit
    const updatedAccountTypeMap: Record<string, string> = { ...autoMap };
    let cacheChanged = false;
    for (const [name, type] of Object.entries(cascadeMap)) {
      if (updatedAccountTypeMap[name] !== type) {
        updatedAccountTypeMap[name] = type;
        cacheChanged = true;
      }
    }
    if (cacheChanged && connection.schemaCacheJson) {
      try {
        const parsed = JSON.parse(connection.schemaCacheJson) as Record<string, unknown>;
        parsed.accountTypeMap = updatedAccountTypeMap;
        await prisma.erpConnection.update({
          where: { id: connectionId },
          data:  { schemaCacheJson: JSON.stringify(parsed) },
        });
      } catch { /* best-effort, don't fail the request */ }
    }

    // 4c. Build response with confidence reflecting source
    const accounts = distinctAccounts.map((name) => {
      const existing  = savedByName.get(name);
      const cascadeType = cascadeMap[name] ?? "UNKNOWN";
      const source    = sources[name] ?? "unknown";

      const autoConf = source === "group"   ? 0.95
                     : source === "pattern" ? 0.75
                     : source === "llm"     ? (llmConfidences[name] ?? 0.70)
                     : 0;

      return {
        accountName:  name,
        accountType:  existing?.accountType  ?? cascadeType,
        confidence:   existing?.confidence   ?? autoConf,
        isConfirmed:  existing?.isConfirmed  ?? false,
        source:       existing                ? "manual" : source,
        reconRelevant: RECON_RELEVANT.includes(existing?.accountType ?? cascadeType),
      };
    });

    const allConfirmed = accounts.every((a) => a.isConfirmed);

    return NextResponse.json({
      connectionId,
      displayName:  connection.displayName,
      accounts,
      allConfirmed,
      totalAccounts: accounts.length,
      confirmedCount: accounts.filter((a) => a.isConfirmed).length,
    });
  } catch (err) {
    console.error("[account-mapping GET]", err);
    return NextResponse.json({ error: "Internal server error", detail: (err as Error).message }, { status: 500 });
  }
}

// ─── POST — save confirmed mappings ──────────────────────────────────────────

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { connectionId } = ctx.params;

    const connection = await prisma.erpConnection.findFirst({
      where: { id: connectionId, orgId: user.orgId },
    });
    if (!connection) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json() as {
      accounts: { accountName: string; accountType: string; confidence: number }[];
    };

    const now = new Date();

    // Upsert all mappings in a transaction
    await prisma.$transaction(
      body.accounts.map((a) =>
        prisma.orgAccountMapping.upsert({
          where:  { connectionId_accountName: { connectionId, accountName: a.accountName } },
          create: {
            orgId: user.orgId,
            connectionId,
            accountName:  a.accountName,
            accountType:  a.accountType,
            confidence:   a.confidence,
            isConfirmed:  true,
            confirmedAt:  now,
          },
          update: {
            accountType:  a.accountType,
            confidence:   a.confidence,
            isConfirmed:  true,
            confirmedAt:  now,
          },
        })
      )
    );

    // Also update schemaCacheJson.accountTypeMap so recon runner picks it up
    const existing = connection.schemaCacheJson
      ? JSON.parse(connection.schemaCacheJson) as Record<string, unknown>
      : {};
    const newMap: Record<string, string> = {};
    for (const a of body.accounts) newMap[a.accountName] = a.accountType;
    existing.accountTypeMap = { ...(existing.accountTypeMap as Record<string, string> ?? {}), ...newMap };

    await prisma.erpConnection.update({
      where: { id: connectionId },
      data:  { schemaCacheJson: JSON.stringify(existing) },
    });

    return NextResponse.json({ saved: body.accounts.length });
  } catch (err) {
    console.error("[account-mapping POST]", err);
    return NextResponse.json({ error: "Internal server error", detail: (err as Error).message }, { status: 500 });
  }
}
