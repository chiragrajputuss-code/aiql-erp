"use client";

import { useEffect, useState, useCallback } from "react";
import { Check, X, AlertCircle, CheckCircle2, Loader2, Zap, CreditCard } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BillingState {
  plan: string;
  trialEndsAt: string | null;
  isTrialActive: boolean;
  trialDaysLeft: number;
  isSubscriptionActive: boolean;
  subscriptionStatus: string | null;
  queriesUsed: number;
  queryLimit: number;
  queriesLeft: number;
  razorpayKeyId: string;
}

// ─── Plan definitions ─────────────────────────────────────────────────────────

const PLANS = [
  {
    key: "STARTER",
    name: "Starter",
    monthlyPrice: 999,
    annualPrice: 9990,
    monthlyKey: "STARTER_MONTHLY" as const,
    annualKey: "STARTER_ANNUAL" as const,
    features: [
      "5 connections",
      "500 AI queries / month",
      "Document scanner (26Q, GSTR-1, GSTR-3B, ITR)",
      "Daily Pulse emails",
      "GL ↔ 26Q reconciliation",
      "GL ↔ GSTR-1 reconciliation",
      "5 team members",
      "Priority email support",
    ],
    missing: ["Month-end close engine", "Tally / Zoho live connector"],
    highlight: false,
  },
  {
    key: "PROFESSIONAL",
    name: "Growth",
    monthlyPrice: 2999,
    annualPrice: 29990,
    monthlyKey: "PROFESSIONAL_MONTHLY" as const,
    annualKey: "PROFESSIONAL_ANNUAL" as const,
    features: [
      "20 connections",
      "2,000 AI queries / month",
      "Document scanner (26Q, GSTR-1, GSTR-3B, ITR)",
      "Daily Pulse emails",
      "GL ↔ 26Q reconciliation",
      "GL ↔ GSTR-1 reconciliation",
      "Month-end close engine",
      "20 team members",
      "Knowledge base — auto-resolve patterns",
      "Priority support",
    ],
    missing: [],
    highlight: true,
  },
];

type PlanKey = "STARTER_MONTHLY" | "STARTER_ANNUAL" | "PROFESSIONAL_MONTHLY" | "PROFESSIONAL_ANNUAL";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: new (opts: Record<string, unknown>) => { open: () => void };
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [state, setState] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [annual, setAnnual] = useState(false);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    const res = await fetch("/api/billing/portal");
    if (res.ok) setState(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchState(); }, [fetchState]);

  // Load Razorpay checkout script
  useEffect(() => {
    if (document.getElementById("rzp-script")) return;
    const s = document.createElement("script");
    s.id = "rzp-script";
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    document.body.appendChild(s);
  }, []);

  async function handleSubscribe(planKey: PlanKey) {
    if (!state) return;
    setSubscribing(planKey);

    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "Failed to create subscription"); return; }

      const rzp = new window.Razorpay({
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: "AccountIQ",
        description: `${planKey.replace("_", " ")} subscription`,
        theme: { color: "#1B3A5C" },
        handler: () => {
          // Payment successful — webhook will update DB; refresh state
          setTimeout(fetchState, 2000);
        },
      });
      rzp.open();
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setSubscribing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!state) return null;

  const isActive = state.isSubscriptionActive;
  const pctUsed = Math.min(100, Math.round((state.queriesUsed / state.queryLimit) * 100));

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Billing & Plan</h1>
        <p className="text-slate-500 mt-1 text-sm">Manage your AccountIQ subscription</p>
      </div>

      {/* ── Status card ─────────────────────────────────────────────────── */}
      <div className={`rounded-2xl border p-6 ${
        state.isTrialActive
          ? "bg-amber-50 border-amber-200"
          : isActive
          ? "bg-green-50 border-green-200"
          : "bg-red-50 border-red-200"
      }`}>
        <div className="flex items-start gap-4">
          {state.isTrialActive ? (
            <Zap className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
          ) : isActive ? (
            <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-6 w-6 text-red-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <div className="font-semibold text-slate-900 text-base">
              {state.isTrialActive
                ? `Free trial — ${state.trialDaysLeft} day${state.trialDaysLeft === 1 ? "" : "s"} left`
                : isActive
                ? `${state.plan} plan — Active`
                : "Trial ended — upgrade to continue"}
            </div>
            <p className="text-sm text-slate-600 mt-1">
              {state.isTrialActive
                ? `Your trial ends on ${new Date(state.trialEndsAt!).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}. Upgrade before it ends to avoid interruption.`
                : isActive
                ? `Your subscription is active. Queries reset on the 1st of each month.`
                : `Your trial has ended. Subscribe below to continue querying your GL data.`}
            </p>

            {/* Query usage bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Queries used this month</span>
                <span>{state.queriesUsed} / {state.queryLimit === 999999 ? "Unlimited" : state.queryLimit}</span>
              </div>
              <div className="h-2 bg-white/60 rounded-full overflow-hidden border border-slate-200">
                <div
                  className={`h-full rounded-full transition-all ${pctUsed > 80 ? "bg-red-500" : "bg-[#1B3A5C]"}`}
                  style={{ width: `${pctUsed}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">{state.queriesLeft} queries remaining</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Billing toggle ───────────────────────────────────────────────── */}
      {!isActive && (
        <>
          <div className="flex items-center justify-center gap-3">
            <span className={`text-sm font-medium ${!annual ? "text-slate-900" : "text-slate-400"}`}>Monthly</span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative w-12 h-6 rounded-full transition-colors ${annual ? "bg-[#1B3A5C]" : "bg-slate-300"}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${annual ? "translate-x-7" : "translate-x-1"}`} />
            </button>
            <span className={`text-sm font-medium ${annual ? "text-slate-900" : "text-slate-400"}`}>
              Annual <span className="text-green-600 font-semibold">(save 2 months)</span>
            </span>
          </div>

          {/* ── Plan cards ──────────────────────────────────────────────── */}
          <div className="grid md:grid-cols-2 gap-6">
            {PLANS.map((plan) => {
              const planKey: PlanKey = annual ? plan.annualKey : plan.monthlyKey;
              const isLoading = subscribing === planKey;

              return (
                <div
                  key={plan.key}
                  className={`rounded-2xl border p-6 relative ${
                    plan.highlight
                      ? "border-[#1B3A5C] shadow-lg shadow-[#1B3A5C]/10"
                      : "border-slate-200"
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1B3A5C] text-white text-xs font-semibold px-4 py-1 rounded-full">
                      Most Popular
                    </div>
                  )}

                  <h3 className="text-lg font-bold text-[#1B3A5C]">{plan.name}</h3>

                  <div className="flex items-baseline gap-1 mt-2 mb-1">
                    <span className="text-3xl font-bold text-slate-900">
                      ₹{(annual ? Math.round(plan.annualPrice / 12) : plan.monthlyPrice).toLocaleString("en-IN")}
                    </span>
                    <span className="text-slate-400 text-sm">/month</span>
                  </div>
                  {annual && (
                    <p className="text-xs text-slate-500 mb-4">
                      ₹{plan.annualPrice.toLocaleString("en-IN")} billed annually
                    </p>
                  )}

                  <button
                    onClick={() => handleSubscribe(planKey)}
                    disabled={!!subscribing}
                    className={`w-full py-3 rounded-xl font-semibold text-sm mt-4 mb-5 transition-colors flex items-center justify-center gap-2 ${
                      plan.highlight
                        ? "bg-[#1B3A5C] text-white hover:bg-[#1B3A5C]/90 disabled:opacity-60"
                        : "bg-slate-100 text-[#1B3A5C] hover:bg-slate-200 disabled:opacity-60"
                    }`}
                  >
                    {isLoading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Opening checkout…</>
                    ) : (
                      <><CreditCard className="h-4 w-4" /> Subscribe — {annual ? "Annual" : "Monthly"}</>
                    )}
                  </button>

                  <div className="space-y-2">
                    {plan.features.map((f) => (
                      <div key={f} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        <span className="text-slate-700">{f}</span>
                      </div>
                    ))}
                    {plan.missing.map((f) => (
                      <div key={f} className="flex items-start gap-2 text-sm opacity-40">
                        <X className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                        <span className="text-slate-500">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-slate-400">
            Payments processed securely by Razorpay · UPI · Net banking · Cards accepted ·{" "}
            <a href="mailto:support@accountiq.in" className="underline">Contact us</a> for Enterprise
          </p>
        </>
      )}

      {/* ── Active subscription ──────────────────────────────────────────── */}
      {isActive && (
        <div className="rounded-2xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-1">Your subscription</h2>
          <p className="text-sm text-slate-500 mb-4">
            Manage your subscription via Razorpay. To cancel or change plan, contact{" "}
            <a href="mailto:support@accountiq.in" className="text-blue-600 underline">support@accountiq.in</a>.
          </p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="text-slate-400 text-xs mb-1">Current plan</div>
              <div className="font-semibold text-slate-900">{state.plan}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="text-slate-400 text-xs mb-1">Status</div>
              <div className="font-semibold text-green-600 capitalize">{state.subscriptionStatus}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
