"use client";

import { useMemo, useState } from "react";
import { Card, Hero, Notice, Page, Pill, NotConnected } from "@/components/ui";
import { n8n, useN8n } from "@/lib/useN8n";
import { DEFAULT_KEYWORDS } from "@/lib/site";
import type { GscResult, Settings } from "@/lib/types";

const pos = (p: number) => (p <= 3 ? "text-good" : p <= 10 ? "text-warn" : "text-bad");

export default function Keywords() {
  const [days, setDays] = useState("28");
  const gsc = useN8n<GscResult>("gsc.queries", { days });
  const settings = useN8n<Settings>("settings.get");
  const [trackedEdit, setTracked] = useState<string[] | null>(null);
  const tracked = trackedEdit ?? (settings.data?.trackedKeywords?.length ? settings.data.trackedKeywords : DEFAULT_KEYWORDS);
  const [newKw, setNewKw] = useState("");
  const [onlyTracked, setOnlyTracked] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const all = gsc.data?.rows ?? [];
    if (!onlyTracked) return all;
    return all.filter((r) => tracked.some((t) => r.query.toLowerCase().includes(t.toLowerCase())));
  }, [gsc.data, onlyTracked, tracked]);

  const missing = tracked.filter((t) => !(gsc.data?.rows ?? []).some((r) => r.query.toLowerCase() === t.toLowerCase()));

  async function saveKeywords(next: string[]) {
    setTracked(next);
    if (!settings.data) return;
    const r = await n8n("settings.save", { body: { ...settings.data, trackedKeywords: next } });
    if (!r.ok) setMsg({ tone: "error", text: r.error });
  }

  async function sync() {
    setBusy(true);
    const r = await n8n("gsc.sync", { body: { days: Number(days) } });
    setBusy(false);
    setMsg(r.ok ? { tone: "ok", text: "Pulled fresh data from Google Search Console." } : { tone: "error", text: r.error });
    if (r.ok) gsc.reload();
  }

  const demo = settings.data?.demoAccountLabel;

  return (
    <>
      <Hero kicker="Google Search Console" title="Keywords">
        Real searches people typed before they saw your website, straight from Google, not estimates. Track as many phrases as you like; there&apos;s no plan limit.
      </Hero>
      <Page>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <Card title="Phrases you care about" action={<span className="text-xs text-muted">{tracked.length} tracked</span>}>
          <div className="flex flex-wrap gap-2">
            {tracked.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 rounded-[4px] border border-line bg-paper px-2 py-1 text-sm">
                {k}
                <button aria-label={`Stop tracking ${k}`} className="text-muted hover:text-bad" onClick={() => saveKeywords(tracked.filter((t) => t !== k))}>×</button>
              </span>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const k = newKw.trim().toLowerCase();
              if (k && !tracked.includes(k)) saveKeywords([...tracked, k]);
              setNewKw("");
            }}
          >
            <input className="field max-w-sm" placeholder="e.g. box trailers geelong" value={newKw} onChange={(e) => setNewKw(e.target.value)} />
            <button className="btn btn-ghost">Add</button>
          </form>
          <p className="mt-2 text-xs text-muted">Tracking a phrase only measures it. Adding or removing one never changes where you rank.</p>
        </Card>

        {!gsc.connected ? (
          <NotConnected what="Search Console" how="Connect n8n, then authorise Google Search Console once in n8n's credentials. Data syncs daily." />
        ) : (
          <Card
            title="What people searched"
            state={gsc.data?.rows ? (demo ? "demo" : "live") : "off"}
            stateLabel={gsc.data?.rows ? `${demo ? "Demo · " : ""}${gsc.data.startDate} → ${gsc.data.endDate}` : "Not synced"}
            action={
              <div className="flex items-center gap-2">
                <select className="field w-auto py-1.5" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Date range">
                  <option value="7">7 days</option><option value="28">28 days</option><option value="90">3 months</option>
                </select>
                <button className="btn btn-ghost py-1.5" onClick={sync} disabled={busy}>{busy ? "Syncing…" : "Sync now"}</button>
              </div>
            }
          >
            <label className="mb-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyTracked} onChange={(e) => setOnlyTracked(e.target.checked)} /> Only show my tracked phrases
            </label>
            {gsc.error && <Notice tone="error">{gsc.error}</Notice>}
            <div className="overflow-x-auto">
              <table className="data min-w-[620px]">
                <thead><tr><th>Search</th><th>Clicks</th><th>Seen</th><th>Click rate</th><th>Avg position</th></tr></thead>
                <tbody>
                  {rows.slice(0, 200).map((r) => (
                    <tr key={r.query}>
                      <td className="font-medium">{r.query} {tracked.includes(r.query.toLowerCase()) && <Pill state="demo">Tracked</Pill>}</td>
                      <td>{r.clicks}</td>
                      <td>{r.impressions.toLocaleString()}</td>
                      <td>{(r.ctr * 100).toFixed(1)}%</td>
                      <td className={pos(r.position)}>{r.position.toFixed(1)}</td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={5} className="text-muted">No data for this range yet.</td></tr>}
                </tbody>
              </table>
            </div>
            {gsc.data?.rows && missing.length > 0 && (
              <p className="mt-3 text-sm text-muted"><b>Not showing up at all yet:</b> {missing.join(", ")}. Google hasn&apos;t shown the site for these exact phrases in this period. These are content gaps.</p>
            )}
            <p className="mt-2 text-xs text-muted">“Avg position” is the blue-link position. For the map results use the Maps Rank Grid.</p>
          </Card>
        )}
      </Page>
    </>
  );
}
