import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact & Demo",
  description:
    "Talk to the AccountIQ team or book a demo. See how one investigation surfaces GST/ITC risks, duplicate payments and cash leaks across your books — or your entire client practice.",
  alternates: { canonical: "/contact" },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
