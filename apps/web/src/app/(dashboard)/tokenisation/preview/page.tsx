"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck, Loader2, ArrowRight, Lock, Tag, Hash, AlertTriangle } from "lucide-react";

const DEMO = `Show AP aging for Sharma Enterprises and Tata Motors.
Total outstanding: ₹12,50,000 across all vendors.
Customer Infosys Ltd has overdue invoice of $25,000.
GL account 4000-100 shows variance above ₹5L.`;

type Token = { original: string; token: string; category: string };

type Stats = {
  entitiesFound: number;
  amountsFound:  number;
  accountsFound: number;
  piiStripped:   number;
  totalTokens:   number;
  processingTimeMs: number;
};

type Result = {
  original:  string;
  tokenised: string;
  tokenMap:  Record<string, string>;
  auditLog:  Token[];
  stats:     Stats;
};

const CATEGORY_META: Record<string, { color: string; bg: string; label: string; icon: typeof Tag }> = {
  VENDOR:   { color: "text-orange-700", bg: "bg-orange-50 border-orange-200", label: "Vendor",   icon: Tag },
  CUSTOMER: { color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",     label: "Customer", icon: Tag },
  EMPLOYEE: { color: "text-purple-700", bg: "bg-purple-50 border-purple-200", label: "Employee", icon: Tag },
  AMOUNT:   { color: "text-green-700",  bg: "bg-green-50 border-green-200",   label: "Amount",   icon: Hash },
  ACCT:     { color: "text-slate-700",  bg: "bg-slate-50 border-slate-200",   label: "Account",  icon: Hash },
  ENTITY:   { color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200", label: "Entity",   icon: Tag },
  PII:      { color: "text-red-700",    bg: "bg-red-50 border-red-200",       label: "PII",      icon: AlertTriangle },
};

function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function highlightOriginal(text: string, tokenMap: Record<string, string>) {
  let html = escHtml(text);
  const originals = Object.values(tokenMap).sort((a, b) => b.length - a.length);
  for (const val of originals) {
    if (!val || val === "[STRIPPED]") continue;
    html = html.split(escHtml(val)).join(
      `<mark class="bg-red-100 text-red-800 rounded px-0.5 font-medium">${escHtml(val)}</mark>`
    );
  }
  return html;
}

function highlightTokenised(text: string, tokenMap: Record<string, string>) {
  let html = escHtml(text);
  const tokens = Object.keys(tokenMap).sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    const cat = token.split("_T")[0];
    const meta = CATEGORY_META[cat];
    const cls = meta
      ? `bg-green-100 text-green-800`
      : `bg-slate-100 text-slate-700`;
    html = html.split(token).join(
      `<mark class="${cls} rounded px-0.5 font-mono text-xs font-medium">${token}</mark>`
    );
  }
  return html;
}

export default function TokenisationPreviewPage() {
  const [text,   setText]   = useState(DEMO);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,  setError]  = useState("");

  async function handleTokenise() {
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/internal/tokenisation/preview", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) { setError("Tokenisation failed. Please try again."); return; }
      setResult(data);
    } catch {
      setError("Request failed.");
    } finally {
      setLoading(false);
    }
  }

  const statCards = result
    ? [
        { label: "Entities masked", value: result.stats.entitiesFound, color: "text-orange-600", bg: "bg-orange-50" },
        { label: "Amounts masked",  value: result.stats.amountsFound,  color: "text-green-600",  bg: "bg-green-50"  },
        { label: "Accounts masked", value: result.stats.accountsFound, color: "text-slate-600",  bg: "bg-slate-100" },
        { label: "PII stripped",    value: result.stats.piiStripped,   color: "text-red-600",    bg: "bg-red-50"    },
      ]
    : [];

  return (
    <div className="space-y-5">
      {/* Trust banner */}
      <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 px-5 py-3">
        <ShieldCheck className="h-5 w-5 text-green-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-green-800">Your data never reaches the AI</p>
          <p className="text-xs text-green-700">Sensitive values are replaced with tokens before processing. Originals stay on your server.</p>
        </div>
      </div>

      {/* Input */}
      <Card className="border-slate-200">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">Text to tokenise</label>
            <span className="text-xs text-muted-foreground">{text.length} chars</span>
          </div>
          <textarea
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-mono min-h-[130px] resize-y focus:outline-none focus:ring-2 focus:ring-[#1B3A5C] focus:bg-white transition-colors"
            value={text}
            onChange={(e) => { setText(e.target.value); setResult(null); }}
            placeholder="Paste any financial query or text…"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleTokenise}
              disabled={loading || !text.trim()}
              className="bg-[#1B3A5C] hover:bg-[#1B3A5C]/90 gap-2 px-6"
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Tokenising…</>
                : <><Lock className="h-4 w-4" /> Tokenise</>
              }
            </Button>
            {result && (
              <span className="text-xs text-muted-foreground">
                {result.stats.totalTokens} token{result.stats.totalTokens !== 1 ? "s" : ""} · {result.stats.processingTimeMs}ms
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {result && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {statCards.map((s) => (
              <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.bg}`}>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-600 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Split view */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="border-red-200 overflow-hidden">
              <CardHeader className="bg-red-50 py-3 px-4 border-b border-red-100">
                <CardTitle className="text-sm font-semibold text-red-800 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  Before — sensitive data visible
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <pre
                  className="text-xs leading-6 font-mono whitespace-pre-wrap break-words"
                  dangerouslySetInnerHTML={{ __html: highlightOriginal(result.original, result.tokenMap) }}
                />
              </CardContent>
            </Card>

            <Card className="border-green-200 overflow-hidden">
              <CardHeader className="bg-green-50 py-3 px-4 border-b border-green-100">
                <CardTitle className="text-sm font-semibold text-green-800 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  After — safe to send to AI ✓
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <pre
                  className="text-xs leading-6 font-mono whitespace-pre-wrap break-words"
                  dangerouslySetInnerHTML={{ __html: highlightTokenised(result.tokenised, result.tokenMap) }}
                />
              </CardContent>
            </Card>
          </div>

          {/* Audit log */}
          {result.auditLog.length > 0 && (
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Token map</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.auditLog.map((entry, i) => {
                    const meta = CATEGORY_META[entry.category];
                    return (
                      <div key={i} className="flex items-center gap-3 text-sm flex-wrap">
                        <Badge
                          className={`${meta?.bg ?? "bg-slate-100"} ${meta?.color ?? "text-slate-700"} border text-xs shrink-0`}
                        >
                          {meta?.label ?? entry.category}
                        </Badge>
                        <span className="font-mono text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded border border-red-100">
                          {entry.original}
                        </span>
                        <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="font-mono text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded border border-green-100">
                          {entry.token}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
