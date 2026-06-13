#!/usr/bin/env tsx
/**
 * AIQL Test Data Generator
 *
 * Generates 10 synthetic Indian SME GL CSV files with deliberately
 * seeded data quality issues. Used to test the close engine end-to-end.
 *
 * Usage:
 *   pnpm tsx tools/test-data-generator/index.ts                  # default: ./test-data/companies/
 *   pnpm tsx tools/test-data-generator/index.ts --out /tmp/x     # custom output dir
 *   pnpm tsx tools/test-data-generator/index.ts --seed 99        # different seed
 *   pnpm tsx tools/test-data-generator/index.ts --random         # different output every run
 *   pnpm tsx tools/test-data-generator/index.ts --only steelco   # generate one company
 */

import * as path from "path";
import { COMPANIES } from "./companies";
import { generateTransactions } from "./generator";
import { writeCSV, writeREADME, ensureDir, joinPath } from "./output";

// ─── Parse CLI args ──────────────────────────────────────────────────────────

interface Args {
  outDir: string;
  seed:   number;
  only?:  string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let outDir = "./test-data/companies";
  let seed   = 42;
  let only:   string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--out" && args[i + 1])  { outDir = args[++i]!; continue; }
    if (arg === "--seed" && args[i + 1]) { seed   = parseInt(args[++i]!, 10); continue; }
    if (arg === "--random")              { seed   = Date.now() & 0x7FFFFFFF; continue; }
    if (arg === "--only" && args[i + 1]) { only   = args[++i]!; continue; }
    if (arg === "--help" || arg === "-h") {
      console.log(`
AIQL Test Data Generator

Generates 10 synthetic Indian SME GL CSV files for testing the close engine.

Usage:
  pnpm tsx tools/test-data-generator/index.ts [options]

Options:
  --out <dir>      Output directory (default: ./test-data/companies)
  --seed <n>       Random seed for reproducibility (default: 42)
  --random         Use random seed (different output every run)
  --only <id>      Generate only one company by ID (e.g. steelco)
  --help, -h       Show this help

Companies (10 total):
${COMPANIES.map((c) => `  ${c.id.padEnd(20)} ${c.name} (${c.industry}, ${c.gstRegime})`).join("\n")}
      `);
      process.exit(0);
    }
  }

  return { outDir, seed, only };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const { outDir, seed, only } = parseArgs();

  const targets = only
    ? COMPANIES.filter((c) => c.id === only)
    : COMPANIES;

  if (targets.length === 0) {
    console.error(`No company matching "${only}". Available: ${COMPANIES.map((c) => c.id).join(", ")}`);
    process.exit(1);
  }

  const absOut = path.resolve(outDir);
  ensureDir(absOut);

  console.log(`\nAIQL Test Data Generator`);
  console.log(`────────────────────────`);
  console.log(`Output:     ${absOut}`);
  console.log(`Seed:       ${seed}`);
  console.log(`Companies:  ${targets.length}\n`);

  const startTime = Date.now();
  const summary: { id: string; rows: number; issues: number; csvSize: string }[] = [];

  for (const [i, company] of targets.entries()) {
    const t0 = Date.now();
    const companySeed = seed + i * 1000; // different seed per company for varied data

    process.stdout.write(`[${(i + 1).toString().padStart(2)}/${targets.length}] ${company.id.padEnd(20)} `);

    // Generate transactions
    const { transactions, seededIssues } = generateTransactions(company, companySeed);

    // Write CSV
    const csvPath = joinPath(absOut, `${company.id}.csv`);
    writeCSV(csvPath, company, transactions);

    // Write README
    const readmePath = joinPath(absOut, `${company.id}.README.md`);
    writeREADME(readmePath, company, transactions, seededIssues);

    const csvSizeKb = (require("fs").statSync(csvPath).size / 1024).toFixed(1);
    const dt = Date.now() - t0;

    console.log(`${transactions.length.toString().padStart(5)} rows · ${seededIssues.length.toString().padStart(3)} issues · ${csvSizeKb}KB · ${dt}ms`);
    summary.push({ id: company.id, rows: transactions.length, issues: seededIssues.length, csvSize: `${csvSizeKb}KB` });
  }

  const totalRows  = summary.reduce((s, x) => s + x.rows, 0);
  const totalIssues = summary.reduce((s, x) => s + x.issues, 0);
  const totalTime  = Date.now() - startTime;

  console.log(`\n────────────────────────`);
  console.log(`Total: ${totalRows.toLocaleString()} rows, ${totalIssues} seeded issues, ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`\nNext steps:`);
  console.log(`  1. Upload any CSV via /connections/new (file upload)`);
  console.log(`  2. Confirm column mappings (most should auto-detect)`);
  console.log(`  3. Visit /connections/<id>/account-mapping to confirm account types`);
  console.log(`  4. Visit /connections/<id>/scan to verify scanner finds the seeded issues`);
  console.log(`  5. Create a close period in /close to test the full workflow\n`);
}

main();
