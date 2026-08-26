// ─── Business Context Resolver (web side) ────────────────────────────────────
//
// Builds the immutable BusinessContext the pure engine runs against (Principles
// 1, 2, 3, 4). It scans the org's data sources, maps real document types to
// capabilities, picks the right tables for the period, and wires memoizing
// accessors backed by Prisma + the pure doc-parsers. The engine never sees
// Prisma — only the resolved context.

import { prisma } from "@aiql/db";
import { parseGstr2B, type Gstr2BRow } from "@aiql/doc-parsers";
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

/**
 * GSTR-2B sources covering the given month, across the WHOLE org — there is
 * no per-client link between a GL connection and its GSTR-2B connection yet,
 * so this can return 0 (nothing uploaded), 1 (safe, unambiguous) or 2+
 * (unsafe: two different clients' filings both cover this month and there is
 * no way to tell which belongs to the client being investigated). Callers
 * decide what "2+" means for their use case — the current period throws
 * (AmbiguousItcSourceError, a whole run is at stake); trailing-period history
 * just skips the month (a softer signal, degrading is fine).
 */
function itcSourcesForPeriod(sources: DataSource[], year: number, month: number): DataSource[] {
  return sources.filter((s) => {
    if (s.documentType !== "GSTR_2B") return false;
    if (!s.periodStart) return false;
    const start = s.periodStart, end = s.periodEnd ?? s.periodStart;
    const lo = new Date(year, month - 1, 1), hi = new Date(year, month, 0);
    return start <= hi && end >= lo;
  });
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
  // Which client book (GL connection) to investigate. Omit only for the
  // legacy single-business path — it then falls back to "the org's latest GL
  // connection", exactly as before practice mode. Never guessed when supplied.
  connectionId?: string;
  // Optional explicit period; if omitted, derived from the chosen GL source.
  year?:  number;
  month?: number;
}

/**
 * Thrown instead of silently pairing the wrong client's data. GL and GSTR-2B
 * uploads are always separate ErpConnection rows (every upload creates a new
 * one — see confirm-upload route), linked only by period overlap. That is
 * safe while an org has at most one GL connection, but once a firm has
 * multiple clients' GL books under one org, more than one GSTR-2B candidate
 * can cover the same period and there is currently no explicit link telling
 * the resolver which one belongs to which client. Guessing here would produce
 * a confidently wrong report attributed to the wrong business — worse than no
 * report at all — so this throws and the caller must resolve the ambiguity
 * (e.g. archive the stale connection) until explicit GL<->2B linking ships.
 */
export class AmbiguousItcSourceError extends Error {
  constructor(period: string, candidateConnectionIds: string[]) {
    super(
      `Multiple GSTR-2B files cover ${period} across this organisation ` +
      `(connections: ${candidateConnectionIds.join(", ")}). AcctQAI cannot yet ` +
      `auto-match a GSTR-2B to a specific client's GL — this is on our roadmap. ` +
      `Keep only one active GSTR-2B connection per period per client until then.`
    );
    this.name = "AmbiguousItcSourceError";
  }
}

export async function buildBusinessContext(params: ResolveParams): Promise<BusinessContext> {
  const { orgId } = params;
  const sources = await gatherDataSources(orgId);

  // Pick the GL source: the requested client, or (legacy path) the org's most
  // recent GL of any client.
  const glSource = params.connectionId
    ? sources.find((s) => s.documentType === "GL" && s.connectionId === params.connectionId) ?? null
    : pickSource(sources, "GL", null);

  if (params.connectionId && !glSource) {
    throw new Error(`No GL upload found for connection ${params.connectionId}.`);
  }

  // Determine the period: explicit, else the chosen GL source's period, else now.
  let year  = params.year;
  let month = params.month;
  if ((!year || !month)) {
    const ref = glSource?.periodEnd ?? glSource?.periodStart ?? null;
    if (ref) { year = ref.getFullYear(); month = ref.getMonth() + 1; }
    else { const now = new Date(); year = now.getFullYear(); month = now.getMonth() + 1; }
  }
  const period = toPeriod(year!, month!);

  // GSTR-2B: candidates covering this period, across the WHOLE org (there is
  // no per-client link yet — see AmbiguousItcSourceError above). Zero is
  // fine (no ITC capability); exactly one is safe and matches today's
  // single-business behaviour; two or more is unsafe to guess between.
  const itcCandidates = itcSourcesForPeriod(sources, year!, month!);
  if (itcCandidates.length > 1) {
    throw new AmbiguousItcSourceError(period.label, itcCandidates.map((s) => s.connectionId));
  }
  // Zero period-covering candidates: only the legacy (no explicit client)
  // path falls back to "most recent GSTR-2B of any period" — safe there
  // because a single-business org has nothing else it could be. Once a
  // client is explicitly selected, reaching for some OTHER client's stale
  // 2B data would be silently wrong, so this run simply has no ITC
  // capability for the period instead of guessing.
  const itcSource = itcCandidates[0]
    ?? (params.connectionId ? null : pickSource(sources, "GSTR_2B", { year: year!, month: month! }));

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

  const trailingRowsCache = new Map<number, Promise<Gstr2BRow[]>>();

  const itc: ItcAccessor | null = itcSource ? {
    getRows: makeMemo(async () => {
      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${itcSource.tableName}" ORDER BY ctid LIMIT ${DOC_ROW_LIMIT}`,
      );
      return parseGstr2B(rows);
    }),
    getConnectionId: () => itcSource.connectionId,

    // Up to `periods` prior months' GSTR-2B, oldest first, excluding the
    // current period. Only months with an UNAMBIGUOUS source (see
    // itcSourcesForPeriod) are included — an ambiguous month (two clients'
    // filings both covering it) is silently skipped rather than guessed,
    // exactly like the current-period resolution above but non-fatal, since
    // this only feeds an optional secondary signal (filing-pattern
    // intelligence), not the investigation's core capability check.
    getTrailingRows: (periods: number) => {
      const cached = trailingRowsCache.get(periods);
      if (cached) return cached;

      const promise = (async () => {
        const monthSources: DataSource[] = [];
        let y = year!, m = month!;
        for (let i = 0; i < periods; i++) {
          m -= 1;
          if (m < 1) { m = 12; y -= 1; }
          const candidates = itcSourcesForPeriod(sources, y, m);
          if (candidates.length === 1) monthSources.push(candidates[0]);
          // 0 candidates: nothing uploaded for that month, skip.
          // 2+ candidates: ambiguous across clients, skip rather than guess.
        }
        monthSources.reverse(); // oldest first

        const allRows: Gstr2BRow[] = [];
        for (const src of monthSources) {
          const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
            `SELECT * FROM "${src.tableName}" ORDER BY ctid LIMIT ${DOC_ROW_LIMIT}`,
          );
          allRows.push(...parseGstr2B(rows));
        }
        return allRows;
      })();

      trailingRowsCache.set(periods, promise);
      return promise;
    },
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
    // Reflects whichever client book this run actually investigated —
    // explicitly chosen, or (legacy path) whatever the org's latest GL
    // resolved to. Null only when there is no GL at all.
    connectionId: glSource?.connectionId ?? null,
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
