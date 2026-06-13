import type { RawSchemaData, RawTable } from "../types";
import { CANONICAL_SCHEMA } from "./canonical-schema";
import type { ResolvedMapping } from "./redundancy-resolver";

/** Build a RawSchemaData from the confirmed column mapping for schema-intel to process. */
export function buildUploadSchema(
  tableName: string,
  mappings:  ResolvedMapping[],
  rowCount:  number
): RawSchemaData {
  const activeCols = mappings.filter((m) => !m.dropped && m.canonicalName);

  const table: RawTable = {
    name:        tableName,
    displayName: "Uploaded Data",
    category:    "ledger",
    columns: activeCols.map((m) => {
      const def = CANONICAL_SCHEMA[m.canonicalName!];
      return {
        name:        m.canonicalName as string,
        dataType:    def?.pgType === "numeric" ? "currency"
                   : def?.pgType === "date"    ? "date"
                   : "string",
        nullable:    true,
        isPrimaryKey: false,
        isForeignKey: false,
      };
    }),
    sampleData: [],
  };

  return {
    erpType:       "FILE_UPLOAD" as never,
    tables:        [table],
    relationships: [],
    metadata:      { rowCount, tableName, currency: "INR" },
  };
}
