"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type Config = {
  tokeniseVendors:   boolean;
  tokeniseCustomers: boolean;
  tokeniseEmployees: boolean;
  tokeniseAmounts:   boolean;
  tokeniseAccounts:  boolean;
  tokeniseProjects:  boolean;
  sensitivityLevel:  "STANDARD" | "HIGH" | "MAXIMUM";
  customEntities:    string[];
  customStripList:   string[];
};

const DEFAULTS: Config = {
  tokeniseVendors:   true,
  tokeniseCustomers: true,
  tokeniseEmployees: true,
  tokeniseAmounts:   true,
  tokeniseAccounts:  true,
  tokeniseProjects:  true,
  sensitivityLevel:  "STANDARD",
  customEntities:    [],
  customStripList:   [],
};

const TOGGLE_ITEMS: Array<{ key: keyof Config; label: string; description: string }> = [
  { key: "tokeniseVendors",   label: "Vendors",     description: "Mask vendor and supplier names" },
  { key: "tokeniseCustomers", label: "Customers",   description: "Mask customer and client names" },
  { key: "tokeniseEmployees", label: "Employees",   description: "Mask employee and person names" },
  { key: "tokeniseAmounts",   label: "Amounts",     description: "Mask ₹/$/€/£ monetary values" },
  { key: "tokeniseAccounts",  label: "GL Accounts", description: "Mask account codes (4000, AC-2100)" },
  { key: "tokeniseProjects",  label: "Projects",    description: "Mask project and cost centre names" },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B3A5C] focus:ring-offset-2 ${
        checked ? "bg-[#1B3A5C]" : "bg-slate-200"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function TokenisationConfigPage() {
  const [cfg,    setCfg]    = useState<Config>(DEFAULTS);
  const [custom, setCustom] = useState({ entities: "", stripList: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("loading");

  useEffect(() => {
    fetch("/api/internal/tokenisation/config")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.tokeniseVendors !== undefined) {
          setCfg({ ...DEFAULTS, ...data, sensitivityLevel: data.sensitivityLevel ?? "STANDARD" });
          setCustom({
            entities:  (data.customEntities  ?? []).join(", "),
            stripList: (data.customStripList ?? []).join(", "),
          });
        }
        setStatus("idle");
      })
      .catch(() => setStatus("idle"));
  }, []);

  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    const res = await fetch("/api/internal/tokenisation/config", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...cfg,
        customEntities:  custom.entities.split(",").map((s) => s.trim()).filter(Boolean),
        customStripList: custom.stripList.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    });
    setStatus(res.ok ? "saved" : "error");
    if (res.ok) setTimeout(() => setStatus("idle"), 2500);
  }

  if (status === "loading") {
    return <div className="h-48 animate-pulse rounded-xl bg-slate-100" />;
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {/* Category toggles */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">What to tokenise</CardTitle>
          <CardDescription>Choose which data categories are masked before reaching the AI</CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 divide-y">
          {TOGGLE_ITEMS.map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between py-4">
              <div>
                <p className="text-sm font-medium text-slate-900">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              </div>
              <Toggle
                checked={cfg[key] as boolean}
                onChange={(v) => set(key, v as Config[typeof key])}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Sensitivity level */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Sensitivity level</CardTitle>
          <CardDescription>Higher sensitivity detects more potential identifiers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {(["STANDARD", "HIGH", "MAXIMUM"] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => set("sensitivityLevel", level)}
                className={`flex-1 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                  cfg.sensitivityLevel === level
                    ? "border-[#1B3A5C] bg-[#1B3A5C]/5 text-[#1B3A5C]"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {level.charAt(0) + level.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Custom rules */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Custom rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Additional entities to mask
              <span className="text-muted-foreground font-normal ml-1">(comma-separated)</span>
            </label>
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm min-h-[72px] resize-y focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]"
              value={custom.entities}
              onChange={(e) => setCustom((c) => ({ ...c, entities: e.target.value }))}
              placeholder="Project Phoenix, Operation Delta, Internal Fund"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Terms to strip entirely
              <span className="text-muted-foreground font-normal ml-1">(irreversible removal)</span>
            </label>
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm min-h-[72px] resize-y focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]"
              value={custom.stripList}
              onChange={(e) => setCustom((c) => ({ ...c, stripList: e.target.value }))}
              placeholder="CONFIDENTIAL, DRAFT, FOR INTERNAL USE ONLY"
            />
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          className="bg-[#1B3A5C] hover:bg-[#1B3A5C]/90"
          disabled={status === "saving"}
        >
          {status === "saving" ? "Saving…" : "Save settings"}
        </Button>
        {status === "saved" && <span className="text-sm text-green-600">Saved ✓</span>}
        {status === "error" && <span className="text-sm text-destructive">Save failed</span>}
      </div>
    </form>
  );
}
