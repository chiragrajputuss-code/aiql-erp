import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const SITE_URL = process.env.DOMAIN ?? "https://acctqai.com";
const SITE_NAME = "AccountIQ";
const TITLE = "AccountIQ — Ask your books anything | AI Finance for Indian SMEs";
const DESCRIPTION =
  "AccountIQ connects to Tally, Zoho Books and GL exports. Ask questions in plain English or Hindi — get instant answers, GST summaries, overdue debtors, profit reports and more. Free 14-day trial.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  keywords: [
    "Tally AI query",
    "Zoho Books AI",
    "GL close automation",
    "Indian SME accounting software",
    "ask ERP in English",
    "finance AI India",
    "GST summary AI",
    "accounts receivable India",
    "AccountIQ",
    "acctqai",
  ],
  authors: [{ name: "AccountIQ", url: SITE_URL }],
  creator: "AccountIQ",
  publisher: "AccountIQ",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "AccountIQ — Ask your books anything" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: SITE_URL,
  },
};

// ─── Site-wide footer ─────────────────────────────────────────────────────────
// Rendered on all pages including dashboard, legal, and public pages.
// Kept minimal — auth pages suppress it via their own full-page layout.

function SiteFooter() {
  return (
    <footer className="border-t border-slate-100 bg-white mt-auto">
      <div className="max-w-6xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-[11px] text-slate-400">
          © {new Date().getFullYear()} AIQL · AI-powered GL close for Indian SMEs
        </p>
        <nav className="flex items-center gap-5">
          {[
            { label: "Privacy",  href: "/privacy" },
            { label: "Terms",    href: "/terms" },
            { label: "Pricing",  href: "/pricing" },
            { label: "Security", href: "/security" },
            { label: "Contact",  href: "/contact" },
          ].map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

// ─── Root layout ──────────────────────────────────────────────────────────────

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AccountIQ",
  url: SITE_URL,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: DESCRIPTION,
  offers: {
    "@type": "Offer",
    price: "999",
    priceCurrency: "INR",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      billingDuration: "P1M",
    },
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    reviewCount: "24",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${inter.className} flex flex-col min-h-screen`}>
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
