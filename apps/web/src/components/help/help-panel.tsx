"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { HelpCircle, X, Send, Loader2, Compass, MessageCircleQuestion } from "lucide-react";
import { tourForPath } from "@/lib/help/tours";
import { ProductTour } from "./product-tour";

// ─── In-app help ─────────────────────────────────────────────────────────────
//
// One affordance, two ways to get unstuck:
//   1. "Show me around this page" — a guided tour that spotlights the real
//      elements on screen (product-tour.tsx).
//   2. A question box answered from the curated, state-aware app corpus
//      (/api/v1/assistant/app) — zero LLM calls, honest refusal when it has
//      no answer rather than an invented one.
//
// Deliberately separate from the marketing-site widget (assistant-widget.tsx),
// which is mounted only on public pages and answers domain questions for
// anonymous visitors. Different audience, different corpus, different job.

interface Exchange {
  question: string;
  answer:   string;
  cta?:     { label: string; href: string } | null;
}

export function HelpPanel() {
  const pathname = usePathname();
  const [open, setOpen]           = useState(false);
  const [tourOpen, setTourOpen]   = useState(false);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [history, setHistory]     = useState<Exchange[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const tour = tourForPath(pathname);

  // Suggestions depend on account state, so they're fetched when the panel is
  // opened rather than at mount — a user who uploads a file mid-session gets
  // the updated set next time they open it.
  useEffect(() => {
    if (!open || suggestions.length > 0) return;
    (async () => {
      try {
        const res = await fetch("/api/v1/assistant/app");
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
      } catch { /* suggestions are a convenience; the box still works */ }
    })();
  }, [open, suggestions.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, loading]);

  const submit = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/v1/assistant/app", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ question: q }),
      });
      const data = res.ok
        ? await res.json()
        : { answer: "Something went wrong. Please try again." };
      setHistory((h) => [...h, { question: q, answer: data.answer, cta: data.cta ?? null }]);
    } catch {
      setHistory((h) => [...h, { question: q, answer: "Something went wrong. Please try again.", cta: null }]);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  function startTour() {
    setOpen(false);
    setTourOpen(true);
  }

  return (
    <>
      {tourOpen && tour && <ProductTour tour={tour} onClose={() => setTourOpen(false)} />}

      <div className="fixed bottom-5 right-5 z-50 print:hidden">
        {open ? (
          <div className="w-[370px] max-w-[calc(100vw-2.5rem)] h-[520px] max-h-[calc(100vh-6rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="bg-[#1B3A5C] text-white px-4 py-3 flex items-center justify-between shrink-0">
              <div>
                <p className="font-semibold text-sm">Help</p>
                <p className="text-[11px] text-blue-200">How to use AcctQAI</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close help" className="text-blue-200 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {history.length === 0 && (
                <div className="space-y-3">
                  {tour && (
                    <button
                      onClick={startTour}
                      className="w-full flex items-start gap-2.5 text-left px-3 py-2.5 rounded-lg border border-[#1B3A5C]/20 bg-[#1B3A5C]/[0.04] hover:border-[#1B3A5C]/50 transition-colors"
                    >
                      <Compass className="h-4 w-4 text-[#1B3A5C] shrink-0 mt-0.5" />
                      <span>
                        <span className="block text-xs font-semibold text-slate-800">Show me around this page</span>
                        <span className="block text-[11px] text-slate-500 mt-0.5">{tour.title} — {tour.steps.length} quick steps</span>
                      </span>
                    </button>
                  )}

                  {suggestions.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Common questions</p>
                      <div className="flex flex-col gap-1.5">
                        {suggestions.map((s) => (
                          <button
                            key={s}
                            onClick={() => submit(s)}
                            className="text-left text-xs px-3 py-2 rounded-lg border border-slate-200 hover:border-[#1B3A5C] hover:bg-slate-50 text-slate-700"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {history.map((ex, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-end">
                    <p className="bg-[#1B3A5C] text-white text-xs rounded-2xl rounded-br-sm px-3 py-2 max-w-[85%]">{ex.question}</p>
                  </div>
                  <div className="flex justify-start">
                    <div className="bg-slate-100 text-slate-700 text-xs rounded-2xl rounded-bl-sm px-3 py-2 max-w-[92%] space-y-2">
                      <p className="whitespace-pre-wrap leading-relaxed">{ex.answer}</p>
                      {ex.cta && (
                        <Link href={ex.cta.href} onClick={() => setOpen(false)} className="inline-flex text-[#1B3A5C] font-semibold hover:underline">
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

            <form
              onSubmit={(e) => { e.preventDefault(); submit(input); }}
              className="border-t border-slate-100 p-2.5 flex items-center gap-2 shrink-0"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask how to do something…"
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
          <div className="flex flex-col items-end gap-2">
            {tour && (
              <button
                onClick={startTour}
                className="inline-flex items-center gap-1.5 bg-white text-[#1B3A5C] border border-slate-200 shadow-lg text-xs font-semibold px-3 py-2 rounded-full hover:bg-slate-50 transition-colors"
              >
                <Compass className="h-3.5 w-3.5" /> Show me around
              </button>
            )}
            <button
              onClick={() => setOpen(true)}
              aria-label="Open help"
              className="w-13 h-13 p-3.5 rounded-full bg-[#1B3A5C] text-white shadow-xl flex items-center justify-center hover:bg-[#1B3A5C]/90 transition-colors"
            >
              <HelpCircle className="h-6 w-6" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// Small named export so a page can offer an inline "how does this work?"
// affordance next to a specific control, rather than only the corner button.
export function InlineHelpHint({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
      <MessageCircleQuestion className="h-3 w-3" /> {children}
    </span>
  );
}
