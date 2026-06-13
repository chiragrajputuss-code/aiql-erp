"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Sparkles } from "lucide-react";

const DISMISS_KEY = "aiql_v1_banner_dismissed";

export function NewFeatureBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(localStorage.getItem(DISMISS_KEY) !== "1");
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="flex items-center gap-3 bg-[#1B3A5C] text-white px-4 py-2.5 text-sm">
      <Sparkles className="h-4 w-4 text-blue-300 shrink-0" />
      <p className="flex-1">
        <span className="font-semibold">New in AIQL:</span>{" "}
        Ask AI questions on your GL in plain English, and get a Daily Pulse with compliance deadlines + TDS alerts.{" "}
        <Link href="/connections" className="underline underline-offset-2 hover:text-blue-200">
          Try it on your GL →
        </Link>
      </p>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-white/60 hover:text-white shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
