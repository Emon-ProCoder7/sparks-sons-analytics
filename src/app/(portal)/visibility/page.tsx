"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Card, Hero, Notice, Page, NotConnected } from "@/components/ui";
import { n8n, useN8n } from "@/lib/useN8n";
import { BUSINESS, DEFAULT_KEYWORDS } from "@/lib/site";
import type { GridJob, Settings } from "@/lib/types";

const GridMap = dynamic(() => import("@/components/GridMap"), { ssr: false, loading: () => <div className="h-[460px] animate-pulse rounded-[6px] bg-line" /> });
const GridSkyline = dynamic(() => import("@/components/GridSkyline"), { ssr: false, loading: () => <div className="h-[460px] animate-pulse rounded-[6px] bg-line" /> });

export default function Visibility() {
  const settings = useN8n<Settings>("settings.get");
  const jobs = useN8n<GridJob[]>("grid.jobs", undefined, 15_000);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"3d" | "map">("3d");

  const [keyword, setKeyword] = useState(DEFAULT_KEYWORDS[0]);
  const [gridSize, setGridSize] = useState(5);
  const [spacingKm, setSpacingKm] = useState(2);
  const [lat, setLat] = useState(String(BUSINESS.lat));
  const [lng, setLng] = useState(String(BUSINESS.lng));
  const [businessName, setBusinessName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const nameToMatch = businessName || settings.data?.businessNameOnGoogle || BUSINESS.name;
  const job = useMemo(() => jobs.data?.find((j) => j.jobId === selected) ?? jobs.data?.find((j) => j.status === "done") ?? null, [jobs.data, selected]);
  // Maps ranks are public data about the real business, so they're never "demo".

  async function start() {
    setBusy(true);
    setMsg(null);
    const r = await n8n<{ jobId: string }>("grid.start", {
      body: { keyword: keyword.trim(), gridSize, spacingKm, centerLat: Number(lat), centerLng: Number(lng), businessName: nameToMatch, depth: 20 },
    });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "error", text: r.error });
    setMsg({ tone: "ok", text: `Scan started: ${gridSize * gridSize} map searches. This takes roughly ${Math.ceil((gridSize * gridSize * 12) / 60)} minutes.` });
    setSelected(r.data?.jobId ?? null);
    jobs.reload();
  }

  const summary = job?.status === "done" ? {
    top3: job.points.filter((p) => p.rank !== null && p.rank <= 3).length,
    found: job.points.filter((p) => p.rank !== null).length,
    avg: (() => { const r = job.points.filter((p) => p.rank !== null).map((p) => p.rank!); return r.length ? (r.reduce((a, b) => a + b, 0) / r.length).toFixed(1) : "—"; })(),
    rivals: Object.entries(job.points.flatMap((p) => p.top.slice(0, 3)).reduce<Record<string, number>>((m, n) => ((m[n] = (m[n] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 6),
  } : null;

  return (
    <>
      <Hero kicker="Google Maps · “places” results" title="Maps rank grid">
        Pretends to be a customer searching from points spread across Geelong, and records where you appear in the map results at each point. This is the result your
        current reports don&apos;t measure.
      </Hero>
      <Page>
        <Card title="New scan">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <label className="label" htmlFor="kw">Search phrase</label>
              <input id="kw" className="field" list="kw-list" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
              <datalist id="kw-list">{DEFAULT_KEYWORDS.map((k) => <option key={k} value={k} />)}</datalist>
            </div>
            <div>
              <label className="label" htmlFor="bn">Business name to find</label>
              <input id="bn" className="field" placeholder={nameToMatch} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="gs">Grid</label>
                <select id="gs" className="field" value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))}>
                  {[3, 5, 7].map((n) => <option key={n} value={n}>{n}×{n} ({n * n})</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="sp">Spacing</label>
                <select id="sp" className="field" value={spacingKm} onChange={(e) => setSpacingKm(Number(e.target.value))}>
                  {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n} km</option>)}
                </select>
              </div>
            </div>
            <div><label className="label" htmlFor="lat">Centre latitude</label><input id="lat" className="field" value={lat} onChange={(e) => setLat(e.target.value)} /></div>
            <div><label className="label" htmlFor="lng">Centre longitude</label><input id="lng" className="field" value={lng} onChange={(e) => setLng(e.target.value)} /></div>
            <div className="flex items-end md:col-span-2">
              <button className="btn btn-primary" onClick={start} disabled={busy || !keyword.trim()}>{busy ? "Starting…" : `Run ${gridSize * gridSize}-point scan`}</button>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">Default centre is 80 Cowie St, North Geelong. Covers about {((gridSize - 1) * spacingKm).toFixed(0)} km edge to edge.</p>
          {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
        </Card>

        {!jobs.connected ? (
          <NotConnected what="Maps rank grid" how="Runs on the n8n automation server and the Maps worker. Connect them in Settings, then scans appear here." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
            <Card
              title={job ? `“${job.keyword}”` : "No scans yet"}
              state={job ? (job.status === "done" ? "live" : job.status === "failed" ? "error" : "loading") : undefined}
              stateLabel={job ? (job.status === "done" ? new Date(job.createdAt).toLocaleDateString("en-AU") : job.status) : undefined}
            >
              {job?.status === "done" ? (
                <>
                  <div role="tablist" aria-label="Result view" className="mb-3 inline-flex rounded-[6px] border border-line p-0.5">
                    {([["3d", "3D skyline"], ["map", "Map"]] as const).map(([v, l]) => (
                      <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`font-display relative rounded-[4px] px-3 py-1 text-xs transition-colors ${view === v ? "text-ink" : "text-muted hover:text-ink"}`}>
                        {view === v && <motion.span layoutId="grid-view" className="absolute inset-0 rounded-[4px] bg-orange" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                        <span className="relative">{l}</span>
                      </button>
                    ))}
                  </div>
                  {view === "3d" ? (
                    <GridSkyline points={job.points} depth={job.depth} gridSize={job.gridSize} spacingKm={job.spacingKm} center={[job.centerLat, job.centerLng]} business={[BUSINESS.lat, BUSINESS.lng]} />
                  ) : (
                    <GridMap points={job.points} center={[job.centerLat, job.centerLng]} depth={job.depth} business={[BUSINESS.lat, BUSINESS.lng]} />
                  )}
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                    <div><p className="font-display text-3xl text-good">{summary!.top3}</p><p className="text-xs text-muted">points in top 3</p></div>
                    <div><p className="font-display text-3xl">{summary!.found}/{job.points.length}</p><p className="text-xs text-muted">points found at all</p></div>
                    <div><p className="font-display text-3xl">{summary!.avg}</p><p className="text-xs text-muted">average rank when found</p></div>
                  </div>
                  <p className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
                    <span><span className="inline-block h-2.5 w-2.5 rounded-full bg-good" /> 1–3</span>
                    <span><span className="inline-block h-2.5 w-2.5 rounded-full bg-warn" /> 4–10</span>
                    <span><span className="inline-block h-2.5 w-2.5 rounded-full bg-bad" /> 11–{job.depth}</span>
                    <span><span className="inline-block h-2.5 w-2.5 rounded-full bg-[#9a9a9a]" /> not in top {job.depth}</span>
                  </p>
                </>
              ) : job ? (
                <p className="text-sm text-muted">{job.status === "failed" ? job.message ?? "This scan failed." : "Scanning… results appear here automatically."}</p>
              ) : (
                <p className="text-sm text-muted">Run your first scan above.</p>
              )}
            </Card>

            <div className="space-y-4">
              {summary && (
                <Card title="Who's beating you">
                  <ol className="space-y-1.5 text-sm">
                    {summary.rivals.map(([n, c]) => (
                      <li key={n} className="flex justify-between gap-2"><span className="truncate">{n}</span><span className="text-muted">{c} pts</span></li>
                    ))}
                  </ol>
                  <p className="mt-2 text-xs text-muted">How many grid points each business held a top-3 spot.</p>
                </Card>
              )}
              <Card title="Past scans">
                {!jobs.data?.length ? <p className="text-sm text-muted">None yet.</p> : (
                  <ul className="space-y-1">
                    {jobs.data.map((j) => (
                      <li key={j.jobId}>
                        <button onClick={() => setSelected(j.jobId)} className={`w-full rounded-[4px] px-2 py-1.5 text-left text-sm hover:bg-paper ${job?.jobId === j.jobId ? "bg-orange-tint" : ""}`}>
                          <span className="block truncate font-medium">{j.keyword}</span>
                          <span className="text-xs text-muted">{new Date(j.createdAt).toLocaleString("en-AU")} · {j.gridSize}×{j.gridSize} · {j.status}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}
      </Page>
    </>
  );
}
