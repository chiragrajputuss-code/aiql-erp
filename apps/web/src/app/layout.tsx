import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";

const inter = Inter({ subsets: ["latin"] });

const SITE_URL = process.env.DOMAIN ?? "https://acctqai.com";
const SITE_NAME = "AccountIQ";
const TITLE = "AccountIQ — Know what deserves your attention before it costs you money";
const DESCRIPTION =
  "AccountIQ is a financial investigation platform for Indian finance teams. Upload your books and it surfaces GST risks, vendor issues, duplicate payments, cash leaks and opportunities — each with the evidence and the action to take, before month-end.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  keywords: [
    "financial investigation platform",
    "GST reconciliation India",
    "GSTR-2B ITC tracking",
    "vendor compliance India",
    "duplicate payment detection",
    "month end close India",
    "TDS reconciliation tool",
    "finance team software India",
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
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "AccountIQ — Financial Investigation Platform" }],
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
