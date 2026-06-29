import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Lock, AlertCircle, TrendingUp, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50">
      {/* Brand / value panel — desktop only */}
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-[#1B3A5C] to-[#15314d] text-white p-12 relative overflow-hidden">
        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center"><span className="text-white text-sm font-bold">IQ</span></div>
            <span className="font-bold text-xl">AccountIQ</span>
          </Link>
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-3xl font-bold leading-tight">
            Know what deserves your attention before it costs you money.
          </h2>
          <p className="text-white/70 mt-4 leading-relaxed">
            AccountIQ investigates your books and surfaces the risks, compliance gaps and opportunities that matter — each with the evidence and the action to take.
          </p>

          {/* Mini finding preview */}
          <div className="mt-8 space-y-2.5">
            {[
              { icon: <AlertCircle className="h-4 w-4 text-red-300" />, t: "₹1,24,500 ITC at risk — 3 vendors haven't filed" },
              { icon: <AlertCircle className="h-4 w-4 text-red-300" />, t: "Possible duplicate payment of ₹68,000" },
              { icon: <TrendingUp className="h-4 w-4 text-emerald-300" />, t: "₹25,000 of unclaimed credit available" },
            ].map((f) => (
              <div key={f.t} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
                {f.icon}
                <span className="text-sm text-white/90">{f.t}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-4 text-xs text-white/60">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Read-only</span>
          <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Encrypted &amp; masked</span>
          <span>Works alongside your ERP</span>
        </div>

        {/* Decorative glow */}
        <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-blue-400/10 blur-3xl" />
      </div>

      {/* Form column */}
      <div className="flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Link href="/" className="lg:hidden inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
