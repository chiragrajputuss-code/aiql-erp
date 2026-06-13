/**
 * AIQL End-to-End Validation Harness
 *
 * Loads each of the 10 sample company CSVs into the actual production database
 * (via the real ingestion pipeline) and runs the actual scanner + task generator
 * + reconciliation code paths against them. Proves the system works end-to-end
 * on real data and quantifies the rupee value of findings.
 *
 * Creates test data with prefix `validate_test_*` for easy cleanup.
 *
 * Usage:
 *   pnpm tsx tools/validate-all/index.ts            # run + print markdown report
 *   pnpm tsx tools/validate-all/index.ts --json     # JSON output for further processing
 *   pnpm tsx tools/validate-all/index.ts --cleanup  # drop all validate_test_* tables and rows
 */

import * as fs from "fs";
import * as path from "path";
import { prisma } from "@aiql/db";
import { hash } from "@node-rs/argon2";
import {
  parseCsv,
  mapColumn,
  resolveRedundancy,
  createTempTable,
  buildUploadSchema,
  getUploadEntityLists,
  type ColumnMappingResult,
  type ResolvedMapping,
} from "@aiql/erp-connectors";
import { seedDefaultPinnedQueries } from "@aiql/db";
import {
  runDataQualityScan,
  generateAdaptiveTemplate,
  parseUserIntent,
  patternKeyForScanIssue,
  type ScanResult,
  type CloseTemplate,
  type CloseIntent,
  type Issue,
} from "@aiql/close-engine";
import { classifyByName } from "@aiql/schema-intel";
// Internal utility imports — pnpm workspace + tsx resolves these directly.
// Used to apply the same SQL transformations the real runReconciliation does.
import {
  buildColMap,
  applyColMap,
  getTableColumns,
  makeSqlDefensive,
} from "../../packages/close-engine/src/utils/column-mapping";

const SAMPLE_DIR = path.join(__dirname, "../../test-data/companies");

const SAMPLE_FILES = [
  "apollo_diag.csv",
  "buildpro.csv",
  "kumar_textiles.csv",
  "learnright.csv",
  "patel_distributors.csv",
  "sharma_electronics.csv",
  "speedy_cargo.csv",
  "spice_garden.csv",
  "steelco.csv",
  "techvista.csv",
];

const TEST_ORG_PREFIX = "validate_test_";
const TEST_ORG_ID    = "validate_test_org";
const TEST_USER_ID   = "validate_test_user";
const TEST_USER_EMAIL    = "demo@validate.aiql.local";
const TEST_USER_PASSWORD = "AIQLdemo2026!";  // local-demo credentials, not for prod

// Each CSV gets one company-specific adaptive intent so we test that path too
const COMPANY_INTENTS: Record<string, string> = {
  "kumar_textiles.csv":
    "GST notice received — check Ganesh Traders Pvt Ltd and Shree Services LLP ITC entries carefully. Also verify if IGST applied correctly on export sales.",
  "buildpro.csv":
    "Bank loan renewal — need project cost breakdown and verify subcontractor invoices carefully, creditor entries may be missing.",
  "spice_garden.csv":
    "Owner suspects cash leakage. Check all journal entries above 1 lakh, especially Diwali Bonus to Staff entries.",
  "sharma_electronics.csv":
    "Statutory audit prep. Need debtor ageing, related party transactions (check Sharma family parties), and top creditor balances.",
  "techvista.csv":
    "Investor due diligence. Check EEFC account for compliance — no rupee expenses should be routed through ICICI EEFC USD A/c.",
  "patel_distributors.csv":
    "Focus on AP — Patel Distributors has 1380 vouchers and 123 parties. Need to verify creditor balances and GST input credits.",
  "steelco.csv":
    "Steel trader has 110 lakh in unbalanced vouchers. Drill down on specific subcontractor and material purchase patterns.",
  "learnright.csv":
    "EdTech with 102 lakh dr-cr gap. Check fee receipts vs revenue recognition alignment.",
  "apollo_diag.csv":
    "Diagnostics chain with 240 parties. Focus on party reconciliation and unmapped accounts.",
  "speedy_cargo.csv":
    "Logistics company. Standard close — focus on party reconciliation for 77 carriers/clients.",
};

// ─── Result types ─────────────────────────────────────────────────────────────

interface CompanyResult {
  file:              string;
  startedAt:         string;
  durationMs:        number;
  // Ingestion
  ingestion: {
    success:          boolean;
    error?:           string;
    rowCount:         number;
    headerCount:      number;
    columnsMapped:    number;
    columnsUnmapped:  number;
    columnsDropped:   number;
    tableName?:       string;
    sampleMappings:   Array<{ original: string; canonical: string | null; method: string; confidence: number }>;
  };
  // Scanner
  scan?: {
    success:        boolean;
    error?:         string;
    durationMs:     number;
    totalIssues:    number;
    bySeverity:     Record<string, number>;
    totalExposure:  number;
    issues:         Array<{ code: string; severity: string; title: string; rows: number; exposure: number | null }>;
  };
  // Intent parser
  intentParse?: {
    success:        boolean;
    error?:         string;
    source:         string;
    confidence:     number;
    focusAreas:     string[];
    watchAccounts:  string[];
    watchParties:   string[];
    riskFlags:      string[];
  };
  // Task generator — both STANDARD and ADAPTIVE
  taskGenStandard?: {
    success:    boolean;
    error?:     string;
    taskCount:  number;
    reasoning:  string[];
    taskTitles: string[];
  };
  taskGenAdaptive?: {
    success:        boolean;
    error?:         string;
    taskCount:      number;
    reasoning:      string[];
    taskTitles:     string[];
    partyTaskCount: number;  // how many `party-*` tasks generated
  };
  // Reconciliations executed against actual data
  reconciliations?: Array<{
    name:          string;
    success:       boolean;
    error?:        string;
    sourceBalance: number;
    targetBalance: number;
    variance:      number;
  }>;
  // Cleanup
  cleanedUp: boolean;
}

// Companies that get the full "month 1 → captured knowledge → month 2 auto-resolve"
// demo treatment. Picked for variety: textile manufacturing, FMCG distribution,
// electronics retail.
const SEED_KB_FOR: string[] = [
  "kumar_textiles.csv",
  "patel_distributors.csv",
  "sharma_electronics.csv",
];

/**
 * Simulate a "previous month" close where the CA resolved scan issues and
 * captured each as knowledge. This populates OrgBusinessKnowledge with
 * patternKey + verdict=NORMAL + autoApply=ALWAYS entries.
 *
 * Then create a "this month" close period that triggers auto-resolve on the
 * same patterns. The result: lastAppliedAt is set, appliedCount > 0, and the
 * insights banner shows non-zero "Auto-resolved" for these connections.
 */
async function seedKnowledgeAndApply(
  connectionId: string,
  scan:         ScanResult,
): Promise<{ captured: number; resolved: number }> {
  // 1. For each non-info scan issue, capture knowledge with patternKey
  let captured = 0;
  for (const issue of scan.issues) {
    if (issue.severity === "info") continue;

    const k = patternKeyForScanIssue({ issueCode: issue.code });
    const stored = {
      issueCode:    issue.code,
      affectedRows: issue.affectedRows,
      exposure:     issue.exposure ?? 0,
    };

    // Backdate firstLearnedAt by 30 days to simulate "last month's close"
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    // Upsert by the compound unique constraint
    const existing = await prisma.orgBusinessKnowledge.findFirst({
      where: { orgId: TEST_ORG_ID, connectionId, patternKey: k.patternKey },
    });
    if (existing) {
      await prisma.orgBusinessKnowledge.update({
        where: { id: existing.id },
        data: {
          sourceRefJson: JSON.stringify(stored),
          // Reset applied tracking — fresh seed
          lastAppliedAt: null,
          appliedCount:  0,
        },
      });
    } else {
      await prisma.orgBusinessKnowledge.create({
        data: {
          orgId:         TEST_ORG_ID,
          connectionId,
          patternKey:    k.patternKey,
          context:       `Demo: ${issue.title}`,
          answer:        `Confirmed normal in previous close cycle. Pattern: ${issue.code}.`,
          source:        "SCAN_ISSUE",
          verdict:       "NORMAL",
          autoApply:     "ALWAYS",
          sourceRefJson: JSON.stringify(stored),
          firstLearnedAt:    monthAgo,
          lastReaffirmedAt:  monthAgo,
        },
      });
    }
    captured++;
  }

  // 2. Mark these knowledge entries as recently-applied so the insights API
  //    counts them. Simulates "the new close period just ran and auto-resolved
  //    them" — same effect as applyKnowledgeBase doing it in production.
  const just = new Date();
  const updated = await prisma.orgBusinessKnowledge.updateMany({
    where: { orgId: TEST_ORG_ID, connectionId, verdict: "NORMAL", autoApply: "ALWAYS" },
    data:  { lastAppliedAt: just, appliedCount: { increment: 1 } },
  });

  return { captured, resolved: updated.count };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function ensureTestOrg(): Promise<void> {
  // Reset org counters/cleanup if exists
  await prisma.organisation.upsert({
    where:  { id: TEST_ORG_ID },
    update: {},
    create: {
      id:             TEST_ORG_ID,
      name:           "Validate Test Org",
      slug:           "validate-test-org",
      queriesResetAt: new Date(),
    },
  });

  // Create / refresh demo user so you can log in and walk through the data in the UI.
  // Hash matches the production signup flow (@node-rs/argon2 with same params).
  const passwordHash = await hash(TEST_USER_PASSWORD, {
    memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1,
  });
  await prisma.user.upsert({
    where:  { id: TEST_USER_ID },
    update: { passwordHash },
    create: {
      id:                 TEST_USER_ID,
      email:              TEST_USER_EMAIL,
      name:               "AIQL Demo (validation harness)",
      passwordHash,
      role:               "ADMIN",
      orgId:              TEST_ORG_ID,
      onboardingComplete: true,
    },
  });
}

async function cleanupAll(): Promise<void> {
  console.error("\n🧹 Cleaning up all validate_test_* artifacts...");

  // Drop all upload_validate_test_* tables
  const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'upload_validate_test_%'`,
  );
  for (const { tablename } of tables) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tablename}" CASCADE`);
    console.error(`  dropped ${tablename}`);
  }

  // Delete OrgBusinessKnowledge for the test org (cascade on org delete handles
  // this too, but be explicit so we get a count).
  const kbDeleted = await prisma.orgBusinessKnowledge.deleteMany({
    where: { orgId: TEST_ORG_ID },
  });
  if (kbDeleted.count > 0) console.error(`  deleted ${kbDeleted.count} knowledge entries`);

  // Delete connections + uploaded files (cascades on connection delete)
  const conns = await prisma.erpConnection.findMany({
    where: { orgId: TEST_ORG_ID },
    select: { id: true },
  });
  for (const c of conns) {
    await prisma.erpConnection.delete({ where: { id: c.id } }).catch(() => {});
  }
  console.error(`  deleted ${conns.length} ErpConnection rows`);

  // Delete the test user (cascade should handle this when org is deleted, but be explicit)
  await prisma.user.deleteMany({ where: { orgId: TEST_ORG_ID } }).catch(() => {});

  // Delete the test org itself
  await prisma.organisation.delete({ where: { id: TEST_ORG_ID } }).catch(() => {});
  console.error(`  deleted test org + demo user`);
  console.error("✅ Cleanup complete\n");
}

async function ingestCompany(file: string): Promise<{
  connectionId: string;
  result:       CompanyResult["ingestion"];
}> {
  const filePath = path.join(SAMPLE_DIR, file);
  const buffer   = fs.readFileSync(filePath);
  const parsed   = parseCsv(buffer);

  // Map each header to canonical
  const mappings: ColumnMappingResult[] = parsed.headers.map((h) => {
    const sampleValues = parsed.rows.slice(0, 30).map((r) => r[h]);
    return mapColumn(h, sampleValues);
  });

  // Resolve redundancies (multiple headers mapping to same canonical → keep best)
  const resolved: ResolvedMapping[] = resolveRedundancy(mappings);

  const columnsMapped   = resolved.filter((m) => m.canonicalName && !m.dropped).length;
  const columnsUnmapped = resolved.filter((m) => !m.canonicalName).length;
  const columnsDropped  = resolved.filter((m) => m.dropped).length;

  // Build a connection ID derived from the file name for stability
  const connectionId = `${TEST_ORG_PREFIX}conn_${file.replace(/[^a-z0-9]/gi, "_").slice(0, 30)}`;
  const fileId       = `${TEST_ORG_PREFIX}file_${file.replace(/[^a-z0-9]/gi, "_").slice(0, 30)}`;

  // Create ErpConnection if it doesn't exist
  await prisma.erpConnection.upsert({
    where:  { id: connectionId },
    update: { status: "ACTIVE" },
    create: {
      id:             connectionId,
      orgId:          TEST_ORG_ID,
      erpType:        "FILE_UPLOAD",
      displayName:    `Validate: ${file}`,
      status:         "ACTIVE",
      credentialsArn: "",
    },
  });

  // Create the table + insert data
  const tableName = await createTempTable(TEST_ORG_ID, fileId, resolved, parsed.rows);

  // Build the canonical mapping JSON the scanner expects
  // (file.columnMapping is JSON of {sourceColumnName, canonicalField}[])
  const columnMappingJson = JSON.stringify(
    resolved
      .filter((m) => m.canonicalName && !m.dropped)
      .map((m) => ({
        sourceColumnName: m.originalName,
        canonicalField:   m.canonicalName,
      })),
  );

  // Create/update UploadedFile record
  await prisma.uploadedFile.upsert({
    where:  { connectionId },
    update: { tableName, rowCount: parsed.rowCount, columnMapping: columnMappingJson },
    create: {
      id:             fileId,
      connectionId,
      originalName:   file,
      mimeType:       "text/csv",
      sizeBytes:      buffer.length,
      rowCount:       parsed.rowCount,
      tableName,
      columnMapping:  columnMappingJson,
      expiresAt:      new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
  });

  // Replicate the production confirm-upload flow exactly so the dashboard,
  // pinned queries, and other downstream features have everything they need:
  //   1. buildUploadSchema()       — full RawSchemaData with tables, columns, currency
  //   2. accountTypeMap            — classifyByName for every distinct account
  //   3. getUploadEntityLists()    — entity dictionary (vendors / customers / parties)
  //   4. seedDefaultPinnedQueries() — pinned cards for the dashboard
  const rawSchema = buildUploadSchema(tableName, resolved, parsed.rowCount);

  const distinctAccounts = await prisma.$queryRawUnsafe<{ account_name: string }[]>(
    `SELECT DISTINCT account_name FROM "${tableName}" WHERE account_name IS NOT NULL AND account_name <> ''`,
  );
  const accountTypeMap: Record<string, string> = {};
  for (const { account_name } of distinctAccounts) {
    accountTypeMap[account_name] = classifyByName(account_name);
  }

  // Merge accountTypeMap into the schema (buildUploadSchema doesn't classify on its own).
  const schemaWithAccounts = { ...rawSchema, accountTypeMap };

  const entityLists = await getUploadEntityLists(tableName);

  await prisma.erpConnection.update({
    where: { id: connectionId },
    data: {
      schemaCacheJson:      JSON.stringify(schemaWithAccounts),
      schemaCachedAt:       new Date(),
      entityDictionaryJson: JSON.stringify(entityLists),
    },
  });

  // Seed default pinned queries so the dashboard has cards to render.
  await seedDefaultPinnedQueries(TEST_ORG_ID, connectionId);

  return {
    connectionId,
    result: {
      success:         true,
      rowCount:        parsed.rowCount,
      headerCount:     parsed.headers.length,
      columnsMapped,
      columnsUnmapped,
      columnsDropped,
      tableName,
      sampleMappings:  resolved.slice(0, 10).map((m) => ({
        original:   m.originalName,
        canonical:  m.canonicalName,
        method:     m.detectionMethod,
        confidence: m.confidence,
      })),
    },
  };
}

/**
 * Execute a reconciliation template directly. Mirrors what `runReconciliation`
 * does but without persisting to the DB (which would require creating a full
 * ClosePeriod + CloseTask chain). Tests that the SQL itself works.
 */
async function executeRecon(
  template:     { name: string; sourceQuery: string; targetQuery: string; params?: string[] },
  connectionId: string,
  tableName:    string,
  start:        Date,
  end:          Date,
): Promise<{ sourceBalance: number; targetBalance: number; variance: number }> {
  const startIso = start.toISOString().slice(0, 10);
  const endIso   = end.toISOString().slice(0, 10);

  // 1. Substitute placeholders that the template generator left in
  const substitute = (q: string) =>
    q.replace(/\{tableName\}/g, tableName)
     .replace(/\{startDate\}/g, startIso)
     .replace(/\{endDate\}/g, endIso);

  // 2. Apply the same column-mapping + defensive transforms as runReconciliation
  const [colMap, presentCols] = await Promise.all([
    buildColMap(connectionId),
    getTableColumns(tableName),
  ]);
  const finalize = (q: string) => makeSqlDefensive(applyColMap(substitute(q), colMap), presentCols);

  const params: unknown[] = template.params ?? [];

  const sourceSql = finalize(template.sourceQuery);
  const targetSql = finalize(template.targetQuery);

  const sourceRows = await prisma.$queryRawUnsafe<{ balance: unknown }[]>(sourceSql, ...params);
  const targetRows = await prisma.$queryRawUnsafe<{ balance: unknown }[]>(targetSql, ...params);

  const sourceBalance = sourceRows[0] ? Number(sourceRows[0].balance ?? 0) : 0;
  const targetBalance = targetRows[0] ? Number(targetRows[0].balance ?? 0) : 0;
  return { sourceBalance, targetBalance, variance: Math.abs(sourceBalance - targetBalance) };
}

function inferPeriod(rows: { transaction_date?: unknown }[]): { start: Date; end: Date } {
  const dates = rows
    .map((r) => r.transaction_date)
    .filter((d): d is string | Date => Boolean(d))
    .map((d) => new Date(d as string))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length === 0) {
    return { start: new Date("2024-01-01"), end: new Date("2024-12-31") };
  }
  // Use last 90 days of data as the "close period" — gives the scanner real data
  // to scan instead of a synthetic period
  const end   = dates[dates.length - 1];
  const start = new Date(end);
  start.setDate(start.getDate() - 90);
  return { start, end };
}

async function runOneCompany(file: string): Promise<CompanyResult> {
  const startedAt = new Date();
  const t0 = Date.now();
  const result: CompanyResult = {
    file,
    startedAt: startedAt.toISOString(),
    durationMs: 0,
    ingestion: {
      success: false,
      rowCount: 0,
      headerCount: 0,
      columnsMapped: 0,
      columnsUnmapped: 0,
      columnsDropped: 0,
      sampleMappings: [],
    },
    cleanedUp: false,
  };

  let connectionId: string;
  try {
    const ing = await ingestCompany(file);
    connectionId = ing.connectionId;
    result.ingestion = ing.result;
  } catch (err) {
    result.ingestion.success = false;
    result.ingestion.error   = (err as Error).message;
    result.durationMs = Date.now() - t0;
    return result;
  }

  // Determine the close period from actual data
  const dateRows = await prisma.$queryRawUnsafe<{ transaction_date: string }[]>(
    `SELECT transaction_date FROM "${result.ingestion.tableName!}" WHERE transaction_date IS NOT NULL`,
  );
  const { start, end } = inferPeriod(dateRows);

  // ─── 1. Run scanner ─────────────────────────────────────────────────────────
  let scanResult: ScanResult | null = null;
  try {
    const scanT0 = Date.now();
    scanResult = await runDataQualityScan(connectionId, start, end);
    result.scan = {
      success:       true,
      durationMs:    Date.now() - scanT0,
      totalIssues:   scanResult.totalIssues,
      bySeverity:    scanResult.bySeverity,
      totalExposure: scanResult.totalExposure,
      issues: scanResult.issues.map((i) => ({
        code:     i.code,
        severity: i.severity,
        title:    i.title,
        rows:     i.affectedRows,
        exposure: i.exposure,
      })),
    };

    // Seed sample knowledge + auto-resolve for the 3 demo companies
    if (SEED_KB_FOR.includes(file)) {
      const kb = await seedKnowledgeAndApply(connectionId, scanResult);
      console.error(`   📚 KB demo: captured ${kb.captured} patterns, marked ${kb.resolved} as auto-resolved`);
    }
  } catch (err) {
    result.scan = {
      success:       false,
      error:         (err as Error).message,
      durationMs:    0,
      totalIssues:   0,
      bySeverity:    { critical: 0, review: 0, info: 0 },
      totalExposure: 0,
      issues:        [],
    };
  }

  // ─── 2. Parse intent (heuristic-only; LLM disabled to keep test offline) ────
  const intentText = COMPANY_INTENTS[file] ?? "";
  let intent: CloseIntent | null = null;
  try {
    intent = await parseUserIntent(intentText);
    result.intentParse = {
      success:       true,
      source:        intent.source,
      confidence:    intent.confidence,
      focusAreas:    intent.focusAreas,
      watchAccounts: intent.watchAccounts,
      watchParties:  intent.watchParties,
      riskFlags:     intent.riskFlags,
    };
  } catch (err) {
    result.intentParse = {
      success:       false,
      error:         (err as Error).message,
      source:        "error",
      confidence:    0,
      focusAreas:    [],
      watchAccounts: [],
      watchParties:  [],
      riskFlags:     [],
    };
  }

  // ─── 3. Run task generator (STANDARD profile) ──────────────────────────────
  try {
    const { template, reasoning } = await generateAdaptiveTemplate(
      connectionId, start, end, { profile: "STANDARD" },
    );
    result.taskGenStandard = {
      success:    true,
      taskCount:  template.tasks.length,
      reasoning,
      taskTitles: template.tasks.map((t) => t.title),
    };
  } catch (err) {
    result.taskGenStandard = {
      success:    false,
      error:      (err as Error).message,
      taskCount:  0,
      reasoning:  [],
      taskTitles: [],
    };
  }

  // ─── 4. Run task generator (ADAPTIVE profile with intent) ──────────────────
  let adaptiveTemplate: CloseTemplate | null = null;
  try {
    const { template, reasoning } = await generateAdaptiveTemplate(
      connectionId, start, end, { profile: "ADAPTIVE", intent },
    );
    adaptiveTemplate = template;
    const partyTaskCount = template.tasks.filter((t) => t.key.startsWith("party-")).length;
    result.taskGenAdaptive = {
      success:        true,
      taskCount:      template.tasks.length,
      reasoning,
      taskTitles:     template.tasks.map((t) => t.title),
      partyTaskCount,
    };
  } catch (err) {
    result.taskGenAdaptive = {
      success:        false,
      error:          (err as Error).message,
      taskCount:      0,
      reasoning:      [],
      taskTitles:     [],
      partyTaskCount: 0,
    };
  }

  // ─── 5. Execute reconciliation templates against real data ─────────────────
  if (adaptiveTemplate && result.ingestion.tableName) {
    result.reconciliations = [];
    for (const task of adaptiveTemplate.tasks) {
      if (!task.reconciliation) continue;
      try {
        const r = await executeRecon(
          task.reconciliation, connectionId, result.ingestion.tableName, start, end,
        );
        result.reconciliations.push({
          name:          task.reconciliation.name,
          success:       true,
          sourceBalance: r.sourceBalance,
          targetBalance: r.targetBalance,
          variance:      r.variance,
        });
      } catch (err) {
        result.reconciliations.push({
          name:          task.reconciliation.name,
          success:       false,
          error:         (err as Error).message,
          sourceBalance: 0,
          targetBalance: 0,
          variance:      0,
        });
      }
    }
  }

  result.durationMs = Date.now() - t0;
  return result;
}

// ─── Reporting ────────────────────────────────────────────────────────────────

function formatRupees(n: number): string {
  if (!isFinite(n) || n === 0) return "₹0";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function renderReport(results: CompanyResult[]): string {
  const out: string[] = [];
  const totalExposure = results.reduce((s, r) => s + (r.scan?.totalExposure ?? 0), 0);
  const totalIssues   = results.reduce((s, r) => s + (r.scan?.totalIssues ?? 0), 0);
  const totalRows     = results.reduce((s, r) => s + r.ingestion.rowCount, 0);
  const successCount  = results.filter((r) => r.scan?.success && r.taskGenStandard?.success && r.taskGenAdaptive?.success).length;

  out.push("# AIQL End-to-End Validation Report\n");
  out.push(`> Real ingestion, real scanner, real task generator. Run against production DB schema.`);
  out.push(`> Generated: ${new Date().toISOString()}\n`);
  out.push("## Headline\n");
  out.push("| Metric | Value |");
  out.push("|---|---|");
  out.push(`| Companies tested | ${results.length} |`);
  out.push(`| Pipeline successful end-to-end | **${successCount}/${results.length}** |`);
  out.push(`| Total rows ingested | ${totalRows.toLocaleString("en-IN")} |`);
  out.push(`| Total anomalies surfaced | **${totalIssues}** |`);
  out.push(`| Total ₹ exposure flagged | **${formatRupees(totalExposure)}** |`);
  out.push("");

  out.push("## Per-company summary\n");
  out.push("| Company | Rows | Cols mapped | Scan | Issues | Exposure | Std tasks | Adapt tasks | Party | Recons OK |");
  out.push("|---|--:|--:|---|--:|--:|--:|--:|--:|---|");
  for (const r of results) {
    const scanIcon = r.scan?.success ? "✓" : "✗";
    const taskS = r.taskGenStandard?.success ? r.taskGenStandard.taskCount.toString() : "✗";
    const taskA = r.taskGenAdaptive?.success ? r.taskGenAdaptive.taskCount.toString() : "✗";
    const party = r.taskGenAdaptive?.partyTaskCount ?? 0;
    const recOk = r.reconciliations
      ? `${r.reconciliations.filter((rc) => rc.success).length}/${r.reconciliations.length}`
      : "—";
    out.push(
      `| ${r.file.replace(".csv", "")} | ${r.ingestion.rowCount} | ${r.ingestion.columnsMapped}/${r.ingestion.headerCount} | ${scanIcon} | ${r.scan?.totalIssues ?? 0} | ${formatRupees(r.scan?.totalExposure ?? 0)} | ${taskS} | ${taskA} | ${party} | ${recOk} |`,
    );
  }
  out.push("");

  for (const r of results) {
    out.push(`---\n\n## ${r.file}\n`);
    out.push(`**Duration:** ${r.durationMs}ms · **Rows:** ${r.ingestion.rowCount} · **Table:** \`${r.ingestion.tableName ?? "(not created)"}\`\n`);

    out.push(`### Ingestion`);
    if (!r.ingestion.success) {
      out.push(`❌ **FAILED**: ${r.ingestion.error}\n`);
      continue;
    }
    out.push(`- Headers: ${r.ingestion.headerCount}`);
    out.push(`- Mapped: ${r.ingestion.columnsMapped}, Unmapped: ${r.ingestion.columnsUnmapped}, Dropped: ${r.ingestion.columnsDropped}`);
    out.push("");
    out.push("| Original column | Canonical | Method | Confidence |");
    out.push("|---|---|---|--:|");
    for (const m of r.ingestion.sampleMappings) {
      out.push(`| ${m.original} | ${m.canonical ?? "—"} | ${m.method} | ${(m.confidence * 100).toFixed(0)}% |`);
    }
    out.push("");

    out.push(`### Scanner`);
    if (!r.scan?.success) {
      out.push(`❌ **FAILED**: ${r.scan?.error}\n`);
    } else {
      out.push(`✓ Ran in ${r.scan.durationMs}ms · ${r.scan.totalIssues} issues · ${formatRupees(r.scan.totalExposure)} exposure`);
      if (r.scan.issues.length > 0) {
        out.push("");
        out.push("| Severity | Title | Rows | Exposure |");
        out.push("|---|---|--:|--:|");
        for (const i of r.scan.issues) {
          out.push(`| ${i.severity} | ${i.title} | ${i.rows} | ${formatRupees(i.exposure ?? 0)} |`);
        }
      }
      out.push("");
    }

    if (r.intentParse) {
      out.push(`### Intent parser`);
      if (!r.intentParse.success) {
        out.push(`❌ **FAILED**: ${r.intentParse.error}\n`);
      } else {
        out.push(`Source: \`${r.intentParse.source}\` · Confidence: ${(r.intentParse.confidence * 100).toFixed(0)}%`);
        if (r.intentParse.focusAreas.length)    out.push(`- Focus areas: ${r.intentParse.focusAreas.join(", ")}`);
        if (r.intentParse.watchAccounts.length) out.push(`- Watch accounts: ${r.intentParse.watchAccounts.join(", ")}`);
        if (r.intentParse.watchParties.length)  out.push(`- **Watch parties: ${r.intentParse.watchParties.join(", ")}**`);
        if (r.intentParse.riskFlags.length)     out.push(`- Risk flags: ${r.intentParse.riskFlags.join(", ")}`);
        out.push("");
      }
    }

    if (r.taskGenStandard) {
      out.push(`### Task generator — STANDARD profile`);
      if (!r.taskGenStandard.success) {
        out.push(`❌ **FAILED**: ${r.taskGenStandard.error}\n`);
      } else {
        out.push(`✓ Generated ${r.taskGenStandard.taskCount} tasks`);
        for (const t of r.taskGenStandard.taskTitles) out.push(`- ${t}`);
        out.push("");
      }
    }

    if (r.taskGenAdaptive) {
      out.push(`### Task generator — ADAPTIVE profile (with intent)`);
      if (!r.taskGenAdaptive.success) {
        out.push(`❌ **FAILED**: ${r.taskGenAdaptive.error}\n`);
      } else {
        out.push(`✓ Generated ${r.taskGenAdaptive.taskCount} tasks (${r.taskGenAdaptive.partyTaskCount} party deep-dive tasks)`);
        for (const t of r.taskGenAdaptive.taskTitles) out.push(`- ${t}`);
        out.push("");
      }
    }

    if (r.reconciliations && r.reconciliations.length > 0) {
      out.push(`### Reconciliations`);
      const passed = r.reconciliations.filter((rc) => rc.success).length;
      out.push(`✓ ${passed}/${r.reconciliations.length} executed successfully\n`);
      out.push("| Recon | Status | Source balance | Target balance | Variance |");
      out.push("|---|---|--:|--:|--:|");
      for (const rc of r.reconciliations) {
        const status = rc.success ? "✓" : `✗ ${rc.error?.slice(0, 40)}`;
        out.push(`| ${rc.name} | ${status} | ${formatRupees(rc.sourceBalance)} | ${formatRupees(rc.targetBalance)} | ${formatRupees(rc.variance)} |`);
      }
      out.push("");
    }
  }
  return out.join("\n");
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args      = process.argv.slice(2);
  const jsonOut   = args.includes("--json");
  const cleanOnly = args.includes("--cleanup");
  const outIdx    = args.indexOf("--out");
  const outPath   = outIdx >= 0 ? args[outIdx + 1] : "/tmp/validation-report.md";

  if (cleanOnly) {
    await cleanupAll();
    return;
  }

  console.error("🔧 Setting up test org...");
  await ensureTestOrg();

  console.error(`📂 Running validation on ${SAMPLE_FILES.length} company files...\n`);
  const results: CompanyResult[] = [];
  for (const file of SAMPLE_FILES) {
    console.error(`▶  ${file}`);
    const r = await runOneCompany(file);
    results.push(r);
    const scanIcon = r.scan?.success ? "✓" : "✗";
    const taskS    = r.taskGenStandard?.success ? `S=${r.taskGenStandard.taskCount}` : "S=✗";
    const taskA    = r.taskGenAdaptive?.success ? `A=${r.taskGenAdaptive.taskCount}` : "A=✗";
    console.error(
      `   ingest=${r.ingestion.success ? "✓" : "✗"} scan=${scanIcon} ${taskS} ${taskA} ` +
      `· issues=${r.scan?.totalIssues ?? 0} · exposure=${formatRupees(r.scan?.totalExposure ?? 0)}`,
    );
  }

  // Write directly to file — bypasses Prisma's stdout-error pollution and any
  // other library logs that would otherwise mix into the report.
  const content = jsonOut ? JSON.stringify(results, null, 2) : renderReport(results);
  fs.writeFileSync(outPath, content);
  console.error(`\n📄 Report written to: ${outPath}`);
  console.error(`✅ Done. ${results.length} companies validated.`);
  console.error(``);
  console.error(`🔑 Demo login (for walking through the data in the UI):`);
  console.error(`   URL:      http://localhost:3000/login  (after \`pnpm dev\`)`);
  console.error(`   Email:    ${TEST_USER_EMAIL}`);
  console.error(`   Password: ${TEST_USER_PASSWORD}`);
  console.error(``);
  console.error(`💡 Run with --cleanup to drop all validate_test_* artifacts.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("FATAL:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
