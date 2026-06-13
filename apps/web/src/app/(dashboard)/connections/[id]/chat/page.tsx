import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlChat } from "@/components/connections/gl-chat";

export default async function ChatPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const connection = await prisma.erpConnection.findFirst({
    where:   { id: params.id, orgId: user.orgId },
    include: { uploadedFile: true },
  });
  if (!connection) notFound();

  // Only FILE_UPLOAD + ACTIVE + GL type supports chat
  if (connection.erpType !== "FILE_UPLOAD" || connection.status !== "ACTIVE") {
    return (
      <div className="max-w-xl space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/connections/${params.id}`}><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
        </Button>
        <p className="text-muted-foreground text-sm">Chat is only available on active file upload connections.</p>
      </div>
    );
  }

  const docType = connection.uploadedFile?.documentType ?? "GL";
  if (docType !== "GL") {
    return (
      <div className="max-w-xl space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/connections/${params.id}`}><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
        </Button>
        <p className="text-muted-foreground text-sm">AI chat is only available for General Ledger (GL) documents. Coming soon for other document types.</p>
      </div>
    );
  }

  // Fetch GL date range
  let glMinDate: string | null = null;
  let glMaxDate: string | null = null;
  if (connection.uploadedFile?.tableName) {
    try {
      const rows = await prisma.$queryRawUnsafe<{ min_d: Date | null; max_d: Date | null }[]>(
        `SELECT MIN(transaction_date) AS min_d, MAX(transaction_date) AS max_d FROM "${connection.uploadedFile.tableName}"`
      );
      glMinDate = rows[0]?.min_d ? new Date(rows[0].min_d).toISOString().slice(0, 10) : null;
      glMaxDate = rows[0]?.max_d ? new Date(rows[0].max_d).toISOString().slice(0, 10) : null;
    } catch { /* ignore */ }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center gap-3 mb-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/connections/${params.id}`}><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-lg font-semibold">{connection.displayName}</h1>
          {glMinDate && glMaxDate && (
            <p className="text-xs text-muted-foreground">{glMinDate} — {glMaxDate}</p>
          )}
        </div>
      </div>
      <GlChat
        connectionId={params.id}
        connectionName={connection.displayName}
        glMinDate={glMinDate}
        glMaxDate={glMaxDate}
        uploadedAt={connection.uploadedFile?.createdAt.toISOString() ?? new Date().toISOString()}
      />
    </div>
  );
}
