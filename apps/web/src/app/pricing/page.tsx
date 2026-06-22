import type { Metadata } from "next";
import Link from "next/link";
import { PricingCards } from "@/components/pricing/pricing-cards";
import { Sparkles, IndianRupee, Clock, Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing — AccountIQ",
  description: "AccountIQ plans start at ₹999/month. 14-day free trial on all plans. Tally GL queries, GST reconciliation, TDS checks, month-end close — no credit card needed to start.",
};

const FAQ = [
  {
    q: "Is there a free trial?",
    a: "Yes — all plans include a 14-day free trial. No credit card required. Explore with demo data or upload your own GL file.",
  },
  {
    q: "Can I switch plans later?",
    a: "Upgrades take effect immediately and are charged pro-rata. Downgrades take effect at the next billing cycle.",
  },
  {
    q: "What counts as a 'connection'?",
    a: "One uploaded GL file (CSV/Excel) or one live ERP integration (Tally, Zoho) = one connection. Demo data connections do not count toward your limit.",
  },
  {
    q: "Is my client data safe?",
    a: "All data is stored on AWS Mumbai (ap-south-1). Vendor and customer names are tokenised before any LLM call — the AI never sees actual PII. Each organisation's data is isolated in a separate database schema.",
  },
  {
    q: "Do you offer discounts for CA firms?",
    a: "Yes — we offer a 50% discount for the first 3 months to our first 50 customers as part of our Early Adopter Pilot. Email pilot@aiql.com to check availability.",
  },
  {
    q: "What payment methods are accepted?",
    a: "UPI, credit/debit cards, net banking, and Razorpay payment link — all processed via Razorpay. GST invoice provided.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "Your uploaded GL tables are retained for 30 days after cancellation, giving you time to export. After 30 days all data is permanently deleted.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-slate-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-[#1B3A5C]">AIQL</Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-slate-500 hover:text-slate-700">Log in</Link>
            <Link
              href="/signup"
              className="text-sm font-semibold bg-[#1B3A5C] text-white rounded-lg px-4 py-2 hover:bg-[#15304d] transition-colors"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-16">

        {/* Hero */}
        <div className="text-center mb-14">
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight mb-3">
            Simple, transparent pricing
          </h1>
          <p className="text-slate-500 text-base max-w-xl mx-auto leading-relaxed">
            One platform for GL close, data quality scanning, and AI-powered queries.
            Cancel anytime — no lock-in.
          </p>
        </div>

        {/* Pilot program banner */}
        <div className="relative rounded-2xl bg-gradient-to-r from-[#1B3A5C] to-[#2a5280] text-white p-6 mb-12 overflow-hidden">
          <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-10">
            <Sparkles className="w-24 h-24" />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div>
              <p className="font-semibold text-white text-base">
                🎉 Early Adopter Pilot — First 50 customers
              </p>
              <p className="text-blue-200 text-sm mt-1">
                Get <strong className="text-white">50% off for your first 3 months</strong> on any plan. Limited spots remaining.
              </p>
            </div>
            <a
              href="mailto:pilot@aiql.com?subject=AIQL Early Adopter Pilot"
              className="inline-flex shrink-0 items-center gap-1.5 bg-white text-[#1B3A5C] font-semibold text-sm rounded-lg px-5 py-2.5 hover:bg-blue-50 transition-colors"
            >
              Claim your spot →
            </a>
          </div>
        </div>

        {/* Pricing cards */}
        <PricingCards />

        {/* Value highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-16 pt-12 border-t border-slate-100">
          {[
            {
              icon: <Clock className="w-5 h-5 text-emerald-500" />,
              title: "Saves 4–8 hrs per close",
              body: "Automating voucher checks, duplicate detection, and reconciliation summaries lets your team focus on judgement calls, not data wrangling.",
            },
            {
              icon: <IndianRupee className="w-5 h-5 text-amber-500" />,
              title: "Flags ₹ exposure instantly",
              body: "Surfaces TDS gaps, GST mismatches, and sign anomalies that manual review misses — with the exact rupee amount at risk.",
            },
            {
              icon: <Shield className="w-5 h-5 text-violet-500" />,
              title: "PII never leaves your org",
              body: "Vendor names, customer names, and amounts are tokenised before any LLM call. The AI reasons about structure, not your clients' identities.",
            },
          ].map(({ icon, title, body }) => (
            <div key={title} className="flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                {icon}
              </div>
              <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        {/* Enterprise */}
        <div className="mt-12 rounded-2xl border border-slate-200 bg-slate-50/50 p-6 text-center">
          <h2 className="font-semibold text-slate-800 mb-1">Need something custom?</h2>
          <p className="text-sm text-slate-500 mb-4">
            Multi-branch CA firms, large CFO offices, or bank/NBFC teams — we can build a tailored deployment with on-premise data options, custom scanner rules, and dedicated support.
          </p>
          <a
            href="mailto:sales@aiql.com?subject=AIQL Custom/Enterprise"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1B3A5C] hover:underline"
          >
            Talk to our team →
          </a>
        </div>

        {/* FAQ */}
        <div className="mt-16 pt-12 border-t border-slate-100">
          <h2 className="text-2xl font-bold text-slate-900 mb-8 text-center">
            Frequently asked questions
          </h2>
          <dl className="space-y-6 max-w-2xl mx-auto">
            {FAQ.map(({ q, a }) => (
              <div key={q}>
                <dt className="font-semibold text-slate-800 text-sm mb-1.5">{q}</dt>
                <dd className="text-slate-500 text-sm leading-relaxed">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </main>
    </div>
  );
}
