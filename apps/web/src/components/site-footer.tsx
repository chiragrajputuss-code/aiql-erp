"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Global minimal legal footer. Hidden on the landing page, which renders its
// own rich footer, to avoid a duplicate footer.
export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  return (
    <footer className="border-t border-slate-100 bg-white mt-auto">
      <div className="max-w-6xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-[11px] text-slate-400">
          © {new Date().getFullYear()} AcctQAI · Financial Investigation Platform for Indian finance teams
        </p>
        <nav className="flex items-center gap-5">
          {[
            { label: "Privacy",  href: "/privacy" },
            { label: "Terms",    href: "/terms" },
            { label: "Pricing",  href: "/pricing" },
            { label: "Security", href: "/privacy#security" },
            { label: "Contact",  href: "/contact" },
          ].map(({ label, href }) => (
            <Link key={label} href={href} className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
