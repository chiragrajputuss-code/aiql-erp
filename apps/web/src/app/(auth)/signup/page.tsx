"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: "Weak", color: "bg-destructive" };
  if (score <= 2) return { score, label: "Fair", color: "bg-yellow-500" };
  if (score <= 3) return { score, label: "Good", color: "bg-blue-500" };
  return { score, label: "Strong", color: "bg-green-500" };
}

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = getPasswordStrength(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const fp = await FingerprintJS.load();
      const { visitorId } = await fp.get();

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, fingerprint: visitorId }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : Object.values(data.error ?? {}).flat().join(", ");
        setError(msg || "Signup failed");
        return;
      }
      router.push("/connections");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-[#1B3A5C] flex items-center justify-center text-white font-bold text-sm">
            A
          </div>
          <span className="font-semibold text-[#1B3A5C]">AIQL</span>
        </div>
        <CardTitle className="text-2xl">Create your account</CardTitle>
        <CardDescription>Start your free trial — no credit card needed</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="name">
              Full name
            </label>
            <Input
              id="name"
              placeholder="Priya Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="email">
              Work email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">
              Password
            </label>
            <Input
              id="password"
              type="password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            {password && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i <= strength.score ? strength.color : "bg-muted"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{strength.label}</p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="confirm">
              Confirm password
            </label>
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full bg-[#1B3A5C] hover:bg-[#1B3A5C]/90" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-xs text-muted-foreground">
            or continue with
          </span>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => (window.location.href = "/api/auth/google")}
          type="button"
        >
          <GoogleIcon className="mr-2 h-4 w-4" />
          Google
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[#1B3A5C] hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
