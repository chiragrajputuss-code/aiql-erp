"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { ANSWERS } from "@/lib/assistant/answers";

// ─── Where it appears ─────────────────────────────────────────────────────────
// Marketing pages only — home, pricing, resources (incl. articles),
// sample-report, contact. Never in the dashboard (docs/PLAN-PRACTICE-MODE.md
// 6.5). Mounted once in the root layout; self-hides via usePathname(),
// mirroring the same pattern SiteFooter already uses.

const MARKETING_PATHS_EXACT = new Set(["/", "/pricing", "/sample-report", "/contact"]);

function isMarketingPath(pathname: string): boolean {
  return MARKETING_PATHS_EXACT.has(pathname) || pathname.startsWith("/resources");
}

// A fixed, deterministic mix of product + domain questions — avoids a
// hydration mismatch that a random sample would risk on first paint.
const SUGGESTION_IDS = ["product-what-checks", "product-cost", "domain-what-is-itc", "domain-rule-37a", "objection-is-chatgpt"];
const SUGGESTIONS = SUGGESTION_IDS
  .map((id) => ANSWERS.find((a) => a.id === id))
  .filter((a): a is NonNullable<typeof a> => Boolean(a));

interface Exchange {
  question: string;
  answer:   string;
  cta?:     { label: string; href: string } | null;
}

interface AssistantResponse {
  matched:       boolean;
  answer:        string;
  cta?:          { label: string; href: string };
  refusalReason?: "injection" | "off_topic" | "no_match";
}

async function askAssistant(question: string): Promise<AssistantResponse> {
  const res = await fetch("/api/assistant", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ question }),
  });
  if (res.status === 429) {
    return { matched: false, answer: "Too many questions in a short time — please try again in a bit." };
  }
  if (!res.ok) {
    return { matched: false, answer: "Something went wrong. Please try again, or reach us at /contact." };
  }
  return res.json();
}

export function AssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen]         = useState(false);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [history, setHistory]   = useState<Exchange[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, loading]);

  if (!isMarketingPath(pathname)) return null;

  async function submit(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setInput("");
    setLoading(true);
    try {
      const res = await askAssistant(q);
      setHistory((h) => [...h, { question: q, answer: res.answer, cta: res.cta ?? null }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <div className="w-[380px] max-w-[calc(100vw-2.5rem)] h-[520px] max-h-[calc(100vh-6rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-[#1B3A5C] text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div>
              <p className="font-semibold text-sm">Ask AcctQAI</p>
              <p className="text-[11px] text-blue-200">GST, ITC and product questions</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-blue-200 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {history.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">Try one of these, or type your own question below.</p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => submit(s.question)}
                      className="text-left text-xs px-3 py-2 rounded-lg border border-slate-200 hover:border-[#1B3A5C] hover:bg-slate-50 text-slate-700"
                    >
                      {s.question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {history.map((ex, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-end">
                  <p className="bg-[#1B3A5C] text-white text-xs rounded-2xl rounded-br-sm px-3 py-2 max-w-[85%]">{ex.question}</p>
                </div>
                <div className="flex justify-start">
                  <div className="bg-slate-100 text-slate-700 text-xs rounded-2xl rounded-bl-sm px-3 py-2 max-w-[90%] space-y-2">
                    <p className="whitespace-pre-wrap">{ex.answer}</p>
                    {ex.cta && (
                      <Link href={ex.cta.href} className="inline-flex text-[#1B3A5C] font-semibold hover:underline">
                        {ex.cta.label} →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); submit(input); }}
            className="border-t border-slate-100 p-2.5 flex items-center gap-2 shrink-0"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              maxLength={500}
              className="flex-1 text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]/30"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="shrink-0 w-9 h-9 rounded-lg bg-[#1B3A5C] text-white flex items-center justify-center disabled:opacity-40 hover:bg-[#1B3A5C]/90"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
          className="w-14 h-14 rounded-full bg-[#1B3A5C] text-white shadow-xl flex items-center justify-center hover:bg-[#1B3A5C]/90 transition-colors"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
