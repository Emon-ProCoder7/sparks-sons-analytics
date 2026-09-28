// Turns raw per-page crawl data (from the snapshot, or from the n8n "audit.run" workflow,
// which returns the same shape) into plain-English findings.

export type PageAudit = {
  url: string;
  status?: number;
  ms?: number;
  kb?: number;
  title?: string;
  description?: string;
  canonical?: string;
  h1?: string[];
  words?: number;
  images?: number;
  images_no_alt?: number;
  schema_types?: string[];
  has_phone?: boolean;
  has_address?: boolean;
  error?: string;
};

export type Finding = {
  severity: "high" | "medium" | "low";
  title: string;
  why: string;
  fix: string;
  pages: string[];
};

const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";

export function analyse(pages: PageAudit[]): { findings: Finding[]; score: number } {
  const ok = pages.filter((p) => !p.error);
  const f: Finding[] = [];

  const longTitles = ok.filter((p) => (p.title?.length ?? 0) > 65);
  if (longTitles.length)
    f.push({
      severity: "high",
      title: `${longTitles.length} page titles are too long for Google`,
      why: "Google shows roughly the first 60 characters of a title. Longer titles get cut off, so the words people actually search for (\"tow bars Geelong\") can disappear from the result.",
      fix: "Rewrite each title to under 60 characters, main service + town first, brand last. e.g. \"Tow Bars Geelong | Supply & Fitting | F. Sparks & Sons\".",
      pages: longTitles.map((p) => `${path(p.url)} (${p.title!.length} chars)`),
    });

  const longDesc = ok.filter((p) => (p.description?.length ?? 0) > 160);
  if (longDesc.length)
    f.push({
      severity: "medium",
      title: `${longDesc.length} meta descriptions will be truncated`,
      why: "The grey text under a Google result is capped around 155–160 characters. Most pages repeat the same \"Serving Bellarine Peninsula, Surf Coast & Melbourne\" line, which wastes the space.",
      fix: "Give each page a unique 140–155 character description with one concrete reason to call (e.g. Hayman Reese stockist, same-week fitting, since 1968).",
      pages: longDesc.map((p) => `${path(p.url)} (${p.description!.length} chars)`),
    });

  const noSchema = ok.filter((p) => !(p.schema_types ?? []).some((t) => /LocalBusiness|Service|AutoPartsStore|Store/.test(t)) && !path(p.url).startsWith("/blog"));
  if (noSchema.length)
    f.push({
      severity: "high",
      title: `${noSchema.length} service pages have no business/service structured data`,
      why: "Structured data is how the page tells Google (and ChatGPT-style answer engines) \"this is a trailer business at 80 Cowie St offering this service\". Only the homepage and one page do this now.",
      fix: "Add LocalBusiness + Service JSON-LD to every service page, with the same name, address and phone as the Google Business Profile.",
      pages: noSchema.map((p) => path(p.url)),
    });

  const multiH1 = ok.filter((p) => (p.h1?.filter(Boolean).length ?? 0) !== 1 || (p.h1?.length ?? 0) > 1);
  if (multiH1.length)
    f.push({
      severity: "low",
      title: `${multiH1.length} page(s) have a missing or duplicated main heading`,
      why: "Each page should have exactly one main (H1) heading that says what the page is about.",
      fix: "Remove the empty/duplicate H1 in the page builder.",
      pages: multiH1.map((p) => path(p.url)),
    });

  const thin = ok.filter((p) => (p.words ?? 0) < 450 && !/gallery|blog$/.test(p.url));
  if (thin.length)
    f.push({
      severity: "medium",
      title: `${thin.length} key pages are thin on content`,
      why: "Pages under ~450 words rarely out-rank competitors for money keywords. The towbar page is one of the most important pages on the site and is among the shortest.",
      fix: "Expand with real detail: brands fitted, vehicle types, typical fitting time, warranty, photos of real jobs, FAQs.",
      pages: thin.map((p) => `${path(p.url)} (${p.words} words)`),
    });

  const heavy = ok.filter((p) => (p.kb ?? 0) > 200);
  if (heavy.length)
    f.push({
      severity: "low",
      title: `${heavy.length} pages ship more than 200 KB of HTML`,
      why: "The website builder adds a lot of code. It doesn't block ranking, but slower pages lose impatient mobile visitors.",
      fix: "Trim unused page-builder widgets; check Core Web Vitals in the Keywords tab once Search Console is connected.",
      pages: heavy.map((p) => `${path(p.url)} (${p.kb} KB)`),
    });

  const errors = pages.filter((p) => p.error || (p.status && p.status >= 400));
  if (errors.length)
    f.push({
      severity: "high",
      title: `${errors.length} pages failed to load`,
      why: "Broken pages waste Google's crawl and lose visitors.",
      fix: "Fix or redirect them.",
      pages: errors.map((p) => path(p.url)),
    });

  const weights = { high: 12, medium: 6, low: 2 };
  const score = Math.max(0, 100 - f.reduce((s, x) => s + weights[x.severity], 0));
  return { findings: f, score };
}

// Findings that come from outside the crawl (verified by hand, 28 Sep 2026).
export const OFFSITE_FINDINGS: Finding[] = [
  {
    severity: "high",
    title: "Business name is written three different ways",
    why: "\"F. Sparks & Sons\", \"F Sparks & Sons\" and \"F Sparks - Sons\" all appear across the website, its structured data and directory listings. Google cross-checks name, address and phone across the web; mismatches weaken trust in the listing.",
    fix: "Your Google Maps listing is \"F Sparks & Sons\" (no full stop). Leave the Google profile alone and make the website titles, structured data and top directories match it exactly.",
    pages: ["Google Maps listing: \"F Sparks & Sons\"", "Website JSON-LD: \"F Sparks & Sons\"", "Page titles: \"F. Sparks & Sons\" and \"F Sparks & Sons\"", "Hayman Reese stockist page: \"F Sparks - Sons\""],
  },
  {
    severity: "high",
    title: "Duplicate Yellow Pages listings",
    why: "There are two separate Yellow Pages listings for the same business (IDs 1000002920949 and 12261442, one under \"Geelong North\"). Duplicates split reviews and confuse Google's picture of the business.",
    fix: "Claim both, merge or remove the older one, and make sure the remaining one matches the Google profile exactly.",
    pages: ["yellowpages.com.au/…/f-sparks-sons-1000002920949", "yellowpages.com.au/…/geelong-north/f-sparks-sons-12261442"],
  },
  {
    severity: "medium",
    title: "Structured data says \"Geelong\", the real suburb is North Geelong",
    why: "The homepage JSON-LD lists addressLocality \"Geelong\" while every directory says North Geelong 3215.",
    fix: "Set addressLocality to \"North Geelong\" and add the Google Business Profile URL to sameAs (only Facebook is there now).",
    pages: ["/ (LocalBusiness JSON-LD)"],
  },
];
