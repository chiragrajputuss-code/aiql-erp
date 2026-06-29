"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Check, ArrowRight, ShieldCheck, Clock, IndianRupee, Lock,
  ChevronDown, Sparkles,
} from "lucide-react";

// ─── Plans ────────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: "Starter",
    monthly: 999, annualMonthly: 832, annualTotal: 9990,
    desc: "For a single business or a CA managing one entity.",
    cta: "Start free", href: "/signup", highlight: false,
    features: ["1 company", "Monthly investigations", "GST & vendor ITC checks", "Evidence on every finding", "1 team member", "Email support"],
  },
  {
    name: "Growth",
    monthly: 2999, annualMonthly: 2499, annualTotal: 29990,
    desc: "For growing businesses and CAs managing several clients.",
    cta: "Start free", href: "/signup", highlight: true,
    features: ["5 companies", "All investigation types", "Duplicate-payment & cash checks", "Receivables & expense analysis", "Drill-down follow-up questions", "5 team members", "Daily Pulse alerts", "Priority support"],
  },
  {
    name: "Enterprise",
    monthly: null, annualMonthly: null, annualTotal: null,
    desc: "For large firms, multi-entity groups and CFO offices.",
    cta: "Talk to us", href: "/contact", highlight: false,
    features: ["Unlimited companies", "Custom investigations", "Tally & Zoho connectors", "Dedicated account manager", "SLA guarantee", "On-premise option"],
  },
];

const VALUE = [
  { icon: <Clock className="w-5 h-5 text-emerald-500" />, title: "Hours back every month", body: "What used to take days of comparing reports and chasing mismatches arrives as a prioritised report in minutes." },
  { icon: <IndianRupee className="w-5 h-5 text-amber-500" />, title: "Rupees at risk, surfaced", body: "ITC at risk, duplicate payments, stuck receivables and TDS gaps — each with the exact amount in play and the action to take." },
  { icon: <Lock className="w-5 h-5 text-violet-500" />, title: "Your data stays yours", body: "Names, references and amounts are encrypted and masked before anything is analysed — never exposed to any AI model." },
];

const FAQ = [
  { q: "Does AccountIQ replace my ERP?", a: "No. AccountIQ works alongside your existing accounting software — Tally, Zoho or any GL export. It reads your data and investigates it; it never replaces your books." },
  { q: "Does AccountIQ modify my accounting data?", a: "Never. AccountIQ is strictly read-only. It analyses your data and recommends actions — every change stays in your hands." },
  { q: "Is this just another reporting tool?", a: "No. Reports tell you what happened. AccountIQ tells you what deserves your attention and why — with the supporting evidence and a recommended action for every finding." },
  { q: "Is there a free trial?", a: "Yes — every plan includes a 14-day free trial. No credit card required. Explore with a sample investigation or upload your own books." },
  { q: "Is my data safe?", a: "Your data is stored in AWS Mumbai (ap-south-1), isolated per organisation. Sensitive fields — vendor and customer names, references and amounts — are encrypted and masked before any analysis runs, and are never exposed to any AI model." },
  { q: "Can I switch plans later?", a: "Yes. Upgrades take effect immediately and are charged pro-rata. Downgrades apply from your next billing cycle." },
  { q: "What payment methods do you accept?", a: "UPI, credit/debit cards and net banking, all processed securely via Razorpay. A GST invoice is provided on every payment." },
  { q: "What happens to my data if I cancel?", a: "Your uploaded data is retained for 30 days after cancellation so you can export it. After 30 days it is permanently deleted." },
];

// ─── Scroll reveal ────────────────────────────────────────────────────────────

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); obs.disconnect(); } }, { threshold: 0.1 });
    obs.observe(el); return () => obs.disconnect();
  }, []);
  return <div ref={ref} style={{ transitionDelay: `${delay}ms` }} className={`transition-all duration-700 ease-out ${shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}>{children}</div>;
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100 px-6 py-3.5">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#1B3A5C] flex items-center justify-center"><span className="text-white text-xs font-bold">IQ</span></div>
          <span className="text-lg font-bold text-[#1B3A5C]">AccountIQ</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900 px-3 py-2">Log in</Link>
          <Link href="/contact" className="text-sm font-semibold bg-[#1B3A5C] text-white rounded-lg px-4 py-2 hover:bg-[#1B3A5C]/90 transition-colors">Book a demo</Link>
        </div>
      </div>
    </header>
  );
}

// ─── FAQ item ─────────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors">
        <span className="font-semibold text-slate-800 text-sm">{q}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-all duration-300 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <p className="px-4 pb-4 text-sm text-slate-500 leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="max-w-5xl mx-auto px-6 py-16">
        {/* Hero */}
        <Reveal>
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-3 py-1 text-xs font-semibold mb-4">
              <ShieldCheck className="h-3.5 w-3.5" /> Built for finance teams
            </div>
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Simple pricing. No usage limits.</h1>
            <p className="text-slate-500 text-lg max-w-xl mx-auto leading-relaxed mt-3">
              No AI credits. No per-query metering. No hidden costs. Just investigations that pay for themselves the first time they catch something.
            </p>
          </div>
        </Reveal>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <span className={`text-sm font-medium ${!annual ? "text-slate-900" : "text-slate-400"}`}>Monthly</span>
          <button
            onClick={() => setAnnual((a) => !a)}
            className={`relative w-12 h-6 rounded-full transition-colors ${annual ? "bg-[#1B3A5C]" : "bg-slate-300"}`}
            aria-label="Toggle annual billing"
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${annual ? "translate-x-6" : ""}`} />
          </button>
          <span className={`text-sm font-medium ${annual ? "text-slate-900" : "text-slate-400"}`}>
            Annual <span className="text-emerald-600 font-semibold">· save 2 months</span>
          </span>
        </div>

        {/* Plans */}
        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 90}>
              <div className={`rounded-2xl border p-6 flex flex-col h-full ${p.highlight ? "border-[#1B3A5C] shadow-xl ring-1 ring-[#1B3A5C]/10 relative" : "border-slate-200"}`}>
                {p.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1B3A5C] text-white text-xs font-semibold px-3 py-1 rounded-full">Most popular</span>}
                <h3 className="font-bold text-lg text-slate-900">{p.name}</h3>
                <p className="text-sm text-slate-500 mt-1 min-h-[40px]">{p.desc}</p>
                <div className="mt-4 flex items-baseline gap-1 min-h-[44px]">
                  {p.monthly === null ? (
                    <span className="text-3xl font-bold text-slate-900">Custom</span>
                  ) : (
                    <>
                      <span className="text-3xl font-bold text-slate-900 tabular-nums">₹{(annual ? p.annualMonthly! : p.monthly).toLocaleString("en-IN")}</span>
                      <span className="text-slate-500 text-sm">/month</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1 min-h-[16px]">
                  {p.annualTotal ? (annual ? `₹${p.annualTotal.toLocaleString("en-IN")} billed yearly` : "billed monthly") : "Annual billing"}
                </p>
                <Link href={p.href} className={`mt-5 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-colors ${p.highlight ? "bg-[#1B3A5C] text-white hover:bg-[#1B3A5C]/90" : "bg-slate-100 text-slate-800 hover:bg-slate-200"}`}>
                  {p.cta} {p.href === "/signup" && <ArrowRight className="h-4 w-4" />}
                </Link>
                <ul className="mt-6 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Pilot banner */}
        <Reveal>
          <div className="relative rounded-2xl bg-gradient-to-r from-[#1B3A5C] to-[#2a5280] text-white p-6 mt-12 overflow-hidden">
            <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-10"><Sparkles className="w-24 h-24" /></div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
              <div>
                <p className="font-semibold text-white text-base">Early Adopter Pilot — first 50 customers</p>
                <p className="text-blue-200 text-sm mt-1">Get <strong className="text-white">50% off your first 3 months</strong> on any plan. Limited spots remaining.</p>
              </div>
              <Link href="/contact" className="inline-flex shrink-0 items-center gap-1.5 bg-white text-[#1B3A5C] font-semibold text-sm rounded-lg px-5 py-2.5 hover:bg-blue-50 transition-colors">
                Claim your spot →
              </Link>
            </div>
          </div>
        </Reveal>

        {/* Value highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-16 pt-12 border-t border-slate-100">
          {VALUE.map((v, i) => (
            <Reveal key={v.title} delay={i * 90}>
              <div className="flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">{v.icon}</div>
                <h3 className="font-semibold text-slate-900 text-sm">{v.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{v.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* FAQ */}
        <div className="mt-16 pt-12 border-t border-slate-100">
          <h2 className="text-2xl font-bold text-slate-900 mb-8 text-center">Frequently asked questions</h2>
          <div className="space-y-3 max-w-2xl mx-auto">
            {FAQ.map((f) => <FaqItem key={f.q} {...f} />)}
          </div>
        </div>

        {/* CTA */}
        <Reveal>
          <div className="mt-16 rounded-2xl bg-gradient-to-br from-[#1B3A5C] to-[#15314d] text-white p-8 text-center">
            <h2 className="text-2xl font-bold">See what AccountIQ finds in your books</h2>
            <p className="text-white/80 mt-2 max-w-lg mx-auto">Start free, or watch a sample investigation run end-to-end first.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 bg-white text-[#1B3A5C] px-7 py-3.5 rounded-xl font-bold hover:bg-slate-100">
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/sample-report" className="inline-flex items-center justify-center gap-2 border border-white/30 text-white px-7 py-3.5 rounded-xl font-semibold hover:bg-white/10">
                View a sample investigation
              </Link>
            </div>
          </div>
        </Reveal>
      </main>
    </div>
  );
}
