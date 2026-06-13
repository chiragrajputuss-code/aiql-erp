import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileSpreadsheet, Calendar } from "lucide-react";
import { GlLister } from "@/components/connections/gl-lister";

export default async function GlDataPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const connection = await prisma.erpConnection.findFirst({
    where:   { id: params.id, orgId: user.orgId },
    include: { uploadedFile: true },
  });
  if (!connection) notFound();
  if (!connection.uploadedFile) redirect(`/connections/${params.id}`);

  // Query GL date range for the header + scan defaults
  let glMin: string | null = null;
  let glMax: string | null = null;
  let glMinIso: string | null = null;
  let glMaxIso: string | null = null;
  try {
    const rows = await prisma.$queryRawUnsafe<{ min_d: Date | null; max_d: Date | null }[]>(
      `SELECT MIN(transaction_date) AS min_d, MAX(transaction_date) AS max_d
       FROM "${connection.uploadedFile.tableName}"`,
    );
    const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    if (rows[0]?.min_d) { glMin = fmt(new Date(rows[0].min_d)); glMinIso = new Date(rows[0].min_d).toISOString().slice(0, 10); }
    if (rows[0]?.max_d) { glMax = fmt(new Date(rows[0].max_d)); glMaxIso = new Date(rows[0].max_d).toISOString().slice(0, 10); }
  } catch { /* best-effort */ }

  return (
    <div className="space-y-5">
      {/* Back nav */}
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-1 -ml-2">
          <Link href={`/connections/${params.id}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to connection
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            <h1 className="text-2xl font-semibold">{connection.displayName}</h1>
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-sm text-slate-500">
            <span>{connection.uploadedFile.rowCount.toLocaleString()} rows</span>
            <span>·</span>
            <span>{connection.uploadedFile.originalName}</span>
            {glMin && glMax && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1 text-indigo-600 font-medium">
                  <Calendar className="h-3.5 w-3.5" />
                  {glMin} — {glMax}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Lister */}
      <GlLister
        connectionId={params.id}
        glMinDate={glMinIso ?? undefined}
        glMaxDate={glMaxIso ?? undefined}
      />
    </div>
  );
}
