/**
 * One-time backfill: tag all existing uploaded_files rows that pre-date the
 * document-type system as GL (the only type that could have been uploaded
 * before classification was added). Sets detectedType = GL at full confidence
 * so the pulse engine and any scanner that checks detectedType won't see nulls.
 *
 * Safe to re-run (idempotent — only updates rows where detectedType IS NULL).
 *
 * Run with:  pnpm --filter @aiql/db tsx scripts/backfill-document-types.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Count how many rows need updating
  const total = await prisma.uploadedFile.count({
    where: { detectedType: null },
  });

  if (total === 0) {
    console.log("Nothing to backfill — all uploaded_files rows already have detectedType set.");
    return;
  }

  console.log(`Backfilling ${total} rows…`);

  // Update in batches of 100 to avoid long-running transactions
  const BATCH = 100;
  let updated = 0;

  while (updated < total) {
    const rows = await prisma.uploadedFile.findMany({
      where:  { detectedType: null },
      select: { id: true },
      take:   BATCH,
    });

    if (rows.length === 0) break;

    const ids = rows.map((r) => r.id);
    await prisma.uploadedFile.updateMany({
      where: { id: { in: ids } },
      data: {
        detectedType:       "GL",
        detectedConfidence: 1.0,
        // documentType already defaults to GL from the migration column default
        // userConfirmedType stays false — these were uploaded without a confirm step
      },
    });

    updated += rows.length;
    console.log(`  ${updated}/${total} done`);
  }

  console.log(`Backfill complete. ${updated} rows updated.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
