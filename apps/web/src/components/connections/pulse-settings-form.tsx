"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Bell, BellOff, Mail, MailX, Monitor, CheckCircle2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Cadence = "DAILY" | "WEEKLY" | "OFF";

const CATEGORIES = [
  { key: "tds_deadline",     label: "TDS Deadlines",         desc: "7th of month reminders" },
  { key: "gstr1_deadline",   label: "GSTR-1 Deadlines",      desc: "10th of month" },
  { key: "gstr3b_deadline",  label: "GSTR-3B Deadlines",     desc: "20th of month" },
  { key: "advance_tax",      label: "Advance Tax",           desc: "Jun, Sep, Dec, Mar 15th" },
  { key: "itr_deadline",     label: "ITR Deadline",          desc: "31 July reminder" },
  { key: "tds_calculator",   label: "TDS Liability Alerts",  desc: "Vendor payments without TDS" },
  { key: "unresolved_scan",  label: "Data Quality Issues",   desc: "Flagged GL entries" },
] as const;

interface Props {
  connectionId:           string;
  initialCadence:         string;
  initialEmailEnabled:    boolean;
  initialInAppEnabled:    boolean;
  initialIsActive:        boolean;
  initialSnoozedCategories: string[];
}

// ─── Toggle button ────────────────────────────────────────────────────────────

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
        active
          ? "bg-[#1B3A5C] text-white border-[#1B3A5C]"
          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

export function PulseSettingsForm({
  connectionId,
  initialCadence,
  initialEmailEnabled,
  initialInAppEnabled,
  initialIsActive,
  initialSnoozedCategories,
}: Props) {
  const router = useRouter();

  const [cadence,            setCadence]            = useState<Cadence>((initialCadence as Cadence) ?? "WEEKLY");
  const [emailEnabled,       setEmailEnabled]        = useState(initialEmailEnabled);
  const [inAppEnabled,       setInAppEnabled]        = useState(initialInAppEnabled);
  const [isActive,           setIsActive]            = useState(initialIsActive);
  const [snoozedCategories,  setSnoozedCategories]  = useState<string[]>(initialSnoozedCategories);
  const [saving,             setSaving]              = useState(false);
  const [saved,              setSaved]               = useState(false);

  function toggleCategory(key: string) {
    setSnoozedCategories((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key],
    );
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/v1/connections/${connectionId}/pulse-subscription`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cadence,
          emailEnabled,
          inAppEnabled,
          isActive: cadence !== "OFF" && isActive,
          snoozedCategories,
        }),
      });
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Cadence */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Digest frequency</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <ToggleBtn active={cadence === "DAILY"}  onClick={() => setCadence("DAILY")}>Daily</ToggleBtn>
            <ToggleBtn active={cadence === "WEEKLY"} onClick={() => setCadence("WEEKLY")}>Weekly (Mon)</ToggleBtn>
            <ToggleBtn active={cadence === "OFF"}    onClick={() => setCadence("OFF")}>
              <span className="flex items-center gap-1.5"><BellOff className="h-3.5 w-3.5" />Off</span>
            </ToggleBtn>
          </div>
          {cadence === "WEEKLY" && (
            <p className="text-xs text-muted-foreground mt-2">Your digest runs every Monday at 8 AM IST.</p>
          )}
          {cadence === "DAILY" && (
            <p className="text-xs text-muted-foreground mt-2">Your digest runs every morning at 8 AM IST.</p>
          )}
          {cadence === "OFF" && (
            <p className="text-xs text-amber-600 mt-2">Pulse is paused — no digests will be generated.</p>
          )}
        </CardContent>
      </Card>

      {/* Delivery */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Delivery channels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-400" />
              <div>
                <p className="text-sm font-medium">Email digest</p>
                <p className="text-xs text-muted-foreground">Sent to your account email</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEmailEnabled((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                emailEnabled ? "bg-[#1B3A5C]" : "bg-slate-200"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  emailEnabled ? "translate-x-4.5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-slate-400" />
              <div>
                <p className="text-sm font-medium">In-app digest</p>
                <p className="text-xs text-muted-foreground">View on the Pulse page</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInAppEnabled((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                inAppEnabled ? "bg-[#1B3A5C]" : "bg-slate-200"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  inAppEnabled ? "translate-x-4.5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Per-category snooze */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Mute alert types</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Muted categories are permanently suppressed (not just today). Unmute anytime.
          </p>
          <div className="space-y-2">
            {CATEGORIES.map(({ key, label, desc }) => {
              const isMuted = snoozedCategories.includes(key);
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm ${
                    isMuted ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200 bg-white"
                  }`}
                >
                  <div>
                    <p className={`font-medium ${isMuted ? "line-through text-slate-400" : "text-slate-700"}`}>
                      {label}
                    </p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleCategory(key)}
                    className={`text-xs font-medium px-2 py-1 rounded-md border transition-colors ${
                      isMuted
                        ? "border-slate-200 text-slate-500 hover:bg-white"
                        : "border-red-100 text-red-500 hover:bg-red-50"
                    }`}
                  >
                    {isMuted ? "Unmute" : "Mute"}
                  </button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#1B3A5C] hover:bg-[#1B3A5C]/90"
        >
          {saving ? "Saving…" : "Save settings"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />Saved
          </span>
        )}
      </div>
    </div>
  );
}
