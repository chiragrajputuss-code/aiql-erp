// Lambda function — called by EventBridge Scheduler at 02:30 UTC daily (8:00 AM IST)
// Replaces Vercel cron: "30 2 * * *"
// Deploy: zip -j function.zip infra/aws/pulse-cron-lambda/index.mjs
//         aws lambda create-function ...  (see deploy-lambda.sh)

const APP_URL     = process.env.APP_URL;       // https://app.yourdomain.com
const CRON_SECRET = process.env.CRON_SECRET;   // same value set in EC2 .env

export const handler = async (event) => {
  console.log("Pulse cron triggered", JSON.stringify(event));

  if (!APP_URL || !CRON_SECRET) {
    throw new Error("APP_URL and CRON_SECRET must be set in Lambda environment variables");
  }

  const url = `${APP_URL}/api/v1/cron/pulse`;

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${CRON_SECRET}`,
      "Content-Type":  "application/json",
    },
    // Lambda timeout is 30s — give the app 25s to respond
    signal: AbortSignal.timeout(25_000),
  });

  const body = await res.text().catch(() => "");

  if (!res.ok) {
    console.error(`Pulse cron failed: ${res.status}`, body);
    throw new Error(`Pulse cron HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  console.log(`Pulse cron OK: ${res.status}`, body.slice(0, 200));
  return { statusCode: res.status, body };
};
