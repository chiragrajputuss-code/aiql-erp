import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — AIQL",
  description: "How AIQL collects, uses, and protects your financial data.",
};

// ── Reusable section wrapper ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-slate-800 mb-3">{title}</h2>
      <div className="text-slate-600 text-sm leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PrivacyPage() {
  const effectiveDate = "1 June 2026";

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-slate-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-[#1B3A5C]">AIQL</Link>
          <Link href="/signup" className="text-sm text-[#1B3A5C] hover:underline font-medium">
            Sign up free →
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-400 mb-10">Effective date: {effectiveDate}</p>

        <p className="text-slate-600 text-sm leading-relaxed mb-8">
          AIQL (&quot;we&quot;, &quot;our&quot;, &quot;the Service&quot;) is an AI-assisted GL close
          and audit tool for Indian finance teams. This Privacy Policy describes what data we
          collect, how we use and protect it, and your rights as a data principal under the{" "}
          <strong>Digital Personal Data Protection Act 2023 (DPDP Act)</strong> and applicable
          Indian law.
        </p>

        <Section title="1. Data We Collect">
          <p><strong>Account data:</strong> Email address, name, and (optionally) phone number when you create an account. For Google Sign-In, we receive the email and name from Google — no password is stored.</p>
          <p><strong>Uploaded GL data:</strong> CSV or Excel exports of your General Ledger that you upload for analysis. These files contain transaction records (dates, amounts, account names, voucher references). They may include vendor and customer names.</p>
          <p><strong>Query logs:</strong> The plain-English questions you type into the Query Studio, along with the SQL generated and the response. This is used to improve answer quality for your organisation over time (RAG learning).</p>
          <p><strong>Usage telemetry:</strong> Number of queries run, connections created, and features used — to measure subscription limits and improve the product. We do <em>not</em> track page clicks or browsing behaviour beyond the app.</p>
          <p><strong>Billing data:</strong> If you subscribe to a paid plan, payment is processed by Razorpay. We receive only a payment confirmation token — we never store your card number, UPI VPA, or bank details.</p>
        </Section>

        <Section title="2. How We Use Your Data">
          <p><strong>GL data is used exclusively for analysis you request.</strong> We run data-quality scans and SQL queries on your uploaded data to surface anomalies, generate close tasks, and answer your questions. We do not sell, share, or use your GL data to train any external AI model.</p>
          <p><strong>PII is masked before any LLM call.</strong> Before your query or GL data reaches a Large Language Model (Groq / Anthropic), our tokeniser replaces vendor names, customer names, and amounts with anonymised tokens (e.g., <code>VENDOR_T001</code>). The raw values are re-injected only in the final response displayed to you. The LLM never receives or stores your actual vendor/customer names.</p>
          <p><strong>Query logs are used for RAG (Retrieval-Augmented Generation).</strong> Successful Q→SQL pairs are stored under your organisation and used as few-shot examples to improve future answers within your account. They are never shared across organisations.</p>
        </Section>

        <Section title="3. Data Storage and Security">
          <p><strong>Location:</strong> All data is stored on Amazon Web Services in the <strong>ap-south-1 (Mumbai) region</strong>, within Indian jurisdiction.</p>
          <p><strong>Encryption:</strong> Data is encrypted at rest (AES-256 via AWS RDS) and in transit (TLS 1.2+). Uploaded GL tables are stored in isolated database schemas per organisation.</p>
          <p><strong>Access controls:</strong> Only your organisation&apos;s users (with valid session tokens) can query your GL data. Our engineering team may access anonymised telemetry for debugging but does not access individual GL tables without explicit support consent.</p>
          <p><strong>Secrets:</strong> API keys you provide for third-party LLMs are encrypted using AWS KMS before storage and decrypted only at call time, in memory.</p>
        </Section>

        <Section title="4. Data Retention">
          <p><strong>Uploaded files:</strong> GL tables are retained for <strong>90 days</strong> from upload, after which they are automatically deleted. You can re-upload to extend this window. You can also delete a connection at any time from Settings → Connections, which immediately drops the GL table.</p>
          <p><strong>Query logs:</strong> Retained indefinitely to support your RAG history. You can request deletion via <a href="mailto:privacy@aiql.com" className="text-[#1B3A5C] underline">privacy@aiql.com</a>.</p>
          <p><strong>Account data:</strong> Retained until you delete your account. On deletion, all personal data and GL tables are removed within 30 days.</p>
        </Section>

        <Section title="5. Your Rights under the DPDP Act 2023">
          <p>As a data principal under the Digital Personal Data Protection Act 2023, you have the right to:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong>Access</strong> — request a summary of personal data we hold about you</li>
            <li><strong>Correction</strong> — request correction of inaccurate data</li>
            <li><strong>Erasure</strong> — request deletion of your personal data and associated GL data</li>
            <li><strong>Grievance redressal</strong> — raise a complaint with our Data Protection Officer</li>
            <li><strong>Nomination</strong> — nominate a person to exercise your rights in the event of death or incapacity</li>
          </ul>
          <p>
            To exercise these rights, email{" "}
            <a href="mailto:privacy@aiql.com" className="text-[#1B3A5C] underline">privacy@aiql.com</a>{" "}
            from your registered email address. We will respond within 7 business days.
          </p>
        </Section>

        <Section title="6. Third-Party Services">
          <p>We use the following sub-processors:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong>Amazon Web Services (AWS)</strong> — database hosting (Mumbai region)</li>
            <li><strong>Groq Inc.</strong> — LLM inference for query generation (PII-masked only)</li>
            <li><strong>Anthropic PBC</strong> — LLM fallback for complex queries (PII-masked only)</li>
            <li><strong>Razorpay Software Pvt. Ltd.</strong> — payment processing</li>
          </ul>
          <p>We do not use Google Analytics, Facebook Pixel, or any advertising trackers.</p>
        </Section>

        <Section title="7. Cookies">
          <p>We use a single session cookie (<code>auth_session</code>) to keep you logged in. No tracking or advertising cookies are used. The session cookie expires when you log out or after 30 days of inactivity.</p>
        </Section>

        <Section title="8. Children">
          <p>AIQL is a professional finance tool not intended for users under 18. We do not knowingly collect data from minors.</p>
        </Section>

        <Section title="9. Changes to This Policy">
          <p>We will notify you by email at least 7 days before any material changes to this policy. Continued use of the service after the effective date constitutes acceptance.</p>
        </Section>

        <Section title="10. Contact">
          <p>
            <strong>Data Protection Officer:</strong>{" "}
            <a href="mailto:privacy@aiql.com" className="text-[#1B3A5C] underline">privacy@aiql.com</a>
          </p>
          <p>
            AIQL — AI-Powered GL Close Platform<br />
            India (registered under Indian law)
          </p>
        </Section>

        <div className="border-t border-slate-100 pt-6 mt-8">
          <p className="text-xs text-slate-400">
            Last updated: {effectiveDate} · For questions, email{" "}
            <a href="mailto:privacy@aiql.com" className="underline">privacy@aiql.com</a>
          </p>
          <div className="flex gap-4 mt-3 text-xs text-slate-400">
            <Link href="/terms" className="hover:text-slate-600">Terms of Service</Link>
            <Link href="/pricing" className="hover:text-slate-600">Pricing</Link>
            <Link href="/" className="hover:text-slate-600">Home</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
