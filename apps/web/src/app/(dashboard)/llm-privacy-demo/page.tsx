"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Shield, ArrowRight, Loader2, Sparkles, BookOpen, AlertCircle,
  Eye, Copy, Check, Wand2, Zap,
} from "lucide-react";

type Provider = "OPENAI" | "ANTHROPIC" | "GROQ" | "AZURE_OPENAI";

interface KeyRow {
  id:       string;
  provider: Provider;
  name:     string;
  isActive: boolean;
}

interface PreviewResponse {
  tokenised: { role: string; content: string }[];
  masked:    Record<string, number>;
  detailedAudit: Array<{ original: string; token: string; category: string }>;
  knowledgeApplied: number;
  knowledgeAddendum: string;
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?:   { prompt_tokens?: number; completion_tokens?: number };
  _aiql?:   { masked: Record<string, number>; provider: string };
  error?:   string;
}

const SAMPLE_PROMPTS = [
  {
    label: "Vendor payment query",
    text: "We paid Reliance Industries ₹12,50,000 last month against their invoice INV-2024-0892. The CFO Mr Kumar wants to know if this aligns with our vendor budget. Can you check?",
  },
  {
    label: "Customer aging review",
    text: "Tata Consultancy Services has an outstanding receivable of ₹45,00,000 that's now 90 days overdue. Their PAN is ABCDE1234F. Should we escalate to legal?",
  },
  {
    label: "Salary anomaly",
    text: "Why did salary expense jump by ₹8,75,000 in March? Bonus was paid to Priya Sharma and Rajesh Singh. HDFC Bank statement shows two payments of ₹4,37,500 each.",
  },
  {
    label: "GST reconciliation",
    text: "Mahindra & Mahindra invoice 2024/0341 shows CGST of ₹9,000 and SGST of ₹9,000 on a base of ₹1,00,000. Why is this mismatched in our books?",
  },
];

const MODEL_OPTIONS: Record<Provider, string[]> = {
  OPENAI:       ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"],
  ANTHROPIC:    ["claude-haiku-4-5-20251001", "claude-sonnet-4-6"],
  GROQ:         ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  AZURE_OPENAI: ["gpt-4", "gpt-35-turbo"],
};

export default function LlmPrivacyDemoPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);

  const [provider, setProvider] = useState<Provider>("OPENAI");
  const [model, setModel]       = useState<string>("gpt-4o-mini");
  const [prompt, setPrompt]     = useState("");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful financial analyst. Answer questions about the company's books concisely."
  );
  const [tokeniseSystem, setTokeniseSystem] = useState(false);

  const [preview, setPreview]     = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [response, setResponse]     = useState<string>("");
  const [responseError, setResponseError] = useState("");
  const [calling, setCalling]       = useState(false);
  const [callMeta, setCallMeta]     = useState<{ tokensIn: number; tokensOut: number } | null>(null);

  // Load keys on mount
  useEffect(() => {
    fetch("/api/v1/llm-proxy/keys")
      .then((r) => r.ok ? r.json() : { keys: [] })
      .then((data: { keys: KeyRow[] }) => setKeys(data.keys))
      .finally(() => setKeysLoading(false));
  }, []);

  // Auto-pick model when provider changes
  useEffect(() => { setModel(MODEL_OPTIONS[provider][0] ?? ""); }, [provider]);

  const hasKey = keys.some((k) => k.provider === provider && k.isActive);

  // Auto-preview on prompt change (debounced)
  useEffect(() => {
    if (!prompt.trim()) { setPreview(null); return; }
    const t = setTimeout(() => {
      void runPreview();
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, systemPrompt, tokeniseSystem]);

  async function runPreview() {
    setPreviewing(true);
    try {
      const res = await fetch("/api/v1/llm-proxy/preview", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...(systemPrompt.trim() ? [{ role: "system", content: systemPrompt }] : []),
            { role: "user", content: prompt },
          ],
          tokeniseSystem,
        }),
      });
      if (res.ok) setPreview(await res.json() as PreviewResponse);
    } finally { setPreviewing(false); }
  }

  async function runChat() {
    setCalling(true);
    setResponseError("");
    setResponse("");
    setCallMeta(null);
    try {
      const res = await fetch("/api/v1/llm-proxy/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          messages: [
            ...(systemPrompt.trim() ? [{ role: "system", content: systemPrompt }] : []),
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens:  800,
          tokeniseSystem,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json() as { error?: string; code?: string };
        setResponseError(typeof errBody.error === "string" ? errBody.error : "Failed");
        return;
      }
      const data = await res.json() as ChatResponse;
      setResponse(data.choices?.[0]?.message?.content ?? "");
      setCallMeta({
        tokensIn:  data.usage?.prompt_tokens ?? 0,
        tokensOut: data.usage?.completion_tokens ?? 0,
      });
    } catch (e) {
      setResponseError((e as Error).message ?? "Network error");
    } finally { setCalling(false); }
  }

  const totalMasked = preview ? Object.values(preview.masked).reduce((s, c) => s + c, 0) : 0;

  return (
    <div className="max-w-6xl mx-auto py-2 space-y-6">
      {/* Header */}
      <div className="bg-hero-indigo rounded-xl p-5 border border-indigo-100">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-indigo-600 text-white p-2.5 shrink-0">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Privacy-Safe LLM Proxy</h1>
            <p className="text-sm text-slate-700 mt-1 leading-relaxed">
              Bring any LLM key. We tokenise vendors, customers, employees, and amounts before sending. Provider sees opaque tokens; you see the original answer.
            </p>
          </div>
        </div>
      </div>

      {/* Sample buttons */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Try a sample</p>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_PROMPTS.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPrompt(s.text)}
              className="text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Three-column layout — input → masked → response */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Column 1: Original */}
        <Panel
          title="1. Your prompt"
          subtitle="What you'd normally send"
          tone="default"
        >
          <div className="space-y-2">
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-600 hover:text-slate-900 select-none">
                System prompt
              </summary>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={3}
                className="text-xs mt-1.5"
              />
              <label className="flex items-start gap-1.5 mt-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tokeniseSystem}
                  onChange={(e) => setTokeniseSystem(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-[10px] text-slate-600 leading-relaxed">
                  Also mask the system prompt
                  <span className="block text-slate-500">
                    Default off — system is treated as &quot;our prompt, not customer data.&quot; Turn on if your system prompt itself contains vendor / customer / employee names.
                  </span>
                </span>
              </label>
            </details>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Paste a finance question with vendor/customer names and amounts…"
              rows={12}
              className="text-sm font-mono"
            />
            <p className="text-[10px] text-slate-500">
              {prompt.length} chars · highlights below show what would be masked
            </p>
          </div>
        </Panel>

        {/* Column 2: Masked */}
        <Panel
          title="2. What leaves your box"
          subtitle={previewing ? "Computing…" : preview ? `${totalMasked} tokens masked` : "Ready"}
          tone="indigo"
          icon={<Wand2 className="h-3.5 w-3.5" />}
        >
          {!preview && !previewing && (
            <p className="text-xs text-slate-500 italic">Type a prompt to see the masked version.</p>
          )}
          {previewing && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Tokenising…
            </div>
          )}
          {preview && (
            <div className="space-y-3">
              {/* Mask summary */}
              {totalMasked > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(preview.masked).map(([cat, count]) => (
                    <span key={cat} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-mono">
                      {cat} × {count}
                    </span>
                  ))}
                </div>
              )}

              {/* Knowledge injection notice */}
              {preview.knowledgeApplied > 0 && (
                <div className="rounded-md border border-emerald-100 bg-emerald-50/50 p-2 text-[11px] text-emerald-900 flex items-start gap-1.5">
                  <BookOpen className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>
                    <strong>{preview.knowledgeApplied}</strong> piece{preview.knowledgeApplied > 1 ? "s" : ""} of your knowledge base auto-injected
                    <details className="mt-1">
                      <summary className="cursor-pointer hover:underline">view</summary>
                      <pre className="text-[10px] whitespace-pre-wrap mt-1 bg-white/60 rounded px-1.5 py-1 border border-emerald-100 overflow-x-auto max-h-32 overflow-y-auto">{preview.knowledgeAddendum}</pre>
                    </details>
                  </span>
                </div>
              )}

              {/* Tokenised messages */}
              <div className="space-y-2">
                {preview.tokenised.map((m, i) => (
                  <div key={i} className="rounded border border-slate-200 bg-white">
                    <div className="px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-200">
                      {m.role}
                    </div>
                    <pre className="text-xs font-mono whitespace-pre-wrap px-2 py-1.5 text-slate-700">
                      {highlightTokens(m.content)}
                    </pre>
                  </div>
                ))}
              </div>

              {/* Detailed audit */}
              {preview.detailedAudit.length > 0 && (
                <details className="text-[11px]">
                  <summary className="cursor-pointer text-slate-600 hover:text-slate-900 select-none">
                    Substitution map ({preview.detailedAudit.length})
                  </summary>
                  <table className="text-[10px] mt-1 w-full font-mono">
                    <thead className="text-slate-500">
                      <tr><th className="text-left pr-2">Original</th><th className="text-left">Token</th></tr>
                    </thead>
                    <tbody>
                      {preview.detailedAudit.slice(0, 15).map((a, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="pr-2 py-0.5 text-slate-700 truncate max-w-[120px]">{a.original}</td>
                          <td className="py-0.5 text-indigo-700">{a.token}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          )}
        </Panel>

        {/* Column 3: Response */}
        <Panel
          title="3. Response (detokenised)"
          subtitle={
            calling ? "Calling provider…" :
            response ? `${callMeta?.tokensIn ?? 0} in / ${callMeta?.tokensOut ?? 0} out` :
            "Run to fetch"
          }
          tone="emerald"
          icon={<Sparkles className="h-3.5 w-3.5" />}
        >
          <div className="space-y-3">
            {/* Provider/model selector */}
            <div className="grid grid-cols-2 gap-2">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
                className="text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                disabled={calling}
              >
                <option value="OPENAI">OpenAI</option>
                <option value="ANTHROPIC">Anthropic</option>
                <option value="GROQ">Groq</option>
                <option value="AZURE_OPENAI">Azure OpenAI</option>
              </select>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                disabled={calling}
              >
                {(MODEL_OPTIONS[provider] ?? []).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {keysLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking keys…
              </div>
            ) : !hasKey ? (
              <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  No active <strong>{provider}</strong> key.{" "}
                  <a href="/settings/api-keys" className="underline hover:text-amber-700">Add one</a> to run live.
                </span>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={runChat}
                disabled={calling || !prompt.trim()}
                className="w-full"
              >
                {calling
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <Zap className="h-3.5 w-3.5 mr-1.5" />}
                Send through proxy
              </Button>
            )}

            {responseError && (
              <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                {responseError}
              </div>
            )}

            {response && (
              <div className="rounded border border-emerald-200 bg-white">
                <div className="px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
                  <span>response · originals restored</span>
                  <CopyButton text={response} />
                </div>
                <pre className="text-xs whitespace-pre-wrap px-2 py-1.5 text-slate-800">
                  {response}
                </pre>
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* Audit footer */}
      <AuditTrail />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Panel({
  title, subtitle, tone, icon, children,
}: {
  title:    string;
  subtitle: string;
  tone:     "default" | "indigo" | "emerald";
  icon?:    React.ReactNode;
  children: React.ReactNode;
}) {
  const toneClass = {
    default: "border-slate-200",
    indigo:  "border-indigo-200",
    emerald: "border-emerald-200",
  }[tone];
  return (
    <div className={`rounded-xl border bg-white ${toneClass} overflow-hidden`}>
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            {icon}
            {title}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      className="text-emerald-700 hover:text-emerald-900 p-0.5"
      aria-label="Copy"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

/**
 * Wraps tokens like VENDOR_T0001 in a styled span so they pop visually
 * in the masked panel. Anything that matches CATEGORY_T<digits> is a token.
 */
function highlightTokens(text: string): React.ReactNode {
  const re = /([A-Z]+_T\d+)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <span key={i++} className="inline-block bg-indigo-100 text-indigo-800 px-1 rounded font-semibold">
        {match[0]}
      </span>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

interface AuditEntry {
  id:               string;
  provider:         string;
  model:            string;
  masked:           Array<{ category: string; count: number }>;
  maskedTotal:      number;
  promptChars:      number;
  responseChars:    number;
  tokensIn:         number;
  tokensOut:        number;
  upstreamStatus:   number;
  knowledgeApplied: number;
  durationMs:       number;
  errorMessage:     string | null;
  createdAt:        string;
}

function AuditTrail() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useMemo(() => () => {
    setLoading(true);
    fetch("/api/v1/llm-proxy/audit?limit=10")
      .then((r) => r.ok ? r.json() : { items: [] })
      .then((d: { items: AuditEntry[] }) => setItems(d.items))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-100">
        <div>
          <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            Audit trail
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Last 10 calls — what left your box</p>
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500">
          No proxied calls yet. Add a key and run one above.
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="text-left px-3 py-2">When</th>
              <th className="text-left px-3 py-2">Provider</th>
              <th className="text-left px-3 py-2">Masked</th>
              <th className="text-left px-3 py-2">Knowledge</th>
              <th className="text-right px-3 py-2">Tokens</th>
              <th className="text-right px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((it) => (
              <tr key={it.id} className="hover:bg-slate-50">
                <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">
                  {new Date(it.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "numeric" })}
                </td>
                <td className="px-3 py-1.5 text-slate-700">{it.provider} · {it.model}</td>
                <td className="px-3 py-1.5">
                  {it.maskedTotal === 0
                    ? <span className="text-slate-400">none</span>
                    : <span className="text-indigo-700 font-semibold">{it.maskedTotal} item{it.maskedTotal > 1 ? "s" : ""}</span>}
                </td>
                <td className="px-3 py-1.5">
                  {it.knowledgeApplied > 0
                    ? <span className="text-emerald-700">{it.knowledgeApplied}</span>
                    : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-1.5 text-right text-slate-600 tabular-nums">
                  {it.tokensIn} / {it.tokensOut}
                </td>
                <td className="px-3 py-1.5 text-right">
                  {it.upstreamStatus === 200
                    ? <span className="text-emerald-600 font-semibold">200</span>
                    : <span className="text-rose-600 font-semibold">{it.upstreamStatus}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
