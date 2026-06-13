import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, FileSpreadsheet, Database, Plug, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { ConnectionCardActions } from "@/components/connection-card-actions";

const ERP_ICONS: Record<string, React.ReactNode> = {
  TALLY:       <span className="text-lg">📒</span>,
  ZOHO_BOOKS:  <span className="text-lg">📗</span>,
  FILE_UPLOAD: <FileSpreadsheet className="h-5 w-5 text-blue-600" />,
  default:     <Database className="h-5 w-5 text-slate-500" />,
};

const STATUS_BADGE: Record<string, { cls: string; icon: React.ReactNode }> = {
  ACTIVE:       { cls: "bg-green-100 text-green-700 border-green-200",  icon: <CheckCircle2 className="h-3 w-3" /> },
  PENDING:      { cls: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: <Clock className="h-3 w-3" /> },
  FAILED:       { cls: "bg-red-100 text-red-700 border-red-200",        icon: <AlertCircle className="h-3 w-3" /> },
  DISCONNECTED: { cls: "bg-slate-100 text-slate-600 border-slate-200",  icon: <Plug className="h-3 w-3" /> },
};

export default async function ConnectionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const connections = await prisma.erpConnection.findMany({
    where: { orgId: user.orgId },
    include: { uploadedFile: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Connections</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Connect your ERP or upload a spreadsheet</p>
        </div>
        <Button asChild className="bg-[#1B3A5C] hover:bg-[#1B3A5C]/90 gap-2">
          <Link href="/connections/new"><Plus className="h-4 w-4" />Add connection</Link>
        </Button>
      </div>

      {connections.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <Plug className="h-10 w-10 text-slate-300" />
            <p className="font-medium text-slate-600">No connections yet</p>
            <p className="text-sm text-muted-foreground">Upload an Excel/CSV file or connect Tally / Zoho Books</p>
            <Button asChild className="mt-2 bg-[#1B3A5C] hover:bg-[#1B3A5C]/90">
              <Link href="/connections/new">Add your first connection</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {connections.map((conn) => {
            const statusMeta = STATUS_BADGE[conn.status] ?? STATUS_BADGE.PENDING;
            const icon = ERP_ICONS[conn.erpType] ?? ERP_ICONS.default;
            const isFile = conn.erpType === "FILE_UPLOAD";

            return (
              <Card key={conn.id} className="border-slate-200 hover:border-slate-300 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 border">
                        {icon}
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold">{conn.displayName}</CardTitle>
                        <p className="text-xs text-muted-foreground">{conn.erpType.replace("_", " ")}</p>
                      </div>
                    </div>
                    <Badge className={`${statusMeta.cls} border flex items-center gap-1 text-xs`}>
                      {statusMeta.icon}{conn.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {isFile && conn.uploadedFile && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>{conn.uploadedFile.rowCount.toLocaleString()} rows · {conn.uploadedFile.originalName}</p>
                      <p>Expires {new Date(conn.uploadedFile.expiresAt).toLocaleDateString("en-IN")}</p>
                    </div>
                  )}
                  {conn.schemaCachedAt && (
                    <p className="text-xs text-muted-foreground">
                      Synced {new Date(conn.schemaCachedAt).toLocaleDateString("en-IN")}
                    </p>
                  )}
                  <ConnectionCardActions
                    connectionId={conn.id}
                    displayName={conn.displayName}
                    canDelete={user.role === "ADMIN"}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
