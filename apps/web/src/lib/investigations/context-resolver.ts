// ─── Business Context Resolver (web side) ────────────────────────────────────
//
// Builds the immutable BusinessContext the pure engine runs against (Principles
// 1, 2, 3, 4). It scans the org's data sources, maps real document types to
// capabilities, picks the right tables for the period, and wires memoizing
// accessors backed by Prisma + the pure doc-parsers. The engine never sees
// Prisma — only the resolved context.

import { prisma } from "@aiql/db";
import { parseGstr2B } from "@aiql/doc-parsers";
import {
  Capability,
  type BusinessContext,
  type InvestigationPeriod,
  type GlAccessor,
  type ItcAccessor,
} from "@aiql/investigation-engine";
import { getDefaultProfile } from "@aiql/investigation-engine";

const STALENESS_DAYS = 45;
const GL_ROW_LIMIT  = 100_000;
const DOC_ROW_LIMIT = 50_000;

// A unified view of an uploaded data source (primary UploadedFile OR a
// supplemental WorkspaceDocument), so the resolver can treat them uniformly.
interface DataSource {
  connectionId: string;
  documentType: string;
  tableName:    string;
  periodStart:  Date | null;
  periodEnd:    Date | null;
  createdAt:    Date;
}

async function gatherDataSources(orgId: string): Promise<DataSource[]> {
  const connections = await prisma.erpConnection.findMany({
    where:   { orgId, status: "ACTIVE" },
    include: { uploadedFile: true, workspaceDocuments: true },
    orderBy: { createdAt: "desc" },
  });

  const sources: DataSource[] = [];
  for (const conn of connections) {
    if (conn.uploadedFile) {
      sources.push({
        connectionId: conn.id,
        documentType: conn.uploadedFile.documentType,
        tableName:    conn.uploadedFile.tableName,
        periodStart:  conn.uploadedFile.periodStart,
        periodEnd:    conn.uploadedFile.periodEnd,
        createdAt:    conn.uploadedFile.createdAt,
      });
    }
    for (const doc of conn.workspaceDocuments) {
      sources.push({
        connectionId: conn.id,
        documentType: doc.documentType,
        tableName:    doc.tableName,
        periodStart:  doc.periodStart,
        periodEnd:    doc.periodEnd,
        createdAt:    doc.createdAt,
      });
    }
  }
  return sources;
}

// Pick the best source for a document type: prefer one whose period covers the
// requested month; otherwise the most recently uploaded (sources are already
// sorted newest-first within each connection, but workspace docs interleave, so
// sort explicitly).
function pickSource(
  sources: DataSource[],
  documentType: string,
  period: { year: number; month: number } | null,
): DataSource | null {
  const candidates = sources
    .filter((s) => s.documentType === documentType)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (candidates.length === 0) return null;

  if (period) {
    const covering = candidates.find((s) => {
      if (!s.periodStart) return false;
      const start = s.periodStart;
      const end   = s.periodEnd ?? s.periodStart;
      const lo = new Date(period.year, period.month - 1, 1);
      const hi = new Date(period.year, period.month, 0);
      return start <= hi && end >= lo;
    });
    if (covering) return covering;
  }
  return candidates[0];
}

function toPeriod(year: number, month: number): InvestigationPeriod {
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 0);
  const label = `${String(month).padStart(2, "0")}-${year}`;
  return { month, year, label, start, end };
}

function makeMemo<T>(loader: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;
  return () => (cached ??= loader());
}

export interface ResolveParams {
  orgId:  string;
  // Optional explicit period; if omitted, derived from the latest GL source.
  year?:  number;
  month?: number;
}

export async function buildBusinessContext(params: ResolveParams): Promise<BusinessContext> {
  const { orgId } = params;
  const sources = await gatherDataSources(orgId);

  // Determine the period: explicit, else the latest GL source's period, else now.
  const latestGl = pickSource(sources, "GL", null);
  let year  = params.year;
  let month = params.month;
  if ((!year || !month)) {
    const ref = latestGl?.periodEnd ?? latestGl?.periodStart ?? null;
    if (ref) { year = ref.getFullYear(); month = ref.getMonth() + 1; }
    else { const now = new Date(); year = now.getFullYear(); month = now.getMonth() + 1; }
  }
  const period = toPeriod(year!, month!);

  const glSource  = pickSource(sources, "GL", { year: year!, month: month! });
  const itcSource = pickSource(sources, "GSTR_2B", { year: year!, month: month! });

  const capabilities = new Set<Capability>();
  if (glSource)  capabilities.add(Capability.GENERAL_LEDGER);
  if (itcSource) capabilities.add(Capability.INPUT_TAX_CREDIT);

  const hasVendorHistory = glSource
    ? (await prisma.vendorComplianceRecord.count({ where: { connectionId: glSource.connectionId } })) > 0
    : false;
  if (hasVendorHistory) capabilities.add(Capability.VENDOR_COMPLIANCE_HISTORY);

  // ── Accessors (memoized — snapshot isolation, Principle 4) ──
  const gl: GlAccessor | null = glSource ? {
    getRawRows: makeMemo(() =>
      prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${glSource.tableName}" ORDER BY ctid LIMIT ${GL_ROW_LIMIT}`,
      ),
    ),
    getConnectionId: () => glSource.connectionId,
    getPeriodStart:  () => glSource.periodStart,
    getPeriodEnd:    () => glSource.periodEnd,
  } : null;

  const itc: ItcAccessor | null = itcSource ? {
    getRows: makeMemo(async () => {
      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${itcSource.tableName}" ORDER BY ctid LIMIT ${DOC_ROW_LIMIT}`,
      );
      return parseGstr2B(rows);
    }),
    getConnectionId: () => itcSource.connectionId,
  } : null;

  // Staleness: based on the freshest relevant data source.
  const dataAsOf = [glSource, itcSource]
    .filter((s): s is DataSource => Boolean(s))
    .map((s) => s.createdAt)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const isStale = dataAsOf
    ? (Date.now() - dataAsOf.getTime()) / 86_400_000 > STALENESS_DAYS
    : false;

  const snapshotId = `CTX-${period.label}-${Date.now().toString(36)}`;

  return Object.freeze({
    organizationId: orgId,
    period,
    snapshotId,
    resolvedAt: new Date(),
    profileId:  getDefaultProfile().id,
    isStale,
    dataAsOf,
    capabilities,
    gl,
    itc,
    vendorCompliance: null, // wired when the vendor-risk investigation ships
  });
}
