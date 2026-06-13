"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const PROVIDERS = [
  { value: "AIQL_MANAGED", label: "AIQL Managed (default)", needsKey: false, placeholder: "" },
  { value: "OPENAI", label: "OpenAI", needsKey: true, placeholder: "sk-..." },
  { value: "AZURE_OPENAI", label: "Azure OpenAI", needsKey: true, placeholder: "Azure API key" },
  { value: "GEMINI", label: "Google Gemini", needsKey: true, placeholder: "AIza..." },
  { value: "GROQ", label: "Groq", needsKey: true, placeholder: "gsk_..." },
  { value: "OLLAMA", label: "Ollama (self-hosted)", needsKey: false, placeholder: "" },
];

const MODEL_HINTS: Record<string, string> = {
  AIQL_MANAGED: "Managed automatically",
  OPENAI: "e.g. gpt-4o, gpt-4-turbo",
  AZURE_OPENAI: "e.g. gpt-4o",
  GEMINI: "e.g. gemini-1.5-pro",
  GROQ: "e.g. llama-3.1-70b-versatile",
  OLLAMA: "e.g. llama3, mistral",
};

type Props = { currentProvider: string | null; currentModel: string | null };

export default function LLMForm({ currentProvider, currentModel }: Props) {
  const [provider, setProvider] = useState(currentProvider ?? "AIQL_MANAGED");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(currentModel ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const providerMeta = PROVIDERS.find((p) => p.value === provider)!;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    const body: Record<string, string> = { llmProvider: provider };
    if (model) body.llmModel = model;
    if (apiKey) body.llmApiKey = apiKey;

    const res = await fetch("/api/internal/org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setStatus(res.ok ? "saved" : "error");
    if (res.ok) setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">LLM Provider</CardTitle>
        <CardDescription>
          By default AIQL routes to Groq (free) and Claude (complex queries). Override here with your own keys.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Provider</label>
            <select
              value={provider}
              onChange={(e) => { setProvider(e.target.value); setApiKey(""); setModel(""); }}
              className="w-full rounded-md border px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1B3A5C]"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {providerMeta.needsKey && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">API Key</label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={providerMeta.placeholder}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">Leave blank to keep existing key</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Model ID</label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={MODEL_HINTS[provider] ?? "Model ID"}
              disabled={provider === "AIQL_MANAGED"}
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              disabled
              className="text-muted-foreground"
            >
              Test connection (coming soon)
            </Button>
            <Button
              type="submit"
              className="bg-[#1B3A5C] hover:bg-[#1B3A5C]/90"
              disabled={status === "saving"}
            >
              {status === "saving" ? "Saving…" : "Save"}
            </Button>
            {status === "saved" && <span className="text-sm text-green-600">Saved ✓</span>}
            {status === "error" && <span className="text-sm text-destructive">Save failed</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
