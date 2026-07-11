import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Plans for CAs & Finance Teams",
  description:
    "AccountIQ pricing — from ₹999/month with a 14-day free trial. GSTR-2B & ITC reconciliation, duplicate-payment detection and cash-risk findings. No usage limits, no AI credits.",
  alternates: { canonical: "/pricing" },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
