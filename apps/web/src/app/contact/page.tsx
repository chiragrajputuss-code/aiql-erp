"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, MessageSquare, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BRAND_BLUE = "#1B3A5C";

export default function ContactPage() {
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus]   = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: BRAND_BLUE }}
            >
              A
            </div>
            <span className="font-semibold" style={{ color: BRAND_BLUE }}>AccountIQ</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900">Sign in</Link>
            <Link
              href="/signup"
              className="text-sm text-white px-4 py-2 rounded-lg font-medium"
              style={{ backgroundColor: BRAND_BLUE }}
            >
              Start free trial
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-20">
        <div className="grid md:grid-cols-2 gap-16">
          {/* Left — info */}
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-4">Get in touch</h1>
            <p className="text-lg text-slate-600 mb-10">
              Have a question about AccountIQ? Want to see a demo for your team?
              We&apos;re happy to help — usually reply within a few hours.
            </p>

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Email us directly</p>
                  <a href="mailto:support@acctqai.com" className="text-blue-600 hover:underline text-sm">
                    support@acctqai.com
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Response time</p>
                  <p className="text-sm text-slate-500">Mon–Sat · 9 AM–7 PM IST · usually within 4 hours</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Free demo call</p>
                  <p className="text-sm text-slate-500">
                    Mention &quot;Demo&quot; in your message and we&apos;ll set up a screen-share
                    walkthrough with your own Tally/Zoho data.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-12 p-5 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-sm font-medium text-slate-700 mb-2">Common questions</p>
              <ul className="space-y-2 text-sm text-slate-600">
                {[
                  "Does it work with my version of Tally?",
                  "Can my CA or accountant use it?",
                  "Is my financial data secure?",
                  "Do I need to install anything?",
                ].map((q) => (
                  <li key={q} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    {q}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-400 mt-3">Just ask in the form — we cover all of these.</p>
            </div>
          </div>

          {/* Right — form */}
          <div>
            {status === "sent" ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-20">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Message sent!</h2>
                <p className="text-slate-600 mb-6">We&apos;ll get back to you within a few hours.</p>
                <Button variant="outline" onClick={() => setStatus("idle")}>Send another</Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5 bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Send us a message</h2>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Your name</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ravi Sharma"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Email address</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ravi@company.com"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Subject</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a topic…</option>
                    <option value="demo">Request a demo</option>
                    <option value="pricing">Pricing / plans</option>
                    <option value="tally">Tally integration</option>
                    <option value="zoho">Zoho Books integration</option>
                    <option value="security">Security / data privacy</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Message</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    placeholder="Tell us about your business and what you'd like to do…"
                    required
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                {status === "error" && (
                  <p className="text-sm text-red-600">Something went wrong. Please email us directly at support@acctqai.com</p>
                )}

                <Button
                  type="submit"
                  disabled={status === "sending"}
                  className="w-full text-white"
                  style={{ backgroundColor: BRAND_BLUE }}
                >
                  {status === "sending" ? "Sending…" : "Send message"}
                </Button>

                <p className="text-xs text-slate-400 text-center">
                  We never share your info. No spam, ever.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
