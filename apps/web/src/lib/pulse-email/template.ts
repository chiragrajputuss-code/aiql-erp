import type { PulseAlertPayload, FinancialSnapshot } from "@aiql/pulse-engine";
import { formatINR } from "@aiql/pulse-engine";

// ─── Email template builder ───────────────────────────────────────────────────
// Plain HTML only — no CSS frameworks (email client compatibility)

const BRAND_COLOR   = "#1B3A5C";
const CRITICAL_COLOR = "#dc2626";
const REVIEW_COLOR   = "#d97706";
const INFO_COLOR     = "#2563eb";

function severityColor(severity: PulseAlertPayload["severity"]): string {
  if (severity === "critical") return CRITICAL_COLOR;
  if (severity === "review")   return REVIEW_COLOR;
  return INFO_COLOR;
}

function alertRow(alert: PulseAlertPayload, baseUrl: string): string {
  const color = severityColor(alert.severity);
  const label = alert.severity === "critical" ? "🚨 URGENT" : alert.severity === "review" ? "⚠️ Action needed" : "ℹ️ FYI";
  const link  = alert.actionUrl ? `${baseUrl}${alert.actionUrl}` : null;

  return `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <span style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: ${color}; letter-spacing: 0.05em;">${label}</span>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 4px;">
              <span style="font-size: 15px; font-weight: 600; color: #0f172a;">${alert.title}</span>
            </td>
          </tr>
          ${alert.detail ? `
          <tr>
            <td style="padding-top: 4px;">
              <span style="font-size: 13px; color: #64748b;">${alert.detail}</span>
            </td>
          </tr>` : ""}
          ${link ? `
          <tr>
            <td style="padding-top: 8px;">
              <a href="${link}" style="font-size: 12px; color: ${BRAND_COLOR}; font-weight: 500; text-decoration: none;">
                View in AIQL →
              </a>
            </td>
          </tr>` : ""}
        </table>
      </td>
    </tr>`;
}

function snapshotSection(snapshot: FinancialSnapshot): string {
  const items = [
    { label: "Cash & Bank",    value: snapshot.cashAndBankBalance },
    { label: "Receivables",    value: snapshot.totalReceivables   },
    { label: "Payables",       value: snapshot.totalPayables      },
  ].filter((i) => i.value !== null);

  if (items.length === 0) return "";

  return `
    <tr>
      <td style="padding: 16px 0 8px;">
        <p style="margin: 0 0 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8;">Financial Snapshot</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${items.map((item) => `
          <tr>
            <td style="padding: 4px 0; font-size: 13px; color: #475569;">${item.label}</td>
            <td style="padding: 4px 0; font-size: 13px; font-weight: 600; color: #0f172a; text-align: right;">${formatINR(item.value)}</td>
          </tr>`).join("")}
        </table>
      </td>
    </tr>`;
}

export type PulseEmailVariant = "standard" | "welcome" | "historical";

export interface PulseEmailData {
  recipientName:   string;
  connectionName:  string;
  alerts:          PulseAlertPayload[];
  snapshot?:       FinancialSnapshot;
  shareToken:      string;
  baseUrl:         string;
  today:           Date;
  variant?:        PulseEmailVariant;
}

export function buildPulseEmail(data: PulseEmailData): { subject: string; html: string } {
  const { recipientName, connectionName, alerts, snapshot, shareToken, baseUrl, today, variant = "standard" } = data;

  const dateStr = today.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const critical = alerts.filter((a) => a.severity === "critical");
  const nonCrit  = alerts.filter((a) => a.severity !== "critical");

  const itemCount   = alerts.length;
  const subjectPrefix = critical.length > 0 ? "🚨 " : "";

  const subject =
    variant === "welcome"
      ? `Welcome to AIQL Pulse · ${connectionName} · GL snapshot ready`
      : variant === "historical"
        ? `AIQL · Open issues from your historical books · ${dateStr}`
        : `${subjectPrefix}AIQL Pulse · ${itemCount > 0 ? `${itemCount} thing${itemCount !== 1 ? "s" : ""} to do` : "All clear"} · ${dateStr}`;

  const shareLink = `${baseUrl}/pulse/${shareToken}`;
  const settingsLink = `${baseUrl}/connections`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin: 0; padding: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width: 560px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="background: ${BRAND_COLOR}; border-radius: 12px 12px 0 0; padding: 20px 24px;">
              <p style="margin: 0; font-size: 18px; font-weight: 700; color: #ffffff;">AIQL Pulse</p>
              <p style="margin: 4px 0 0; font-size: 13px; color: #93c5fd;">${connectionName} · ${dateStr}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background: #ffffff; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: 0;">
              <table width="100%" cellpadding="0" cellspacing="0">

                <!-- Greeting -->
                <tr>
                  <td style="padding-bottom: 20px;">
                    <p style="margin: 0 0 4px; font-size: 14px; color: #475569;">Hi ${recipientName},</p>
                    <p style="margin: 0; font-size: 14px; color: #64748b;">
                      ${variant === "welcome"
                        ? "Your GL data is loaded. Here's a snapshot of your books — check back tomorrow for your first full digest."
                        : variant === "historical"
                          ? "Here are the open issues flagged in your historical GL data."
                          : itemCount === 0
                            ? "Nothing urgent today. Your books look clean."
                            : `${itemCount} ${itemCount === 1 ? "item" : "items"} need${itemCount === 1 ? "s" : ""} your attention.`}
                    </p>
                  </td>
                </tr>

                <!-- Alerts -->
                ${alerts.length > 0 ? `
                <tr>
                  <td>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${[...critical, ...nonCrit].map((a) => alertRow(a, baseUrl)).join("")}
                    </table>
                  </td>
                </tr>` : ""}

                <!-- Snapshot -->
                ${snapshot ? snapshotSection(snapshot) : ""}

                <!-- CTA -->
                <tr>
                  <td style="padding-top: 24px; text-align: center;">
                    <a href="${baseUrl}/query" style="display: inline-block; background: ${BRAND_COLOR}; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
                      Ask AI about your books
                    </a>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding-top: 20px; border-top: 1px solid #f1f5f9;">
                    <p style="margin: 12px 0 0; font-size: 11px; color: #94a3b8; text-align: center;">
                      <a href="${shareLink}" style="color: #94a3b8;">View this pulse</a> ·
                      <a href="${settingsLink}" style="color: #94a3b8;">Manage alerts</a>
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
