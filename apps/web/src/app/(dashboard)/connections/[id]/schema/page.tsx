import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Table2, Key, Link2 } from "lucide-react";

interface SchemaColumn { name: string; dataType: string; nullable: boolean; isPrimaryKey?: boolean; isForeignKey?: boolean }
interface SchemaTable  { name: string; displayName: string; columns: SchemaColumn[]; category?: string }
interface CachedSchema { erpType: string; tables: SchemaTable[]; metadata: Record<string, unknown> }

const DATA_TYPE_COLORS: Record<string, string> = {
  string:   "bg-blue-50 text-blue-700",
  numeric:  "bg-green-50 text-green-700",
  currency: "bg-emerald-50 text-emerald-700",
  date:     "bg-purple-50 text-purple-700",
  boolean:  "bg-slate-100 text-slate-600",
};

export default async function ConnectionSchemaPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const connection = await prisma.erpConnection.findFirst({
    where: { id: params.id, orgId: user.orgId },
  });
  if (!connection) notFound();

  let schema: CachedSchema | null = null;
  if (connection.schemaCacheJson) {
    try {
      const raw = JSON.parse(connection.schemaCacheJson);
      if (!raw._pending) schema = raw as CachedSchema;
    } catch {}
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link href={`/connections/${connection.id}`}><ArrowLeft className="h-4 w-4" />{connection.displayName}</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Schema</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{connection.erpType} · {connection.displayName}</p>
      </div>

      {!schema ? (
        <Card className="border-dashed border-2">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Table2 className="h-8 w-8 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">No schema cached yet</p>
            <p className="text-sm mt-1">Test the connection to introspect the schema</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Metadata */}
          {schema.metadata && Object.keys(schema.metadata).length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(schema.metadata)
                .filter(([k]) => !["tableName", "rowCount"].includes(k))
                .map(([k, v]) => (
                  <Badge key={k} variant="secondary" className="text-xs">{k}: {String(v)}</Badge>
                ))}
            </div>
          )}

          {/* Tables */}
          {schema.tables.map((table) => (
            <Card key={table.name} className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-slate-400" />
                  {table.displayName}
                  <Badge variant="secondary" className="text-xs font-mono">{table.name}</Badge>
                  {table.category && (
                    <Badge className="bg-slate-100 text-slate-600 text-xs">{table.category}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Column</th>
                        <th className="px-3 py-2 text-left font-medium">Type</th>
                        <th className="px-3 py-2 text-left font-medium">Flags</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {table.columns.map((col) => (
                        <tr key={col.name} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono">{col.name}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${DATA_TYPE_COLORS[col.dataType] ?? "bg-slate-100 text-slate-600"}`}>
                              {col.dataType}
                            </span>
                          </td>
                          <td className="px-3 py-2 flex gap-1">
                            {col.isPrimaryKey && <span title="Primary key"><Key className="h-3 w-3 text-yellow-500" /></span>}
                            {col.isForeignKey && <span title="Foreign key"><Link2 className="h-3 w-3 text-blue-400" /></span>}
                            {col.nullable && <span className="text-muted-foreground text-xs">null</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
