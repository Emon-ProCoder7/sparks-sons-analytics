"use client";

import { useEffect, useState } from "react";
import { Card, Hero, Notice, Page, Pill } from "@/components/ui";
import { n8n, useN8n } from "@/lib/useN8n";
import { BUSINESS, DEFAULT_KEYWORDS } from "@/lib/site";
import type { Settings } from "@/lib/types";

const EMPTY: Settings = {
  businessNameOnGoogle: BUSINESS.name,
  googlePlaceId: "",
  gscProperty: "sc-domain:sparks.com.au",
  trackedKeywords: DEFAULT_KEYWORDS,
  facebookPageName: "",
  reviewMessage: "",
  extraFacts: "",
  demoAccountLabel: "",
};

export default function SettingsPage() {
  const remote = useN8n<Settings>("settings.get");
  const [status, setStatus] = useState<{ role: string | null; n8n: boolean } | null>(null);
  const [edit, setEdit] = useState<Settings | null>(null);
  const s: Settings = edit ?? { ...EMPTY, ...(remote.data ?? {}) };
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch("/api/status").then((r) => r.json()).then(setStatus); }, []);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setEdit({ ...s, [k]: v });

  async function save() {
    setBusy(true);
    const r = await n8n("settings.save", { body: s });
    setBusy(false);
    setMsg(r.ok ? { tone: "ok", text: "Saved." } : { tone: "error", text: r.error });
  }

  const conns: [string, boolean | null, string][] = [
    ["Automation server (n8n)", status?.n8n ?? null, "N8N_WEBHOOK_BASE + N8N_SHARED_SECRET in Vercel"],
    ["n8n settings store", remote.connected && !remote.error && !!remote.data, "Workflow “Sparks · Portal Core” active in n8n"],
  ];

  return (
    <>
      <Hero kicker="Admin" title="Settings" />
      <Page>
        <Card title="Connections">
          <ul className="divide-y divide-line text-sm">
            {conns.map(([name, ok, how]) => (
              <li key={name} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span><b>{name}</b><br /><span className="text-xs text-muted">{how}</span></span>
                <Pill state={ok === null ? "loading" : ok ? "live" : "off"}>{ok === null ? "checking" : ok ? "connected" : "not connected"}</Pill>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Google Search Console, Google Business Profile, Facebook, OpenAI and SMS/email credentials are stored inside n8n&apos;s encrypted credential store, never in this portal or the browser.
            You&apos;re signed in as <b>{status?.role ?? "…"}</b>.
          </p>
        </Card>

        <Card title="Business details used by the tools">
          {!remote.connected && <div className="mb-3"><Notice tone="warn">Settings are stored in n8n. Connect it to save changes.</Notice></div>}
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="label" htmlFor="bn">Business name exactly as on Google Maps</label><input id="bn" className="field" value={s.businessNameOnGoogle} onChange={(e) => set("businessNameOnGoogle", e.target.value)} /></div>
            <div><label className="label" htmlFor="pid">Google Place ID</label><input id="pid" className="field" placeholder="ChIJ…" value={s.googlePlaceId} onChange={(e) => set("googlePlaceId", e.target.value)} /></div>
            <div><label className="label" htmlFor="gsc">Search Console property</label><input id="gsc" className="field" value={s.gscProperty} onChange={(e) => set("gscProperty", e.target.value)} /></div>
            <div><label className="label" htmlFor="fb">Facebook Page name</label><input id="fb" className="field" value={s.facebookPageName} onChange={(e) => set("facebookPageName", e.target.value)} /></div>
            <div className="md:col-span-2"><label className="label" htmlFor="kw">Tracked keywords (one per line)</label><textarea id="kw" rows={5} className="field" value={s.trackedKeywords.join("\n")} onChange={(e) => set("trackedKeywords", e.target.value.split("\n").map((x) => x.trim().toLowerCase()).filter(Boolean))} /></div>
            <div className="md:col-span-2"><label className="label" htmlFor="rm">Review request message</label><textarea id="rm" rows={2} className="field" value={s.reviewMessage} placeholder="Uses the default if blank. {name} and {link} are filled in." onChange={(e) => set("reviewMessage", e.target.value)} /></div>
            <div className="md:col-span-2"><label className="label" htmlFor="ef">Extra facts the post writer may use</label><textarea id="ef" rows={4} className="field" placeholder="e.g. Hayman Reese stockist. Galvanised trailers built on site. 12-month structural warranty on new builds." value={s.extraFacts} onChange={(e) => set("extraFacts", e.target.value)} /><p className="mt-1 text-xs text-muted">Only put things here that are true. The writer won&apos;t invent anything else.</p></div>
            <div className="md:col-span-2"><label className="label" htmlFor="demo">Demo account label</label><input id="demo" className="field" placeholder="e.g. Truetel's own Google profile (leave blank once Sparks' accounts are connected)" value={s.demoAccountLabel} onChange={(e) => set("demoAccountLabel", e.target.value)} /><p className="mt-1 text-xs text-muted">While set, every live card is marked “Demo account” so a screenshot can&apos;t be mistaken for Sparks&apos; own data.</p></div>
          </div>
          <button className="btn btn-primary mt-4" onClick={save} disabled={busy || !remote.connected}>{busy ? "Saving…" : "Save settings"}</button>
          {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
        </Card>
      </Page>
    </>
  );
}
