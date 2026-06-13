#!/usr/bin/env tsx
/**
 * AIQL Smoke Test
 *
 * Runs each test CSV through the entire close-engine pipeline and logs every
 * error or unexpected behavior. Goal: find real bugs in 30 minutes that test
 * suites would take days to discover.
 *
 * Pipeline tested per company:
 *   1. Read CSV
 *   2. Parse + map columns
 *   3. Create upload table (real DB)
 *   4. Create ErpConnection record
 *   5. Build schema cache (account classification)
 *   6. Run data quality scan
 *   7. Create adaptive close period
 *   8. Run all reconciliations
 *   9. Run flux analysis
 *   10. Run P&L review
 *   11. Compute readiness score
 *   12. Cleanup
 *
 * Usage:
 *   pnpm tsx tools/smoke-test/index.ts                  # all 10 companies
 *   pnpm tsx tools/smoke-test/index.ts --only steelco   # one company
 *   pnpm tsx tools/smoke-test/index.ts --keep-data      # don't cleanup
 */

import * as fs from "fs";
import * as path from "path";
import { prisma } from "@aiql/db";
import { parseCsv, mapColumn, resolveRedundancy, createTempTable } from "@aiql/erp-connectors";
import { classifyByName } from "@aiql/schema-intel";
import {
  runDataQualityScan,
  runFluxAnalysis,
  computeReadinessScore,
  generateAdaptiveTemplate,
  createClosePeriodFromTemplate,
  runReconciliation,
  startPlReview,
} from "@aiql/close-engine";

// ─── CLI args ────────────────────────────────────────────────────────────────

interface Args { only?: string; keepData: boolean; }
function parseArgs(): Args {
  const args = process.argv.slice(2);
  let only: string | undefined;
  let keepData = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--only" && args[i + 1]) { only = args[++i]!; continue; }
    if (args[i] === "--keep-data") { keepData = true; continue; }
  }
  return { only, keepData };
}

// ─── Logging ─────────────────────────────────────────────────────────────────

interface StepResult {
  step:     string;
  status:   "pass" | "fail" | "warn";
  durationMs: number;
  detail?:  string;
  error?:   string;
}

interface CompanyReport {
  company:    string;
  totalSteps: number;
  passed:     number;
  failed:     number;
  warned:     number;
  steps:      StepResult[];
}

const allReports: CompanyReport[] = [];

async function timeStep<T>(label: string, fn: () => Promise<T>): Promise<{ ok: true; value: T; ms: number } | { ok: false; error: string; ms: number }> {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { ok: true, value, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: (e as Error).message, ms: Date.now() - t0 };
  }
}

const log = {
  step:    (msg: string) => process.stdout.write(`  → ${msg.padEnd(60)} `),
  pass:    (ms: number, detail?: string) => console.log(`✓ ${ms}ms${detail ? ` (${detail})` : ""}`),
  fail:    (ms: number, err: string) => console.log(`✗ ${ms}ms\n      ERROR: ${err}`),
  warn:    (ms: number, msg: string) => console.log(`⚠ ${ms}ms — ${msg}`),
  section: (msg: string) => console.log(`\n━━━ ${msg} ━━━`),
};

// ─── Main per-company runner ─────────────────────────────────────────────────

async function runCompany(csvPath: string, keepData: boolean): Promise<CompanyReport> {
  const id = path.basename(csvPath).replace(".csv", "");
  log.section(`${id}`);

  const report: CompanyReport = { company: id, totalSteps: 0, passed: 0, failed: 0, warned: 0, steps: [] };
  const recordStep = (step: string, status: "pass" | "fail" | "warn", durationMs: number, detail?: string, error?: string) => {
    report.steps.push({ step, status, durationMs, detail, error });
    report.totalSteps++;
    if (status === "pass") report.passed++;
    if (status === "fail") report.failed++;
    if (status === "warn") report.warned++;
  };

  let orgId: string | null = null;
  let connectionId: string | null = null;
  let tableName: string | null = null;
  let periodId: string | null = null;

  try {
    // ── Setup: create test org + user ─────────────────────────────────────
    log.step("setup test org");
    const setupRes = await timeStep("setup", async () => {
      const org = await prisma.organisation.create({
        data: {
          name:           `SmokeTest-${id}-${Date.now()}`,
          slug:           `smoke-${id}-${Date.now()}`,
          queriesResetAt: new Date(Date.now() + 30 * 86_400_000),
        },
      });
      return org.id;
    });
    if (!setupRes.ok) { log.fail(setupRes.ms, setupRes.error); recordStep("setup", "fail", setupRes.ms, undefined, setupRes.error); return report; }
    orgId = setupRes.value;
    log.pass(setupRes.ms);
    recordStep("setup", "pass", setupRes.ms);

    // ── 1. Read CSV ────────────────────────────────────────────────────────
    log.step("1. read CSV");
    const readRes = await timeStep("read", async () => {
      const buffer = fs.readFileSync(csvPath);
      return parseCsv(buffer);
    });
    if (!readRes.ok) { log.fail(readRes.ms, readRes.error); recordStep("readCsv", "fail", readRes.ms, undefined, readRes.error); return report; }
    log.pass(readRes.ms, `${readRes.value.rows.length} rows, ${readRes.value.headers.length} cols`);
    recordStep("readCsv", "pass", readRes.ms, `${readRes.value.rows.length} rows`);

    // ── 2. Map columns ─────────────────────────────────────────────────────
    log.step("2. map columns");
    const mapRes = await timeStep("map", async () => {
      const mappings = readRes.value.headers.map((col) => {
        const sampleValues = readRes.value.rows.slice(0, 50).map((r) => r[col]);
        return mapColumn(col, sampleValues);
      });
      return resolveRedundancy(mappings);
    });
    if (!mapRes.ok) { log.fail(mapRes.ms, mapRes.error); recordStep("mapColumns", "fail", mapRes.ms, undefined, mapRes.error); return report; }
    const activeMappings = mapRes.value.filter((m) => !m.dropped && m.canonicalName);
    log.pass(mapRes.ms, `${activeMappings.length}/${mapRes.value.length} mapped`);
    recordStep("mapColumns", "pass", mapRes.ms, `${activeMappings.length} active`);

    // ── 3. Create upload table ─────────────────────────────────────────────
    log.step("3. create upload table");
    const tableRes = await timeStep("createTable", async () => {
      const fileId = `smoketest_${Date.now()}`;
      const tn = await createTempTable(orgId!, fileId, mapRes.value, readRes.value.rows);
      return { tableName: tn, fileId };
    });
    if (!tableRes.ok) { log.fail(tableRes.ms, tableRes.error); recordStep("createTable", "fail", tableRes.ms, undefined, tableRes.error); return report; }
    tableName = tableRes.value.tableName;
    log.pass(tableRes.ms, tableName);
    recordStep("createTable", "pass", tableRes.ms, tableName);

    // ── 4. Create ErpConnection ────────────────────────────────────────────
    log.step("4. create connection record");
    const connRes = await timeStep("createConnection", async () => {
      const accountTypeMap: Record<string, string> = {};
      const sampleAccounts = await prisma.$queryRawUnsafe<{ account_name: string }[]>(
        `SELECT DISTINCT account_name FROM "${tableName}" WHERE account_name IS NOT NULL LIMIT 200`
      );
      for (const r of sampleAccounts) {
        accountTypeMap[r.account_name] = classifyByName(r.account_name);
      }

      const conn = await prisma.erpConnection.create({
        data: {
          orgId:          orgId!,
          erpType:        "FILE_UPLOAD" as never,
          displayName:    id,
          status:         "ACTIVE",
          credentialsArn: "",
          schemaCacheJson: JSON.stringify({
            erpType:        "FILE_UPLOAD",
            tables:         [{ name: tableName, columns: activeMappings.map((m) => ({ name: m.canonicalName, type: "text" })) }],
            accountTypeMap,
          }),
          schemaCachedAt: new Date(),
          uploadedFile: {
            create: {
              originalName:  `${id}.csv`,
              mimeType:      "text/csv",
              sizeBytes:     fs.statSync(csvPath).size,
              rowCount:      readRes.value.rows.length,
              tableName:     tableName!,
              columnMapping: JSON.stringify(activeMappings.map((m) => ({
                sourceColumnName: m.originalName,
                canonicalField:   m.canonicalName,
              }))),
              expiresAt: new Date(Date.now() + 30 * 86_400_000),
            },
          },
        },
      });
      return { conn, classifiedCount: Object.values(accountTypeMap).filter((t) => t !== "UNKNOWN").length, totalAccounts: sampleAccounts.length };
    });
    if (!connRes.ok) { log.fail(connRes.ms, connRes.error); recordStep("createConnection", "fail", connRes.ms, undefined, connRes.error); return report; }
    connectionId = connRes.value.conn.id;
    const classifiedPct = Math.round(connRes.value.classifiedCount / connRes.value.totalAccounts * 100);
    log.pass(connRes.ms, `${connRes.value.classifiedCount}/${connRes.value.totalAccounts} accounts classified (${classifiedPct}%)`);
    recordStep("createConnection", classifiedPct < 80 ? "warn" : "pass", connRes.ms, `${classifiedPct}% accounts classified`);

    // ── 5. Determine period from data ──────────────────────────────────────
    log.step("5. detect period from data");
    const periodRes = await timeStep("detectPeriod", async () => {
      const range = await prisma.$queryRawUnsafe<{ min_d: Date; max_d: Date }[]>(
        `SELECT MIN(transaction_date) AS min_d, MAX(transaction_date) AS max_d FROM "${tableName}"`
      );
      if (!range[0] || !range[0].min_d) throw new Error("No transaction_date column or empty data");
      return { startDate: new Date(range[0].min_d), endDate: new Date(range[0].max_d) };
    });
    if (!periodRes.ok) { log.fail(periodRes.ms, periodRes.error); recordStep("detectPeriod", "fail", periodRes.ms, undefined, periodRes.error); return report; }
    const startDate = periodRes.value.startDate;
    const endDate = periodRes.value.endDate;
    log.pass(periodRes.ms, `${startDate.toISOString().slice(0,10)} → ${endDate.toISOString().slice(0,10)}`);
    recordStep("detectPeriod", "pass", periodRes.ms);

    // ── 6. Run data quality scan ───────────────────────────────────────────
    log.step("6. run data quality scan");
    const scanRes = await timeStep("scan", () => runDataQualityScan(connectionId!, startDate, endDate));
    if (!scanRes.ok) { log.fail(scanRes.ms, scanRes.error); recordStep("scan", "fail", scanRes.ms, undefined, scanRes.error); }
    else {
      const r = scanRes.value;
      log.pass(scanRes.ms, `${r.totalIssues} issues found`);
      recordStep("scan", "pass", scanRes.ms, `${r.totalIssues} issues, ${r.bySeverity.critical} critical`);
    }

    // ── 7. Create adaptive close period ────────────────────────────────────
    log.step("7. create close period (adaptive)");
    const periodCreateRes = await timeStep("createPeriod", async () => {
      const adaptive = await generateAdaptiveTemplate(connectionId!, startDate, endDate);
      const period = await createClosePeriodFromTemplate(
        orgId!, connectionId!, [connectionId!],
        `Smoke ${id}`, startDate, endDate,
        adaptive.template, undefined, tableName!,
        JSON.stringify(adaptive.scanResult)
      );
      return { periodId: period.id, taskCount: period.tasks.length, reasoning: adaptive.reasoning };
    });
    if (!periodCreateRes.ok) { log.fail(periodCreateRes.ms, periodCreateRes.error); recordStep("createPeriod", "fail", periodCreateRes.ms, undefined, periodCreateRes.error); return report; }
    periodId = periodCreateRes.value.periodId;
    log.pass(periodCreateRes.ms, `${periodCreateRes.value.taskCount} tasks generated`);
    recordStep("createPeriod", "pass", periodCreateRes.ms, `${periodCreateRes.value.taskCount} tasks`);

    // ── 8. Run all reconciliations ─────────────────────────────────────────
    log.step("8. run all reconciliations");
    const reconRes = await timeStep("reconcile", async () => {
      const tasks = await prisma.closeTask.findMany({
        where:   { periodId: periodId! },
        include: { reconciliations: true },
      });
      const allRecons = tasks.flatMap((t) => t.reconciliations);
      const results = { passed: 0, failed: 0, errored: 0 };
      const errors: string[] = [];
      for (const recon of allRecons) {
        try {
          const result = await runReconciliation(recon.id);
          if (result.status === "PASSED") results.passed++;
          else if (result.status === "FAILED") results.failed++;
        } catch (e) {
          results.errored++;
          errors.push(`${recon.name}: ${(e as Error).message}`);
        }
      }
      return { results, errors };
    });
    if (!reconRes.ok) { log.fail(reconRes.ms, reconRes.error); recordStep("reconcile", "fail", reconRes.ms, undefined, reconRes.error); }
    else {
      const r = reconRes.value.results;
      const status = r.errored > 0 ? "warn" : "pass";
      const detail = `${r.passed} passed, ${r.failed} failed, ${r.errored} errored`;
      if (r.errored > 0) log.warn(reconRes.ms, detail);
      else                log.pass(reconRes.ms, detail);
      recordStep("reconcile", status, reconRes.ms, detail, reconRes.value.errors.join("; "));
    }

    // ── 9. Run flux analysis ───────────────────────────────────────────────
    log.step("9. run flux analysis");
    const fluxRes = await timeStep("flux", () => runFluxAnalysis(connectionId!, startDate, endDate, { withAI: false }));
    if (!fluxRes.ok) { log.fail(fluxRes.ms, fluxRes.error); recordStep("flux", "fail", fluxRes.ms, undefined, fluxRes.error); }
    else {
      log.pass(fluxRes.ms, `${fluxRes.value.totalAccounts} accounts, ${fluxRes.value.materialCount} material`);
      recordStep("flux", "pass", fluxRes.ms, `${fluxRes.value.materialCount} material variances`);
    }

    // ── 10. Run P&L review ─────────────────────────────────────────────────
    log.step("10. run P&L review");
    const plRes = await timeStep("plReview", async () => {
      const tasks = await prisma.closeTask.findMany({ where: { periodId: periodId!, title: { contains: "P&L" } } });
      const plTask = tasks[0];
      return startPlReview({
        orgId:        orgId!,
        connectionId: connectionId!,
        startDate,
        endDate,
        taskId:       plTask?.id,
      });
    });
    if (!plRes.ok) { log.fail(plRes.ms, plRes.error); recordStep("plReview", "fail", plRes.ms, undefined, plRes.error); }
    else {
      const detail = `${plRes.value.report?.investigations.length ?? 0} investigations, ${plRes.value.questions?.length ?? 0} questions`;
      log.pass(plRes.ms, detail);
      recordStep("plReview", "pass", plRes.ms, detail);
    }

    // ── 11. Compute readiness score ────────────────────────────────────────
    log.step("11. compute readiness score");
    const readyRes = await timeStep("readiness", () => computeReadinessScore(periodId!));
    if (!readyRes.ok) { log.fail(readyRes.ms, readyRes.error); recordStep("readiness", "fail", readyRes.ms, undefined, readyRes.error); }
    else {
      log.pass(readyRes.ms, `score=${readyRes.value.score}/100, status=${readyRes.value.status}`);
      recordStep("readiness", "pass", readyRes.ms, `${readyRes.value.score}/100 ${readyRes.value.status}`);
    }
  } finally {
    // ── Cleanup ────────────────────────────────────────────────────────────
    if (!keepData) {
      try {
        if (tableName) await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tableName}"`);
        if (orgId)     await prisma.organisation.delete({ where: { id: orgId } });
      } catch (e) {
        console.log(`    cleanup error: ${(e as Error).message}`);
      }
    } else {
      console.log(`    [data kept] orgId=${orgId} connectionId=${connectionId} table=${tableName}`);
    }
  }

  return report;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { only, keepData } = parseArgs();
  const dataDir = path.resolve("./test-data/companies");

  if (!fs.existsSync(dataDir)) {
    console.error(`Data directory ${dataDir} does not exist. Run 'pnpm gen:test-data' first.`);
    process.exit(1);
  }

  const csvFiles = fs.readdirSync(dataDir)
    .filter((f) => f.endsWith(".csv"))
    .filter((f) => !only || f.startsWith(only))
    .map((f) => path.join(dataDir, f));

  console.log(`\nAIQL Smoke Test — ${csvFiles.length} compan${csvFiles.length === 1 ? "y" : "ies"}\n`);
  console.log(`Each company runs through 11 pipeline steps.`);
  console.log(`Goal: surface real bugs in 30 minutes.\n`);

  const startTime = Date.now();

  for (const csvPath of csvFiles) {
    const report = await runCompany(csvPath, keepData);
    allReports.push(report);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(70)}`);
  console.log(`SMOKE TEST SUMMARY (${totalTime}s)`);
  console.log(`${"═".repeat(70)}\n`);

  console.log(`${"Company".padEnd(22)} ${"Pass".padStart(5)} ${"Fail".padStart(5)} ${"Warn".padStart(5)}`);
  console.log("─".repeat(40));
  let totalPass = 0, totalFail = 0, totalWarn = 0;
  for (const r of allReports) {
    console.log(`${r.company.padEnd(22)} ${String(r.passed).padStart(5)} ${String(r.failed).padStart(5)} ${String(r.warned).padStart(5)}`);
    totalPass += r.passed;
    totalFail += r.failed;
    totalWarn += r.warned;
  }
  console.log("─".repeat(40));
  console.log(`${"TOTAL".padEnd(22)} ${String(totalPass).padStart(5)} ${String(totalFail).padStart(5)} ${String(totalWarn).padStart(5)}`);

  // Failures + warnings
  console.log(`\n${"═".repeat(70)}\nISSUES FOUND\n${"═".repeat(70)}\n`);
  let issueCount = 0;
  for (const r of allReports) {
    const issues = r.steps.filter((s) => s.status !== "pass");
    if (issues.length === 0) continue;
    console.log(`\n${r.company}:`);
    for (const s of issues) {
      const icon = s.status === "fail" ? "✗" : "⚠";
      console.log(`  ${icon} ${s.step.padEnd(20)} ${s.detail ?? ""}`);
      if (s.error) console.log(`      ${s.error.slice(0, 200)}`);
      issueCount++;
    }
  }

  if (issueCount === 0) {
    console.log(`No issues found. All ${totalPass} steps passed across ${allReports.length} companies.`);
  } else {
    console.log(`\n${issueCount} issues across ${allReports.length} companies.\n`);
  }

  await prisma.$disconnect();
  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
