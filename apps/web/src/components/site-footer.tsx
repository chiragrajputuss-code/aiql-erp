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
        <p className="text-[11px] text-slate-400 text-center sm:text-left">
          © {new Date().getFullYear()} AcctQAI · Financial Investigation Platform for Indian finance teams
        </p>
        {/* Links wrap and carry a 44px touch height on phones — at the bare
            11px line height these were ~20px tall, well under a comfortable
            tap target, and sat close enough together to mis-tap. */}
        <nav className="flex items-center justify-center flex-wrap gap-x-5 gap-y-1">
          {[
            { label: "Privacy",  href: "/privacy" },
            { label: "Terms",    href: "/terms" },
            { label: "Pricing",  href: "/pricing" },
            { label: "Security", href: "/privacy#security" },
            { label: "Contact",  href: "/contact" },
          ].map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="inline-flex items-center min-h-11 sm:min-h-0 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
