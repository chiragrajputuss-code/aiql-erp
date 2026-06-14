"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MessageSquare, Upload, Zap, Shield, Bell, FileSearch,
  GitCompare, CheckCircle2, ChevronRight, ArrowRight,
  BarChart3, AlertCircle, TrendingUp, Check, Star,
  Menu, X, Play,
} from "lucide-react";

// ─── Brand ───────────────────────────────────────────────────────────────────

const BRAND = {
  name: "AccountIQ",
  tagline: "Ask your books anything.",
  description: "AI-powered financial intelligence for Indian SMEs. Connect your Tally, Zoho or GL export — ask questions in plain English, catch compliance issues automatically, never miss a tax deadline.",
  primary: "#1B3A5C",
  accent: "#2563EB",
};

// ─── Demo chat data ───────────────────────────────────────────────────────────

const DEMO_QA = [
  {
    q: "What is my total GST liability for Q2?",
    a: "Your Q2 GST liability is ₹4,82,310 — CGST ₹2,18,440 · SGST ₹2,18,440 · IGST ₹45,430. Filing due in 8 days.",
    rows: [
      { Month: "July 2025", CGST: "₹68,200", SGST: "₹68,200", IGST: "₹14,100" },
      { Month: "August 2025", CGST: "₹79,440", SGST: "₹79,440", IGST: "₹18,200" },
      { Month: "September 2025", CGST: "₹70,800", SGST: "₹70,800", IGST: "₹13,130" },
    ],
  },
  {
    q: "Show top 5 vendors by payment this year",
    a: "5 vendors · ₹38,24,500 total payments this financial year.",
    rows: [
      { Vendor: "Infosys BPM Ltd", Amount: "₹12,40,000", TDS: "₹1,24,000" },
      { Vendor: "Tata Consultancy", Amount: "₹9,80,000", TDS: "₹98,000" },
      { Vendor: "Wipro Ltd", Amount: "₹7,20,000", TDS: "₹72,000" },
      { Vendor: "HCL Technologies", Amount: "₹5,44,500", TDS: "₹54,450" },
      { Vendor: "Tech Mahindra", Amount: "₹3,40,000", TDS: "₹34,000" },
    ],
  },
  {
    q: "Any overdue vendor payments?",
    a: "3 vendors have payments overdue by more than 30 days. Total overdue: ₹6,84,200.",
    rows: [
      { Vendor: "Sharma Traders", Overdue: "₹2,40,000", Days: "45 days" },
      { Vendor: "Mehta Supplies", Overdue: "₹1,94,200", Days: "38 days" },
      { Vendor: "Kumar & Sons", Overdue: "₹2,50,000", Days: "32 days" },
    ],
  },
  {
    q: "Compare Q1 vs Q2 total expenses",
    a: "Expenses increased 18.4% from Q1 to Q2. Biggest jump in employee costs (+32%) and office expenses (+24%).",
    rows: [
      { Category: "Employee costs", "Q1": "₹8,40,000", "Q2": "₹11,09,000", Change: "+32%" },
      { Category: "Office expenses", "Q1": "₹1,20,000", "Q2": "₹1,49,000", Change: "+24%" },
      { Category: "Travel", "Q1": "₹84,000", "Q2": "₹91,000", Change: "+8%" },
      { Category: "Software", "Q1": "₹62,000", "Q2": "₹64,000", Change: "+3%" },
    ],
  },
  {
    q: "Is my TDS deducted and deposited correctly?",
    a: "⚠️ Found a mismatch — ₹48,200 TDS deducted but only ₹42,000 deposited. Section 194J under-deposited.",
    rows: [
      { Section: "194C", Deducted: "₹24,000", Deposited: "₹24,000", Status: "✅ OK" },
      { Section: "194J", Deducted: "₹48,200", Deposited: "₹42,000", Status: "⚠️ Gap ₹6,200" },
      { Section: "194H", Deducted: "₹18,000", Deposited: "₹18,000", Status: "✅ OK" },
    ],
  },
  {
    q: "What is my cash position today?",
    a: "Current cash & bank balance: ₹24,18,440 across 3 accounts.",
    rows: [
      { Account: "HDFC Current A/c", Balance: "₹14,20,000" },
      { Account: "SBI Savings A/c", Balance: "₹8,44,440" },
      { Account: "Petty Cash", Balance: "₹1,54,000" },
    ],
  },
];

// ─── Features ────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: <MessageSquare className="h-6 w-6" />,
    title: "Ask in plain English",
    desc: "Type any finance question naturally. No SQL, no formulas, no training needed. Get instant answers from your actual GL data.",
    magic: "\"What is my GST liability this quarter?\" → answered in 2 seconds",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: <Bell className="h-6 w-6" />,
    title: "Daily Pulse at 8 AM",
    desc: "Every morning, AccountIQ emails you a digest of compliance deadlines, TDS alerts, and cashflow warnings — before your day starts.",
    magic: "Never miss a GST filing, TDS deposit, or advance tax instalment",
    color: "bg-amber-50 text-amber-600",
  },
  {
    icon: <FileSearch className="h-6 w-6" />,
    title: "Document Scanner",
    desc: "Upload Form 26Q, GSTR-1, GSTR-3B, or ITR. AccountIQ scans for errors — wrong PAN, rate deviations, missing HSN codes.",
    magic: "Caught ₹6,200 TDS under-deposit before the penalty notice arrived",
    color: "bg-red-50 text-red-600",
  },
  {
    icon: <GitCompare className="h-6 w-6" />,
    title: "GL Reconciliation",
    desc: "Automatically cross-match your GL against Form 26Q and GSTR-1. Every invoice, every deductee — reconciled in seconds.",
    magic: "Invoice in GSTR-1 but missing from GL — flagged automatically",
    color: "bg-purple-50 text-purple-600",
  },
  {
    icon: <CheckCircle2 className="h-6 w-6" />,
    title: "Month-end Close",
    desc: "Structured close checklist, reconciliation tasks, and flux analysis. Know exactly what's pending and who owns it.",
    magic: "Close time reduced from 5 days to 1 day for our beta customers",
    color: "bg-green-50 text-green-600",
  },
  {
    icon: <Shield className="h-6 w-6" />,
    title: "PII Protection built-in",
    desc: "Vendor names, customer names, and amounts are masked before reaching the AI. Your sensitive data never leaves your account.",
    magic: "AI sees tokens — your actual data stays in your database",
    color: "bg-slate-50 text-slate-600",
  },
];

// ─── How it works ────────────────────────────────────────────────────────────

const STEPS = [
  {
    number: "01",
    title: "Connect your books",
    desc: "Upload your Tally export, Zoho Books GL, or any Excel/CSV file. Takes 60 seconds. No IT required.",
    detail: "Supports Tally XML, Zoho Books exports, and any standard GL format. Column mapping is automatic.",
  },
  {
    number: "02",
    title: "Ask anything",
    desc: "Type your question in plain English. AccountIQ understands Indian accounting — GST, TDS, ledger names, voucher types.",
    detail: "3-layer AI pipeline: template engine first (free, instant), then learned patterns, then LLM. 70% of queries answered without AI cost.",
  },
  {
    number: "03",
    title: "Get answers + alerts",
    desc: "Instant answers with real numbers from your data. Plus proactive alerts for compliance deadlines and anomalies.",
    detail: "All answers computed server-side from actual rows — no AI hallucination. Every number is traceable to source.",
  },
];

// ─── Pricing ─────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: "Starter",
    price: "₹999",
    period: "/month",
    annual: "₹9,990/year (save 2 months)",
    desc: "Perfect for a single business owner or CA managing one entity.",
    cta: "Start free trial",
    highlight: false,
    features: [
      "1 connection",
      "GL file uploads",
      "100 AI queries/month",
      "Hindi / Hinglish queries",
      "1 team member",
      "Email support",
    ],
    missing: [
      "Document scanner (26Q, GSTR)",
      "Daily Pulse emails",
      "GL Reconciliation",
      "Close engine",
    ],
  },
  {
    name: "Growth",
    price: "₹2,999",
    period: "/month",
    annual: "₹29,990/year (save 2 months)",
    desc: "For growing businesses and CAs managing multiple clients.",
    cta: "Start free trial",
    highlight: true,
    features: [
      "5 connections",
      "GL file uploads",
      "500 AI queries/month",
      "Hindi / Hinglish queries",
      "5 team members",
      "Document scanner (26Q, GSTR-1, GSTR-3B, ITR)",
      "Daily Pulse emails at 8 AM IST",
      "GL ↔ 26Q reconciliation",
      "GL ↔ GSTR-1 reconciliation",
      "Month-end close engine",
      "Priority email support",
    ],
    missing: [],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    annual: "Annual billing only",
    desc: "For large firms, multi-entity groups, and enterprise finance teams.",
    cta: "Contact us",
    highlight: false,
    features: [
      "Unlimited connections",
      "Unlimited AI queries",
      "Unlimited team members",
      "Tally & Zoho Books live connector",
      "Custom SQL templates",
      "White-label option",
      "Dedicated account manager",
      "SLA guarantee",
      "On-premise deployment option",
    ],
    missing: [],
  },
];

// ─── Testimonials (placeholder) ───────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote: "We used to spend 3 days every month just reconciling TDS. AccountIQ does it in minutes and catches mismatches we always missed.",
    name: "Rajesh Mehta",
    role: "CFO, Mumbai",
    stars: 5,
  },
  {
    quote: "My clients ask me questions constantly. Now I just open AccountIQ and type the question — the answer is there in seconds with the actual numbers.",
    name: "CA Priya Sharma",
    role: "Chartered Accountant, Pune",
    stars: 5,
  },
  {
    quote: "The 8 AM pulse email is the first thing I read every morning. It told me about an advance tax deadline I had completely forgotten about.",
    name: "Anita Gupta",
    role: "Finance Manager, Bengaluru",
    stars: 5,
  },
];

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#1B3A5C] flex items-center justify-center">
            <span className="text-white text-xs font-bold">IQ</span>
          </div>
          <span className="font-bold text-[#1B3A5C] text-lg">{BRAND.name}</span>
        </div>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {["Features", "How it works", "Pricing"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/ /g, "-")}`}
              className="text-sm text-slate-600 hover:text-[#1B3A5C] transition-colors font-medium"
            >
              {item}
            </a>
          ))}
        </div>

        {/* CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900 font-medium px-4 py-2">
            Log in
          </Link>
          <Link
            href="/register"
            className="text-sm bg-[#1B3A5C] text-white px-5 py-2 rounded-lg font-medium hover:bg-[#1B3A5C]/90 transition-colors"
          >
            Start free trial
          </Link>
        </div>

        {/* Mobile menu button */}
        <button className="md:hidden p-2" onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-white border-t border-slate-100 px-6 py-4 space-y-4">
          {["Features", "How it works", "Pricing"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/ /g, "-")}`}
              className="block text-sm text-slate-600 font-medium py-2"
              onClick={() => setOpen(false)}
            >
              {item}
            </a>
          ))}
          <Link href="/login" className="block text-sm text-slate-600 py-2">Log in</Link>
          <Link href="/register" className="block text-sm bg-[#1B3A5C] text-white px-5 py-2.5 rounded-lg font-medium text-center">
            Start free trial
          </Link>
        </div>
      )}
    </nav>
  );
}

// ─── Interactive Demo ─────────────────────────────────────────────────────────

function InteractiveDemo() {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = DEMO_QA[activeIdx];
  const cols = Object.keys(active.rows[0]);

  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-w-2xl w-full">
      {/* Window chrome */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-red-400" />
        <div className="w-3 h-3 rounded-full bg-yellow-400" />
        <div className="w-3 h-3 rounded-full bg-green-400" />
        <span className="ml-2 text-xs text-slate-400 font-medium">AccountIQ — AI Chat</span>
      </div>

      {/* Question chips */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
          Try a sample question
        </p>
        <div className="flex flex-wrap gap-1.5">
          {DEMO_QA.map((item, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                activeIdx === i
                  ? "bg-[#1B3A5C] text-white border-[#1B3A5C]"
                  : "bg-white text-slate-600 border-slate-200 hover:border-[#1B3A5C] hover:text-[#1B3A5C]"
              }`}
            >
              {item.q.length > 30 ? item.q.slice(0, 30) + "…" : item.q}
            </button>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className="px-4 pb-4 space-y-3">
        {/* User message */}
        <div className="flex justify-end">
          <div className="bg-[#1B3A5C] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-xs text-sm">
            {active.q}
          </div>
        </div>

        {/* Assistant message */}
        <div className="flex gap-2 items-start">
          <div className="w-7 h-7 rounded-full bg-[#1B3A5C]/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-[#1B3A5C]">IQ</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded">
                Template
              </span>
              <span className="text-[10px] text-slate-400">answered in 48ms</span>
            </div>
            <p className="text-sm font-medium text-slate-900 mb-2">{active.a}</p>

            {/* Mini table */}
            <div className="rounded border border-slate-100 overflow-hidden text-xs">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    {cols.map((c) => (
                      <th key={c} className="px-2 py-1.5 text-left text-slate-500 font-medium border-r last:border-0 whitespace-nowrap">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {active.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      {cols.map((c) => (
                        <td key={c} className="px-2 py-1.5 text-slate-700 border-r last:border-0 whitespace-nowrap">
                          {(row as Record<string, string>)[c]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Input bar (decorative) */}
      <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50 flex items-center gap-2">
        <div className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-400">
          Ask about your GL data…
        </div>
        <div className="w-9 h-9 bg-[#1B3A5C] rounded-xl flex items-center justify-center">
          <ChevronRight className="h-4 w-4 text-white" />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-20 px-6 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            {/* Left */}
            <div className="flex-1 space-y-8">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-4 py-1.5 text-sm font-medium">
                <Zap className="h-3.5 w-3.5" />
                Built for Indian SMEs · GST + TDS + GL
              </div>

              {/* Headline */}
              <div className="space-y-3">
                <h1 className="text-5xl lg:text-6xl font-bold text-[#1B3A5C] leading-tight">
                  Ask your books<br />
                  <span className="text-blue-600">anything.</span>
                </h1>
                <p className="text-xl text-slate-600 max-w-lg leading-relaxed">
                  {BRAND.description}
                </p>
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center gap-2 bg-[#1B3A5C] text-white px-8 py-4 rounded-xl font-semibold text-base hover:bg-[#1B3A5C]/90 transition-colors shadow-lg shadow-[#1B3A5C]/20"
                >
                  Start free trial — 14 days
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center gap-2 bg-white text-slate-700 px-8 py-4 rounded-xl font-semibold text-base border border-slate-200 hover:border-slate-400 transition-colors"
                >
                  <Play className="h-4 w-4" />
                  See how it works
                </a>
              </div>

              {/* Trust signals */}
              <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500">
                <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-500" />No credit card required</span>
                <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-500" />Setup in 60 seconds</span>
                <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-500" />Cancel anytime</span>
              </div>
            </div>

            {/* Right — Interactive demo */}
            <div className="flex-1 flex justify-center">
              <InteractiveDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ─────────────────────────────────────────────────────── */}
      <section className="border-y border-slate-100 bg-white py-10 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: "< 2s", label: "Average query time" },
            { value: "70%", label: "Queries answered free (no AI cost)" },
            { value: "₹0", label: "Cost for template queries" },
            { value: "8 AM", label: "Daily compliance pulse" },
          ].map(({ value, label }) => (
            <div key={label}>
              <div className="text-3xl font-bold text-[#1B3A5C]">{value}</div>
              <div className="text-sm text-slate-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-[#1B3A5C]">Up and running in 60 seconds</h2>
            <p className="text-slate-500 mt-3 text-lg">No IT setup. No training. No SQL.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((step) => (
              <div key={step.number} className="relative">
                {/* Connector line */}
                <div className="hidden md:block absolute top-8 left-full w-full h-px bg-slate-200 -translate-x-8 z-0" />

                <div className="bg-white rounded-2xl p-8 border border-slate-200 relative z-10 h-full">
                  <div className="text-5xl font-bold text-slate-100 mb-4">{step.number}</div>
                  <h3 className="text-xl font-bold text-[#1B3A5C] mb-3">{step.title}</h3>
                  <p className="text-slate-600 mb-4 leading-relaxed">{step.desc}</p>
                  <p className="text-xs text-slate-400 leading-relaxed border-t border-slate-100 pt-4">
                    {step.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features / Magic ──────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-[#1B3A5C]">The magic it does</h2>
            <p className="text-slate-500 mt-3 text-lg max-w-xl mx-auto">
              Six things AccountIQ does automatically that used to take your team hours every month.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-slate-200 p-6 hover:shadow-lg hover:border-slate-300 transition-all duration-200 bg-white"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${f.color}`}>
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold text-[#1B3A5C] mb-2">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-4">{f.desc}</p>
                <div className="flex items-start gap-2 bg-slate-50 rounded-lg px-3 py-2.5 mt-auto">
                  <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-600 italic">{f.magic}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Compliance section ────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-gradient-to-br from-[#1B3A5C] to-[#0f2238] text-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-sm">
                <Bell className="h-3.5 w-3.5 text-amber-400" />
                Daily Pulse — 8 AM every morning
              </div>
              <h2 className="text-4xl font-bold">Never miss a compliance deadline again</h2>
              <p className="text-slate-300 text-lg leading-relaxed">
                AccountIQ monitors your GL continuously and sends a personalized compliance digest every morning — GST filing dates, TDS deposit deadlines, advance tax instalments, and cashflow warnings.
              </p>
              <div className="space-y-3">
                {[
                  "GSTR-1 due in 3 days · ₹4,82,310 liability",
                  "TDS deposit overdue · Section 194J · ₹6,200 gap",
                  "Advance tax instalment · 15 Dec · ₹1,20,000 due",
                  "Vendor payment overdue · 3 vendors · ₹6,84,200",
                ].map((alert) => (
                  <div key={alert} className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3">
                    <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                    <span className="text-sm text-slate-200">{alert}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white/10 rounded-2xl p-6 border border-white/10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="font-semibold">Monthly Snapshot</div>
                    <div className="text-xs text-slate-400">October 2025</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Total Revenue", value: "₹48,40,000" },
                    { label: "Total Expenses", value: "₹31,20,000" },
                    { label: "GST Liability", value: "₹4,82,310" },
                    { label: "Net Profit", value: "₹17,20,000" },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white/10 rounded-xl p-3">
                      <div className="text-xs text-slate-400 mb-1">{label}</div>
                      <div className="font-bold text-lg">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 bg-green-500/20 border border-green-500/30 rounded-xl px-4 py-3">
                <TrendingUp className="h-4 w-4 text-green-400" />
                <span className="text-sm text-green-300">Revenue up 12% vs last month · 3 compliance alerts</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ──────────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-[#1B3A5C]">Trusted by finance teams across India</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-slate-700 leading-relaxed mb-6 text-sm">"{t.quote}"</p>
                <div>
                  <div className="font-semibold text-[#1B3A5C] text-sm">{t.name}</div>
                  <div className="text-xs text-slate-400">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-[#1B3A5C]">Simple, transparent pricing</h2>
            <p className="text-slate-500 mt-3 text-lg">14-day free trial on all plans. No credit card required.</p>
            <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 border border-green-100 rounded-full px-4 py-1.5 text-sm font-medium mt-4">
              <Check className="h-3.5 w-3.5" />
              Annual billing saves 2 months
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 items-start">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl border p-8 relative ${
                  plan.highlight
                    ? "border-[#1B3A5C] shadow-xl shadow-[#1B3A5C]/10 bg-white"
                    : "border-slate-200 bg-white"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#1B3A5C] text-white text-xs font-semibold px-4 py-1 rounded-full">
                    Most Popular
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-lg font-bold text-[#1B3A5C]">{plan.name}</h3>
                  <p className="text-slate-500 text-sm mt-1">{plan.desc}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-[#1B3A5C]">{plan.price}</span>
                    <span className="text-slate-400 text-sm">{plan.period}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{plan.annual}</p>
                </div>

                <Link
                  href={plan.name === "Enterprise" ? "mailto:sales@accountiq.in" : "/register"}
                  className={`w-full block text-center py-3 rounded-xl font-semibold text-sm transition-colors mb-6 ${
                    plan.highlight
                      ? "bg-[#1B3A5C] text-white hover:bg-[#1B3A5C]/90"
                      : "bg-slate-100 text-[#1B3A5C] hover:bg-slate-200"
                  }`}
                >
                  {plan.cta}
                </Link>

                <div className="space-y-2.5">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-slate-700">{f}</span>
                    </div>
                  ))}
                  {plan.missing.map((f) => (
                    <div key={f} className="flex items-start gap-2.5 text-sm opacity-40">
                      <X className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                      <span className="text-slate-500">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-gradient-to-br from-[#1B3A5C] to-[#0f2238]">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <h2 className="text-4xl lg:text-5xl font-bold text-white">
            Your books are talking.<br />Are you listening?
          </h2>
          <p className="text-slate-300 text-lg">
            Join finance teams across India who use AccountIQ to close faster, stay compliant, and get instant answers from their GL data.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 bg-white text-[#1B3A5C] px-8 py-4 rounded-xl font-bold text-base hover:bg-slate-100 transition-colors shadow-lg"
            >
              Start free for 14 days
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="mailto:sales@accountiq.in"
              className="inline-flex items-center justify-center gap-2 border border-white/30 text-white px-8 py-4 rounded-xl font-semibold text-base hover:bg-white/10 transition-colors"
            >
              Talk to us
            </a>
          </div>
          <p className="text-slate-400 text-sm">No credit card · Setup in 60 seconds · Cancel anytime</p>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="bg-[#0a1929] text-slate-400 py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">IQ</span>
                </div>
                <span className="font-bold text-white">{BRAND.name}</span>
              </div>
              <p className="text-sm leading-relaxed">AI-powered financial intelligence for Indian SMEs.</p>
            </div>
            {[
              { title: "Product", links: ["Features", "Pricing", "Security", "Changelog"] },
              { title: "Company", links: ["About", "Blog", "Careers", "Contact"] },
              { title: "Legal", links: ["Privacy", "Terms", "Refund Policy"] },
            ].map(({ title, links }) => (
              <div key={title}>
                <h4 className="text-white font-semibold text-sm mb-3">{title}</h4>
                <ul className="space-y-2">
                  {links.map((l) => (
                    <li key={l}>
                      <a href="#" className="text-sm hover:text-white transition-colors">{l}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs">© {new Date().getFullYear()} AccountIQ · Made in India 🇮🇳</p>
            <p className="text-xs">GST · TDS · GL · Tally · Zoho Books · Indian SMEs</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
