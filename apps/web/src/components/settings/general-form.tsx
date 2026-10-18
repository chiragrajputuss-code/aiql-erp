"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const PLAN_COLORS: Record<string, string> = {
  FREE: "bg-slate-100 text-slate-700",
  STARTER: "bg-blue-100 text-blue-700",
  PROFESSIONAL: "bg-purple-100 text-purple-700",
  ENTERPRISE: "bg-amber-100 text-amber-700",
};

type Props = {
  name: string;
  slug: string;
  plan: string;
  reportBrandName: string;
  reportBrandContact: string;
};

export default function GeneralForm({ name, slug, plan, reportBrandName, reportBrandContact }: Props) {
  const [form, setForm] = useState({ name, slug });
  const [brand, setBrand] = useState({ reportBrandName, reportBrandContact });
  const [brandStatus, setBrandStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [brandError, setBrandError] = useState("");

  async function handleBrandSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBrandStatus("saving");
    setBrandError("");
    const res = await fetch("/api/internal/org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(brand),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setBrandError(typeof data.error === "string" ? data.error : "Could not save — check the values and try again.");
      setBrandStatus("error");
    } else {
      setBrandStatus("saved");
      setTimeout(() => setBrandStatus("idle"), 2500);
    }
  }
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setErrors({});
    const res = await fetch("/api/internal/org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrors(typeof data.error === "object" ? data.error : { _: [data.error] });
      setStatus("error");
    } else {
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    }
  }

  return (
    <div className="space-y-6">
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Organisation</CardTitle>
            <CardDescription>Your organisation name and URL slug</CardDescription>
          </div>
          <Badge className={`${PLAN_COLORS[plan] ?? ""} border-0`}>{plan}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="org-name">Organisation name</label>
            <Input
              id="org-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name[0]}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="org-slug">Slug</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">aiql.io/</span>
              <Input
                id="org-slug"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))}
                placeholder="acme"
                required
              />
            </div>
            {errors.slug && <p className="text-xs text-destructive">{errors.slug[0]}</p>}
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button
              type="submit"
              className="bg-[#1B3A5C] hover:bg-[#1B3A5C]/90"
              disabled={status === "saving"}
            >
              {status === "saving" ? "Saving…" : "Save changes"}
            </Button>
            {status === "saved" && <span className="text-sm text-green-600">Saved ✓</span>}
          </div>
        </form>
      </CardContent>
    </Card>

    {/* Client-report branding — what goes on the "Prepared by" line of the
        Health Check PDF a firm forwards to its client. Kept separate from the
        org identity above: the AcctQAI account name and the letterhead name
        are often different ("acme-associates" vs "Acme & Associates, Chartered
        Accountants"). */}
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Client report branding</CardTitle>
        <CardDescription>
          How your firm appears on the Health Check PDF you send to clients — the report is
          issued under your name, with AcctQAI only in the footer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleBrandSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="brand-name">Firm name on reports</label>
            <Input
              id="brand-name"
              value={brand.reportBrandName}
              onChange={(e) => setBrand((b) => ({ ...b, reportBrandName: e.target.value }))}
              placeholder={name}
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground">
              Shown as the report header, e.g. “Sharma &amp; Associates, Chartered Accountants”.
              Leave blank to use your organisation name.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="brand-contact">Contact line (optional)</label>
            <Input
              id="brand-contact"
              value={brand.reportBrandContact}
              onChange={(e) => setBrand((b) => ({ ...b, reportBrandContact: e.target.value }))}
              placeholder="ca.sharma@firm.in · +91 98xxxxxx00"
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground">Appears under the firm name so clients can reach you from the report.</p>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" className="bg-[#1B3A5C] hover:bg-[#1B3A5C]/90" disabled={brandStatus === "saving"}>
              {brandStatus === "saving" ? "Saving…" : "Save branding"}
            </Button>
            {brandStatus === "saved" && <span className="text-sm text-green-600">Saved ✓</span>}
            {brandStatus === "error" && <span className="text-sm text-destructive">{brandError}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
    </div>
  );
}
