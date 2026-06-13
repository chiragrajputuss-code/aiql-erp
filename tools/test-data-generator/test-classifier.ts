#!/usr/bin/env tsx
/**
 * Verifies the name-based classifier against all 10 generated companies.
 * Reports per-company classification coverage.
 */

import { classifyByName } from "../../packages/schema-intel/src/account-classifier";
import { COMPANIES, buildChartOfAccounts } from "./companies";

console.log("Account Classification Coverage Test");
console.log("=====================================\n");

let totalAccounts = 0;
let totalClassified = 0;

for (const company of COMPANIES) {
  const accounts = buildChartOfAccounts(company);
  const accountNames = accounts.map((a) => a.name);
  const distinctNames = Array.from(new Set(accountNames));

  let classified = 0;
  const unclassifiedSamples: string[] = [];
  const byType: Record<string, number> = {};

  for (const name of distinctNames) {
    const type = classifyByName(name);
    if (type !== "UNKNOWN") {
      classified++;
      byType[type] = (byType[type] ?? 0) + 1;
    } else {
      unclassifiedSamples.push(name);
    }
  }

  const pct = (classified / distinctNames.length * 100).toFixed(0);
  const bar = "█".repeat(Math.round(parseInt(pct) / 5)).padEnd(20, "░");

  console.log(`${company.id.padEnd(20)} ${bar} ${pct}%  (${classified}/${distinctNames.length})`);
  if (unclassifiedSamples.length > 0) {
    console.log(`  Unclassified: ${unclassifiedSamples.join(", ")}`);
  }
  console.log();

  totalAccounts += distinctNames.length;
  totalClassified += classified;
}

const overallPct = (totalClassified / totalAccounts * 100).toFixed(1);
console.log(`─────────────────────────────────────`);
console.log(`OVERALL COVERAGE: ${overallPct}% (${totalClassified} / ${totalAccounts})`);
