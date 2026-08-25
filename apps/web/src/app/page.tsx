"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Search, ShieldCheck, ArrowRight, IndianRupee,
  TrendingUp, Check, Menu, X, Receipt, Wallet, Users,
  FileText, Sparkles, Lock, CheckCircle2, ChevronRight, EyeOff, ServerCog,
  Building2, Briefcase, Layers, Fingerprint, FileSearch, Boxes, Loader2,
} from "lucide-react";

// ─── Brand ───────────────────────────────────────────────────────────────────

const BRAND = {
  name: "AcctQAI",
  primary: "#1B3A5C",
};

// ─── Hero interactive preview data — real findings, surfaced immediately ──────

type HeroSev = "critical" | "warning" | "opportunity";

const HERO_FINDINGS: {
  sev: HeroSev; cat: string; impact: string; title: string; vendor: string; reason: string; action: string;
}[] = [
  {
    sev: "critical", cat: "GST & Compliance", impact: "₹4,80,000",
    title: "Input Tax Credit blocked", vendor: "ABC Industries",
    reason: "Vendor hasn't filed GSTR-1 — this credit will be reversed.",
    action: "Hold payment and send a filing reminder today.",
  },
  {
    sev: "critical", cat: "Risk & Control", impact: "₹68,000",
    title: "Duplicate payment detected", vendor: "Mehta Steel Industries",
    reason: "Invoice INV-MSI-041 was paid twice — on 7 May and 22 May.",
    action: "Recover ₹68,000 from the vendor or adjust the next bill.",
  },
  {
    sev: "opportunity", cat: "GST & Compliance", impact: "₹15,000",
    title: "ITC available but not booked", vendor: "Sunrise Lubricants",
    reason: "GSTR-2B shows credit you haven't claimed — the invoice isn't in your books.",
    action: "Book the invoice and claim the credit before GSTR-3B.",
  },
];

// Severity that screams — critical is visually dominant.
const HERO_SEV: Record<HeroSev, { card: string; bar: string; pill: string; impact: string; dot: string; label: string }> = {
  critical:    { card: "bg-red-50 border-red-200",      bar: "bg-red-500",     pill: "bg-red-600 text-white",        impact: "text-red-600",     dot: "bg-red-500",     label: "CRITICAL" },
  warning:     { card: "bg-amber-50 border-amber-200",  bar: "bg-amber-400",   pill: "bg-amber-500 text-white",      impact: "text-amber-600",   dot: "bg-amber-500",   label: "NEEDS ATTENTION" },
  opportunity: { card: "bg-emerald-50 border-emerald-200", bar: "bg-emerald-400", pill: "bg-emerald-600 text-white", impact: "text-emerald-600", dot: "bg-emerald-500", label: "OPPORTUNITY" },
};

// ─── Drill-down questions (AI is a follow-up tool, not the hero) ───────────────

const DRILL_QUESTIONS = [
  "Why did expenses increase this month?",
  "Show the invoices behind this finding.",
  "Which vendors contributed to this issue?",
  "Explain this recommendation in detail.",
];

// ─── What we investigate ──────────────────────────────────────────────────────

// The checks the investigation engine actually runs today (GST-ITC-001…005 +
// DUP-PAY-001…002). Seven — not a marketing number.
const INVESTIGATES = [
  "Purchase invoices missing from GSTR-2B",
  "Vendor hasn't filed GSTR-1",
  "ITC marked ineligible",
  "ITC available but not booked",
  "Supplier name mismatch",
  "Duplicate payment (same bill, paid twice)",
  "Probable duplicate (same payee & amount)",
];

// ─── Capabilities (one investigation, complete visibility) ────────────────────

// Only what the product actually does today. Anything not built is listed
// separately under "Coming soon" — never implied here.
const CAPABILITIES = [
  { icon: <Receipt className="h-5 w-5" />,    title: "GST & ITC",           desc: "Reconcile your books against GSTR-2B — blocked credit, unfiled vendors, ineligible ITC.", color: "bg-blue-50 text-blue-600" },
  { icon: <Wallet className="h-5 w-5" />,     title: "Duplicate Payments",  desc: "Catch the same bill paid twice, with both vouchers as evidence.", color: "bg-red-50 text-red-600" },
  { icon: <Users className="h-5 w-5" />,      title: "Vendor ITC Scorecard", desc: "See which vendors repeatedly put your input tax credit at risk.", color: "bg-purple-50 text-purple-600" },
  { icon: <TrendingUp className="h-5 w-5" />, title: "Month-End Close",     desc: "Flux analysis on every account — what changed vs last period, and why.", color: "bg-amber-50 text-amber-600" },
  { icon: <FileText className="h-5 w-5" />,   title: "Executive Summary",   desc: "A board-ready brief of the month's findings, written for you.", color: "bg-slate-100 text-slate-600" },
];

// Things you can ASK (query engine, 50+ templates) — real, but answered on
// demand, not surfaced automatically. Kept distinct from investigations.
const ASKABLE = [
  "Cash & bank balance", "Overdue debtors (30/60/90)", "Profit & loss summary",
  "Expense by voucher type", "TDS summary", "Vendor & customer ledgers",
  "Purchase & sales registers", "Bank reconciliation",
];

// Not built yet. Stated plainly rather than implied.
const COMING_SOON = ["Receivables investigation", "Cash-flow monitoring", "Tally & Zoho auto-sync"];

// ─── How it works ─────────────────────────────────────────────────────────────

const STEPS = [
  { n: "1", title: "Upload your files", desc: "The exports you already have from Tally or your accounting software. Takes two minutes. Nothing to install, nothing changes in your books." },
  { n: "2", title: "We check them", desc: "AcctQAI goes through your books the way a careful accountant would — every entry, not a sample." },
  { n: "3", title: "You see what's leaking", desc: "A simple report: what's wrong, how many rupees are involved, and what to do about it. Every finding comes with the proof, so you can verify it yourself." },
];

// ─── Pricing ──────────────────────────────────────────────────────────────────

// Two real tiers: findings and evidence are never paywalled. Firm pricing is
// per PRACTICE, not per client — that is how CA firms actually buy software.
const PLANS = [
  {
    name: "Free", price: "₹0", period: "", annual: "Free forever · no card",
    desc: "Prove it on your own files. No expiry.", cta: "Start free", highlight: false,
    features: ["2 client books per month", "GST/ITC + duplicate-payment checks", "Every finding with full evidence rows", "Vendor filing-pattern intelligence", "Month-end close & flux analysis", "Drill-down questions in plain English"],
  },
  {
    name: "Firm", price: "₹30,000", period: "/year", annual: "Per firm · unlimited clients",
    desc: "For CA practices. One price, your whole client book.", cta: "Start free", highlight: true,
    features: ["Everything in Free", "Unlimited client books", "Working-paper PDF export with evidence annexure", "Whole-practice scan in one pass", "Named WhatsApp support through filing season", "5 team members"],
  },
  {
    name: "Custom", price: "Let's talk", period: "", annual: "Multi-entity groups",
    desc: "Group structures and special requirements.", cta: "Talk to us", highlight: false,
    features: ["Everything in Firm", "Multi-entity / group structures", "Custom investigations (built with you)", "Dedicated onboarding"],
  },
];

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar() {
  const [open, setOpen] = useState(false);
  const links = [
    { label: "For CAs", href: "#for-cas" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
    { label: "Resources", href: "/resources" },
    { label: "Sample report", href: "/sample-report" },
  ];
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#1B3A5C] flex items-center justify-center">
            <span className="text-white text-xs font-bold">AQ</span>
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
          <Link href="/signup" className="text-sm bg-[#1B3A5C] text-white px-5 py-2 rounded-lg font-medium hover:bg-[#1B3A5C]/90 transition-colors">Start free</Link>
        </div>
        <button className="md:hidden p-2" onClick={() => setOpen(!open)}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      </div>
      {open && (
        <div className="md:hidden bg-white border-t border-slate-100 px-6 py-4 space-y-4">
          {links.map((l) => (
            <a key={l.label} href={l.href} className="block text-sm text-slate-600 font-medium py-2" onClick={() => setOpen(false)}>{l.label}</a>
          ))}
          <Link href="/login" className="block text-sm text-slate-600 py-2">Log in</Link>
          <Link href="/signup" className="block text-sm bg-[#1B3A5C] text-white px-5 py-2.5 rounded-lg font-medium text-center">Start free</Link>
        </div>
      )}
    </nav>
  );
}

// ─── Hero interactive preview ─────────────────────────────────────────────────

function HeroPreview() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % HERO_FINDINGS.length), 4200);
    return () => clearInterval(t);
  }, []);

  const f = HERO_FINDINGS[idx];
  const s = HERO_SEV[f.sev];

  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden w-full max-w-md">
      {/* Window chrome */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
          <span className="ml-2 text-xs text-slate-400 font-medium flex items-center gap-1.5">
            <Search className="h-3 w-3" /> Investigation Report · May 2026
          </span>
        </div>
        <span className="text-[10px] font-semibold text-slate-500">3 findings · ₹6.2L</span>
      </div>

      {/* One real finding, screaming by severity */}
      <div className="p-4 min-h-[300px] flex flex-col">
        <div key={idx} className={`rounded-xl border-l-[5px] border ${s.card} p-4 animate-in fade-in slide-in-from-bottom-2 duration-500 flex-1`} style={{ borderLeftColor: "currentColor" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className={`h-2.5 w-2.5 rounded-full ${s.dot} ${f.sev === "critical" ? "animate-pulse" : ""}`} />
            <span className={`text-[10px] font-bold rounded px-2 py-0.5 ${s.pill}`}>{s.label}</span>
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">{f.cat}</span>
          </div>

          <div className="flex items-end justify-between gap-3">
            <p className="font-semibold text-slate-900 text-[15px]">{f.title}</p>
            <p className={`text-2xl font-extrabold tabular-nums shrink-0 ${s.impact}`}>{f.impact}</p>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{f.vendor}</p>

          <div className="mt-3 pt-3 border-t border-black/5 space-y-1.5">
            <p className="text-xs text-slate-600"><span className="font-semibold text-slate-700">Why:</span> {f.reason}</p>
            <p className="text-xs text-slate-600"><span className="font-semibold text-slate-700">Do this:</span> {f.action}</p>
          </div>
        </div>

        {/* dots + link */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-1.5">
            {HERO_FINDINGS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-5 bg-[#1B3A5C]" : "w-1.5 bg-slate-200"}`} />
            ))}
          </div>
          <Link href="/sample-report" className="flex items-center gap-1 text-xs font-semibold text-[#1B3A5C] hover:underline">
            See the full report <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
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

// ─── Practice scanner (the CA multiplier) ─────────────────────────────────────
//
// Shows the OUTCOME of one pass across a whole client book: books scanned,
// issues found, money surfaced — with findings streaming in. Client identities
// are masked (•). The finding *types* are the value we show; the detection
// method is never shown here or anywhere. This doubles as the privacy signal.

type ScanTone = "critical" | "warning" | "opportunity";

const SCAN_TONE: Record<ScanTone, { dot: string; text: string; chip: string }> = {
  critical:    { dot: "bg-red-500",     text: "text-red-600",     chip: "border-red-200 bg-red-50" },
  warning:     { dot: "bg-amber-500",   text: "text-amber-600",   chip: "border-amber-200 bg-amber-50" },
  opportunity: { dot: "bg-emerald-500", text: "text-emerald-600", chip: "border-emerald-200 bg-emerald-50" },
};

type ScanClient = { name: string; issue: null | { label: string; tone: ScanTone; amount: number } };

const SCAN_CLIENTS: ScanClient[] = [
  { name: "M••••• Steel Pvt Ltd",  issue: { label: "Duplicate payment",         tone: "critical",    amount: 54000 } },
  { name: "S•••• Traders",         issue: null },
  { name: "V••••• Transport Co",   issue: { label: "ITC at risk · unfiled",     tone: "critical",    amount: 76700 } },
  { name: "B•••• Tools & Dies",    issue: null },
  { name: "P•••• Chemicals",       issue: { label: "ITC marked ineligible",     tone: "warning",     amount: 9324 } },
  { name: "R•••• Auto Components", issue: { label: "Supplier name mismatch",     tone: "warning",     amount: 0 } },
  { name: "N•••• Electricals",     issue: null },
  { name: "G•••• Fasteners",       issue: { label: "ITC available, not booked",  tone: "opportunity", amount: 15000 } },
  { name: "A•••• Packaging",       issue: null },
  { name: "K•••• Textiles",        issue: { label: "Duplicate payment",          tone: "critical",    amount: 38200 } },
  { name: "D•••• Logistics",       issue: null },
  { name: "S•••• Pharma Dist.",    issue: null },
];

function PracticeScanner() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setActive(true); }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return;
    const N = SCAN_CLIENTS.length;
    const t = setInterval(() => setStep((s) => (s >= N + 7 ? 0 : s + 1)), 360); // pause ~7 ticks, then replay
    return () => clearInterval(t);
  }, [active]);

  const done = Math.min(step, SCAN_CLIENTS.length);
  const scanning = step < SCAN_CLIENTS.length ? step : -1;
  const resolved = SCAN_CLIENTS.slice(0, done);
  const issues = resolved.filter((c) => c.issue);
  const money = issues.reduce((s, c) => s + (c.issue?.amount ?? 0), 0);
  const stream = issues.slice(-3).reverse();

  return (
    <div ref={ref} className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
      {/* chrome */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
          <FileSearch className="h-3.5 w-3.5" /> Practice Scan · May 2026
        </span>
        <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
          {done < SCAN_CLIENTS.length
            ? <><Loader2 className="h-3 w-3 animate-spin" /> scanning…</>
            : <><Check className="h-3 w-3 text-emerald-500" /> one pass complete</>}
        </span>
      </div>

      {/* live stats */}
      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
        {[
          { label: "Client books", val: `${done}/${SCAN_CLIENTS.length}`, tone: "text-slate-900" },
          { label: "Issues found", val: `${issues.length}`,               tone: "text-red-600" },
          { label: "Money found",  val: `₹${money.toLocaleString("en-IN")}`, tone: "text-emerald-600" },
        ].map((s) => (
          <div key={s.label} className="px-3 py-3 text-center">
            <p className={`text-lg font-extrabold tabular-nums ${s.tone}`}>{s.val}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2">
        {/* client grid */}
        <div className="p-3 grid grid-cols-1 gap-1.5 border-r border-slate-100">
          {SCAN_CLIENTS.map((c, i) => {
            const isDone = i < done;
            const isScan = i === scanning;
            const tone = c.issue ? SCAN_TONE[c.issue.tone] : null;
            return (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] border transition-all duration-300 ${
                  isScan ? "border-blue-200 bg-blue-50"
                  : isDone && tone ? tone.chip
                  : isDone ? "border-slate-100 bg-slate-50"
                  : "border-transparent bg-slate-50/40 opacity-40"
                }`}
              >
                {isScan
                  ? <Loader2 className="h-3 w-3 text-blue-500 animate-spin shrink-0" />
                  : isDone && tone ? <span className={`h-2 w-2 rounded-full ${tone.dot} shrink-0`} />
                  : isDone ? <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                  : <span className="h-2 w-2 rounded-full bg-slate-200 shrink-0" />}
                <span className="font-medium text-slate-500 truncate">{c.name}</span>
              </div>
            );
          })}
        </div>

        {/* finding stream */}
        <div className="p-3 space-y-2 bg-slate-50/40 min-h-[220px]">
          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold px-0.5">Findings as they surface</p>
          {stream.length === 0 && (
            <p className="text-[11px] text-slate-400 px-0.5 pt-2">Scanning your client book…</p>
          )}
          {stream.map((c, i) => {
            const tone = SCAN_TONE[c.issue!.tone];
            return (
              <div key={`${c.name}-${i}`} className={`rounded-lg border ${tone.chip} p-2.5 animate-in fade-in slide-in-from-right-2 duration-500`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                  <span className={`text-xs font-bold tabular-nums ml-auto ${tone.text}`}>₹{c.issue!.amount.toLocaleString("en-IN")}</span>
                </div>
                <p className="text-[12px] font-semibold text-slate-800 mt-1">{c.issue!.label}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                  <Lock className="h-2.5 w-2.5" /> {c.name}
                </p>
              </div>
            );
          })}
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

      {/* ── Hero — the brand banner ── */}
      <section
        className="relative pt-32 pb-24 px-6 overflow-hidden"
        style={{ background: "linear-gradient(120deg, #24507e 0%, #1B3A5C 55%, #12293f 100%)" }}
      >
        {/* subtle blueprint grid, fading in from the right */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "linear-gradient(90deg, transparent, #000 45%)",
            WebkitMaskImage: "linear-gradient(90deg, transparent, #000 45%)",
          }}
        />
        <div className="max-w-6xl mx-auto relative">
          <div className="flex flex-col lg:flex-row items-center gap-14">
            <div className="flex-1 space-y-7">
              <div className="inline-flex items-center gap-2 bg-white/10 text-white/90 border border-white/20 rounded-full px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
                <ShieldCheck className="h-3.5 w-3.5" /> For Indian businesses &amp; their CAs
              </div>
              <h1 className="text-4xl lg:text-[3.4rem] font-bold text-white leading-[1.08] tracking-tight">
                Your books are leaking money.<br />
                <span className="text-[#8FB4EE]">Quietly.</span>
              </h1>
              <p className="text-lg text-white/75 max-w-xl leading-relaxed">
                A supplier skips a GST filing — and your tax credit dies. The same bill gets paid twice — once from the site, once from the office. <strong className="text-white font-semibold">Nobody notices until the money is gone.</strong>
              </p>
              <p className="text-lg text-white/75 max-w-xl leading-relaxed">
                AcctQAI finds these leaks in your books and shows you the proof. <span className="text-white font-medium">Free to check. No card needed.</span>
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/signup" className="inline-flex items-center justify-center gap-2 bg-white text-[#1B3A5C] px-7 py-4 rounded-xl font-bold text-base hover:bg-blue-50 transition-colors shadow-lg shadow-black/20">
                  Check my books — free <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/sample-report" className="inline-flex items-center justify-center gap-2 text-white px-7 py-4 rounded-xl font-semibold text-base border border-white/30 hover:bg-white/10 transition-colors">
                  See what it found for others
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/60">
                <span className="flex items-center gap-1.5"><Lock className="h-4 w-4" /> Read-only — never modifies your books</span>
                <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-400" /> Works alongside your ERP</span>
                <span className="flex items-center gap-1.5"><IndianRupee className="h-4 w-4 text-[#8FB4EE]" /> Every entry checked — not a sample</span>
                <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-400" /> Computed, not generated — same answer every run</span>
              </div>
            </div>
            <div className="flex-1 flex justify-center w-full">
              <HeroPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── For Chartered Accountants (the multiplier) ── */}
      <section id="for-cas" className="py-20 px-6 bg-gradient-to-b from-white to-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-12">
              <div className="inline-flex items-center gap-2 bg-[#1B3A5C]/[0.06] text-[#1B3A5C] border border-[#1B3A5C]/10 rounded-full px-4 py-1.5 text-sm font-semibold">
                <Briefcase className="h-3.5 w-3.5" /> For Chartered Accountants
              </div>
              <h2 className="text-3xl font-bold text-[#1B3A5C] mt-4">One pass across your entire client book.</h2>
              <p className="text-lg text-slate-600 mt-3">
                Stop rebuilding the same reconciliation for every client. Run every book through the same investigation at once — and get a prioritised list of what to fix, and what to bill for, per client.
              </p>
            </div>
          </Reveal>

          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <Reveal>
              <div>
                <ul className="space-y-4">
                  {[
                    { icon: <Layers className="h-4 w-4" />,   t: "Your whole book, in minutes", d: "Point AcctQAI at each client's Tally or ERP export. Every book is investigated in the same pass — no per-client setup." },
                    { icon: <Search className="h-4 w-4" />,   t: "Catch it before the auditor does", d: "Blocked ITC, duplicate payments, ineligible credit — flagged with the evidence, so you're never the one who missed it." },
                    { icon: <IndianRupee className="h-4 w-4" />, t: "Turn month-end into billable value", d: "Hand each client a health check that finds real money. What was unbillable review becomes a service you charge for." },
                    { icon: <Fingerprint className="h-4 w-4" />, t: "Their data stays protected", d: "Every client's names, references and amounts are masked before anything is processed — and never shown to any AI model." },
                  ].map((x) => (
                    <li key={x.t} className="flex gap-3.5">
                      <span className="w-9 h-9 rounded-lg bg-[#1B3A5C]/[0.06] text-[#1B3A5C] flex items-center justify-center shrink-0">{x.icon}</span>
                      <div>
                        <p className="font-semibold text-slate-800">{x.t}</p>
                        <p className="text-slate-600 text-sm mt-0.5 leading-relaxed">{x.d}</p>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* defensibility — depth without the recipe */}
                <div className="mt-7 rounded-xl border border-slate-200 bg-white p-4 flex items-start gap-3">
                  <Boxes className="h-5 w-5 text-[#1B3A5C] shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-600 leading-relaxed">
                    <span className="font-semibold text-slate-800">Every client book runs through the same GST/ITC and duplicate-payment checks</span> — with new investigations added as we build them. The findings are yours; the engine that produces them stays ours.
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <PracticeScanner />
            </Reveal>
          </div>

          <Reveal>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-12">
              <Link href="/contact" className="inline-flex items-center justify-center gap-2 bg-[#1B3A5C] text-white px-7 py-3.5 rounded-xl font-semibold hover:bg-[#1B3A5C]/90 transition-colors shadow-lg shadow-[#1B3A5C]/20">
                Bring AcctQAI to your practice <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/sample-report" className="inline-flex items-center justify-center gap-2 bg-white text-slate-700 px-7 py-3.5 rounded-xl font-semibold border border-slate-200 hover:border-slate-400 transition-colors">
                See what a client report looks like
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── From data to decisions ── */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs font-bold tracking-[0.18em] text-blue-600 uppercase mb-3">The problem</p>
            <h2 className="text-3xl font-bold text-[#1B3A5C]">Two leaks. Every business has at least one.</h2>
            <p className="text-lg text-slate-600 mt-3">
              They don&apos;t show up in any report. Each entry looks fine on its own. That&apos;s why they survive for months.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: <Receipt className="h-6 w-6" />, color: "bg-red-50 text-red-600", title: "The tax credit that dies", desc: "You bought goods and paid the GST. But your credit only becomes real if the supplier files their return. When they don't, that money silently disappears — and you find out months later, at the worst time." },
              { icon: <Wallet className="h-6 w-6" />, color: "bg-amber-50 text-amber-600", title: "The bill paid twice", desc: "Accounts pays a bill from the bank. The owner also pays it on UPI. Or it's entered twice with a slightly different number. Your software never warns you — it just records both." },
              { icon: <IndianRupee className="h-6 w-6" />, color: "bg-emerald-50 text-emerald-600", title: "What we found on one month's books", desc: "₹76,700 of tax credit at risk. ₹54,000 paid twice. ₹15,000 of credit never claimed. About ₹1.4 lakh — in one sample month, in one business. Want to know what's in yours?" },
            ].map((c) => (
              <div key={c.title} className="rounded-2xl border border-slate-200 p-6 hover:shadow-md hover:border-slate-300 transition-all">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${c.color}`}>{c.icon}</div>
                <h3 className="font-semibold text-lg text-slate-900 mt-4">{c.title}</h3>
                <p className="text-slate-600 text-sm mt-2 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link href="/signup" className="inline-flex items-center gap-2 bg-[#1B3A5C] text-white px-7 py-3.5 rounded-xl font-semibold hover:bg-[#1B3A5C]/90 transition-colors">
              Find out what&apos;s in my books <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="text-xs text-slate-400 mt-2">Free · no card · your data stays masked and read-only</p>
          </div>
        </div>
      </section>

      {/* ── Computed, not generated (anti-wrapper positioning) ── */}
      <section className="py-20 px-6 bg-white border-y border-slate-100">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs font-bold tracking-[0.18em] text-blue-600 uppercase mb-3">Why it&apos;s different</p>
            <h2 className="text-3xl font-bold text-[#1B3A5C]">Computed, not generated.</h2>
            <p className="text-lg text-slate-600 mt-3">
              AcctQAI is not a chatbot wrapped around your books. Every finding comes from fixed accounting rules — the kind an auditor can re-check.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: <Check className="h-6 w-6" />, color: "bg-emerald-50 text-emerald-600",
                title: "Same answer, every time",
                desc: "Run the same file twice and you get the same report, to the rupee. Findings come from accounting rules, not AI guesswork — so you can verify any of them against your own records.",
              },
              {
                icon: <FileText className="h-6 w-6" />, color: "bg-blue-50 text-blue-600",
                title: "AI writes one sentence. Never a number.",
                desc: "Every amount, every match, every finding is calculated. AI is only used to phrase the summary — and the report still works with the AI switched off entirely.",
              },
              {
                icon: <Lock className="h-6 w-6" />, color: "bg-violet-50 text-violet-600",
                title: "No AI credits. No metering.",
                desc: "Because the engine doesn't burn AI to do its job, we never charge per query or per document. And your names and amounts are masked before anything is processed.",
              },
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
            <p className="text-xs font-bold tracking-[0.18em] text-blue-600 uppercase mb-3">Three steps</p>
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

      {/* ── Why AcctQAI (vs Tally + Excel) ── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-[#1B3A5C]">Why not just Tally and Excel?</h2>
              <p className="text-lg text-slate-600 mt-3">Because spreadsheets don&apos;t tell you what you missed.</p>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-2 gap-6">
            <Reveal>
              <div className="rounded-2xl border border-slate-200 p-6 h-full">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Without AcctQAI</p>
                <ul className="space-y-3">
                  {["Export reports, rebuild the same pivots every month", "Eyeball ledgers for anything unusual", "Find the GST mismatch after the credit is reversed", "Hope nobody paid an invoice twice", "Spend the close prepping summaries by hand"].map((t) => (
                    <li key={t} className="flex gap-3 text-sm text-slate-600"><X className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" /> {t}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="rounded-2xl border-2 border-[#1B3A5C] bg-[#1B3A5C]/[0.03] p-6 h-full">
                <p className="text-xs font-semibold text-[#1B3A5C] uppercase tracking-wide mb-4">With AcctQAI</p>
                <ul className="space-y-3">
                  {["Upload once — a prioritised report comes back in minutes", "Risks, anomalies and opportunities surfaced automatically", "Catch blocked ITC before it's reversed", "Duplicate payments flagged with both vouchers", "The executive summary is written for you"].map((t) => (
                    <li key={t} className="flex gap-3 text-sm text-slate-700 font-medium"><Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /> {t}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
          <Reveal>
            <p className="text-center text-slate-500 mt-8 text-sm">
              <span className="font-semibold text-slate-700">The ROI:</span> turn hours of month-end investigation into minutes — and catch the risks that cost real money before they hit your working capital.
            </p>
          </Reveal>
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
                  { icon: <ServerCog className="h-4 w-4" />, t: "Read-only, always", d: "AcctQAI analyses your books — it never modifies them." },
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

      {/* ── Every investigation answers (trust) ── */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-[#1B3A5C]">Every finding answers five questions</h2>
              <p className="text-lg text-slate-600 mt-3">No vague alerts. No black box. Just clear, verifiable findings.</p>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { q: "What changed?", icon: <Search className="h-5 w-5" /> },
                { q: "Why?", icon: <FileText className="h-5 w-5" /> },
                { q: "How much money?", icon: <IndianRupee className="h-5 w-5" /> },
                { q: "What should I do?", icon: <Sparkles className="h-5 w-5" /> },
                { q: "Can I verify it?", icon: <ShieldCheck className="h-5 w-5" /> },
              ].map((x) => (
                <div key={x.q} className="rounded-xl bg-white border border-slate-200 p-4 text-center">
                  <div className="w-10 h-10 rounded-lg bg-[#1B3A5C]/[0.06] text-[#1B3A5C] flex items-center justify-center mx-auto">{x.icon}</div>
                  <p className="font-semibold text-slate-800 text-sm mt-3">{x.q}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Before closing your books (the conversion section) ── */}
      <section className="py-20 px-6 bg-[#1B3A5C] text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold">Before closing your books…</h2>
          <p className="text-white/70 text-lg mt-3">Can you confidently answer these questions?</p>
          <div className="grid sm:grid-cols-2 gap-3 mt-10 text-left">
            {[
              "Is any of my input tax credit blocked?",
              "Which vendors haven't filed their GSTR-1?",
              "Did we pay any invoice twice?",
              "Is there ITC in GSTR-2B we never booked?",
              "What changed vs last month, and why?",
              "What should management know?",
            ].map((q) => (
              <div key={q} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                <span className="text-white/90">{q}</span>
              </div>
            ))}
          </div>
          <p className="text-white/70 mt-8">If not — run an AcctQAI investigation.</p>
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
              <div className="w-7 h-7 rounded-full bg-[#1B3A5C]/10 flex items-center justify-center shrink-0"><span className="text-xs font-bold text-[#1B3A5C]">AQ</span></div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 flex-1 text-sm text-slate-700">
                Three vendors account for the ₹1,24,500 at risk: Agarwal Stationery (₹12,780), Sindhwani Rubber (₹16,920) and Bright Tools (₹94,300). All three have unfiled GSTR-1 for May.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── What we investigate (replaces testimonials) ── */}
      <section id="investigates" className="py-20 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-[#1B3A5C]">What AcctQAI investigates</h2>
            <p className="text-lg text-slate-600 mt-3">
              Every check we run today — stated plainly. No vague categories.
            </p>
          </div>

          {/* Automatic — the investigation report */}
          <div className="mt-10">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-center mb-4">Surfaced automatically, with evidence</p>
            <div className="flex flex-wrap justify-center gap-3">
              {INVESTIGATES.map((i) => (
                <span key={i} className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-2 text-sm font-medium text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {i}
                </span>
              ))}
            </div>
          </div>

          {/* On demand — the query engine */}
          <div className="mt-10">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-center mb-4">Answered when you ask, in plain English</p>
            <div className="flex flex-wrap justify-center gap-2.5">
              {ASKABLE.map((i) => (
                <span key={i} className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-600">
                  <Sparkles className="h-3.5 w-3.5 text-blue-500" /> {i}
                </span>
              ))}
            </div>
          </div>

          {/* Not built — said out loud */}
          <div className="mt-10 rounded-xl border border-slate-200 bg-white p-5 text-center">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Not built yet — on the roadmap</p>
            <div className="flex flex-wrap justify-center gap-2.5">
              {COMING_SOON.map((i) => (
                <span key={i} className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-400">
                  {i}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3">
              We&apos;d rather tell you what we don&apos;t do than have you find out after you sign up.
            </p>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-4">
            <p className="text-xs font-bold tracking-[0.18em] text-blue-600 uppercase mb-3">Pricing</p>
            <h2 className="text-3xl font-bold text-[#1B3A5C]">Free to prove it. One price for your firm.</h2>
            <p className="text-lg text-slate-600 mt-3">Free to prove it on your own files. One flat price for your whole firm.</p>
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
                <Link href={p.name === "Enterprise" ? "/contact" : "/signup"}
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
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><span className="text-white text-xs font-bold">AQ</span></div>
                <span className="font-bold text-white text-lg">{BRAND.name}</span>
              </div>
              <p className="font-semibold text-slate-200">Financial Investigation Platform</p>
              <p className="text-sm mt-1">Helping finance teams understand what deserves attention before it costs them money.</p>
            </div>
            <div className="flex gap-12 text-sm">
              <div className="space-y-2">
                <p className="text-slate-200 font-semibold mb-3">Product</p>
                <Link href="/sample-report" className="block hover:text-white">Sample report</Link>
                <Link href="/resources" className="block hover:text-white">Resources</Link>
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
