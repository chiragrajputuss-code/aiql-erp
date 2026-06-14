import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AccountIQ — Ask your books anything",
  description: "AI-powered financial intelligence for Indian SMEs. Connect Tally, Zoho Books or GL exports. Query in plain English, catch compliance issues automatically.",
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
            { label: "Contact",  href: "mailto:support@aiql.com" },
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} flex flex-col min-h-screen`}>
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
