import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, BookOpen } from "lucide-react";
import { ARTICLES } from "./articles";

export const metadata: Metadata = {
  title: "Resources — GST, ITC & Payment Guides for CAs & SMEs",
  description:
    "Practical, first-hand guides on GSTR-2B reconciliation, input tax credit, duplicate payments and month-end close for Indian CAs and finance teams.",
  alternates: { canonical: "/resources" },
};

export default function ResourcesPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-slate-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-[#1B3A5C]">AcctQAI</Link>
          <Link href="/signup" className="inline-flex items-center min-h-11 px-2 -mr-2 text-sm text-[#1B3A5C] hover:underline font-medium">
            Sign up free →
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-14">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-[#1B3A5C]/[0.06] text-[#1B3A5C] border border-[#1B3A5C]/10 rounded-full px-3 py-1 text-xs font-semibold">
            <BookOpen className="h-3.5 w-3.5" /> Resources
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-[#1B3A5C] mt-4">
            Guides for GST, ITC &amp; payment control
          </h1>
          <p className="text-lg text-slate-600 mt-3 leading-relaxed">
            Practical, first-hand walkthroughs written for Indian CAs and finance teams — how to
            reconcile GSTR-2B, protect your input tax credit, and catch what quietly leaks money.
          </p>
        </div>

        <div className="mt-12 space-y-4">
          {ARTICLES.map((a) => (
            <Link
              key={a.slug}
              href={`/resources/${a.slug}`}
              className="block rounded-2xl border border-slate-200 p-6 hover:border-slate-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                <span className="font-semibold text-[#1B3A5C]">{a.category}</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {a.readMins} min read</span>
              </div>
              <h2 className="text-xl font-semibold text-slate-900 group-hover:text-[#1B3A5C] transition-colors">
                {a.title}
              </h2>
              <p className="text-slate-600 text-sm mt-2 leading-relaxed">{a.description}</p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#1B3A5C] mt-4">
                Read the guide <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-14 rounded-2xl bg-slate-50 border border-slate-200 p-6 text-center">
          <p className="text-slate-700 font-medium">See these findings on real books.</p>
          <p className="text-slate-500 text-sm mt-1">
            AcctQAI investigates your Tally or ERP export and surfaces GST/ITC risk and duplicate payments with evidence.
          </p>
          <Link
            href="/sample-report"
            className="inline-flex items-center gap-2 mt-4 bg-[#1B3A5C] text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-[#1B3A5C]/90 transition-colors"
          >
            View a sample report <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
