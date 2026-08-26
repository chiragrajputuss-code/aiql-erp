"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Check, ArrowRight, ShieldCheck, Clock, IndianRupee, Lock,
  ChevronDown,
} from "lucide-react";

// ─── Founding-free panel ──────────────────────────────────────────────────────

// One real offer, not three. Free for founding firms through 2027 — not
// "forever": a surprise invoice after a silent free year is how goodwill
// dies, so we say plainly what's true today and what changes later.
const INCLUDED = [
  "Unlimited client books",
  "GST/ITC reconciliation + duplicate-payment checks",
  "Every finding with full evidence rows — nothing held back",
  "Vendor filing-pattern intelligence (spot habitual late filers)",
  "Month-end close & flux analysis",
  "Working-paper PDF export",
  "Drill-down questions in plain English",
];

const VALUE = [
  { icon: <Clock className="w-5 h-5 text-emerald-500" />, title: "Hours back every month", body: "What used to take days of comparing reports and chasing mismatches arrives as a prioritised report in minutes." },
  { icon: <IndianRupee className="w-5 h-5 text-amber-500" />, title: "Rupees at risk, surfaced", body: "Blocked ITC, unfiled vendors and duplicate payments — each with the exact amount in play and the action to take." },
  { icon: <Lock className="w-5 h-5 text-violet-500" />, title: "Your data stays yours", body: "Names, references and amounts are encrypted and masked before anything is analysed — never exposed to any AI model." },
];

const FAQ = [
  { q: "Does AcctQAI replace my ERP?", a: "No. AcctQAI works alongside your existing accounting software — Tally, Zoho or any GL export. It reads your data and investigates it; it never replaces your books." },
  { q: "Does AcctQAI modify my accounting data?", a: "Never. AcctQAI is strictly read-only. It analyses your data and recommends actions — every change stays in your hands." },
  { q: "Is this just another reporting tool?", a: "No. Reports tell you what happened. AcctQAI tells you what deserves your attention and why — with the supporting evidence and a recommended action for every finding." },
  { q: "Is this an AI chatbot wrapped around my books?", a: "No. Every finding is computed by fixed accounting rules — run the same file twice and you get the same report, to the rupee. AI is only used to phrase the summary; it never calculates a number, never sees your real names or amounts (they're masked first), and the report works even with the AI switched off. That's also why we never charge AI credits or per-query fees." },
  { q: "Is there a free trial?", a: "No trial and no card required. AcctQAI is free for founding firms through 2027 — run full investigations on every client book you upload, with every finding and all the evidence." },
  { q: "Will AcctQAI always be free?", a: "No — we'll introduce pricing after 2027. Founding firms (anyone signed up before then) will get advance notice and preferential terms. We won't turn on a surprise invoice." },
  { q: "Is my data safe?", a: "Your data is stored in AWS Mumbai (ap-south-1), isolated per organisation. Sensitive fields — vendor and customer names, references and amounts — are encrypted and masked before any analysis runs, and are never exposed to any AI model." },
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
          <div className="w-8 h-8 rounded-lg bg-[#1B3A5C] flex items-center justify-center"><span className="text-white text-xs font-bold">AQ</span></div>
          <span className="text-lg font-bold text-[#1B3A5C]">AcctQAI</span>
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
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Free for founding firms — through 2027.</h1>
            <p className="text-slate-500 text-lg max-w-xl mx-auto leading-relaxed mt-3">
              Every finding, every client book, full evidence — nothing held back and nothing charged while we build AcctQAI with our first users.
            </p>
          </div>
        </Reveal>

        {/* Founding panel */}
        <Reveal>
          <div className="rounded-2xl border border-[#1B3A5C] shadow-xl ring-1 ring-[#1B3A5C]/10 p-8 max-w-lg mx-auto">
            <h3 className="font-bold text-lg text-slate-900">Founding access</h3>
            <p className="text-sm text-slate-500 mt-1">Everything, for every client you upload.</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-slate-900 tabular-nums">₹0</span>
              <span className="text-slate-500 text-sm">through 2027</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">No credit card required</p>
            <Link href="/signup" className="mt-5 inline-flex w-full items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-colors bg-[#1B3A5C] text-white hover:bg-[#1B3A5C]/90">
              Start free <ArrowRight className="h-4 w-4" />
            </Link>
            <ul className="mt-6 space-y-2.5">
              {INCLUDED.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /> {f}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-400 mt-6 pt-4 border-t border-slate-100 leading-relaxed">
              Free for founding firms through 2027. We&apos;ll introduce pricing after that — founding firms will get notice and preferential terms.
            </p>
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
            <h2 className="text-2xl font-bold">See what AcctQAI finds in your books</h2>
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
