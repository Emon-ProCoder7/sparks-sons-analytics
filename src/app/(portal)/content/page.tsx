"use client";

import { useState } from "react";
import { Card, Hero, Notice, Page, Pill } from "@/components/ui";
import { n8n, useN8n } from "@/lib/useN8n";
import type { ContentPost } from "@/lib/types";

const KINDS = [
  { v: "job", l: "Recent job / build" },
  { v: "product", l: "Product in stock" },
  { v: "tip", l: "Towing or maintenance tip" },
  { v: "update", l: "Business update (hours, closures)" },
  { v: "offer", l: "Offer / promotion" },
];
const PLATFORMS = [
  { v: "google", l: "Google Business Profile" },
  { v: "facebook", l: "Facebook Page" },
];

export default function Content() {
  const list = useN8n<ContentPost[]>("content.list");
  const [kind, setKind] = useState("job");
  const [platforms, setPlatforms] = useState<string[]>(["google", "facebook"]);
  const [facts, setFacts] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [draft, setDraft] = useState<ContentPost | null>(null);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState<"" | "draft" | "publish">("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);

  async function makeDraft() {
    setBusy("draft");
    setMsg(null);
    setApproved(false);
    const r = await n8n<ContentPost>("content.draft", { body: { kind, platforms, facts, imageUrl: imageUrl || undefined } });
    setBusy("");
    if (!r.ok) return setMsg({ tone: "error", text: r.error });
    setDraft(r.data);
    list.reload();
  }

  async function publish() {
    if (!draft) return;
    setBusy("publish");
    setMsg(null);
    const r = await n8n<ContentPost>("content.publish", { body: { id: draft.id, captions: draft.captions, platforms: draft.platforms, imageUrl: draft.imageUrl, approved } });
    setBusy("");
    if (!r.ok) return setMsg({ tone: "error", text: r.error });
    const res = r.data?.results ?? {};
    const failed = Object.entries(res).filter(([, v]) => v !== "published");
    setMsg(failed.length ? { tone: "warn", text: `Posted with problems: ${failed.map(([k, v]) => `${k}: ${v}`).join("; ")}` } : { tone: "ok", text: "Published." });
    setDraft(null);
    setFacts("");
    setImageUrl("");
    list.reload();
  }

  return (
    <>
      <Hero kicker="Google & Facebook" title="Posts & photos">
        Tell us what happened in the workshop in a sentence or two. We draft the post for each platform, you read it, tick approve, and it goes out.
      </Hero>
      <Page>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="1 · What's the post about?">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="kind">Type</label>
                <select id="kind" className="field" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}</select>
              </div>
              <fieldset>
                <legend className="label">Post to</legend>
                {PLATFORMS.map((p) => (
                  <label key={p.v} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={platforms.includes(p.v)} onChange={(e) => setPlatforms(e.target.checked ? [...platforms, p.v] : platforms.filter((x) => x !== p.v))} /> {p.l}
                  </label>
                ))}
              </fieldset>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="facts">The facts (only these will be used)</label>
                <textarea id="facts" rows={5} className="field" placeholder="e.g. Built a 7x5 tandem box trailer for a landscaper in Lara. Galvanised, cage sides, electric brakes. Picked up Friday." value={facts} onChange={(e) => setFacts(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="img">Photo link (optional)</label>
                <input id="img" className="field" placeholder="https://… (a real photo of the job works best)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-primary mt-3" onClick={makeDraft} disabled={busy !== "" || facts.trim().length < 15 || !platforms.length}>{busy === "draft" ? "Drafting…" : "Draft the post"}</button>
            <p className="mt-2 text-xs text-muted">The writer is told to use only your facts: no invented prices, specs or promises. Drafts are checked for banned phrases before you see them.</p>
          </Card>

          <Card title="2 · Check & approve">
            {!draft ? (
              <p className="text-sm text-muted">Your draft appears here.</p>
            ) : (
              <div className="space-y-4">
                {draft.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.imageUrl} alt="" className="max-h-56 w-full rounded-[6px] object-cover" />
                )}
                {draft.platforms.map((p) => (
                  <div key={p}>
                    <label className="label" htmlFor={`cap-${p}`}>{PLATFORMS.find((x) => x.v === p)?.l ?? p}</label>
                    <textarea
                      id={`cap-${p}`}
                      rows={6}
                      className="field"
                      value={draft.captions[p] ?? ""}
                      onChange={(e) => { setApproved(false); setDraft({ ...draft, captions: { ...draft.captions, [p]: e.target.value } }); }}
                    />
                    <p className="text-right text-xs text-muted">{(draft.captions[p] ?? "").length} chars{p === "google" && " · Google cuts off at 1,500"}</p>
                  </div>
                ))}
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={approved} onChange={(e) => setApproved(e.target.checked)} /> I&apos;ve read this and it&apos;s accurate. Publish it.</label>
                <button className="btn btn-primary" onClick={publish} disabled={!approved || busy !== ""}>{busy === "publish" ? "Publishing…" : "Publish"}</button>
              </div>
            )}
            {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
          </Card>
        </div>

        <Card title="Post history" state={list.connected ? "live" : "off"} stateLabel={list.connected ? "Live" : "Not connected"}>
          {!list.data?.length ? <p className="text-sm text-muted">{list.connected ? "No posts yet." : "Appears once n8n is connected."}</p> : (
            <div className="overflow-x-auto">
              <table className="data min-w-[640px]">
                <thead><tr><th>When</th><th>Type</th><th>Where</th><th>Text</th><th>Status</th></tr></thead>
                <tbody>
                  {list.data.slice(0, 40).map((p) => (
                    <tr key={p.id}>
                      <td className="text-xs">{new Date(p.createdAt).toLocaleString("en-AU")}</td>
                      <td>{KINDS.find((k) => k.v === p.kind)?.l ?? p.kind}</td>
                      <td className="text-xs">{p.platforms.join(", ")}</td>
                      <td className="max-w-[360px] truncate text-xs">{Object.values(p.captions)[0]}</td>
                      <td><Pill state={p.status === "published" ? "live" : p.status === "draft" ? "off" : "error"}>{p.status}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Page>
    </>
  );
}
