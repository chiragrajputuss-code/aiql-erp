import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FileSpreadsheet, RefreshCw, AlertCircle, ArrowLeft, Calendar, MessageCircle, Bell, TrendingUp } from "lucide-react";
import { DeleteConnectionDialog } from "@/components/connections/delete-connection-dialog";

export default async function ConnectionDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const connection = await prisma.erpConnection.findFirst({
    where: { id: params.id, orgId: user.orgId },
    include: { uploadedFile: true },
  });
  if (!connection) notFound();

  const isFile  = connection.erpType === "FILE_UPLOAD";
  const schema  = connection.schemaCacheJson ? (() => {
    try { return JSON.parse(connection.schemaCacheJson) as { tables?: Array<{ columns: unknown[] }> }; }
    catch { return null; }
  })() : null;

  const columnCount = schema?.tables?.[0]?.columns?.length ?? 0;

  const daysUntilExpiry = connection.uploadedFile
    ? Math.ceil((new Date(connection.uploadedFile.expiresAt).getTime() - Date.now()) / 86400000)
    : null;

  // Query the actual GL date range from the uploaded table so users can see
  // what period their data covers before creating a close period.
  let glMinDate: string | null = null;
  let glMaxDate: string | null = null;
  if (connection.uploadedFile?.tableName) {
    try {
      const dateRows = await prisma.$queryRawUnsafe<{ min_d: Date | null; max_d: Date | null }[]>(
        `SELECT MIN(transaction_date) AS min_d, MAX(transaction_date) AS max_d FROM "${connection.uploadedFile.tableName}"`,
      );
      glMinDate = dateRows[0]?.min_d ? new Date(dateRows[0].min_d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
      glMaxDate = dateRows[0]?.max_d ? new Date(dateRows[0].max_d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
    } catch { /* best-effort — table may not exist yet */ }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link href="/connections"><ArrowLeft className="h-4 w-4" />Connections</Link>
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{connection.displayName}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{connection.erpType.replace("_", " ")}</p>
        </div>
        <Badge className={
          connection.status === "ACTIVE"  ? "bg-green-100 text-green-700 border border-green-200" :
          connection.status === "PENDING" ? "bg-yellow-100 text-yellow-700 border border-yellow-200" :
          "bg-red-100 text-red-700 border border-red-200"
        }>{connection.status}</Badge>
      </div>

      {/* File upload details */}
      {isFile && connection.uploadedFile && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-blue-600" />
              File Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* GL period — shown first and prominently */}
            {glMinDate && glMaxDate && (
              <div className="flex items-center gap-2 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2.5">
                <Calendar className="h-4 w-4 text-indigo-500 shrink-0" />
                <div>
                  <p className="text-[11px] text-indigo-500 font-semibold uppercase tracking-wider">GL Period</p>
                  <p className="text-sm font-semibold text-indigo-900">{glMinDate} — {glMaxDate}</p>
                  <p className="text-[11px] text-indigo-500 mt-0.5">Use these dates when creating a close period</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">File</p>
                <p className="font-medium">{connection.uploadedFile.originalName}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Rows loaded</p>
                <p className="font-medium">{connection.uploadedFile.rowCount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Canonical columns</p>
                <p className="font-medium">{columnCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Size</p>
                <p className="font-medium">{(connection.uploadedFile.sizeBytes / 1024).toFixed(1)} KB</p>
              </div>
            </div>

            {daysUntilExpiry !== null && (
              <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
                daysUntilExpiry < 14 ? "bg-yellow-50 text-yellow-700" : "bg-slate-50 text-slate-600"
              }`}>
                {daysUntilExpiry < 14 && <AlertCircle className="h-4 w-4 shrink-0" />}
                <span>Data expires in <strong>{daysUntilExpiry} days</strong> — re-upload to extend for 90 more days</span>
              </div>
            )}

            <Separator />
            <div className="flex gap-3 flex-wrap">
              {/* Chat button — only for GL document type */}
              {(connection.uploadedFile?.documentType ?? "GL") === "GL" && (
                <Button asChild size="sm" className="gap-2 bg-[#1B3A5C] hover:bg-[#1B3A5C]/90">
                  <Link href={`/connections/${connection.id}/chat`}>
                    <MessageCircle className="h-4 w-4" />Ask AI
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline" size="sm" className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                <Link href={`/connections/${connection.id}/data`}>View GL Data</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link href={`/connections/${connection.id}/schema`}>View Schema</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link href={`/connections/${connection.id}/account-mapping`}>Account Mapping</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-2 border-violet-200 text-violet-700 hover:bg-violet-50">
                <Link href={`/connections/${connection.id}/scan`}>Data Quality Scan</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50">
                <Link href={`/connections/${connection.id}/flux`}>Flux Analysis</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50">
                <Link href={`/connections/${connection.id}/pulse`}>
                  <Bell className="h-4 w-4" />Daily Pulse
                </Link>
              </Button>
              {connection.uploadedFile?.documentType === "GSTR_2B" && (
                <Button asChild variant="outline" size="sm" className="gap-2 border-violet-200 text-violet-700 hover:bg-violet-50">
                  <Link href={`/connections/${connection.id}/vendor-compliance`}>
                    <TrendingUp className="h-4 w-4" />Vendor ITC Scorecard
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-2" disabled>
                <RefreshCw className="h-4 w-4" />Update Data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ERP connection details */}
      {!isFile && (
        <Card className="border-slate-200">
          <CardHeader><CardTitle className="text-base">Connection Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Type</p>
                <p className="font-medium">{connection.erpType}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Last synced</p>
                <p className="font-medium">
                  {connection.schemaCachedAt
                    ? new Date(connection.schemaCachedAt).toLocaleDateString("en-IN")
                    : "Never"}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button asChild variant="outline" size="sm">
                <Link href={`/connections/${connection.id}/schema`}>View Schema</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Danger Zone — ADMIN only */}
      {user.role === "ADMIN" && (
        <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-5">
          <h3 className="text-sm font-semibold text-rose-700 mb-1">Danger Zone</h3>
          <p className="text-xs text-rose-500 mb-4 leading-snug">
            Deleting this connection permanently removes all uploaded GL data, scan history,
            pinned queries, and the underlying database table. This action cannot be undone.
          </p>
          <DeleteConnectionDialog
            connectionId={connection.id}
            displayName={connection.displayName}
          />
        </div>
      )}
    </div>
  );
}
