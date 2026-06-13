import { PrismaClient } from "@prisma/client";
import type { EntityLists } from "../types";

const prisma = new PrismaClient();

const VENDOR_GROUPS   = new Set(["sundry creditors", "creditors", "trade payables", "accounts payable"]);
const CUSTOMER_GROUPS = new Set(["sundry debtors", "debtors", "trade receivables", "accounts receivable"]);

/**
 * Extract vendor/customer/employee names from an uploaded data table.
 *
 * Priority order:
 *  1. vendor_name / customer_name columns exist → use them directly
 *  2. account_group column exists → classify by group name
 *  3. party_name column → all are ENTITY (can't distinguish)
 */
export async function getUploadEntityLists(tableName: string): Promise<EntityLists> {
  if (!tableName.startsWith("upload_")) return { vendors: [], customers: [], employees: [] };

  // Discover available columns
  const colRows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
    tableName
  );
  const cols = new Set(colRows.map((r) => r.column_name));

  const vendors:   string[] = [];
  const customers: string[] = [];

  // Strategy 1: explicit vendor_name / customer_name columns
  if (cols.has("vendor_name")) {
    const rows = await prisma.$queryRawUnsafe<Array<{ vendor_name: string }>>(
      `SELECT DISTINCT vendor_name FROM "${tableName}" WHERE vendor_name IS NOT NULL AND vendor_name <> ''`
    );
    vendors.push(...rows.map((r) => r.vendor_name));
  }
  if (cols.has("customer_name")) {
    const rows = await prisma.$queryRawUnsafe<Array<{ customer_name: string }>>(
      `SELECT DISTINCT customer_name FROM "${tableName}" WHERE customer_name IS NOT NULL AND customer_name <> ''`
    );
    customers.push(...rows.map((r) => r.customer_name));
  }

  // Strategy 2: account_group + account_name
  if (vendors.length === 0 && customers.length === 0 && cols.has("account_group") && cols.has("account_name")) {
    const rows = await prisma.$queryRawUnsafe<Array<{ account_name: string; account_group: string }>>(
      `SELECT DISTINCT account_name, account_group FROM "${tableName}" WHERE account_name IS NOT NULL`
    );
    for (const row of rows) {
      const group = (row.account_group ?? "").toLowerCase();
      if (VENDOR_GROUPS.has(group))        vendors.push(row.account_name);
      else if (CUSTOMER_GROUPS.has(group)) customers.push(row.account_name);
    }
  }

  // Strategy 3: party_name as vendor fallback
  if (vendors.length === 0 && customers.length === 0 && cols.has("party_name")) {
    const rows = await prisma.$queryRawUnsafe<Array<{ party_name: string }>>(
      `SELECT DISTINCT party_name FROM "${tableName}" WHERE party_name IS NOT NULL AND party_name <> ''`
    );
    vendors.push(...rows.map((r) => r.party_name));
  }

  return { vendors: Array.from(new Set(vendors)), customers: Array.from(new Set(customers)), employees: [] };
}
