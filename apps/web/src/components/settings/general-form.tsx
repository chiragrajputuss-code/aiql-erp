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

type Props = { name: string; slug: string; plan: string };

export default function GeneralForm({ name, slug, plan }: Props) {
  const [form, setForm] = useState({ name, slug });
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
  );
}
