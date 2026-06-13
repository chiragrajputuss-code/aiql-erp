import nodemailer from "nodemailer";

const IS_PROD = process.env.NODE_ENV === "production";

let _transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return _transporter;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!IS_PROD) {
    console.log(`\n[Email] ───────────────────────────`);
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:    ${html.replace(/<[^>]+>/g, "").slice(0, 200)}`);
    console.log(`────────────────────────────────────\n`);
    return;
  }
  await getTransporter().sendMail({
    from: `AIQL <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });
}
