"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Upload, FileSpreadsheet, CheckCircle2, Loader2, ArrowLeft, X } from "lucide-react";

// Inline canonical column names — avoids a Node.js server-only import in a client component
const CANONICAL_COLUMN_NAMES = [
  "transaction_date","due_date","value_date","account_code","account_name","account_group",
  "account_type","vendor_name","customer_name","party_name","debit_amount","credit_amount",
  "net_amount","opening_balance","closing_balance","description","reference_number",
  "document_number","voucher_type","transaction_type","cost_centre","project",
  "currency_code","exchange_rate",
] as const;

// Document type options — inline so this client component stays browser-safe
const DOC_TYPES = [
  { value: "GL",             label: "General Ledger",  icon: "📊", chatEnabled: true },
  { value: "TDS_RETURN_26Q", label: "Form 26Q (TDS)",  icon: "📋", chatEnabled: false },
  { value: "GSTR_1",         label: "GSTR-1",          icon: "🧾", chatEnabled: false },
  { value: "GSTR_2B",        label: "GSTR-2B (ITC)",   icon: "📥", chatEnabled: false },
  { value: "GSTR_3B",        label: "GSTR-3B",         icon: "🧾", chatEnabled: false },
  { value: "ITR",            label: "ITR",             icon: "📁", chatEnabled: false },
  { value: "OTHER",          label: "Other",           icon: "📄", chatEnabled: false },
] as const;
type DocTypeValue = (typeof DOC_TYPES)[number]["value"];

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = "type" | "upload" | "mapping" | "success" | "tally" | "zoho";

interface DetectedMapping {
  originalName:    string;
  canonicalName:   string | null;
  confidence:      number;
  detectionMethod: string;
  skip:            boolean;
  skipReason?:     string;
}

interface DetectionCandidate {
  type:             string;
  confidence:       number;
  matchedColumns:   string[];
  missingRequired:  string[];
  schemaVersion?:   string;
}

interface ExtractedPeriod {
  periodStart: string | null;
  periodEnd:   string | null;
  source:      string;
  confidence:  number;
  rawHint:     string | null;
}

interface UploadState {
  connectionId:     string;
  detectedMappings: DetectedMapping[];
  preview:          Record<string, unknown>[];
  headers:          string[];
  rowCount:         number;
  fileName:         string;
  detection?: {
    candidates:  DetectionCandidate[];
    best:        DetectionCandidate | null;
    isAmbiguous: boolean;
  };
  period?: ExtractedPeriod;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function confidenceBadge(m: DetectedMapping) {
  if (m.skip) return <Badge className="bg-slate-100 text-slate-500 border text-xs">skipped</Badge>;
  if (!m.canonicalName) return <Badge className="bg-red-100 text-red-600 border text-xs">unmapped</Badge>;
  const pct = Math.round(m.confidence * 100);
  const cls = pct >= 90 ? "bg-green-100 text-green-700 border-green-200"
             : pct >= 60 ? "bg-yellow-100 text-yellow-700 border-yellow-200"
             : "bg-orange-100 text-orange-700 border-orange-200";
  return <Badge className={`${cls} border text-xs`}>{pct}%</Badge>;
}

const CANONICAL_LIST = [...CANONICAL_COLUMN_NAMES].sort();

// ─── Step components ──────────────────────────────────────────────────────────

function StepType({ onSelect }: { onSelect: (t: WizardStep) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Choose connection type</h2>
        <p className="text-sm text-muted-foreground mt-1">Excel/CSV is the fastest way to get started</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { id: "upload" as WizardStep, emoji: "📊", title: "Upload File", sub: "Excel / CSV", time: "~2 min",
            highlight: true, desc: "Upload any spreadsheet — AIQL auto-detects columns" },
          { id: "tally" as WizardStep, emoji: "📒", title: "Tally Prime", sub: "Cloud VPS", time: "~5 min",
            highlight: false, desc: "Connect to Tally Prime running on cloud server" },
          { id: "zoho" as WizardStep, emoji: "📗", title: "Zoho Books", sub: "OAuth 2.0", time: "~1 min",
            highlight: false, desc: "Connect via Zoho's secure OAuth flow" },
        ].map((opt) => (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            className={`rounded-xl border-2 p-5 text-left transition-all hover:shadow-md ${
              opt.highlight ? "border-[#1B3A5C] bg-[#1B3A5C]/5" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="text-3xl mb-3">{opt.emoji}</div>
            <p className="font-semibold text-slate-900">{opt.title}</p>
            <p className="text-xs text-muted-foreground">{opt.sub}</p>
            <p className="mt-2 text-xs text-slate-600">{opt.desc}</p>
            <p className="mt-3 text-xs font-medium text-[#1B3A5C]">{opt.time}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepUpload({ onNext, onBack }: { onNext: (s: UploadState) => void; onBack: () => void }) {
  const [file, setFile]             = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [dragging, setDragging]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    setDisplayName(f.name.replace(/\.[^.]+$/, ""));
    setError("");
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  async function submit() {
    if (!file) return;
    setLoading(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("displayName", displayName || file.name);
    try {
      const res = await fetch("/api/internal/connections", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Upload failed"); return; }
      onNext(data as UploadState);
    } catch { setError("Upload failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-slate-700"><ArrowLeft className="h-4 w-4" /></button>
        <h2 className="text-xl font-semibold">Upload your file</h2>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
          dragging ? "border-[#1B3A5C] bg-[#1B3A5C]/5" : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileSpreadsheet className="h-8 w-8 text-blue-600" />
            <div className="text-left">
              <p className="font-medium text-slate-900">{file.name}</p>
              <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="ml-2 text-muted-foreground hover:text-slate-700"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <>
            <Upload className="mx-auto h-10 w-10 text-slate-300 mb-3" />
            <p className="font-medium text-slate-700">Drop your file here or click to browse</p>
            <p className="text-sm text-muted-foreground mt-1">.xlsx, .xls, .csv, .tsv — max 50 MB</p>
          </>
        )}
      </div>

      {file && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Connection name</label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. FY 2025-26 GL" />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={submit} disabled={!file || loading} className="bg-[#1B3A5C] hover:bg-[#1B3A5C]/90 gap-2">
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Detecting columns…</> : "Continue →"}
      </Button>
    </div>
  );
}

function DocTypeCard({
  detection,
  period,
  docType,
  setDocType,
  dataIntent,
  setDataIntent,
  periodStart,
  setPeriodStart,
  periodEnd,
  setPeriodEnd,
  onUserEdited,
}: {
  detection?: UploadState["detection"];
  period?:    UploadState["period"];
  docType:    DocTypeValue;
  setDocType: (v: DocTypeValue) => void;
  dataIntent: "CURRENT_OPERATIONAL" | "HISTORICAL";
  setDataIntent: (v: "CURRENT_OPERATIONAL" | "HISTORICAL") => void;
  periodStart: string;
  setPeriodStart: (v: string) => void;
  periodEnd: string;
  setPeriodEnd: (v: string) => void;
  onUserEdited: () => void;
}) {
  const best       = detection?.best;
  const confidence = best ? Math.round(best.confidence * 100) : 0;
  const isAmbiguous = detection?.isAmbiguous ?? false;
  const docDef     = DOC_TYPES.find((d) => d.value === docType)!;

  const confidenceColor =
    confidence >= 80 ? "text-green-700 bg-green-50 border-green-200"
    : confidence >= 50 ? "text-yellow-700 bg-yellow-50 border-yellow-200"
    : "text-slate-500 bg-slate-50 border-slate-200";

  const periodSource = period?.source === "filename"
    ? "from filename"
    : period?.source === "date_column"
    ? "from data"
    : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Document type</p>

      {/* Detected type + confidence */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">{docDef.icon}</span>
        <div className="flex-1">
          <select
            value={docType}
            onChange={(e) => { setDocType(e.target.value as DocTypeValue); onUserEdited(); }}
            className="font-medium text-slate-900 bg-transparent border-0 border-b border-dashed border-slate-400 focus:outline-none text-sm pr-4 w-full"
          >
            {DOC_TYPES.map((d) => (
              <option key={d.value} value={d.value}>{d.icon} {d.label}</option>
            ))}
          </select>
          {!docDef.chatEnabled && (
            <p className="text-xs text-amber-600 mt-0.5">AI chat not yet available for this type — coming in v2</p>
          )}
        </div>
        {confidence > 0 && (
          <span className={`text-xs border rounded-full px-2 py-0.5 ${confidenceColor}`}>
            {confidence}% confidence
          </span>
        )}
      </div>

      {isAmbiguous && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
          Multiple document types matched — please confirm above.
        </p>
      )}

      {/* Data period */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-slate-700">Data period</p>
          {periodSource && (
            <span className="text-xs text-muted-foreground">({periodSource})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={periodStart}
            onChange={(e) => { setPeriodStart(e.target.value); onUserEdited(); }}
            className="h-7 text-xs"
            placeholder="Start date"
          />
          <span className="text-xs text-muted-foreground shrink-0">to</span>
          <Input
            type="date"
            value={periodEnd}
            onChange={(e) => { setPeriodEnd(e.target.value); onUserEdited(); }}
            className="h-7 text-xs"
            placeholder="End date"
          />
        </div>
      </div>

      {/* Current / Historical toggle */}
      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 w-fit">
        {(["CURRENT_OPERATIONAL", "HISTORICAL"] as const).map((intent) => (
          <button
            key={intent}
            onClick={() => { setDataIntent(intent); onUserEdited(); }}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              dataIntent === intent
                ? "bg-[#1B3A5C] text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {intent === "CURRENT_OPERATIONAL" ? "Current" : "Historical"}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepMapping({ state, onBack, onConfirm }: {
  state: UploadState;
  onBack: () => void;
  onConfirm: (cols: number) => void;
}) {
  const [mappings, setMappings] = useState(state.detectedMappings);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  // Document type state — pre-populated from auto-detection
  const detectedType = (state.detection?.best?.type as DocTypeValue | undefined) ?? "GL";
  const [docType, setDocType]       = useState<DocTypeValue>(detectedType);
  const [userConfirmedType, setUserConfirmedType] = useState(false);
  const [dataIntent, setDataIntent] = useState<"CURRENT_OPERATIONAL" | "HISTORICAL">("CURRENT_OPERATIONAL");
  const [periodStart, setPeriodStart] = useState(
    state.period?.periodStart ? new Date(state.period.periodStart).toISOString().slice(0, 10) : ""
  );
  const [periodEnd, setPeriodEnd] = useState(
    state.period?.periodEnd ? new Date(state.period.periodEnd).toISOString().slice(0, 10) : ""
  );

  const active  = mappings.filter((m) => !m.skip);
  const skipped = mappings.filter((m) => m.skip);

  function setCanonical(idx: number, val: string) {
    setMappings((prev) => prev.map((m, i) => i === idx ? { ...m, canonicalName: val || null } : m));
  }

  async function confirm() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/internal/connections/confirm-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId:     state.connectionId,
          confirmedMapping: mappings,
          documentType:     docType,
          dataIntent,
          userConfirmedType,
          periodStart:      periodStart || null,
          periodEnd:        periodEnd   || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(Array.isArray(data.details) ? data.details.join("; ") : (data.error ?? "Failed"));
        return;
      }
      onConfirm(data.canonicalColumns.length);
    } catch { setError("Request failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-slate-700"><ArrowLeft className="h-4 w-4" /></button>
        <div>
          <h2 className="text-xl font-semibold">Review & confirm</h2>
          <p className="text-sm text-muted-foreground">{state.rowCount.toLocaleString()} rows · {state.fileName}</p>
        </div>
      </div>

      {/* Document type confirm card */}
      <DocTypeCard
        detection={state.detection}
        period={state.period}
        docType={docType}
        setDocType={setDocType}
        dataIntent={dataIntent}
        setDataIntent={setDataIntent}
        periodStart={periodStart}
        setPeriodStart={setPeriodStart}
        periodEnd={periodEnd}
        setPeriodEnd={setPeriodEnd}
        onUserEdited={() => setUserConfirmedType(true)}
      />

      {/* Active column mappings */}
      <div className="rounded-lg border overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 px-3 pt-3 pb-1">Column mapping</p>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Your column</th>
              <th className="px-3 py-2 text-left font-medium">Maps to</th>
              <th className="px-3 py-2 text-left font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {active.map((m) => {
              const realIdx = mappings.indexOf(m);
              return (
                <tr key={m.originalName} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">{m.originalName}</td>
                  <td className="px-3 py-2">
                    <select
                      value={m.canonicalName ?? ""}
                      onChange={(e) => setCanonical(realIdx, e.target.value)}
                      className="text-xs border rounded px-2 py-1 bg-white w-full"
                    >
                      <option value="">(unmapped)</option>
                      {CANONICAL_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">{confidenceBadge(m)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Skipped columns */}
      {skipped.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-slate-700">
            {skipped.length} column{skipped.length !== 1 ? "s" : ""} skipped automatically
          </summary>
          <div className="mt-2 space-y-1 pl-4">
            {skipped.map((m) => (
              <div key={m.originalName} className="flex items-center gap-2 text-xs text-muted-foreground">
                <X className="h-3 w-3" />
                <span className="font-mono">{m.originalName}</span>
                <span>— {m.skipReason}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Preview */}
      <div>
        <p className="text-sm font-medium mb-2 text-muted-foreground">Data preview (first 5 rows)</p>
        <div className="overflow-x-auto rounded-lg border text-xs">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>{state.headers.filter((h) => !mappings.find((m) => m.originalName === h)?.skip).map((h) => (
                <th key={h} className="px-2 py-1.5 text-left font-mono whitespace-nowrap border-r last:border-0">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y">
              {state.preview.map((row, i) => (
                <tr key={i}>
                  {state.headers.filter((h) => !mappings.find((m) => m.originalName === h)?.skip).map((h) => (
                    <td key={h} className="px-2 py-1.5 text-muted-foreground whitespace-nowrap border-r last:border-0 max-w-[120px] truncate">
                      {String(row[h] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={confirm} disabled={loading} className="bg-[#1B3A5C] hover:bg-[#1B3A5C]/90 gap-2">
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Loading data…</> : "Confirm & Load Data →"}
      </Button>
    </div>
  );
}

function StepSuccess({ columns, onDone }: { columns: number; onDone: () => void }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4 py-8">
      <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
      </div>
      <h2 className="text-xl font-semibold">Data loaded successfully</h2>
      <p className="text-muted-foreground text-sm">{columns} canonical columns ready for AI queries</p>
      <Button onClick={onDone} className="bg-[#1B3A5C] hover:bg-[#1B3A5C]/90 mt-2">Go to Query Studio →</Button>
    </div>
  );
}

function StepTally({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-slate-700"><ArrowLeft className="h-4 w-4" /></button>
        <h2 className="text-xl font-semibold">Connect Tally Prime</h2>
      </div>
      <p className="text-sm text-muted-foreground">Coming in Sprint 3 Day 19 — full connection wizard</p>
      <Button variant="outline" onClick={onBack}>Back</Button>
    </div>
  );
}

function StepZoho({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-slate-700"><ArrowLeft className="h-4 w-4" /></button>
        <h2 className="text-xl font-semibold">Connect Zoho Books</h2>
      </div>
      <p className="text-sm text-muted-foreground">Coming in Sprint 3 Day 19 — OAuth flow</p>
      <Button variant="outline" onClick={onBack}>Back</Button>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function NewConnectionPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>("type");
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [loadedColumns, setLoadedColumns] = useState(0);

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Add connection</h1>
      </div>

      <Card className="border-slate-200">
        <CardContent className="pt-6">
          {step === "type"    && <StepType onSelect={(t) => setStep(t)} />}
          {step === "upload"  && <StepUpload onBack={() => setStep("type")} onNext={(s) => { setUploadState(s); setStep("mapping"); }} />}
          {step === "mapping" && uploadState && (
            <StepMapping state={uploadState} onBack={() => setStep("upload")}
              onConfirm={(cols) => { setLoadedColumns(cols); setStep("success"); }} />
          )}
          {step === "success" && <StepSuccess columns={loadedColumns} onDone={() => router.push("/query")} />}
          {step === "tally"   && <StepTally onBack={() => setStep("type")} />}
          {step === "zoho"    && <StepZoho onBack={() => setStep("type")} />}
        </CardContent>
      </Card>
    </div>
  );
}
