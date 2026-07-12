import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, Clock, ShieldCheck, AlertTriangle, CheckCircle2, Lock, ArrowLeft,
} from "lucide-react";
import { getArticle } from "../articles";

const SITE_URL = process.env.DOMAIN ?? "https://acctqai.com";
const article = getArticle("vendor-not-filed-gstr-1-itc")!;
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
    q: "Can I claim ITC if my vendor hasn't filed GSTR-1?",
    a: "No. Under Section 16(2)(aa) of the CGST Act, input tax credit can be claimed only on invoices your supplier has furnished in their GSTR-1 and that appear in your GSTR-2B. However genuine your bill, if it is not reflected in GSTR-2B, the credit cannot be lawfully claimed for that period.",
  },
  {
    q: "Will the ITC come back if the vendor files GSTR-1 later?",
    a: "Yes. Once the invoice appears in a later period's GSTR-2B, you can claim the credit in that period — subject to the overall time limit under Section 16(4), i.e. the earlier of 30 November following the end of the financial year or the date of filing the annual return.",
  },
  {
    q: "What is the time limit to claim input tax credit?",
    a: "Section 16(4) sets the limit as the earlier of 30 November following the end of the relevant financial year, or the date of filing the annual return for that year. Miss it and the credit lapses permanently, so chronically late vendors need to be chased well before the deadline.",
  },
  {
    q: "How do I check whether a vendor has filed their GSTR-1?",
    a: "On the GST portal, use Search Taxpayer with the vendor's GSTIN to view their return filing status, or reconcile your purchase register against your downloaded GSTR-2B — any booked invoice missing from GSTR-2B points to a supplier who hasn't filed (or has filed with an error).",
  },
];

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="text-2xl font-bold text-[#1B3A5C] mt-12 mb-4 scroll-mt-24">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-slate-700 leading-relaxed mb-4">{children}</p>;
}

export default function VendorNotFiledGstr1Article() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.title,
      description: article.description,
      author: { "@type": "Organization", name: "AcctQAI" },
      publisher: {
        "@type": "Organization",
        name: "AcctQAI",
        logo: { "@type": "ImageObject", url: `${SITE_URL}/opengraph-image` },
      },
      datePublished: article.updated,
      dateModified: article.updated,
      mainEntityOfPage: URL,
      about: ["input tax credit", "GSTR-1", "GSTR-2B reconciliation"],
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

      <header className="border-b border-slate-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-[#1B3A5C]">AcctQAI</Link>
          <Link href="/signup" className="text-sm text-[#1B3A5C] hover:underline font-medium">Sign up free →</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/resources" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#1B3A5C] mb-6">
          <ArrowLeft className="h-3.5 w-3.5" /> All resources
        </Link>

        <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
          <span className="font-semibold text-[#1B3A5C]">{article.category}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {article.readMins} min read</span>
          <span>Updated {new Date(article.updated).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</span>
        </div>
        <h1 className="text-3xl lg:text-[2.5rem] font-bold text-[#1B3A5C] leading-[1.1]">
          Vendor Hasn&apos;t Filed GSTR-1: What Happens to Your ITC
        </h1>
        <p className="text-lg text-slate-600 mt-4 leading-relaxed">
          You received the bill, paid the GST, and booked the purchase — so the input tax credit is
          yours, right? Not quite. Your ITC doesn&apos;t depend on your books. It depends on your
          supplier filing their GSTR-1.
        </p>

        <article className="mt-6">
          <P>
            This is one of the most expensive surprises in GST. A purchase is booked, the credit is
            assumed, and the working-capital benefit is quietly baked into your cash planning. Then
            the credit never shows up in your GSTR-2B — because the supplier didn&apos;t file — and
            weeks later it becomes a problem you have to fix with interest.
          </P>

          <H2 id="the-rule">The rule, in one line</H2>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 mb-4">
            <P>
              <span className="not-prose">Under <strong>Section 16(2)(aa) of the CGST Act</strong>, you
              can claim input tax credit only on invoices your supplier has furnished in their GSTR-1
              and that are reflected in your <strong>GSTR-2B</strong>. No GSTR-2B entry means no ITC —
              regardless of how genuine your invoice is.</span>
            </P>
            <p className="text-slate-600 text-sm mb-0">
              GSTR-2B — not your books, and not the invoice in your hand — is the document the law
              now treats as the source of truth for eligibility.
            </p>
          </div>

          <H2 id="what-happens">What actually happens when a vendor doesn&apos;t file</H2>
          <ul className="space-y-2.5 mb-4">
            {[
              "The invoice never appears in your GSTR-2B for the period.",
              "You either can't claim the ITC — blocking working capital you were counting on — or you claim it anyway and create a GSTR-2B mismatch.",
              "A mismatch invites a notice, and the excess credit is liable to be reversed.",
              "On reversal, interest applies under Section 50 — so the cash you 'saved' becomes a larger liability months later.",
            ].map((t) => (
              <li key={t} className="flex gap-3 text-slate-700"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#1B3A5C] shrink-0" /> <span className="leading-relaxed">{t}</span></li>
            ))}
          </ul>

          <H2 id="why-vendors-dont-file">Why vendors don&apos;t file (or file late)</H2>
          <P>It is not always bad faith. The common reasons:</P>
          <ul className="space-y-2.5 mb-4">
            {[
              ["Quarterly filers (QRMP)", "Small suppliers on the QRMP scheme may file GSTR-1 quarterly, so their invoices don't show in your monthly GSTR-2B until the quarter closes."],
              ["Cash-flow stress", "A supplier under pressure may delay filing to defer their own liability — your credit is collateral damage."],
              ["Data-entry errors", "A wrong GSTIN, invoice number or period on their side means the invoice exists but never matches yours."],
              ["Genuine defaulters", "Some simply don't file. These are the vendors worth flagging as a recurring risk."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3 text-slate-700">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong className="text-slate-800">{t}:</strong> {d}</span>
              </li>
            ))}
          </ul>

          <H2 id="how-to-spot">How to spot it: reconcile GSTR-2B against your purchase register</H2>
          <ol className="space-y-3 mb-4">
            {[
              ["Download GSTR-2B for the period.", "On the GST portal: Returns → GSTR-2B for the relevant month, and export it."],
              ["Pull your purchase register.", "Export your booked purchases for the same period from Tally or your ERP."],
              ["Match invoice by invoice.", "Line up each booked purchase against a GSTR-2B entry using GSTIN, invoice number and taxable value."],
              ["Isolate what's missing.", "Invoices in your books but not in GSTR-2B are your at-risk ITC. That list is the whole point of the exercise."],
              ["Check the supplier's filing status.", "For each missing invoice, verify the vendor's GSTR-1 / return status on the portal to confirm whether it's a non-filing or an error."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="w-7 h-7 rounded-full bg-[#1B3A5C] text-white flex items-center justify-center font-bold text-sm shrink-0">{i + 1}</span>
                <div><p className="font-semibold text-slate-800">{t}</p><p className="text-slate-600 text-sm mt-0.5 leading-relaxed">{d}</p></div>
              </li>
            ))}
          </ol>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 mb-4">
            <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-2">
              <AlertTriangle className="h-4 w-4" /> Watch for false mismatches
            </div>
            <p className="text-sm text-amber-900/90">
              The same invoice booked as <strong>INV/26/041</strong> and reported by the vendor as{" "}
              <strong>INV-26-41</strong> will look like a missing invoice when it isn&apos;t.
              Normalise invoice references (strip spaces, slashes and leading zeros) before matching,
              or you&apos;ll chase vendors who actually filed.
            </p>
          </div>

          <H2 id="protect">How to protect your ITC</H2>
          <ul className="space-y-2.5 mb-4">
            {[
              ["Claim only what's in GSTR-2B.", "Before filing GSTR-3B, restrict your ITC claim to invoices actually reflected in GSTR-2B for the period."],
              ["Chase the vendor in writing.", "Ask the supplier to file GSTR-1 for the period and keep a written trail — it matters if the credit is ever questioned."],
              ["Use payment as leverage.", "Hold the payment, or at least the GST portion, until the invoice appears in GSTR-2B. It's the strongest lever you have."],
              ["Add a GST clause for repeat offenders.", "Bake a filing / indemnity clause into vendor terms so chronic defaulters carry the cost, not you."],
              ["Track it month over month.", "A vendor who is late every month is a working-capital risk — measure it and reconsider the relationship."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3 text-slate-700">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong className="text-slate-800">{t}:</strong> {d}</span>
              </li>
            ))}
          </ul>

          {/* Product CTA */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 my-10">
            <div className="flex items-center gap-2 text-[#1B3A5C] font-semibold mb-2">
              <ShieldCheck className="h-5 w-5" /> Doing this automatically
            </div>
            <p className="text-slate-700 text-sm leading-relaxed">
              AcctQAI reconciles your purchase register against GSTR-2B and flags every booked
              invoice that is <strong>missing from GSTR-2B</strong> — with the vendor and the exact{" "}
              <strong>rupee ITC at risk</strong>, ranked by amount, and with the false-mismatch cases
              filtered out. For CAs, it runs across the whole client book in one pass.
            </p>
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 flex items-center gap-3 text-sm">
              <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
              <span className="font-semibold text-slate-800">ITC at risk · vendor not filed · ₹76,700</span>
              <span className="text-slate-400 text-xs flex items-center gap-1 ml-auto"><Lock className="h-3 w-3" /> V••••• Transport Co</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Party names, references and amounts are masked before anything is processed — the
              example shows how a finding appears, not your real data.
            </p>
            <Link href="/sample-report" className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-[#1B3A5C] hover:underline">
              See a full sample report <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <H2 id="checklist">A quick checklist</H2>
          <ul className="space-y-2.5 mb-4">
            {[
              "Reconcile GSTR-2B against your purchase register every month, before GSTR-3B.",
              "Claim ITC only on invoices reflected in GSTR-2B.",
              "Normalise invoice references before matching to avoid false mismatches.",
              "Chase missing invoices with the vendor in writing; hold the GST portion as leverage.",
              "Watch the Section 16(4) deadline — 30 November following the financial year.",
            ].map((t) => (
              <li key={t} className="flex gap-3 text-slate-700"><CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" /> <span className="leading-relaxed">{t}</span></li>
            ))}
          </ul>

          {/* Related */}
          <div className="rounded-xl border border-slate-200 p-5 my-8">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Related guide</p>
            <Link href="/resources/detect-duplicate-payments-in-tally" className="text-[#1B3A5C] font-semibold hover:underline">
              How to Detect Duplicate Payments in Tally →
            </Link>
          </div>

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

        <div className="mt-14 rounded-2xl bg-[#1B3A5C] text-white p-8 text-center">
          <h2 className="text-2xl font-bold">See your at-risk ITC on your own books</h2>
          <p className="text-white/70 mt-2">Upload your purchase register and GSTR-2B — get every missing invoice with the vendor and the rupee impact.</p>
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
          Written by the AcctQAI team. This guide is general information based on the CGST Act as
          it currently stands, not tax advice — confirm the treatment of any specific invoice with
          your CA, as GST provisions and time limits change.
        </p>
      </main>
    </div>
  );
}
