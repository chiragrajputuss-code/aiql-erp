import Razorpay from "razorpay";
import crypto from "crypto";

// ─── Client (server-side only) ────────────────────────────────────────────────

export function getRazorpay(): Razorpay {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set");
  return new Razorpay({ key_id, key_secret });
}

// ─── Plan IDs (set these after creating plans in Razorpay dashboard) ─────────

export const RAZORPAY_PLAN_IDS: Record<string, string> = {
  STARTER_MONTHLY:      process.env.RAZORPAY_PLAN_STARTER_MONTHLY      ?? "",
  STARTER_ANNUAL:       process.env.RAZORPAY_PLAN_STARTER_ANNUAL        ?? "",
  PROFESSIONAL_MONTHLY: process.env.RAZORPAY_PLAN_PROFESSIONAL_MONTHLY  ?? "",
  PROFESSIONAL_ANNUAL:  process.env.RAZORPAY_PLAN_PROFESSIONAL_ANNUAL   ?? "",
};

export const PLAN_DB_MAP: Record<string, string> = {
  STARTER_MONTHLY:      "STARTER",
  STARTER_ANNUAL:       "STARTER",
  PROFESSIONAL_MONTHLY: "PROFESSIONAL",
  PROFESSIONAL_ANNUAL:  "PROFESSIONAL",
};

export const PLAN_QUERY_LIMIT: Record<string, number> = {
  STARTER:      500,
  PROFESSIONAL: 2000,
  ENTERPRISE:   999999,
};

// ─── Webhook signature verification ──────────────────────────────────────────

export function verifyWebhookSignature(body: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET not set");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
