import { NextResponse } from "next/server";

export function GET() {
  const domain = process.env.DOMAIN ?? "https://acctqai.com";
  const body = `User-agent: *
Allow: /
Allow: /pricing
Allow: /contact
Allow: /terms
Allow: /privacy

# App pages — no crawl value, require authentication
Disallow: /login
Disallow: /signup
Disallow: /connections/
Disallow: /billing/
Disallow: /settings/
Disallow: /admin/
Disallow: /onboarding/
Disallow: /close/
Disallow: /query/
Disallow: /history/
Disallow: /usage/
Disallow: /knowledge/
Disallow: /tokenisation/

# All API routes
Disallow: /api/

Sitemap: ${domain}/sitemap.xml
`;
  return new NextResponse(body, {
    headers: { "Content-Type": "text/plain" },
  });
}
