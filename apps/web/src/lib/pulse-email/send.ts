import { sendEmail } from "@/lib/email";
import { buildPulseEmail, type PulseEmailData, type PulseEmailVariant } from "./template";

export type { PulseEmailVariant };

export async function sendPulseEmail(
  to: string,
  data: PulseEmailData,
): Promise<void> {
  const { subject, html } = buildPulseEmail(data);
  await sendEmail(to, subject, html);
}
