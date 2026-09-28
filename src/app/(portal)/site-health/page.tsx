"use client";

import { useState } from "react";
import { Card, Hero, Notice, Page, Pill } from "@/components/ui";
import { analyse, OFFSITE_FINDINGS, type Finding, type PageAudit } from "@/lib/audit";
import { n8n, useN8n } from "@/lib/useN8n";
import snapshot from "@/data/sparks-audit-2026-09-28.json";

type AuditRun = { runId: string; createdAt: string; site: string; pages: PageAudit[] };

const SEV = { high: "bg-bad text-white", medium: "bg-warn text-white", low: "bg-line text-muted" };

function FindingList({ items }: { items: Finding[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((f) => (
        <li key={f.title} className="py-4 first:pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-display rounded-[3px] px-1.5 py-0.5 text-[0.68rem] ${SEV[f.severity]}`}>{f.severity}</span>
            <p className="font-medium">{f.title}</p>
          </div>
          <p className="mt-1.5 text-sm"><span className="text-muted">Why it matters: </span>{f.why}</p>
          <p className="mt-1 text-sm"><span className="text-muted">Fix: </span>{f.fix}</p>
          <details className="mt-1.5 text-xs text-muted">
            <summary className="cursor-pointer">{f.pages.length} affected</summary>
            <ul className="mt-1 list-disc pl-5">{f.pages.map((p) => <li key={p}>{p}</li>)}</ul>
          </details>
        </li>
      ))}
    </ul>
  );
}

export default function SiteHealth() {
  const latest = useN8n<AuditRun | null>("audit.latest");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const live = latest.data?.pages?.length ? latest.data : null;
  const pages = (live?.pages ?? snapshot) as PageAudit[];
  const { findings, score } = analyse(pages);
  const all = [...OFFSITE_FINDINGS, ...findings].sort((a, b) => ["high", "medium", "low"].indexOf(a.severity) - ["high", "medium", "low"].indexOf(b.severity));

  async function run() {
    setBusy(true);
    setMsg(null);
    const r = await n8n("audit.run", { body: { site: "https://www.sparks.com.au" } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "error", text: r.error });
    setMsg({ tone: "ok", text: "Audit started. It crawls every page in the sitemap and takes about a minute. This page refreshes when it's done." });
    setTimeout(latest.reload, 60_000);
  }

  return (
    <>
      <Hero kicker="sparks.com.au" title="Website health">
        What Google sees when it reads your website, and what to fix, in order of impact.
      </Hero>
      <Page>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <p className="font-display text-5xl text-orange-deep">{score}</p>
            <div>
              <p className="font-display text-sm">Health score / 100</p>
              {live ? <Pill state="live">{`Live · ${new Date(live.createdAt).toLocaleDateString("en-AU")}`}</Pill> : <Pill state="snapshot">Snapshot · 28 Sep 2026</Pill>}
            </div>
          </div>
          <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? "Starting…" : "Run a fresh audit"}</button>
        </div>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        {!latest.connected && <Notice tone="warn">n8n isn&apos;t connected yet, so fresh audits can&apos;t run. You&apos;re seeing the 28 Sep 2026 crawl of all 16 pages in the sitemap.</Notice>}

        <Card title={`Issues (${all.length})`}>
          <FindingList items={all} />
        </Card>

        <Card title="Every page">
          <div className="overflow-x-auto">
            <table className="data min-w-[860px]">
              <thead>
                <tr><th>Page</th><th>Title length</th><th>Description</th><th>Words</th><th>Structured data</th><th>Load</th></tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.url}>
                    <td className="max-w-[280px]"><p className="truncate font-medium">{p.url.replace(/^https?:\/\/[^/]+/, "") || "/"}</p><p className="truncate text-xs text-muted">{p.title}</p></td>
                    <td className={(p.title?.length ?? 0) > 65 ? "text-bad" : ""}>{p.title?.length ?? "—"}</td>
                    <td className={(p.description?.length ?? 0) > 160 ? "text-bad" : ""}>{p.description?.length ?? "—"}</td>
                    <td className={(p.words ?? 0) < 450 ? "text-warn" : ""}>{p.words ?? "—"}</td>
                    <td className="text-xs">{p.schema_types?.length ? p.schema_types.join(", ") : <span className="text-bad">none</span>}</td>
                    <td className="text-xs">{p.ms ? `${p.ms} ms · ${p.kb} KB` : p.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Page>
    </>
  );
}
