import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — AIQL",
  description: "AIQL Terms of Service — your rights and responsibilities when using the platform.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-slate-800 mb-3">{title}</h2>
      <div className="text-slate-600 text-sm leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  const effectiveDate = "1 June 2026";

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-[#1B3A5C]">AIQL</Link>
          <Link href="/signup" className="text-sm text-[#1B3A5C] hover:underline font-medium">
            Sign up free →
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-slate-400 mb-10">Effective date: {effectiveDate}</p>

        <p className="text-slate-600 text-sm leading-relaxed mb-8">
          These Terms of Service (&quot;Terms&quot;) govern your access to and use of AIQL, an
          AI-powered General Ledger close and audit platform (&quot;Service&quot;) operated by AIQL
          (&quot;we&quot;, &quot;us&quot;). By creating an account or using the Service, you agree to
          these Terms. If you do not agree, do not use the Service.
        </p>

        <Section title="1. Service Description">
          <p>AIQL is a professional financial analysis tool that connects to your uploaded GL data, runs automated data-quality checks, and answers plain-English queries about your accounts. It is designed for finance professionals — CAs, CFOs, and accountants — working with Indian SME books.</p>
          <p>The Service is provided on a subscription basis. We offer three plans (Starter, Professional, Business) billed monthly or annually as described on the <Link href="/pricing" className="text-[#1B3A5C] underline">pricing page</Link>.</p>
        </Section>

        <Section title="2. Accounts and Eligibility">
          <p>You must be at least 18 years old and capable of forming a legally binding contract under Indian law to use the Service.</p>
          <p>Each subscription is for one <strong>organisation</strong>. The first user to register an email domain creates the org and becomes the Admin. Admins may invite team members within the plan limits.</p>
          <p>You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. Notify us immediately at <a href="mailto:support@aiql.com" className="text-[#1B3A5C] underline">support@aiql.com</a> if you suspect unauthorised access.</p>
        </Section>

        <Section title="3. Acceptable Use">
          <p>You may use AIQL to analyse your own organisation&apos;s GL data, or GL data for which you have a legitimate professional mandate (e.g., as an auditor or CA for a client).</p>
          <p><strong>You must not:</strong></p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Upload data you are not authorised to access or analyse</li>
            <li>Use the Service for money laundering, tax evasion, or financial fraud</li>
            <li>Attempt to reverse-engineer, scrape, or extract the underlying SQL templates or AI prompts</li>
            <li>Resell or sublicense access to the Service without a written reseller agreement</li>
            <li>Upload malicious files or attempt to inject code into the platform</li>
            <li>Share login credentials across individuals (each user must have their own account)</li>
          </ul>
        </Section>

        <Section title="4. Subscription, Billing, and Refunds">
          <p><strong>Billing:</strong> Subscriptions are billed in advance — monthly on the same date each month, or annually at the start of each year. Payment is processed by Razorpay in Indian Rupees (INR) inclusive of applicable GST.</p>
          <p><strong>Plan changes:</strong> You may upgrade at any time; the new rate is charged on the next billing cycle. Downgrades take effect at the end of the current billing period.</p>
          <p><strong>Refund policy:</strong> We do not offer refunds for partial months. If you cancel mid-cycle, you retain access until the end of the paid period. Annual plan refunds are available on a pro-rated basis within the first 30 days only.</p>
          <p><strong>Free trial:</strong> Where offered, the free trial does not require a payment method. At the end of the trial, access is suspended until a plan is selected.</p>
          <p><strong>Failed payments:</strong> If a payment fails, we will retry twice over 5 days. After the second failure, access is suspended (data is retained for 30 days). On recovery, the outstanding amount is charged.</p>
        </Section>

        <Section title="5. Your Data">
          <p>You own all GL data you upload. We process it solely to provide the Service. See our <Link href="/privacy" className="text-[#1B3A5C] underline">Privacy Policy</Link> for full details on storage, retention, and your deletion rights.</p>
          <p>On account termination or subscription cancellation, your uploaded GL tables are deleted within 30 days. Query logs can be exported on request.</p>
        </Section>

        <Section title="6. Intellectual Property">
          <p>AIQL, its SQL template library, prompt engineering, and all associated IP remain our exclusive property. Nothing in these Terms grants you a licence to copy, distribute, or create derivative works from the Service or its underlying technology.</p>
          <p>You grant us a limited, non-exclusive licence to process your uploaded data solely to provide and improve the Service for your organisation.</p>
        </Section>

        <Section title="7. Accuracy of Output">
          <p>AIQL uses AI to generate SQL queries and financial summaries. <strong>Outputs must be reviewed by a qualified finance professional before being relied upon for decisions, filings, or client deliverables.</strong> We are not a registered auditor and nothing in the Service constitutes audit assurance or legal/tax advice.</p>
          <p>You are responsible for verifying all AI-generated outputs against source records.</p>
        </Section>

        <Section title="8. Limitation of Liability">
          <p>To the maximum extent permitted by Indian law, our aggregate liability arising out of or related to these Terms shall not exceed the total fees you paid to us in the <strong>3 months preceding the claim</strong>.</p>
          <p>We are not liable for indirect, incidental, or consequential damages including lost profits, data loss, or business interruption, even if advised of the possibility of such damages.</p>
          <p>We do not warrant that the Service will be uninterrupted or error-free. Planned maintenance is communicated 48 hours in advance at status.aiql.com.</p>
        </Section>

        <Section title="9. Termination">
          <p>You may cancel your subscription at any time from Settings → Billing. We may suspend or terminate your access immediately if you breach these Terms, fail to pay, or if required by law.</p>
          <p>On termination, your right to use the Service ceases. Sections 5 (Your Data), 6 (IP), 8 (Liability), 10 (Governing Law), and 11 (Disputes) survive termination.</p>
        </Section>

        <Section title="10. Governing Law">
          <p>These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts of India.</p>
        </Section>

        <Section title="11. Dispute Resolution">
          <p>Before initiating legal proceedings, you agree to first notify us at <a href="mailto:legal@aiql.com" className="text-[#1B3A5C] underline">legal@aiql.com</a> and give us 30 days to resolve the dispute informally. If unresolved, disputes shall be referred to arbitration under the Arbitration and Conciliation Act 1996 (India).</p>
        </Section>

        <Section title="12. Changes to These Terms">
          <p>We may update these Terms from time to time. We will notify you by email at least 14 days before any material changes take effect. Continued use after the effective date constitutes acceptance of the revised Terms.</p>
        </Section>

        <Section title="13. Contact">
          <p>
            For billing: <a href="mailto:billing@aiql.com" className="text-[#1B3A5C] underline">billing@aiql.com</a><br />
            For legal/terms: <a href="mailto:legal@aiql.com" className="text-[#1B3A5C] underline">legal@aiql.com</a><br />
            For support: <a href="mailto:support@aiql.com" className="text-[#1B3A5C] underline">support@aiql.com</a>
          </p>
        </Section>

        <div className="border-t border-slate-100 pt-6 mt-8">
          <p className="text-xs text-slate-400">Last updated: {effectiveDate}</p>
          <div className="flex gap-4 mt-3 text-xs text-slate-400">
            <Link href="/privacy" className="hover:text-slate-600">Privacy Policy</Link>
            <Link href="/pricing" className="hover:text-slate-600">Pricing</Link>
            <Link href="/" className="hover:text-slate-600">Home</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
