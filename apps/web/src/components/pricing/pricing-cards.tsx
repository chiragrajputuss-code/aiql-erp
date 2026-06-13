"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X, Sparkles } from "lucide-react";
import { PLANS, formatInr, type Plan } from "@/lib/plans";

// ─── Toggle ───────────────────────────────────────────────────────────────────

function BillingToggle({
  annual,
  onChange,
}: {
  annual: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="inline-flex items-center gap-3 bg-slate-100 rounded-full p-1">
      <button
        onClick={() => onChange(false)}
        className={`text-sm font-medium px-4 py-1.5 rounded-full transition-all ${
          !annual ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
        }`}
      >
        Monthly
      </button>
      <button
        onClick={() => onChange(true)}
        className={`text-sm font-medium px-4 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
          annual ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
        }`}
      >
        Annual
        <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 leading-none">
          2 months free
        </span>
      </button>
    </div>
  );
}

// ─── Plan card ────────────────────────────────────────────────────────────────

function PlanCard({ plan, annual }: { plan: Plan; annual: boolean }) {
  const price = annual ? plan.annualMonthly : plan.monthlyPrice;

  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-7 transition-shadow hover:shadow-lg ${
        plan.recommended
          ? "border-[#1B3A5C] shadow-md bg-white ring-1 ring-[#1B3A5C]/10"
          : "border-slate-200 bg-white"
      }`}
    >
      {plan.recommended && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 bg-[#1B3A5C] text-white text-[11px] font-semibold px-3 py-1 rounded-full">
            <Sparkles className="w-3 h-3" /> Most Popular
          </span>
        </div>
      )}

      <div className="mb-5">
        <h3 className="text-base font-semibold text-slate-900">{plan.name}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{plan.tagline}</p>
      </div>

      <div className="mb-5">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-slate-900 tracking-tight">
            {formatInr(price)}
          </span>
          <span className="text-sm text-slate-400">/mo</span>
        </div>
        {annual && (
          <p className="text-xs text-emerald-600 mt-1">
            Billed {formatInr(price * 12)}/year · saves {formatInr((plan.monthlyPrice - price) * 12)}
          </p>
        )}
        {!annual && (
          <p className="text-xs text-slate-400 mt-1">
            or {formatInr(plan.annualMonthly)}/mo billed annually
          </p>
        )}
      </div>

      <Link
        href={plan.ctaHref}
        className={`block text-center text-sm font-semibold rounded-lg px-4 py-2.5 mb-6 transition-colors ${
          plan.recommended
            ? "bg-[#1B3A5C] text-white hover:bg-[#15304d]"
            : "border border-slate-200 text-slate-700 hover:bg-slate-50"
        }`}
      >
        {plan.ctaLabel}
      </Link>

      <ul className="space-y-2.5 flex-1">
        {plan.features.map((f) => (
          <li key={f.text} className="flex items-start gap-2.5">
            {f.included ? (
              <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <X className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
            )}
            <span
              className={`text-xs leading-snug ${
                f.included
                  ? f.highlight
                    ? "text-slate-900 font-medium"
                    : "text-slate-600"
                  : "text-slate-400"
              }`}
            >
              {f.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PricingCards() {
  const [annual, setAnnual] = useState(true);

  return (
    <div>
      {/* Toggle */}
      <div className="flex justify-center mb-10">
        <BillingToggle annual={annual} onChange={setAnnual} />
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} annual={annual} />
        ))}
      </div>
    </div>
  );
}
