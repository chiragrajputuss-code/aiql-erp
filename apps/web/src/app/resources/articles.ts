// ─── Resources / content-hub article registry ────────────────────────────────
//
// One source of truth for the hub index, each article's metadata, and the
// sitemap. Adding an article = one entry here + its page.tsx under the slug.

export interface ResourceArticle {
  slug:        string;
  title:       string;   // card + on-page H1
  metaTitle:   string;   // <title> (keyword-led)
  description: string;   // meta description
  category:    string;
  readMins:    number;
  updated:     string;   // ISO date — also feeds sitemap lastmod
  targetQuery: string;   // primary search intent this page targets
}

export const ARTICLES: ResourceArticle[] = [
  {
    slug:        "vendor-not-filed-gstr-1-itc",
    title:       "Vendor Hasn't Filed GSTR-1: What Happens to Your ITC (and How to Protect It)",
    metaTitle:   "Vendor Not Filed GSTR-1? How It Affects Your ITC",
    description:
      "Your input tax credit doesn't depend on your books — it depends on your supplier filing GSTR-1. Here's what happens to your ITC when a vendor doesn't file, how to spot it early, and how to protect the credit.",
    category:    "GST & ITC",
    readMins:    7,
    updated:     "2026-07-11",
    targetQuery: "vendor not filed gstr-1 itc",
  },
  {
    slug:        "detect-duplicate-payments-in-tally",
    title:       "How to Detect Duplicate Payments in Tally (Before They Cost You)",
    metaTitle:   "How to Detect Duplicate Payments in Tally — A Practical Guide",
    description:
      "Duplicate payments are one of the most invisible ways money leaks out of an Indian SME. Learn how they happen in Tally, how to find them manually, why the manual method misses the costly ones, and how to catch them reliably.",
    category:    "Payments & Controls",
    readMins:    8,
    updated:     "2026-07-10",
    targetQuery: "duplicate payment tally",
  },
];

export function getArticle(slug: string): ResourceArticle | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
