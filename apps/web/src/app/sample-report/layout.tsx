import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sample GST/ITC & Duplicate-Payment Report",
  description:
    "See a real AccountIQ investigation report: GST/ITC risks, duplicate payments, receivables and cash findings — each with the evidence, the ₹ impact and the action to take. No signup required.",
  alternates: { canonical: "/sample-report" },
};

export default function SampleReportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
