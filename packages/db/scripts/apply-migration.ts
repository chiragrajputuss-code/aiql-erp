/**
 * Applies the document_types_and_pulse migration safely.
 * Uses ADD COLUMN IF NOT EXISTS — safe for AWS RDS, won't drop dynamic GL tables.
 *
 * Run: pnpm --filter @aiql/db tsx scripts/apply-migration.ts
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

async function main() {
  const sql = readFileSync(
    join(__dirname, "../prisma/migrations/20260531000000_document_types_and_pulse/migration.sql"),
    "utf8",
  );

  console.log("Applying migration: document_types_and_pulse …");

  // Split on semicolons but handle PL/pgSQL $$ blocks which contain semicolons
  // Run the whole file as one transaction-like batch via $executeRawUnsafe
  // Prisma doesn't support multi-statement strings, so split on statement boundaries
  const statements = splitStatements(sql);

  let applied = 0;
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed || trimmed.startsWith("--")) continue;
    try {
      await prisma.$executeRawUnsafe(trimmed);
      applied++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Tolerate "already exists" errors from IF NOT EXISTS semantics
      if (
        msg.includes("already exists") ||
        msg.includes("duplicate_object") ||
        msg.includes("duplicate object")
      ) {
        console.log(`  ⚠ Skipped (already applied): ${trimmed.slice(0, 60)}…`);
      } else {
        console.error(`  ✗ Failed: ${trimmed.slice(0, 100)}`);
        console.error(`    Error: ${msg}`);
        throw err;
      }
    }
  }

  console.log(`\n✓ Migration applied — ${applied} statements executed.`);
  console.log("\nNext step: run the backfill script to set detectedType on existing rows:");
  console.log("  pnpm --filter @aiql/db db:backfill-doc-types");
}

/**
 * Split SQL into individual statements, handling PL/pgSQL DO $$ ... $$ blocks.
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollarBlock = false;

  for (const line of sql.split("\n")) {
    if (line.trim().startsWith("DO $$") || line.trim() === "DO $$") {
      inDollarBlock = true;
    }
    current += line + "\n";
    if (inDollarBlock && line.trim() === "END $$;") {
      statements.push(current.trim());
      current = "";
      inDollarBlock = false;
    } else if (!inDollarBlock && line.trim().endsWith(";")) {
      statements.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
