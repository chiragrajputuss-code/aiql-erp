import { describe, it, expect, vi, beforeEach } from "vitest";

// The executor constructs its own PrismaClient at module load. Mock the whole
// client so these tests exercise the guard logic without touching a database.
// vi.hoisted keeps the spies available inside the hoisted vi.mock factory.
const { queryRawUnsafe, executeRawUnsafe, $transaction } = vi.hoisted(() => ({
  queryRawUnsafe:   vi.fn(),
  executeRawUnsafe: vi.fn(),
  $transaction:     vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    $queryRawUnsafe = queryRawUnsafe;
    $executeRawUnsafe = executeRawUnsafe;
    $transaction = $transaction;
  },
}));

import { executeUploadQuery, QUERY_MAX_ROWS } from "../file-upload/file-executor";

const MY_TABLE = "upload_org1_conn1";

beforeEach(() => {
  vi.clearAllMocks();
  // $transaction([setTimeout, query]) → [timeoutResult, rows]
  $transaction.mockImplementation(async () => [0, [{ total: 42 }]]);
});

describe("executeUploadQuery — tenant isolation", () => {
  it("allows a query against its own upload table", async () => {
    const r = await executeUploadQuery(MY_TABLE, `SELECT count(*) AS total FROM "${MY_TABLE}"`);
    expect(r.rowCount).toBe(1);
    expect($transaction).toHaveBeenCalled();
  });

  it("allows the {{table}} placeholder form", async () => {
    const r = await executeUploadQuery(MY_TABLE, "SELECT count(*) AS total FROM {{table}}");
    expect(r.rowCount).toBe(1);
  });

  it("BLOCKS a query that reads another organisation's upload table", async () => {
    await expect(
      executeUploadQuery(MY_TABLE, `SELECT * FROM "upload_org2_conn9"`),
    ).rejects.toThrow(/not allowed to read/i);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("BLOCKS a cross-tenant JOIN even when its own table is also referenced", async () => {
    await expect(
      executeUploadQuery(
        MY_TABLE,
        `SELECT a.* FROM "${MY_TABLE}" a JOIN "upload_org2_conn9" b ON a.id = b.id`,
      ),
    ).rejects.toThrow(/not allowed to read/i);
  });

  it("BLOCKS reading application tables (users, organisations)", async () => {
    await expect(
      executeUploadQuery(MY_TABLE, `SELECT email FROM users`),
    ).rejects.toThrow(/not allowed to read/i);
    await expect(
      executeUploadQuery(MY_TABLE, `SELECT * FROM "Session"`),
    ).rejects.toThrow(/not allowed to read/i);
  });

  it("allows CTEs the query itself declared", async () => {
    const sql = `WITH totals AS (SELECT party_name, SUM(net_amount) s FROM "${MY_TABLE}" GROUP BY 1)
                 SELECT * FROM totals ORDER BY s DESC`;
    const r = await executeUploadQuery(MY_TABLE, sql);
    expect(r.rowCount).toBe(1);
  });

  it("allows subqueries over its own table", async () => {
    const sql = `SELECT * FROM (SELECT party_name FROM "${MY_TABLE}") x`;
    const r = await executeUploadQuery(MY_TABLE, sql);
    expect(r.rowCount).toBe(1);
  });

  it("still blocks write operations", async () => {
    await expect(
      executeUploadQuery(MY_TABLE, `DELETE FROM "${MY_TABLE}"`),
    ).rejects.toThrow(/Write operations/i);
  });

  it("rejects a table name that is not an upload table", async () => {
    await expect(executeUploadQuery("users", "SELECT 1")).rejects.toThrow(/invalid table name/i);
  });
});

describe("executeUploadQuery — resource caps", () => {
  it("sets a statement timeout on the transaction", async () => {
    await executeUploadQuery(MY_TABLE, `SELECT 1 FROM "${MY_TABLE}"`);
    expect(executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining("statement_timeout"));
  });

  it("caps returned rows", async () => {
    const many = Array.from({ length: QUERY_MAX_ROWS + 250 }, (_, i) => ({ i }));
    $transaction.mockImplementation(async () => [0, many]);
    const r = await executeUploadQuery(MY_TABLE, `SELECT i FROM "${MY_TABLE}"`);
    expect(r.rowCount).toBe(QUERY_MAX_ROWS);
  });
});
