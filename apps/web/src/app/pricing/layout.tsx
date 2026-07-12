import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Plans for CAs & Finance Teams",
  description:
    "AcctQAI pricing — from ₹999/month with a 14-day free trial. GSTR-2B & ITC reconciliation, and duplicate-payment detection. No usage limits, no AI credits.",
  alternates: { canonical: "/pricing" },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
