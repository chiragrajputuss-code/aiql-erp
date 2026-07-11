import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, Clock, ShieldCheck, AlertTriangle, CheckCircle2, Lock, ArrowLeft,
} from "lucide-react";
import { getArticle } from "../articles";

const SITE_URL = process.env.DOMAIN ?? "https://acctqai.com";
const article = getArticle("detect-duplicate-payments-in-tally")!;
const URL = `${SITE_URL}/resources/${article.slug}`;

export const metadata: Metadata = {
  title: article.metaTitle,
  description: article.description,
  alternates: { canonical: `/resources/${article.slug}` },
  openGraph: {
    type: "article",
    url: URL,
    title: article.metaTitle,
    description: article.description,
    // Next replaces the parent's `openGraph` object wholesale, so the root
    // opengraph-image does NOT cascade here — it must be named explicitly.
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: article.title }],
  },
};

// ─── FAQ (visible + JSON-LD must match) ───────────────────────────────────────

const FAQ = [
  {
    q: "Does Tally have a built-in duplicate payment check?",
    a: "No. Tally will record the same payment twice without warning. There is no native duplicate-detection report, which is exactly why duplicate payments so often go unnoticed until a vendor or auditor points them out.",
  },
  {
    q: "How do I find duplicate payments across multiple ledgers in Tally?",
    a: "Export the vouchers for each bank and cash ledger to Excel, combine them into one sheet, then sort by party and amount and scan for repeats. Because duplicates often span a bank payment and a cash payment, you must check ledgers together — checking one ledger at a time misses cross-ledger duplicates.",
  },
  {
    q: "Can the same bill entered twice affect my GST input tax credit?",
    a: "Yes. If a purchase bill is booked twice, you risk claiming input tax credit twice on the same invoice. That excess ITC is liable to be reversed with interest if flagged during reconciliation or assessment, so a booking duplicate is both a cash and a compliance problem.",
  },
  {
    q: "What is the fastest way for a CA to check duplicate payments across many clients?",
    a: "Manual sort-and-scan does not scale past a handful of ledgers. Tools that read a Tally or Excel export and match on normalised payee, amount, invoice reference and a date window can screen an entire client book in one pass and return only the likely duplicates for review.",
  },
];

// ─── Small presentational helpers ─────────────────────────────────────────────

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="text-2xl font-bold text-[#1B3A5C] mt-12 mb-4 scroll-mt-24">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-slate-700 leading-relaxed mb-4">{children}</p>;
}

export default function DuplicatePaymentsTallyArticle() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.title,
      description: article.description,
      author: { "@type": "Organization", name: "AccountIQ" },
      publisher: {
        "@type": "Organization",
        name: "AccountIQ",
        logo: { "@type": "ImageObject", url: `${SITE_URL}/opengraph-image` },
      },
      datePublished: article.updated,
      dateModified: article.updated,
      mainEntityOfPage: URL,
      about: ["duplicate payment detection", "Tally", "accounts payable controls"],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Resources", item: `${SITE_URL}/resources` },
        { "@type": "ListItem", position: 2, name: article.title, item: URL },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Nav */}
      <header className="border-b border-slate-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-[#1B3A5C]">AccountIQ</Link>
          <Link href="/signup" className="text-sm text-[#1B3A5C] hover:underline font-medium">Sign up free →</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Breadcrumb */}
        <Link href="/resources" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#1B3A5C] mb-6">
          <ArrowLeft className="h-3.5 w-3.5" /> All resources
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
          <span className="font-semibold text-[#1B3A5C]">{article.category}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {article.readMins} min read</span>
          <span>Updated {new Date(article.updated).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</span>
        </div>
        <h1 className="text-3xl lg:text-[2.5rem] font-bold text-[#1B3A5C] leading-[1.1]">
          How to Detect Duplicate Payments in Tally (Before They Cost You)
        </h1>
        <p className="text-lg text-slate-600 mt-4 leading-relaxed">
          Paying the same bill twice is one of the most common — and most invisible — ways money
          quietly leaves an Indian SME. Here is how it happens in Tally, how to find it, and why the
          usual sort-and-scan misses the duplicates that cost the most.
        </p>

        {/* Body */}
        <article className="mt-6">
          <P>
            A bill gets entered twice. A vendor is paid once by the accounts team and again by the
            owner over UPI. An advance is paid, then the full invoice is settled without adjusting
            the advance. In every case Tally does exactly what you told it to — it records the
            payment. It has no idea you have already paid that bill, and it will never warn you.
          </P>
          <P>
            By the time anyone notices, the cash is gone and recovering it means an awkward call to
            the vendor, who may or may not still have the credit. Multiply that across a year, or
            across a CA&apos;s entire client book, and duplicate payments become a real, recurring
            leak — one that never shows up as a line item because it hides inside legitimate-looking
            vouchers.
          </P>

          <H2 id="why-they-happen">Why duplicate payments happen in Tally</H2>
          <P>Tally has no built-in duplicate check. On live books, the recurring causes are:</P>
          <ul className="space-y-2.5 mb-4">
            {[
              "The same purchase bill entered twice — two people book it, or someone re-enters a voucher they thought was missing.",
              "A payment made from the bank and a second from cash or petty cash for the same bill.",
              "An advance paid, then the full invoice paid without knocking off the advance.",
              "The same invoice recorded with a slightly different reference (INV-041 vs INV/041) so it never looks like a match.",
              "Split payments that together add up to a second full settlement of the same bill.",
              "Cross-month duplicates — paid in the last week of one month and again in the first week of the next.",
            ].map((t) => (
              <li key={t} className="flex gap-3 text-slate-700"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#1B3A5C] shrink-0" /> <span className="leading-relaxed">{t}</span></li>
            ))}
          </ul>

          <H2 id="the-cost">The cost is bigger than the rupees</H2>
          <P>
            The obvious cost is the cash you paid twice. But a duplicate has a longer tail. Recovery
            depends entirely on the vendor&apos;s goodwill and record-keeping. It distorts your
            payables and your cash position. And if the underlying <em>bill</em> was booked twice —
            not just the payment — you risk claiming <strong>input tax credit twice on the same
            invoice</strong>, which is liable to be reversed with interest if it surfaces during GST
            reconciliation or assessment. A single duplicate can be a cash problem and a compliance
            problem at once.
          </P>

          <H2 id="manual-method">How to find duplicate payments in Tally, manually</H2>
          <P>You can screen for the obvious duplicates without any extra software:</P>
          <ol className="space-y-3 mb-4">
            {[
              ["Open the ledger vouchers.", "Gateway of Tally → Display More Reports → Account Books → Ledger. Do this for each bank and cash ledger you pay bills from."],
              ["Set the full period.", "Widen the date range (F2) to the whole span you want to check — ideally a full quarter, so cross-month duplicates are visible."],
              ["Export to Excel.", "Press Alt+E (Export) and export the vouchers with date, party, amount, voucher number and narration."],
              ["Sort by party, then amount.", "In Excel, sort on the party column, then the amount column, so identical payments to the same party sit next to each other."],
              ["Flag the repeats.", "Add a helper column = party & \"|\" & amount, then use Conditional Formatting → Highlight Cell Rules → Duplicate Values to light up every repeated payee-and-amount pair."],
              ["Confirm before you act.", "Open the two vouchers behind each highlighted pair and compare the bill reference and narration — two genuine bills can share a value, so confirm it is the same bill before raising it with the vendor."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="w-7 h-7 rounded-full bg-[#1B3A5C] text-white flex items-center justify-center font-bold text-sm shrink-0">{i + 1}</span>
                <div><p className="font-semibold text-slate-800">{t}</p><p className="text-slate-600 text-sm mt-0.5 leading-relaxed">{d}</p></div>
              </li>
            ))}
          </ol>

          <H2 id="what-manual-misses">Why the manual method misses the expensive ones</H2>
          <P>
            Sort-by-amount catches exact twins. Unfortunately, the duplicates that cost the most are
            usually the ones it can&apos;t see:
          </P>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 mb-4">
            <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-3">
              <AlertTriangle className="h-4 w-4" /> Blind spots in a manual scan
            </div>
            <ul className="space-y-2 text-sm text-amber-900/90">
              {[
                "Fuzzy payee names — “Mehta Steel Industries” and “Mehta Steel Inds” sort into different places and never line up.",
                "Reference-format differences — the same bill entered as INV/26/041 and INV-26-41 looks like two different invoices.",
                "Cross-ledger duplicates — one payment from bank, one from cash, so they never appear in the same export.",
                "Cross-month duplicates — if you only export one month, you never see the matching pair.",
                "Split or partial duplicates — two part-payments that together repay a bill already settled in full.",
              ].map((t) => (
                <li key={t} className="flex gap-2.5"><span className="mt-1.5 h-1 w-1 rounded-full bg-amber-500 shrink-0" /> {t}</li>
              ))}
            </ul>
          </div>
          <P>
            And it is slow. For a business with thousands of vouchers a quarter — or a CA closing 50
            clients — sort-and-eyeball simply doesn&apos;t scale, so it gets skipped in the crunch,
            which is exactly when duplicates slip through.
          </P>

          <H2 id="reliable-check">What a reliable duplicate check actually compares</H2>
          <P>
            A dependable check never relies on a single field. It compares payments across a{" "}
            <em>combination</em> of signals, allowing for the messiness of real ledgers:
          </P>
          <ul className="space-y-2.5 mb-4">
            {[
              ["Normalised payee", "Ignore case, punctuation and “Pvt Ltd / & Co” noise, and treat near-identical spellings as the same vendor."],
              ["Amount", "Match the exact amount — and watch for split payments that sum to a second full settlement."],
              ["Normalised bill reference", "Strip spaces, slashes and leading zeros before comparing, so format differences don’t hide a genuine match."],
              ["A date window", "Two identical settlements to the same payee within, say, 30–45 days deserve a look even without a shared reference."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3 text-slate-700">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong className="text-slate-800">{t}:</strong> {d}</span>
              </li>
            ))}
          </ul>
          <P>
            The classification then follows naturally: same payee + same amount + same reference is
            almost certainly a duplicate; same payee + same amount within the window, without a
            shared reference, is a <em>probable</em> duplicate worth confirming.
          </P>

          {/* Product CTA — honest, masked */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 my-10">
            <div className="flex items-center gap-2 text-[#1B3A5C] font-semibold mb-2">
              <ShieldCheck className="h-5 w-5" /> Doing this automatically
            </div>
            <p className="text-slate-700 text-sm leading-relaxed">
              AccountIQ reads your Tally or Excel export and runs exactly this kind of check across
              your whole ledger — every ledger, every month, with fuzzy payee and reference handling
              — then hands you each likely duplicate with <strong>both vouchers and the rupee
              amount</strong>, so you can confirm and recover. For CAs, it runs across your entire
              client book in a single pass.
            </p>
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 flex items-center gap-3 text-sm">
              <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
              <span className="font-semibold text-slate-800">Duplicate payment · ₹54,000</span>
              <span className="text-slate-400 text-xs flex items-center gap-1 ml-auto"><Lock className="h-3 w-3" /> M••••• Steel Pvt Ltd</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Party names, references and amounts are masked before anything is processed — the
              example above shows how a finding appears, not your real data.
            </p>
            <Link href="/sample-report" className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-[#1B3A5C] hover:underline">
              See a full sample report <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <H2 id="checklist">A quick checklist</H2>
          <ul className="space-y-2.5 mb-4">
            {[
              "Check bank and cash ledgers together, not one at a time.",
              "Screen a full quarter so cross-month pairs are visible.",
              "Match on payee + amount + reference, not amount alone.",
              "Confirm the bill reference before raising a duplicate with a vendor.",
              "If a bill — not just a payment — was booked twice, check you haven’t claimed ITC twice.",
            ].map((t) => (
              <li key={t} className="flex gap-3 text-slate-700"><CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" /> <span className="leading-relaxed">{t}</span></li>
            ))}
          </ul>

          {/* FAQ */}
          <H2 id="faq">Frequently asked questions</H2>
          <div className="space-y-4">
            {FAQ.map((f) => (
              <div key={f.q} className="rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-900">{f.q}</h3>
                <p className="text-slate-600 text-sm mt-2 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </article>

        {/* Footer CTA */}
        <div className="mt-14 rounded-2xl bg-[#1B3A5C] text-white p-8 text-center">
          <h2 className="text-2xl font-bold">Catch duplicate payments on your own books</h2>
          <p className="text-white/70 mt-2">Upload a Tally or ERP export and see the findings — with the evidence and the rupee impact.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
            <Link href="/sample-report" className="inline-flex items-center justify-center gap-2 bg-white text-[#1B3A5C] px-6 py-3 rounded-xl font-bold hover:bg-slate-100">
              View a sample report <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/signup" className="inline-flex items-center justify-center gap-2 border border-white/30 text-white px-6 py-3 rounded-xl font-semibold hover:bg-white/10">
              Sign up free
            </Link>
          </div>
        </div>

        <p className="text-xs text-slate-400 mt-8 border-t border-slate-100 pt-6">
          Written by the AccountIQ team from patterns seen on real Indian SME ledgers. This guide is
          general information, not tax or accounting advice — confirm any duplicate against your
          source vouchers before acting.
        </p>
      </main>
    </div>
  );
}
