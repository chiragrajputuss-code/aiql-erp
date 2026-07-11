import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";

const inter = Inter({ subsets: ["latin"] });

const SITE_URL = process.env.DOMAIN ?? "https://acctqai.com";
const SITE_NAME = "AccountIQ";
const TITLE = "GSTR-2B Reconciliation Software for CAs & SMEs | AccountIQ";
const DESCRIPTION =
  "Reconcile GSTR-2B with your books. Catch blocked ITC, unfiled vendors and duplicate payments — each with the evidence and the rupee impact. Built for Indian CAs & SMEs.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  keywords: [
    "GSTR-2B reconciliation",
    "GST reconciliation software",
    "input tax credit reconciliation",
    "ITC mismatch GSTR-2B",
    "duplicate payment detection",
    "GSTR-2B vs purchase register",
    "GST reconciliation for CA",
    "Tally GST reconciliation",
    "vendor GSTR-1 not filed ITC",
    "AccountIQ",
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
    // Preview image is supplied by app/opengraph-image.tsx (generated PNG).
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    // Preview image is supplied by app/twitter-image.tsx (generated PNG).
  },
  alternates: {
    canonical: SITE_URL,
  },
};

// ─── Root layout ──────────────────────────────────────────────────────────────

const jsonLd = [
  {
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
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/opengraph-image`,
    description:
      "AccountIQ investigates the books of Indian SMEs and their CAs — reconciling GSTR-2B to surface blocked ITC, unfiled vendors and duplicate payments, with evidence and recommended actions.",
    areaServed: "IN",
    knowsAbout: [
      "GST reconciliation",
      "GSTR-2B input tax credit",
      "duplicate payment detection",
      "vendor compliance",
      "month-end close",
    ],
  },
];

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
