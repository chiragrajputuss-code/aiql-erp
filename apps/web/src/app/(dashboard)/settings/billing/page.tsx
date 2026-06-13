import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@aiql/db";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const PLANS = {
  FREE:         { label: "Free",         queries: 50,    price: "₹0/mo",       features: ["50 queries/month", "1 connection", "Query Studio"] },
  STARTER:      { label: "Starter",      queries: 500,   price: "₹4,999/mo",   features: ["500 queries/month", "3 connections", "Close Manager", "API access"] },
  PROFESSIONAL: { label: "Professional", queries: 2000,  price: "₹9,999/mo",   features: ["2,000 queries/month", "Unlimited connections", "All features", "Priority support"] },
  ENTERPRISE:   { label: "Enterprise",   queries: 99999, price: "Custom",       features: ["Unlimited queries", "Custom LLM", "SSO", "Dedicated support"] },
};

export default async function BillingSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const org = await prisma.organisation.findUnique({
    where: { id: user.orgId },
    select: { plan: true, queriesUsed: true, queryLimit: true, queriesResetAt: true },
  });
  if (!org) redirect("/login");

  const plan = PLANS[org.plan as keyof typeof PLANS] ?? PLANS.STARTER;
  const usagePct = Math.min(100, Math.round((org.queriesUsed / org.queryLimit) * 100));

  return (
    <div className="space-y-4">
      {/* Current plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Current plan</CardTitle>
              <CardDescription>Billing cycle resets {org.queriesResetAt.toLocaleDateString("en-IN", { day: "numeric", month: "long" })}</CardDescription>
            </div>
            <Badge className="bg-blue-100 text-blue-700 border-0 text-sm px-3 py-1">{plan.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1.5">
            {plan.features.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                <Check className="h-4 w-4 text-green-500 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <Button variant="outline" disabled className="gap-2">
            Manage billing
            <span className="text-xs text-muted-foreground">(Stripe — Sprint 10)</span>
          </Button>
        </CardContent>
      </Card>

      {/* Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Query usage this month</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Queries used</span>
            <span className="font-medium">{org.queriesUsed.toLocaleString()} / {org.queryLimit.toLocaleString()}</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${usagePct >= 90 ? "bg-red-500" : usagePct >= 70 ? "bg-yellow-500" : "bg-[#1B3A5C]"}`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{usagePct}% of monthly limit used</p>
        </CardContent>
      </Card>
    </div>
  );
}
