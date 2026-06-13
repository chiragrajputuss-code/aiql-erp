"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Upload, ArrowRight, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function markComplete(): Promise<void> {
  await fetch("/api/v1/onboarding/complete", { method: "POST" });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WelcomeStep(): JSX.Element {
  const router = useRouter();
  const [loadingDemo, setLoadingDemo]   = useState(false);
  const [demoError,   setDemoError]     = useState<string | null>(null);
  const [successMsg,  setSuccessMsg]    = useState<string | null>(null);

  async function handleLoadDemo(): Promise<void> {
    setLoadingDemo(true);
    setDemoError(null);
    try {
      const res = await fetch("/api/v1/onboarding/load-demo", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      await markComplete();
      setSuccessMsg("Sample data loaded! Taking you to your dashboard…");
      router.refresh();
      router.push("/");
    } catch (err) {
      setDemoError((err as Error).message);
      setLoadingDemo(false);
    }
  }

  async function handleUpload(): Promise<void> {
    await markComplete();
    router.push("/connections/new");
  }

  async function handleSkip(): Promise<void> {
    await markComplete();
    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50/30 p-4">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1B3A5C] mb-5">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            Welcome to AIQL
          </h1>
          <p className="mt-3 text-slate-500 text-base max-w-md mx-auto leading-relaxed">
            Your AI-powered GL close assistant for Indian SMEs. Let&apos;s get you started.
          </p>
        </div>

        {/* Success flash */}
        {successMsg && (
          <div className="mb-6 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            {successMsg}
          </div>
        )}

        {/* Two option cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">

          {/* Option 1 — Demo */}
          <button
            onClick={handleLoadDemo}
            disabled={loadingDemo}
            className="group relative flex flex-col items-start text-left rounded-2xl border-2 border-[#1B3A5C]/20 bg-white hover:border-[#1B3A5C]/50 hover:shadow-lg p-6 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="w-10 h-10 rounded-xl bg-[#1B3A5C]/10 flex items-center justify-center mb-4 group-hover:bg-[#1B3A5C]/15 transition-colors">
              {loadingDemo
                ? <Loader2 className="w-5 h-5 text-[#1B3A5C] animate-spin" />
                : <Sparkles className="w-5 h-5 text-[#1B3A5C]" />}
            </div>
            <h2 className="font-semibold text-slate-900 text-base mb-1">
              {loadingDemo ? "Loading sample data…" : "Try with sample data"}
            </h2>
            <p className="text-sm text-slate-500 leading-snug">
              3 real Indian SME books (textiles, electronics, IT services) loaded instantly. No upload needed.
            </p>
            <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[#1B3A5C]">
              Get started now <ArrowRight className="w-3.5 h-3.5" />
            </div>
            <span className="absolute top-4 right-4 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 uppercase tracking-wide">
              Recommended
            </span>
          </button>

          {/* Option 2 — Upload */}
          <button
            onClick={handleUpload}
            className="group flex flex-col items-start text-left rounded-2xl border-2 border-slate-200 bg-white hover:border-slate-300 hover:shadow-lg p-6 transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-4 group-hover:bg-slate-200 transition-colors">
              <Upload className="w-5 h-5 text-slate-600" />
            </div>
            <h2 className="font-semibold text-slate-900 text-base mb-1">
              Upload my own data
            </h2>
            <p className="text-sm text-slate-500 leading-snug">
              Upload a CSV or Excel export from Tally, Zoho Books, or any ERP. Takes under 2 minutes.
            </p>
            <div className="mt-4 flex items-center gap-1 text-sm font-medium text-slate-600">
              Choose file <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </button>
        </div>

        {/* Error */}
        {demoError && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-600">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {demoError}
          </div>
        )}

        {/* Feature highlights */}
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-5 py-4 mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
            What AIQL does for you
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-600">
            {[
              "Finds voucher imbalances, duplicates & missing fields",
              "Surfaces TDS gaps & GST mismatches automatically",
              "Answers plain-English questions about your GL books",
            ].map((feat) => (
              <li key={feat} className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                {feat}
              </li>
            ))}
          </ul>
        </div>

        {/* Skip */}
        <p className="text-center text-xs text-slate-400">
          Already know what you&apos;re doing?{" "}
          <button
            onClick={handleSkip}
            className="text-slate-500 hover:text-slate-700 underline underline-offset-2 transition-colors"
          >
            Skip for now
          </button>
          {" · "}
          <Link href="/connections" className="text-slate-500 hover:text-slate-700 underline underline-offset-2">
            View connections
          </Link>
        </p>
      </div>
    </div>
  );
}
