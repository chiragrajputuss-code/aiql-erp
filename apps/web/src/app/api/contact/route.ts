import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendEmail } from "@/lib/email";

const schema = z.object({
  name:    z.string().min(1).max(100),
  email:   z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(5000),
});

const SUBJECT_LABELS: Record<string, string> = {
  demo:     "Request a demo",
  pricing:  "Pricing / plans",
  tally:    "Tally integration",
  zoho:     "Zoho Books integration",
  security: "Security / data privacy",
  other:    "Other",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { name, email, subject, message } = parsed.data;
  const subjectLabel = SUBJECT_LABELS[subject] ?? subject;

  const TO = process.env.GMAIL_USER ?? "chirag.rajput070991@gmail.com";

  await sendEmail(
    TO,
    `[AccountIQ Contact] ${subjectLabel} — from ${name}`,
    `
<div style="font-family:sans-serif;max-width:600px">
  <h2 style="color:#1B3A5C">New contact form submission</h2>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#666;width:100px">Name</td><td><strong>${name}</strong></td></tr>
    <tr><td style="padding:8px 0;color:#666">Email</td><td><a href="mailto:${email}">${email}</a></td></tr>
    <tr><td style="padding:8px 0;color:#666">Topic</td><td>${subjectLabel}</td></tr>
  </table>
  <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
  <p style="white-space:pre-wrap;color:#333">${message}</p>
  <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
  <p style="color:#999;font-size:12px">Sent from acctqai.com/contact</p>
</div>
`
  );

  return NextResponse.json({ ok: true });
}
