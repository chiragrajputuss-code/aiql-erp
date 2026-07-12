import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@aiql/db";
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

/** Escape user input before it goes into the notification email's HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { name, email, subject, message } = parsed.data;
  const subjectLabel = SUBJECT_LABELS[subject] ?? subject;

  // ── 1. Persist FIRST. A lead must survive an email outage. ──────────────────
  let submissionId: string;
  try {
    const row = await prisma.contactSubmission.create({
      data: { name, email, subject: subjectLabel, message },
      select: { id: true },
    });
    submissionId = row.id;
  } catch (err) {
    // Only a DB failure is a real failure — the lead is genuinely lost.
    console.error("[contact] FAILED TO PERSIST LEAD", { name, email, subjectLabel, message, err });
    return NextResponse.json({ error: "Could not save your message" }, { status: 500 });
  }

  // ── 2. Notify by email — best effort. Never fail the request on this. ───────
  const TO = process.env.CONTACT_NOTIFY_TO ?? process.env.GMAIL_USER;
  if (TO) {
    try {
      await sendEmail(
        TO,
        `[AccountIQ Contact] ${subjectLabel} — from ${name}`,
        `
<div style="font-family:sans-serif;max-width:600px">
  <h2 style="color:#1B3A5C">New contact form submission</h2>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#666;width:100px">Name</td><td><strong>${esc(name)}</strong></td></tr>
    <tr><td style="padding:8px 0;color:#666">Email</td><td><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
    <tr><td style="padding:8px 0;color:#666">Topic</td><td>${esc(subjectLabel)}</td></tr>
  </table>
  <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
  <p style="white-space:pre-wrap;color:#333">${esc(message)}</p>
  <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
  <p style="color:#999;font-size:12px">Sent from acctqai.com/contact · id ${submissionId}</p>
</div>
`,
      );
      await prisma.contactSubmission.update({
        where: { id: submissionId },
        data:  { emailed: true },
      });
    } catch (err) {
      // Email is down — but the lead is safely in the DB. Log loudly, still succeed.
      const reason = err instanceof Error ? err.message : String(err);
      console.error("[contact] lead SAVED but email failed:", submissionId, reason);
      await prisma.contactSubmission
        .update({ where: { id: submissionId }, data: { emailError: reason } })
        .catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
