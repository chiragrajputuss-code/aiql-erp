"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Search, Activity, ShieldCheck, ArrowRight,
  TrendingUp, Check, Menu, X, Receipt, Wallet, Users,
  FileText, Sparkles, Lock, CheckCircle2, ChevronRight, EyeOff, ServerCog,
} from "lucide-react";

// ─── Brand ───────────────────────────────────────────────────────────────────

const BRAND = {
  name: "AccountIQ",
  primary: "#1B3A5C",
};

// ─── Hero interactive preview data ────────────────────────────────────────────

const PREVIEW_STEPS = [
  "Reading General Ledger…",
  "Cross-checking GST records…",
  "Scanning payments for duplicates…",
  "Aging receivables…",
  "Writing your report…",
];

const PREVIEW_FINDINGS = [
  { sev: "critical" as const, title: "₹1,24,500 ITC at risk — 3 vendors haven't filed GSTR-1", tag: "GST & Compliance" },
  { sev: "critical" as const, title: "Possible duplicate payment of ₹68,000 to a steel vendor", tag: "Risk & Control" },
  { sev: "warning"  as const, title: "₹4,70,000 stuck in receivables beyond 60 days", tag: "Cash Health" },
  { sev: "opportunity" as const, title: "₹25,000 of unclaimed Input Tax Credit available", tag: "Opportunity" },
];

const SEV_DOT: Record<string, string> = {
  critical: "bg-red-500", warning: "bg-amber-500", opportunity: "bg-emerald-500",
};
const SEV_PILL: Record<string, string> = {
  critical: "bg-red-100 text-red-700", warning: "bg-amber-100 text-amber-700", opportunity: "bg-emerald-100 text-emerald-700",
};

// ─── Drill-down questions (AI is a follow-up tool, not the hero) ───────────────

const DRILL_QUESTIONS = [
  "Why did expenses increase this month?",
  "Show the invoices behind this finding.",
  "Which vendors contributed to this issue?",
  "Explain this recommendation in detail.",
];

// ─── What we investigate ──────────────────────────────────────────────────────

const INVESTIGATES = [
  "Compliance", "Vendor Risk", "Cash Movement", "Expense Analysis",
  "Profit Changes", "Receivables", "Duplicate Payments", "Working Capital",
];

// ─── Capabilities (one investigation, complete visibility) ────────────────────

const CAPABILITIES = [
  { icon: <Receipt className="h-5 w-5" />,    title: "Compliance",        desc: "Identify GST and filing issues before they affect working capital.", color: "bg-blue-50 text-blue-600" },
  { icon: <Users className="h-5 w-5" />,      title: "Vendor Risk",       desc: "Know which vendors require immediate attention.", color: "bg-purple-50 text-purple-600" },
  { icon: <TrendingUp className="h-5 w-5" />, title: "Financial Changes", desc: "Understand why profits, expenses or cash flow changed.", color: "bg-amber-50 text-amber-600" },
  { icon: <Wallet className="h-5 w-5" />,     title: "Cash Health",       desc: "See where money is moving and what needs attention.", color: "bg-emerald-50 text-emerald-600" },
  { icon: <FileText className="h-5 w-5" />,   title: "Executive Summary", desc: "Explain this month's financial story in minutes, not hours.", color: "bg-slate-100 text-slate-600" },
];

// ─── How it works ─────────────────────────────────────────────────────────────

const STEPS = [
  { n: "1", title: "Upload your accounting data", desc: "Import your Tally or ERP export securely. AccountIQ recognises your ledger and GST documents automatically — no mapping, no setup call." },
  { n: "2", title: "AccountIQ investigates your business", desc: "The investigation engine reviews your financial data and identifies exactly what deserves attention — risks, compliance gaps, unusual changes and opportunities." },
  { n: "3", title: "Review findings and take action", desc: "Understand each issue, verify the supporting transactions, and resolve it before it impacts your business — every finding comes with a recommended action." },
];

// ─── Pricing ──────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: "Starter", price: "₹999", period: "/month", annual: "₹9,990/year",
    desc: "For a single business or CA managing one entity.", cta: "Start free", highlight: false,
    features: ["1 company", "Monthly investigations", "GST & vendor ITC checks", "Evidence on every finding", "1 team member", "Email support"],
  },
  {
    name: "Growth", price: "₹2,999", period: "/month", annual: "₹29,990/year",
    desc: "For growing businesses and CAs managing multiple clients.", cta: "Start free", highlight: true,
    features: ["5 companies", "All investigation types", "Duplicate-payment & cash checks", "Receivables & expense analysis", "Drill-down follow-up questions", "5 team members", "Daily Pulse alerts", "Priority support"],
  },
  {
    name: "Enterprise", price: "Custom", period: "", annual: "Annual billing",
    desc: "For large firms, multi-entity groups and CFO offices.", cta: "Talk to us", highlight: false,
    features: ["Unlimited companies", "Custom investigations", "Tally & Zoho connectors", "Dedicated account manager", "SLA guarantee", "On-premise option"],
  },
];

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar() {
  const [open, setOpen] = useState(false);
  const links = [
    { label: "How it works", href: "#how-it-works" },
    { label: "What we investigate", href: "#investigates" },
    { label: "Pricing", href: "#pricing" },
    { label: "Sample report", href: "/sample-report" },
  ];
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#1B3A5C] flex items-center justify-center">
            <span className="text-white text-xs font-bold">IQ</span>
          </div>
          <span className="font-bold text-[#1B3A5C] text-lg">{BRAND.name}</span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a key={l.label} href={l.href} className="text-sm text-slate-600 hover:text-[#1B3A5C] transition-colors font-medium">{l.label}</a>
          ))}
        </div>
        <div className="hidden md:flex items-center gap-3">
          <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900 font-medium px-4 py-2">Log in</Link>
          <Link href="/contact" className="text-sm bg-[#1B3A5C] text-white px-5 py-2 rounded-lg font-medium hover:bg-[#1B3A5C]/90 transition-colors">Book a demo</Link>
        </div>
        <button className="md:hidden p-2" onClick={() => setOpen(!open)}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      </div>
      {open && (
        <div className="md:hidden bg-white border-t border-slate-100 px-6 py-4 space-y-4">
          {links.map((l) => (
            <a key={l.label} href={l.href} className="block text-sm text-slate-600 font-medium py-2" onClick={() => setOpen(false)}>{l.label}</a>
          ))}
          <Link href="/login" className="block text-sm text-slate-600 py-2">Log in</Link>
          <Link href="/contact" className="block text-sm bg-[#1B3A5C] text-white px-5 py-2.5 rounded-lg font-medium text-center">Book a demo</Link>
        </div>
      )}
    </nav>
  );
}

// ─── Hero interactive preview ─────────────────────────────────────────────────

function HeroPreview() {
  const [phase, setPhase] = useState<"analysing" | "report">("analysing");
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (phase === "analysing") {
      if (step >= PREVIEW_STEPS.length) { const t = setTimeout(() => setPhase("report"), 500); return () => clearTimeout(t); }
      const t = setTimeout(() => setStep((s) => s + 1), 520);
      return () => clearTimeout(t);
    }
    // hold the report, then loop
    const t = setTimeout(() => { setStep(0); setPhase("analysing"); }, 5200);
    return () => clearTimeout(t);
  }, [phase, step]);

  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden w-full max-w-md">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-red-400" />
        <div className="w-3 h-3 rounded-full bg-yellow-400" />
        <div className="w-3 h-3 rounded-full bg-green-400" />
        <span className="ml-2 text-xs text-slate-400 font-medium flex items-center gap-1.5">
          <Search className="h-3 w-3" /> AccountIQ — Investigation
        </span>
      </div>

      <div className="p-4 min-h-[330px]">
        {phase === "analysing" ? (
          <div>
            <div className="flex items-center gap-2 text-[#1B3A5C] text-sm font-semibold mb-3">
              <Activity className="h-4 w-4 animate-pulse" /> Investigating May 2026…
            </div>
            <div className="space-y-2">
              {PREVIEW_STEPS.map((s, i) => {
                const done = i < step, active = i === step;
                return (
                  <div key={i} className={`flex items-center gap-2 text-xs transition-opacity ${done || active ? "opacity-100" : "opacity-30"}`}>
                    {done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      : active ? <div className="h-3.5 w-3.5 rounded-full border-2 border-[#1B3A5C] border-t-transparent animate-spin" />
                      : <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-200" />}
                    <span className="text-slate-600">{s}</span>
                  </div>
                );
              })}
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-4">
              <div className="h-full bg-gradient-to-r from-[#1B3A5C] to-blue-500 transition-all duration-500" style={{ width: `${(step / PREVIEW_STEPS.length) * 100}%` }} />
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> 4 findings · ₹8.5L in play
              </span>
              <span className="text-[10px] text-slate-400">May 2026</span>
            </div>
            <div className="space-y-2">
              {PREVIEW_FINDINGS.map((f, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`h-2 w-2 rounded-full ${SEV_DOT[f.sev]}`} />
                    <span className={`text-[9px] font-semibold rounded px-1.5 py-0.5 ${SEV_PILL[f.sev]}`}>{f.tag}</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-snug">{f.title}</p>
                </div>
              ))}
            </div>
            <Link href="/sample-report" className="mt-3 flex items-center justify-center gap-1 text-xs font-semibold text-[#1B3A5C] hover:underline">
              View the full report <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Scroll reveal (wow on scroll) ────────────────────────────────────────────

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); obs.disconnect(); } },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
    >
      {children}
    </div>
  );
}

// ─── Privacy showcase (highlights protection — never the mechanism) ───────────

const PRIVACY_ROWS = [
  { raw: ["Sharma Traders Pvt Ltd", "INV-2026-0412", "₹2,40,000"], label: "Vendor" },
  { raw: ["Rajesh Auto Components",  "SI-2026-007",   "₹1,56,000"], label: "Customer" },
  { raw: ["Mehta Steel Industries",  "PV-2026-118",   "₹68,000"],   label: "Vendor" },
];

function mask(s: string): string {
  // Display-only masking for the demo — shows the OUTCOME (hidden), not the method.
  return s.replace(/[A-Za-z0-9]/g, "•");
}

function PrivacyShowcase() {
  const [secured, setSecured] = useState(true);

  // Auto-toggle so it feels alive; users can also click.
  useEffect(() => {
    const t = setInterval(() => setSecured((s) => !s), 2600);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your data, before it&apos;s processed</span>
        <button
          onClick={() => setSecured((s) => !s)}
          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 border transition-colors ${
            secured ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
          }`}
        >
          {secured ? <><Lock className="h-3 w-3" /> Protected</> : <><EyeOff className="h-3 w-3" /> Raw values</>}
        </button>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-100">
            <th className="px-4 py-2 font-medium">Party</th>
            <th className="px-4 py-2 font-medium">Reference</th>
            <th className="px-4 py-2 font-medium text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {PRIVACY_ROWS.map((r, i) => (
            <tr key={i} className="border-b border-slate-50 last:border-0">
              <td className="px-4 py-2.5">
                <span className={`font-medium transition-all duration-500 ${secured ? "text-slate-400 tracking-tight blur-[0.3px]" : "text-slate-800"}`}>
                  {secured ? mask(r.raw[0]) : r.raw[0]}
                </span>
              </td>
              <td className="px-4 py-2.5 font-mono text-slate-600">{secured ? mask(r.raw[1]) : r.raw[1]}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{secured ? mask(r.raw[2]) : r.raw[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-3 bg-emerald-50/50 border-t border-emerald-100 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
        <span className="text-[11px] text-emerald-800">
          Names, references and amounts are <b>encrypted &amp; masked</b> before any analysis runs — and never exposed to any AI model.
        </span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-6 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-14">
            <div className="flex-1 space-y-7">
              <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-4 py-1.5 text-sm font-medium">
                <ShieldCheck className="h-3.5 w-3.5" /> Financial Investigation Platform for Indian finance teams
              </div>
              <h1 className="text-4xl lg:text-[3.4rem] font-bold text-[#1B3A5C] leading-[1.08]">
                Upload your financial data.<br />
                <span className="text-blue-600">Know what deserves your attention</span> before it costs you money.
              </h1>
              <p className="text-lg text-slate-600 max-w-xl leading-relaxed">
                AccountIQ automatically investigates your books to surface financial risks, compliance issues, unusual changes and opportunities — so your finance team knows exactly what needs attention before month-end.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/sample-report" className="inline-flex items-center justify-center gap-2 bg-[#1B3A5C] text-white px-7 py-4 rounded-xl font-semibold text-base hover:bg-[#1B3A5C]/90 transition-colors shadow-lg shadow-[#1B3A5C]/20">
                  View a sample investigation <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/contact" className="inline-flex items-center justify-center gap-2 bg-white text-slate-700 px-7 py-4 rounded-xl font-semibold text-base border border-slate-200 hover:border-slate-400 transition-colors">
                  Book a demo
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
                <span className="flex items-center gap-1.5"><Lock className="h-4 w-4 text-slate-400" /> Read-only — never modifies your books</span>
                <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-500" /> Works alongside your ERP</span>
              </div>
            </div>
            <div className="flex-1 flex justify-center w-full">
              <HeroPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── From data to decisions ── */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl font-bold text-[#1B3A5C]">From financial data to financial decisions</h2>
            <p className="text-lg text-slate-600 mt-3">
              Most finance software tells you <span className="font-semibold text-slate-800">what happened</span>. AccountIQ helps you understand <span className="font-semibold text-slate-800">what deserves your attention and why.</span>
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: <Search className="h-6 w-6" />, color: "bg-red-50 text-red-600", title: "Investigate financial risks", desc: "Automatically detect unusual expenses, cash movement, GST mismatches and vendor risks — before they become costly problems." },
              { icon: <FileText className="h-6 w-6" />, color: "bg-blue-50 text-blue-600", title: "Evidence behind every finding", desc: "Every recommendation is backed by invoices, ledger entries and supporting transactions — so your team can trust every insight." },
              { icon: <Sparkles className="h-6 w-6" />, color: "bg-emerald-50 text-emerald-600", title: "Ask follow-up questions", desc: "Need more detail? Just ask. AccountIQ explains every finding in plain English and links back to the underlying data." },
            ].map((c) => (
              <div key={c.title} className="rounded-2xl border border-slate-200 p-6 hover:shadow-md hover:border-slate-300 transition-all">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${c.color}`}>{c.icon}</div>
                <h3 className="font-semibold text-lg text-slate-900 mt-4">{c.title}</h3>
                <p className="text-slate-600 text-sm mt-2 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-20 px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-[#1B3A5C]">How it works</h2>
            <p className="text-lg text-slate-600 mt-3">Three steps from raw data to a decision you can act on.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <div key={s.n} className="relative">
                <div className="w-11 h-11 rounded-full bg-[#1B3A5C] text-white flex items-center justify-center font-bold text-lg">{s.n}</div>
                <h3 className="font-semibold text-lg text-slate-900 mt-4">{s.title}</h3>
                <p className="text-slate-600 text-sm mt-2 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Privacy by design ── */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <Reveal>
            <div>
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1 text-xs font-semibold">
                <ShieldCheck className="h-3.5 w-3.5" /> Privacy by design
              </div>
              <h2 className="text-3xl font-bold text-[#1B3A5C] mt-4">Your numbers never leave your control</h2>
              <p className="text-lg text-slate-600 mt-3 leading-relaxed">
                Sensitive details — vendor and customer names, references and amounts — are encrypted and masked before anything is processed. The investigation runs on protected data, and no AI model ever sees your real business information.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  { icon: <Lock className="h-4 w-4" />, t: "Encrypted before processing", d: "Sensitive fields are protected the moment your file is read." },
                  { icon: <EyeOff className="h-4 w-4" />, t: "Never exposed to AI", d: "Models only ever work on masked values — never your real data." },
                  { icon: <ServerCog className="h-4 w-4" />, t: "Read-only, always", d: "AccountIQ analyses your books — it never modifies them." },
                ].map((x) => (
                  <li key={x.t} className="flex gap-3">
                    <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">{x.icon}</span>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{x.t}</p>
                      <p className="text-slate-500 text-sm">{x.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <PrivacyShowcase />
          </Reveal>
        </div>
      </section>

      {/* ── One investigation, complete visibility ── */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-14">
              <h2 className="text-3xl font-bold text-[#1B3A5C]">One investigation. Complete financial visibility.</h2>
              <p className="text-lg text-slate-600 mt-3">Instead of searching through reports, you receive a single prioritised investigation report.</p>
            </div>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="rounded-2xl border border-slate-200 p-5 hover:shadow-md hover:border-slate-300 transition-all">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.color}`}>{c.icon}</div>
                <h3 className="font-semibold text-slate-900 mt-3">{c.title}</h3>
                <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link href="/sample-report" className="inline-flex items-center gap-2 text-[#1B3A5C] font-semibold hover:underline">
              See a real investigation report <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Before closing your books (the conversion section) ── */}
      <section className="py-20 px-6 bg-[#1B3A5C] text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold">Before closing your books…</h2>
          <p className="text-white/70 text-lg mt-3">Can you confidently answer these questions?</p>
          <div className="grid sm:grid-cols-2 gap-3 mt-10 text-left">
            {[
              "Why did profits change this month?",
              "Are there any GST risks?",
              "Which vendors need attention?",
              "What unusual expenses occurred?",
              "Where is cash leaking?",
              "What should management know?",
            ].map((q) => (
              <div key={q} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                <span className="text-white/90">{q}</span>
              </div>
            ))}
          </div>
          <p className="text-white/70 mt-8">If not — run an AccountIQ investigation.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-5">
            <Link href="/sample-report" className="inline-flex items-center justify-center gap-2 bg-white text-[#1B3A5C] px-7 py-3.5 rounded-xl font-bold hover:bg-slate-100">
              View a sample investigation <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/contact" className="inline-flex items-center justify-center gap-2 border border-white/30 text-white px-7 py-3.5 rounded-xl font-semibold hover:bg-white/10">
              Book a demo
            </Link>
          </div>
        </div>
      </section>

      {/* ── Need more detail (drill-down) ── */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold text-[#1B3A5C]">Need more detail? Just ask.</h2>
            <p className="text-lg text-slate-600 mt-3 leading-relaxed">
              Every finding can be explored further in plain English — no SQL, no report building. The query engine becomes your drill-down tool, not another dashboard to learn.
            </p>
            <ul className="mt-6 space-y-2.5">
              {DRILL_QUESTIONS.map((q) => (
                <li key={q} className="flex items-center gap-3 text-slate-700">
                  <ChevronRight className="h-4 w-4 text-[#1B3A5C] shrink-0" />
                  <span className="text-sm">{q}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex justify-end">
              <div className="bg-[#1B3A5C] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm max-w-xs">Which vendors contributed to the ITC risk?</div>
            </div>
            <div className="flex gap-2 items-start">
              <div className="w-7 h-7 rounded-full bg-[#1B3A5C]/10 flex items-center justify-center shrink-0"><span className="text-xs font-bold text-[#1B3A5C]">IQ</span></div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 flex-1 text-sm text-slate-700">
                Three vendors account for the ₹1,24,500 at risk: Agarwal Stationery (₹12,780), Sindhwani Rubber (₹16,920) and Bright Tools (₹94,300). All three have unfiled GSTR-1 for May.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── What we investigate (replaces testimonials) ── */}
      <section id="investigates" className="py-20 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-[#1B3A5C]">What AccountIQ investigates</h2>
          <p className="text-lg text-slate-600 mt-3">A growing library of investigations, all evidence-backed.</p>
          <div className="flex flex-wrap justify-center gap-3 mt-10">
            {INVESTIGATES.map((i) => (
              <span key={i} className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-2 text-sm font-medium text-slate-700">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {i}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-4">
            <h2 className="text-3xl font-bold text-[#1B3A5C]">Built for finance teams</h2>
            <p className="text-lg text-slate-600 mt-3">Simple pricing. No usage limits. No AI credits. No hidden costs.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            {PLANS.map((p) => (
              <div key={p.name} className={`rounded-2xl border p-6 flex flex-col ${p.highlight ? "border-[#1B3A5C] shadow-xl ring-1 ring-[#1B3A5C]/10 relative" : "border-slate-200"}`}>
                {p.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1B3A5C] text-white text-xs font-semibold px-3 py-1 rounded-full">Most popular</span>}
                <h3 className="font-bold text-lg text-slate-900">{p.name}</h3>
                <p className="text-sm text-slate-500 mt-1 min-h-[40px]">{p.desc}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-slate-900">{p.price}</span>
                  <span className="text-slate-500 text-sm">{p.period}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">{p.annual}</p>
                <Link href={p.name === "Enterprise" ? "/contact" : "/register"}
                  className={`mt-5 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-colors ${p.highlight ? "bg-[#1B3A5C] text-white hover:bg-[#1B3A5C]/90" : "bg-slate-100 text-slate-800 hover:bg-slate-200"}`}>
                  {p.cta}
                </Link>
                <ul className="mt-6 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 px-6 bg-gradient-to-br from-[#1B3A5C] to-[#15314d] text-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl lg:text-4xl font-bold">Your financial investigation partner</h2>
          <p className="text-white/80 text-lg mt-4 leading-relaxed">
            Helping finance teams discover, understand and act — before financial problems become financial losses.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
            <Link href="/sample-report" className="inline-flex items-center justify-center gap-2 bg-white text-[#1B3A5C] px-8 py-4 rounded-xl font-bold hover:bg-slate-100">
              View a sample investigation <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/contact" className="inline-flex items-center justify-center gap-2 border border-white/30 text-white px-8 py-4 rounded-xl font-semibold hover:bg-white/10">
              Book a demo
            </Link>
          </div>
          <p className="text-white/50 text-sm mt-4">No credit card · Read-only · Works alongside your ERP</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between gap-8">
            <div className="max-w-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><span className="text-white text-xs font-bold">IQ</span></div>
                <span className="font-bold text-white text-lg">{BRAND.name}</span>
              </div>
              <p className="font-semibold text-slate-200">Financial Investigation Platform</p>
              <p className="text-sm mt-1">Helping finance teams understand what deserves attention before it costs them money.</p>
            </div>
            <div className="flex gap-12 text-sm">
              <div className="space-y-2">
                <p className="text-slate-200 font-semibold mb-3">Product</p>
                <Link href="/sample-report" className="block hover:text-white">Sample report</Link>
                <a href="#how-it-works" className="block hover:text-white">How it works</a>
                <a href="#pricing" className="block hover:text-white">Pricing</a>
              </div>
              <div className="space-y-2">
                <p className="text-slate-200 font-semibold mb-3">Company</p>
                <Link href="/contact" className="block hover:text-white">Contact</Link>
                <Link href="/privacy" className="block hover:text-white">Privacy</Link>
                <Link href="/terms" className="block hover:text-white">Terms</Link>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 mt-10 pt-6 text-xs flex flex-col sm:flex-row justify-between gap-2">
            <span>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</span>
            <span>Made for Indian finance teams · Read-only · Evidence-backed</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
