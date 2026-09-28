import { LEAD_COLUMNS } from "./site";
import type { LeadRow } from "./types";

export type LeadConfig = {
  label: string;
  categories: { label: string; variants: string[] }[];
  suburbs: string[];
  state: string; // results whose address isn't in this state are dropped (e.g. "Maidstone VIC" vs Maidstone, Kent)
  target: number;
  maxPerQuery: number;
  widen: boolean;
  rings: string[][];
  verifyPhones: boolean;
  findDecisionMakers: boolean;
  franchiseBrands: string[];
  nationalBrands: string[];
};

export function buildQueries(categories: LeadConfig["categories"], suburbs: string[], state: string) {
  const out: { query: string; category: string; suburb: string }[] = [];
  for (const c of categories)
    for (const s of suburbs)
      for (const v of c.variants.map((x) => x.trim()).filter(Boolean)) out.push({ query: `${v} in ${s} ${state}`, category: c.label, suburb: s });
  return out;
}

/** Rough wall-clock estimate: ~5s per result opened + 6s per query, run one query at a time. */
export function estimateMinutes(queryCount: number, maxPerQuery: number) {
  return Math.ceil((queryCount * (6 + maxPerQuery * 5)) / 60);
}

function cell(v: string | undefined) {
  const s = (v ?? "").replace(/\r?\n/g, " ");
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: LeadRow[]) {
  return [LEAD_COLUMNS.join(","), ...rows.map((r) => LEAD_COLUMNS.map((c) => cell(r[c])).join(","))].join("\r\n");
}
