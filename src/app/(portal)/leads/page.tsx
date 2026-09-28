"use client";

import { useMemo, useState } from "react";
import { Card, Hero, Notice, Page, Pill, NotConnected } from "@/components/ui";
import { n8n, useN8n } from "@/lib/useN8n";
import { FRANCHISE_BRANDS, LEAD_CATEGORIES, LEAD_RINGS, LEAD_SUBURBS } from "@/lib/site";
import { buildQueries, estimateMinutes, toCsv, type LeadConfig } from "@/lib/leads";
import type { LeadJob, LeadRow } from "@/lib/types";

const NATIONAL = ["coates", "kennards", "bunnings", "repco", "supercheap auto"];
const csvList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`rounded-[4px] border px-2.5 py-1 text-sm transition-colors ${on ? "border-orange bg-orange-tint" : "border-line bg-white text-muted hover:border-ink"}`}>
      {children}
    </button>
  );
}

function JobProgress({ j }: { j: LeadJob }) {
  const pct = j.queriesTotal ? Math.round((j.queriesDone / j.queriesTotal) * 100) : 0;
  const stages: [string, number][] = [["Scraped", j.scraped], ["Unique", j.unique], ["Phone verified", j.phoneVerified], ["With email", j.withEmail], ["Decision-maker", j.withDecisionMaker], ["Direct mobile", j.withDirectMobile]];
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded bg-line"><div className="h-full bg-orange" style={{ width: `${j.status === "done" ? 100 : pct}%` }} /></div>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {stages.map(([k, v]) => (
          <div key={k}><p className="font-display text-xl">{v ?? 0}</p><p className="text-[0.7rem] text-muted">{k}</p></div>
        ))}
      </div>
      {j.widenedInto?.length > 0 && <p className="mt-2 text-xs"><b>Widened into:</b> {j.widenedInto.join(", ")}{j.widenReason ? ` (${j.widenReason})` : ""}</p>}
      {j.message && <p className="mt-1 text-xs text-muted">{j.message}</p>}
    </div>
  );
}

export default function Leads() {
  const jobs = useN8n<LeadJob[]>("leads.jobs", undefined, 10_000);
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useN8n<LeadRow[]>("leads.rows", selected ? { jobId: selected } : { jobId: "" });

  // --- configuration (everything the owner can change)
  const [cats, setCats] = useState(LEAD_CATEGORIES.map((c, i) => ({ ...c, on: i < 3 })));
  const [newCat, setNewCat] = useState("");
  const [suburbs, setSuburbs] = useState(LEAD_SUBURBS.map((s, i) => ({ s, on: i < 5 })));
  const [newSuburb, setNewSuburb] = useState("");
  const [state, setState] = useState("VIC");
  const [target, setTarget] = useState(100);
  const [maxPerQuery, setMaxPerQuery] = useState(20);
  const [widen, setWiden] = useState(true);
  const [rings, setRings] = useState(LEAD_RINGS.map((r) => r.join(", ")));
  const [verifyPhones, setVerifyPhones] = useState(true);
  const [findDMs, setFindDMs] = useState(true);
  const [franchise, setFranchise] = useState(FRANCHISE_BRANDS.join(", "));
  const [national, setNational] = useState(NATIONAL.join(", "));
  const [label, setLabel] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const activeCats = cats.filter((c) => c.on);
  const activeSuburbs = suburbs.filter((x) => x.on).map((x) => x.s);
  const queries = useMemo(() => buildQueries(activeCats, activeSuburbs, state), [activeCats, activeSuburbs, state]);
  const mins = estimateMinutes(queries.length, maxPerQuery);

  async function start() {
    setBusy(true);
    setMsg(null);
    const config: LeadConfig = {
      label: label.trim() || `${activeCats.map((c) => c.label).join(", ")} · ${activeSuburbs.slice(0, 3).join(", ")}${activeSuburbs.length > 3 ? "…" : ""}`,
      categories: activeCats.map(({ label, variants }) => ({ label, variants })),
      suburbs: activeSuburbs,
      state,
      target,
      maxPerQuery,
      widen,
      rings: rings.map(csvList).filter((r) => r.length),
      verifyPhones,
      findDecisionMakers: findDMs,
      franchiseBrands: csvList(franchise.toLowerCase()),
      nationalBrands: csvList(national.toLowerCase()),
    };
    const r = await n8n<{ jobId: string }>("leads.start", { body: { config, queries, acknowledgedCompliance: ack } });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "error", text: r.error });
    setMsg({ tone: "ok", text: `Started. Roughly ${mins} minutes; you can leave this page, it keeps running on the server.` });
    setSelected(r.data?.jobId ?? null);
    jobs.reload();
  }

  const selJob = jobs.data?.find((j) => j.jobId === selected) ?? null;

  function download() {
    if (!rows.data || !selJob) return;
    const blob = new Blob([toCsv(rows.data)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Sparks_Leads_${selJob.label.replace(/[^a-z0-9]+/gi, "_").slice(0, 50)}_${rows.data.length}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <Hero kicker="New trade customers" title="Lead finder">
        Finds local businesses that buy trailers, towbars and parts (caravan dealers, hire yards, landscapers, builders), checks their details on their own website,
        and gives you one clean call list.
      </Hero>
      <Page>
        <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
          <Card title="1 · Who are you looking for?">
            <p className="label">Business types (tap to include)</p>
            <div className="space-y-2">
              {cats.map((c, i) => (
                <div key={c.label} className="flex flex-wrap items-center gap-2">
                  <Chip on={c.on} onClick={() => setCats(cats.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}>{c.label}</Chip>
                  {c.on && (
                    <input
                      aria-label={`Search phrasings for ${c.label}`}
                      className="field min-w-0 flex-1 py-1 text-xs"
                      value={c.variants.join(", ")}
                      onChange={(e) => setCats(cats.map((x, j) => (j === i ? { ...x, variants: csvList(e.target.value) } : x)))}
                    />
                  )}
                </div>
              ))}
            </div>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const l = newCat.trim(); if (l) setCats([...cats, { label: l, variants: [l.toLowerCase()], on: true }]); setNewCat(""); }}>
              <input className="field max-w-xs py-1.5" placeholder="Add a business type" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
              <button className="btn btn-ghost py-1.5">Add</button>
            </form>
            <p className="mt-1 text-xs text-muted">Each type is searched with every phrasing you list. Google Maps returns different businesses for “caravan dealer” vs “caravan sales”.</p>

            <p className="label mt-5">Suburbs</p>
            <div className="flex flex-wrap gap-2">
              {suburbs.map((x, i) => <Chip key={x.s} on={x.on} onClick={() => setSuburbs(suburbs.map((y, j) => (j === i ? { ...y, on: !y.on } : y)))}>{x.s}</Chip>)}
            </div>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const s = newSuburb.trim(); if (s) setSuburbs([...suburbs, { s, on: true }]); setNewSuburb(""); }}>
              <input className="field max-w-xs py-1.5" placeholder="Add a suburb" value={newSuburb} onChange={(e) => setNewSuburb(e.target.value)} />
              <button className="btn btn-ghost py-1.5">Add</button>
            </form>

            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <div><label className="label" htmlFor="tg">How many leads</label><input id="tg" type="number" min={10} max={1000} className="field" value={target} onChange={(e) => setTarget(Number(e.target.value))} /></div>
              <div><label className="label" htmlFor="mq">Results per search</label><input id="mq" type="number" min={5} max={25} className="field" value={maxPerQuery} onChange={(e) => setMaxPerQuery(Math.min(25, Number(e.target.value)))} /></div>
              <div><label className="label" htmlFor="stt">State only</label><input id="stt" className="field" value={state} onChange={(e) => setState(e.target.value.toUpperCase())} /></div>
              <div><label className="label" htmlFor="lb">Run name</label><input id="lb" className="field" placeholder="optional" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
            </div>
          </Card>

          <div className="space-y-4">
            <Card title="2 · Options">
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={widen} onChange={(e) => setWiden(e.target.checked)} /> <span>If there aren&apos;t enough leads, widen outward ring by ring. The results show exactly which suburbs were added and why.</span></label>
              {widen && (
                <div className="mt-2 space-y-2 pl-6">
                  {rings.map((r, i) => (
                    <div key={i}><label className="label" htmlFor={`ring${i}`}>Ring {i + 1}</label><input id={`ring${i}`} className="field py-1 text-xs" value={r} onChange={(e) => setRings(rings.map((x, j) => (j === i ? e.target.value : x)))} /></div>
                  ))}
                </div>
              )}
              <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={verifyPhones} onChange={(e) => setVerifyPhones(e.target.checked)} /> <span>Check each phone number appears on the business&apos;s own website, and collect their own-domain email.</span></label>
              <label className="mt-2 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={findDMs} onChange={(e) => setFindDMs(e.target.checked)} /> <span>Look for the owner/director&apos;s name on their website. Left blank when not found. Never guessed.</span></label>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-muted">Chains & franchises (flagged, not dropped)</summary>
                <label className="label mt-2" htmlFor="fr">Franchise brands: “independently owned office”</label>
                <textarea id="fr" rows={2} className="field text-xs" value={franchise} onChange={(e) => setFranchise(e.target.value)} />
                <label className="label mt-2" htmlFor="nt">National corporates: “general contact only”</label>
                <textarea id="nt" rows={2} className="field text-xs" value={national} onChange={(e) => setNational(e.target.value)} />
              </details>
            </Card>

            <Card title="3 · Review & start">
              <p className="text-sm"><b>{queries.length}</b> Google Maps searches · up to <b>{queries.length * maxPerQuery}</b> listings checked · about <b>{mins} min</b></p>
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-muted">See every search</summary>
                <ul data-lenis-prevent className="mt-1 max-h-40 overflow-y-auto">{queries.map((q) => <li key={q.query}>{q.query}</li>)}</ul>
              </details>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>I&apos;ll check numbers against the Do Not Call Register before calling, follow ACMA calling hours, and only email in line with the Spam Act 2003.</span>
              </label>
              <button className="btn btn-primary mt-3 w-full" onClick={start} disabled={busy || !ack || !queries.length || !jobs.connected}>{busy ? "Starting…" : "Find leads"}</button>
              {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
            </Card>
          </div>
        </div>

        {!jobs.connected ? (
          <NotConnected what="Lead finder" how="Runs on the n8n automation server plus the Maps worker. Connect them in Settings to start runs." />
        ) : (
          <Card title="Runs">
            {!jobs.data?.length ? <p className="text-sm text-muted">No runs yet.</p> : (
              <div className="space-y-3">
                {jobs.data.map((j) => (
                  <div key={j.jobId} className={`rounded-[6px] border p-3 ${selected === j.jobId ? "border-orange" : "border-line"}`}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <button className="text-left font-medium hover:underline" onClick={() => setSelected(j.jobId)}>{j.label}</button>
                      <span className="flex items-center gap-2 text-xs text-muted">
                        {(j.status === "interrupted" || j.status === "failed") && (
                          <button
                            className="btn btn-ghost px-2 py-1 text-xs"
                            onClick={async () => {
                              const r = await n8n("leads.resume", { body: { jobId: j.jobId } });
                              setMsg(r.ok ? { tone: "ok", text: "Resuming from the last completed search." } : { tone: "error", text: r.error });
                              jobs.reload();
                            }}
                          >
                            Resume
                          </button>
                        )}
                        {new Date(j.createdAt).toLocaleString("en-AU")}
                        <Pill state={j.status === "done" ? "live" : j.status === "failed" ? "error" : "loading"}>{j.status}</Pill>
                      </span>
                    </div>
                    <JobProgress j={j} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {selJob && (
          <Card
            title={`Results · ${selJob.label}`}
            action={<button className="btn btn-primary" onClick={download} disabled={!rows.data?.length}>Download CSV ({rows.data?.length ?? 0})</button>}
          >
            <p className="mb-3 text-xs text-muted">
              Sorted: phone verified first, then has email, then most Google reviews. Size is estimated from review count, because Google Maps has no staff or revenue data. Names
              marked “auto-extracted” come from the business&apos;s own website; spot-check before relying on them.
            </p>
            {rows.error && <Notice tone="error">{rows.error}</Notice>}
            <div data-lenis-prevent className="max-h-[560px] overflow-auto">
              <table className="data min-w-[1100px]">
                <thead className="sticky top-0 bg-white"><tr><th>Business</th><th>Suburb</th><th>Phone</th><th>Verified</th><th>Email</th><th>Reviews</th><th>Decision-maker</th><th>Size</th></tr></thead>
                <tbody>
                  {(rows.data ?? []).map((r, i) => (
                    <tr key={i}>
                      <td><p className="font-medium">{r.business_name}</p><p className="text-xs text-muted">{r.category}</p></td>
                      <td>{r.suburb_area}</td>
                      <td className="whitespace-nowrap">{r.business_phone}</td>
                      <td className="text-xs">{r.phone_verified_on_own_site}</td>
                      <td className="text-xs">{r.business_email}</td>
                      <td>{r.google_rating && `${r.google_rating}★`} {r.google_reviews}</td>
                      <td className="text-xs">{r.decision_maker_name ? <><b>{r.decision_maker_name}</b> · {r.decision_maker_role}{r.decision_maker_direct_mobile && <><br />{r.decision_maker_direct_mobile}</>}{r.decision_maker_shared_with_other_listing && <><br /><span className="text-warn">{r.decision_maker_shared_with_other_listing}</span></>}</> : "—"}</td>
                      <td className="text-xs">{r.business_size_estimate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </Page>
    </>
  );
}
