import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/auth";
import { prisma } from "@aiql/db";
import {
  parseForm26Q, parseGstr1,
  reconcileGl26Q, reconcileGlGstr1,
} from "@aiql/doc-parsers";

type Ctx = { params: { connectionId: string } };

// Body: which document to reconcile against the GL
const bodySchema = z.object({
  documentId: z.string().optional(),  // WorkspaceDocument id
  // if omitted, uses UploadedFile (primary document, must be non-GL type)
});

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { user } = await validateRequest();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { connectionId } = ctx.params;

    const connection = await prisma.erpConnection.findFirst({
      where: { id: connectionId, orgId: user.orgId },
      include: { uploadedFile: true },
    });
    if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

    // The GL must exist to reconcile against
    const glFile = connection.uploadedFile;
    if (!glFile) {
      return NextResponse.json({ error: "No uploaded GL file found for this connection" }, { status: 404 });
    }

    let body: z.infer<typeof bodySchema> = {};
    try { body = bodySchema.parse(await req.json()); } catch { /* no body */ }

    // Determine the secondary document to reconcile
    let secTableName: string;
    let documentType: string;

    if (body.documentId) {
      const doc = await prisma.workspaceDocument.findFirst({
        where: { id: body.documentId, connectionId },
      });
      if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
      secTableName = doc.tableName;
      documentType = doc.documentType;
    } else {
      // Primary UploadedFile — must be a non-GL type
      if (glFile.documentType === "GL") {
        return NextResponse.json(
          { error: "Primary file is the GL. Provide documentId of a Form 26Q or GSTR-1 document to reconcile." },
          { status: 400 }
        );
      }
      secTableName = glFile.tableName;
      documentType = glFile.documentType;

      // Need a GL somewhere — check for a WorkspaceDocument of type GL
      const glDoc = await prisma.workspaceDocument.findFirst({
        where: { connectionId, documentType: "GL" },
        orderBy: { createdAt: "desc" },
      });
      if (!glDoc) {
        return NextResponse.json(
          { error: "No GL document found. Upload a GL file first, then reconcile against it." },
          { status: 404 }
        );
      }
      // Swap: glFile is actually the doc, glDoc is the real GL
      secTableName = glFile.tableName;
      documentType = glFile.documentType;
      // fetch GL rows from workspace doc
      const glRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${glDoc.tableName}" ORDER BY ctid LIMIT 100000`
      );
      const docRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${secTableName}" ORDER BY ctid LIMIT 50000`
      );
      return runReconciliation(glRows, docRows, documentType, connectionId);
    }

    // Standard path: glFile is GL, secTableName is the document
    if (glFile.documentType !== "GL") {
      return NextResponse.json(
        { error: "Primary uploaded file is not a GL. Cannot use it as the GL source." },
        { status: 400 }
      );
    }

    const [glRows, docRows] = await Promise.all([
      prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${glFile.tableName}" ORDER BY ctid LIMIT 100000`
      ),
      prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${secTableName}" ORDER BY ctid LIMIT 50000`
      ),
    ]);

    return runReconciliation(glRows, docRows, documentType, connectionId);
  } catch (err) {
    console.error("[reconcile POST]", err);
    return NextResponse.json(
      { error: "Reconciliation failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

function runReconciliation(
  glRows:      Record<string, unknown>[],
  docRows:     Record<string, unknown>[],
  docType:     string,
  connectionId: string,
): NextResponse {
  let result;

  if (docType === "FORM_26Q") {
    const parsed = parseForm26Q(docRows);
    result = reconcileGl26Q(glRows, parsed, connectionId);
  } else if (docType === "GSTR_1") {
    const parsed = parseGstr1(docRows);
    result = reconcileGlGstr1(glRows, parsed, connectionId);
  } else {
    return NextResponse.json(
      { error: `No reconciliation engine for document type: ${docType}` },
      { status: 400 }
    );
  }

  const safe = JSON.parse(
    JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? Number(v) : v))
  );
  return NextResponse.json(safe);
}
