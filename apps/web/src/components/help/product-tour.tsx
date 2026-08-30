"use client";

import { useState, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { X, ArrowRight, ArrowLeft } from "lucide-react";
import type { Tour, TourStep } from "@/lib/help/tours";

// ─── Product tour overlay ────────────────────────────────────────────────────
//
// Spotlights real on-page elements rather than showing screenshots. Built in
// house rather than pulling in driver.js/shepherd — the whole thing is one
// component and avoids a dependency for a feature this contained.
//
// Two behaviours worth knowing about:
//  - A step whose target element isn't on the page is SKIPPED, not rendered
//    against a blank rect. That keeps a stale selector from parking a tooltip
//    in the corner pointing at nothing (dev builds warn to console).
//  - Position is recomputed on scroll/resize, because the spotlight is drawn
//    in viewport coordinates over a fixed overlay.

const TOOLTIP_W = 320;
const GAP       = 12;   // space between target and tooltip
const PAD       = 6;    // spotlight padding around the target

interface Rect { top: number; left: number; width: number; height: number }

function rectOf(target: string): Rect | null {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // A target that exists but is collapsed (display:none ancestor, empty
  // conditional render) is treated as absent — same skip path.
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Place the tooltip on the requested side, flipping when it would overflow. */
function placeTooltip(rect: Rect, placement: TourStep["placement"] = "bottom") {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const estH = 190; // tooltip height estimate for flip decisions

  let side = placement;
  if (side === "bottom" && rect.top + rect.height + GAP + estH > vh) side = "top";
  if (side === "top"    && rect.top - GAP - estH < 0)                side = "bottom";
  if (side === "right"  && rect.left + rect.width + GAP + TOOLTIP_W > vw) side = "left";
  if (side === "left"   && rect.left - GAP - TOOLTIP_W < 0)          side = "right";

  let top: number;
  let left: number;

  switch (side) {
    case "top":
      top  = rect.top - GAP;
      left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
      return { top, left, transform: "translateY(-100%)" };
    case "left":
      top  = rect.top + rect.height / 2;
      left = rect.left - GAP - TOOLTIP_W;
      return { top, left, transform: "translateY(-50%)" };
    case "right":
      top  = rect.top + rect.height / 2;
      left = rect.left + rect.width + GAP;
      return { top, left, transform: "translateY(-50%)" };
    case "bottom":
    default:
      top  = rect.top + rect.height + GAP;
      left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
      return { top, left, transform: "none" };
  }
}

export function ProductTour({ tour, onClose }: { tour: Tour; onClose: () => void }) {
  // Only steps whose target is actually present — computed once on open so the
  // step count shown to the user stays stable while they walk through it.
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const present = tour.steps.filter((s) => {
      const ok = rectOf(s.target) !== null;
      if (!ok && process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[tour:${tour.id}] skipping step — no element with [data-tour="${s.target}"]`);
      }
      return ok;
    });
    setSteps(present);
    setI(0);
  }, [tour]);

  const step = steps[i];

  const reposition = useCallback(() => {
    if (!step) return;
    setRect(rectOf(step.target));
  }, [step]);

  // useLayoutEffect so the spotlight is painted in the right place on the very
  // first frame rather than flashing at 0,0.
  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    reposition();
  }, [step, reposition]);

  useEffect(() => {
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [reposition]);

  const next = useCallback(() => {
    setI((n) => (n + 1 < steps.length ? n + 1 : n));
    if (i + 1 >= steps.length) onClose();
  }, [i, steps.length, onClose]);

  const prev = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape")     onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft")  prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  // Every step's target was missing — tell the user plainly instead of
  // rendering an empty overlay they have to guess their way out of.
  if (mounted && steps.length === 0) {
    return createPortal(
      <div className="fixed inset-0 z-[100] bg-slate-900/50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-xl p-5 max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm text-slate-700">There&apos;s nothing to walk through on this screen yet. Try it once you&apos;ve loaded a client book.</p>
          <button onClick={onClose} className="mt-4 text-sm font-semibold text-[#1B3A5C] hover:underline">Close</button>
        </div>
      </div>,
      document.body,
    );
  }

  if (!mounted || !step || !rect) return null;

  const pos = placeTooltip(rect, step.placement);

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-label={`${tour.title}: step ${i + 1} of ${steps.length}`}>
      {/* Dim + spotlight. A huge box-shadow on a transparent cut-out is the
          cheapest way to darken everything except the target, with no SVG
          mask and no four-panel layout maths. */}
      <div
        className="absolute rounded-lg pointer-events-none transition-all duration-200"
        style={{
          top:    rect.top - PAD,
          left:   rect.left - PAD,
          width:  rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          boxShadow: "0 0 0 9999px rgba(15,23,42,0.62)",
          border: "2px solid #8FB4EE",
        }}
      />
      {/* Click-anywhere-to-exit, sitting under the tooltip. */}
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className="absolute bg-white rounded-xl shadow-2xl p-4"
        style={{ top: pos.top, left: pos.left, width: TOOLTIP_W, transform: pos.transform }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold text-slate-900 text-sm">{step.title}</p>
          <button onClick={onClose} aria-label="Close tour" className="text-slate-400 hover:text-slate-600 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{step.body}</p>

        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-1">
            {steps.map((_, n) => (
              <span
                key={n}
                className={`h-1.5 rounded-full transition-all ${n === i ? "w-4 bg-[#1B3A5C]" : "w-1.5 bg-slate-200"}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button onClick={prev} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-3 w-3" /> Back
              </button>
            )}
            <button
              onClick={next}
              className="inline-flex items-center gap-1 bg-[#1B3A5C] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#1B3A5C]/90"
            >
              {i + 1 === steps.length ? "Done" : <>Next <ArrowRight className="h-3 w-3" /></>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
