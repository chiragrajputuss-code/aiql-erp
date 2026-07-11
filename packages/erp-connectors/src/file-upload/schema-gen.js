import { CANONICAL_SCHEMA } from "./canonical-schema";
/** Build a RawSchemaData from the confirmed column mapping for schema-intel to process. */
export function buildUploadSchema(tableName, mappings, rowCount) {
    const activeCols = mappings.filter((m) => !m.dropped && m.canonicalName);
    const table = {
        name: tableName,
        displayName: "Uploaded Data",
        category: "ledger",
        columns: activeCols.map((m) => {
            const def = CANONICAL_SCHEMA[m.canonicalName];
            return {
                name: m.canonicalName,
                dataType: def?.pgType === "numeric" ? "currency"
                    : def?.pgType === "date" ? "date"
                        : "string",
                nullable: true,
                isPrimaryKey: false,
                isForeignKey: false,
            };
        }),
        sampleData: [],
    };
    return {
        erpType: "FILE_UPLOAD",
        tables: [table],
        relationships: [],
        metadata: { rowCount, tableName, currency: "INR" },
    };
}
