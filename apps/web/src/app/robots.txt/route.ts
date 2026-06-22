import { NextResponse } from "next/server";

export function GET() {
  const domain = process.env.DOMAIN ?? "https://acctqai.com";
  const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /connections/
Disallow: /billing/
Disallow: /settings/
Disallow: /admin/

Sitemap: ${domain}/sitemap.xml
`;
  return new NextResponse(body, {
    headers: { "Content-Type": "text/plain" },
  });
}
