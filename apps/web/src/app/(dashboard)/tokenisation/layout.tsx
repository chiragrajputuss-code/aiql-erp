"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/tokenisation/preview", label: "Preview" },
  { href: "/tokenisation/config",  label: "Settings" },
];

export default function TokenisationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-0">
      <div className="mb-6 border-b">
        <div className="flex items-end justify-between mb-3">
          <h1 className="text-2xl font-semibold text-slate-900">Tokenisation</h1>
        </div>
        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                pathname.startsWith(tab.href)
                  ? "border-[#1B3A5C] text-[#1B3A5C]"
                  : "border-transparent text-muted-foreground hover:text-slate-700"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
