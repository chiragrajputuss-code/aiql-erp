import { NextResponse } from "next/server";

const STATIC_PAGES = [
  { path: "/",         priority: "1.0", changefreq: "weekly" },
  { path: "/pricing",  priority: "0.9", changefreq: "monthly" },
  { path: "/contact",  priority: "0.8", changefreq: "monthly" },
  { path: "/terms",    priority: "0.4", changefreq: "yearly" },
  { path: "/privacy",  priority: "0.4", changefreq: "yearly" },
];

export function GET() {
  const domain = process.env.DOMAIN ?? "https://acctqai.com";
  const now = new Date().toISOString().split("T")[0];

  const urls = STATIC_PAGES.map(
    ({ path, priority, changefreq }) => `
  <url>
    <loc>${domain}${path}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
  ).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
