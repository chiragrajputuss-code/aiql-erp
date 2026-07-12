import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sample GST/ITC & Duplicate-Payment Report",
  description:
    "See a real AcctQAI investigation report: blocked ITC, unfiled vendors and duplicate payments — each with the evidence, the ₹ impact and the action to take. No signup required.",
  alternates: { canonical: "/sample-report" },
};

export default function SampleReportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
