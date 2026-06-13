"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus, Key, Trash2, Loader2, AlertCircle, ShieldCheck, Eye, EyeOff,
  CheckCircle2, ExternalLink,
} from "lucide-react";

type Provider = "OPENAI" | "ANTHROPIC" | "GROQ" | "AZURE_OPENAI";

interface KeyRow {
  id:         string;
  provider:   Provider;
  name:       string;
  keyTail:    string;
  isActive:   boolean;
  callCount:  number;
  lastUsedAt: string | null;
  createdAt:  string;
}

const PROVIDER_META: Record<Provider, { label: string; placeholder: string; href: string; tone: string }> = {
  OPENAI:       { label: "OpenAI",       placeholder: "sk-...",     href: "https://platform.openai.com/api-keys", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ANTHROPIC:    { label: "Anthropic",    placeholder: "sk-ant-...", href: "https://console.anthropic.com/settings/keys", tone: "bg-orange-50 text-orange-700 border-orange-200" },
  GROQ:         { label: "Groq",         placeholder: "gsk_...",    href: "https://console.groq.com/keys", tone: "bg-purple-50 text-purple-700 border-purple-200" },
  AZURE_OPENAI: { label: "Azure OpenAI", placeholder: "32-char hex", href: "https://portal.azure.com",    tone: "bg-blue-50 text-blue-700 border-blue-200" },
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/llm-proxy/keys");
      if (res.ok) {
        const data = await res.json() as { keys: KeyRow[] };
        setKeys(data.keys);
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function deleteKey(id: string) {
    if (!confirm("Delete this API key? Calls using it will fail until a new key is added.")) return;
    const res = await fetch(`/api/v1/llm-proxy/keys/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  async function toggleActive(row: KeyRow) {
    await fetch(`/api/v1/llm-proxy/keys/${row.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ isActive: !row.isActive }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      {/* Headline */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-indigo-700 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-indigo-900">Bring-your-own LLM keys</p>
          <p className="text-xs text-indigo-800 leading-relaxed mt-1">
            Add your existing OpenAI, Anthropic, Groq, or Azure OpenAI key. We store it AES-256-GCM encrypted and use it ONLY when you make proxied calls. Customer data is tokenised before it reaches the provider — they never see real vendor / customer / employee names or amounts.
          </p>
        </div>
      </div>

      {/* Keys list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Registered keys</h2>
            <p className="text-xs text-slate-500 mt-0.5">{keys.length} active</p>
          </div>
          <Button size="sm" onClick={() => setShowAdd((s) => !s)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add key
          </Button>
        </div>

        {showAdd && <AddKeyForm onAdded={() => { setShowAdd(false); load(); }} onCancel={() => setShowAdd(false)} />}

        {loading ? (
          <div className="space-y-2 mt-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-slate-50 animate-pulse" />
            ))}
          </div>
        ) : keys.length === 0 && !showAdd ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center mt-3">
            <Key className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">No keys registered yet</p>
            <p className="text-xs text-slate-500 mt-0.5">Add your first key to start proxying LLM calls.</p>
          </div>
        ) : (
          <div className="space-y-2 mt-3">
            {keys.map((k) => {
              const meta = PROVIDER_META[k.provider];
              return (
                <div key={k.id} className="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-3">
                  <div className={`pill ${meta.tone} shrink-0 mt-0.5`}>{meta.label}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-900">{k.name}</span>
                      <span className="font-mono text-[11px] text-slate-500">…{k.keyTail}</span>
                      {!k.isActive && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                          INACTIVE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                      <span>{k.callCount.toLocaleString("en-IN")} call{k.callCount !== 1 ? "s" : ""}</span>
                      {k.lastUsedAt && (
                        <span>last used {new Date(k.lastUsedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                      )}
                      <span>added {new Date(k.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleActive(k)}
                      className="text-[11px] text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100"
                    >
                      {k.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteKey(k.id)}
                      className="text-rose-500 hover:text-rose-700 p-1.5 rounded hover:bg-rose-50"
                      aria-label="Delete key"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Try it CTA */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-900">Test the privacy layer</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Open the Privacy Demo to see exactly what gets masked before your data leaves the box.
          </p>
        </div>
        <a
          href="/llm-privacy-demo"
          className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1 shrink-0"
        >
          Open demo <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

// ─── Add-key form ─────────────────────────────────────────────────────────

function AddKeyForm({ onAdded, onCancel }: { onAdded: () => void; onCancel: () => void }) {
  const [provider, setProvider] = useState<Provider>("OPENAI");
  const [name, setName]         = useState("");
  const [apiKey, setApiKey]     = useState("");
  const [showKey, setShowKey]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  const meta = PROVIDER_META[provider];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !apiKey.trim()) { setError("Name and key are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/v1/llm-proxy/keys", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ provider, name: name.trim(), apiKey: apiKey.trim() }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string | object };
        const msg = typeof body.error === "string" ? body.error : "Failed to save key";
        setError(msg);
        return;
      }
      setApiKey("");
      setName("");
      onAdded();
    } catch {
      setError("Network error");
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 mt-3">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Provider</Label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          >
            {(Object.keys(PROVIDER_META) as Provider[]).map((p) => (
              <option key={p} value={p}>{PROVIDER_META[p].label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1 sm:col-span-3">
          <Label className="text-xs">Display name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Production ${meta.label} key`}
            className="text-sm"
            maxLength={100}
          />
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs">API key</Label>
          <a
            href={meta.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-indigo-600 hover:underline inline-flex items-center gap-1"
          >
            Get one <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
        <div className="relative">
          <Input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={meta.placeholder}
            className="text-sm font-mono pr-9"
            maxLength={500}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
            aria-label={showKey ? "Hide key" : "Show key"}
          >
            {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        <p className="text-[10px] text-slate-500">
          Encrypted with AES-256-GCM before storage. Only decrypted in-memory at request time.
        </p>
      </div>

      {error && (
        <div role="alert" className="text-xs text-rose-700 flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
          Save key
        </Button>
      </div>
    </form>
  );
}
