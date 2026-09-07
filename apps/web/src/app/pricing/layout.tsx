import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Plans for CAs & Finance Teams",
  // Keep this in step with the page itself — it's the Google snippet, so a
  // stale price or a trial that doesn't exist is the first thing a CA reads.
  description:
    "AcctQAI is free for founding firms through 2027 — no trial, no card. GSTR-2B & ITC reconciliation and duplicate-payment detection, with no usage limits and no AI credits.",
  alternates: { canonical: "/pricing" },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
