"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/general", label: "General" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/llm", label: "LLM Config" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/tokenisation/config", label: "Data Masking" },
];

export default function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b mb-6">
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
  );
}
