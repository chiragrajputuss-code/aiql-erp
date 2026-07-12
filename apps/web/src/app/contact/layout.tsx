import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact & Demo",
  description:
    "Talk to the AcctQAI team or book a demo. See how one investigation surfaces blocked ITC, unfiled vendors and duplicate payments across your books — or your entire client practice.",
  alternates: { canonical: "/contact" },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
