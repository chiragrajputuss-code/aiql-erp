import { NextResponse } from "next/server";
import { ARTICLES } from "../resources/articles";

// lastmod must reflect the actual date content was last changed.
// Using a dynamic "today" for every page would waste Google's crawl budget
// by signalling a change on every request. Static pages get a real date.
// Bumped 2026-07-12: site-wide rebrand (AccountIQ → AcctQAI) changed titles,
// descriptions and on-page copy, so every page genuinely changed.
const STATIC_PAGES = [
  { path: "/",              priority: "1.0", changefreq: "monthly", lastmod: "2026-07-12" },
  { path: "/sample-report", priority: "0.9", changefreq: "monthly", lastmod: "2026-07-12" },
  { path: "/pricing",       priority: "0.9", changefreq: "monthly", lastmod: "2026-07-12" },
  { path: "/resources",     priority: "0.8", changefreq: "weekly",  lastmod: "2026-07-12" },
  { path: "/contact",       priority: "0.7", changefreq: "yearly",  lastmod: "2026-07-12" },
  { path: "/terms",         priority: "0.3", changefreq: "yearly",  lastmod: "2026-07-12" },
  { path: "/privacy",       priority: "0.3", changefreq: "yearly",  lastmod: "2026-07-12" },
];

export function GET() {
  const domain = process.env.DOMAIN ?? "https://acctqai.com";

  // Content-hub articles — sourced from the shared registry so new posts appear
  // automatically with their real lastmod.
  const articlePages = ARTICLES.map((a) => ({
    path: `/resources/${a.slug}`, priority: "0.7", changefreq: "monthly", lastmod: a.updated,
  }));

  const allPages = [...STATIC_PAGES, ...articlePages];

  const urls = allPages.map(
    ({ path, priority, changefreq, lastmod }) => `  <url>
    <loc>${domain}${path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=86400", // cache 24h — don't regenerate on every Google hit
    },
  });
}
