"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, Hero, Notice, Page, Pill, NotConnected } from "@/components/ui";
import { n8n, useN8n } from "@/lib/useN8n";
import { analyse, OFFSITE_FINDINGS, type PageAudit } from "@/lib/audit";
import type { KeywordSet, VisCheck, VisRow } from "@/lib/types";

// ---------- small helpers (all wording is plain English for the owner)

function rankStyle(rank: number | null) {
  if (rank === null) return { cls: "bg-line text-muted", label: "Not in top 20" };
  if (rank <= 3) return { cls: "bg-good text-white", label: "In the map" };
  if (rank <= 10) return { cls: "bg-warn text-white", label: "Just below the map" };
  return { cls: "bg-bad text-white", label: "Far down the list" };
}

function Movement({ now, before }: { now: number | null; before: number | null | undefined }) {
  if (before === undefined) return <span className="text-xs text-muted">first check</span>;
  if (now === null || before === null || now === before) return <span className="text-xs text-muted">no change</span>;
  const up = now < before; // a smaller number is a better position
  return <span className={`text-xs font-medium ${up ? "text-good" : "text-bad"}`}>{up ? "▲" : "▼"} {Math.abs(before - now)} since last check</span>;
}

const STEM: Record<string, RegExp> = { manufacturers: /manufactur|fabricat|custom/, repairs: /repair/, parts: /part/, servicing: /servic/, builders: /build|fabricat/ };
function hasServicePage(row: VisRow, pages: PageAudit[]) {
  const words = row.keyword.split(" ");
  const stem = words.map((w) => STEM[w]).find(Boolean);
  return pages.some((p) => {
    const t = `${p.title ?? ""} ${(p.h1 ?? []).join(" ")}`.toLowerCase();
    return t.includes(row.mainWord) && (!stem || stem.test(t));
  });
}

/** Data-backed reasons a keyword sits where it does. Nothing here is a guess. */
function reasonsFor(row: VisRow, own: VisCheck["own"]): string[] {
  const out: string[] = [];
  if (row.categoryMatch === false && row.winningCategory)
    out.push(`The businesses ahead of you are listed on Google as "${row.winningCategory}". Your listing doesn't have that category yet.`);
  if (row.top3WithWordInName >= 2)
    out.push(`${row.top3WithWordInName} of the top competitors have "${row.mainWord}" in their business name. Google counts that, and it's against Google's rules to add words to your name, so reviews and your website have to do more of the work.`);
  if (own?.reviews != null && row.top3AvgReviews != null && own.reviews < row.top3AvgReviews)
    out.push(`They average ${row.top3AvgReviews} Google reviews. You have ${own.reviews}.`);
  if (!out.length && row.mapRank !== null && row.mapRank > 3) out.push("Your category and reviews already match the leaders here. Fresh reviews and a stronger page for this service are the next levers.");
  return out;
}

export default function GoogleVisibility() {
  const vis = useN8n<{ latest: VisCheck | null; previous: VisCheck | null }>("visibility.latest");
  const kw = useN8n<KeywordSet>("keywords.get");
  const quota = useN8n<{ left?: number }>("quota.get");
  const audit = useN8n<{ pages?: PageAudit[] }>("audit.latest");
  const [busy, setBusy] = useState<"" | "check" | "find">("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const latest = vis.data?.latest ?? null;
  const prevRank = (k: string) => {
    const p = vis.data?.previous;
    if (!p) return undefined;
    return p.rows.find((r) => r.keyword === k)?.mapRank ?? null;
  };
  const tracked = kw.data?.tracked ?? [];
  const needed = tracked.length + 1;
  const pages = audit.data?.pages ?? [];

  async function check() {
    setBusy("check");
    setMsg(null);
    const r = await n8n<{ searches: number }>("visibility.run", { body: {} });
    setBusy("");
    if (!r.ok) return setMsg({ tone: "error", text: r.error });
    setMsg({ tone: "ok", text: `Checking ${tracked.length} keywords on Google Maps. This takes about a minute and refreshes by itself.` });
    setTimeout(() => { vis.reload(); quota.reload(); }, 45_000);
    setTimeout(() => vis.reload(), 90_000);
  }

  async function findKeywords() {
    setBusy("find");
    setMsg(null);
    const r = await n8n("keywords.discover", { body: {} });
    setBusy("");
    if (!r.ok) return setMsg({ tone: "error", text: r.error });
    setMsg({ tone: "ok", text: "Keywords refreshed from what people are typing into Google right now." });
    kw.reload();
  }

  async function change(keyword: string, action: "pin" | "unpin" | "ignore") {
    const r = await n8n("keywords.update", { body: { keyword, action } });
    if (!r.ok) setMsg({ tone: "error", text: r.error });
    kw.reload();
  }

  // ---------- checklist (computed from the latest check + website audit)
  const missingCats = latest ? [...new Set(latest.rows.filter((r) => r.categoryMatch === false).map((r) => r.winningCategory))] : [];
  const rivalsAvg = latest ? Math.round(latest.rows.filter((r) => r.top3AvgReviews != null).reduce((s, r, _, a) => s + (r.top3AvgReviews ?? 0) / a.length, 0)) : 0;
  const newReviews = latest?.own?.reviews != null && vis.data?.previous?.own?.reviews != null ? latest.own.reviews - vis.data.previous.own.reviews : null;
  const noServicePage = latest && pages.length ? latest.rows.filter((r) => !hasServicePage(r, pages)).map((r) => r.keyword) : [];
  const highIssues = pages.length ? [...OFFSITE_FINDINGS, ...analyse(pages).findings].filter((f) => f.severity === "high").length : null;

  const checklist = latest ? [
    {
      ok: missingCats.length === 0,
      title: "Google categories cover what wins",
      detail: missingCats.length
        ? `Add ${missingCats.map((c) => `"${c}"`).join(", ")} as an extra category on your Google profile. Competitors ranking above you use it.`
        : `Your categories (${latest.own?.types.join(", ") || "unknown"}) match the leaders for every keyword.`,
    },
    {
      ok: (latest.own?.reviews ?? 0) >= rivalsAvg && (newReviews === null || newReviews > 0),
      title: "Steady new reviews",
      detail: `You have ${latest.own?.reviews ?? "?"} reviews (${latest.own?.rating ?? "?"}★); competitors average ${rivalsAvg}. ${newReviews === null ? "Next check will show how many new ones arrived." : `${newReviews} new since the last check.`} Google rewards a new review every 2–3 weeks.`,
      link: { href: "/reviews", label: "Ask for reviews" },
    },
    {
      ok: pages.length > 0 && noServicePage.length === 0,
      title: "A website page for every service",
      detail: !pages.length
        ? "Run a website audit to check this."
        : noServicePage.length
          ? `No page clearly about: ${noServicePage.join(", ")}.`
          : "Every tracked service has its own page.",
      link: { href: "/site-health", label: "Website health" },
    },
    {
      ok: highIssues === 0,
      title: "No major website problems",
      detail: highIssues === null ? "Run a website audit to check this." : `${highIssues} high-priority issue${highIssues === 1 ? "" : "s"} found (titles, structured data, listings).`,
      link: { href: "/site-health", label: "See them" },
    },
  ] : [];

  return (
    <>
      <Hero kicker="Live from Google" title="Your Google visibility">
        Where you appear on the Google map for the searches your customers actually make, and what is holding each one back.
      </Hero>
      <Page>
        {!vis.connected ? (
          <NotConnected what="Google visibility" how="Runs on the n8n automation server with SerpApi. Connect n8n in Settings." />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                {latest ? <>Last checked <b className="text-ink">{new Date(latest.checkedAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</b> · {latest.location} · checks itself every Monday</> : "No check yet."}
              </p>
              <div className="flex items-center gap-2">
                {typeof quota.data?.left === "number" && <span className="text-xs text-muted">{needed} of {quota.data.left} searches left</span>}
                <button className="btn btn-primary" onClick={check} disabled={busy !== "" || !tracked.length}>{busy === "check" ? "Starting…" : "Check now"}</button>
              </div>
            </div>
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

            {/* 1. Scoreboard */}
            <Card title="1 · The scoreboard" state={latest ? "live" : "off"} stateLabel={latest ? "Live" : "No check yet"}>
              <p className="mb-4 text-sm text-muted">Google shows 3 businesses on the map. <b className="text-ink">#1–3 means customers see you without scrolling.</b> #4 and below means they have to scroll to find you.</p>
              {!latest ? <p className="text-sm text-muted">Click &ldquo;Check now&rdquo; for the first reading.</p> : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {latest.rows.map((r) => {
                    const s = rankStyle(r.mapRank);
                    return (
                      <div key={r.keyword} className="rounded-[6px] border border-line p-4">
                        <p className="font-display text-sm">“{r.keyword}”</p>
                        <div className="mt-2 flex items-center gap-3">
                          <span className={`font-display grid h-14 w-14 shrink-0 place-items-center rounded-[6px] text-2xl ${s.cls}`}>{r.mapRank === null ? "–" : `#${r.mapRank}`}</span>
                          <div>
                            <p className="font-medium">{s.label}</p>
                            <Movement now={r.mapRank} before={prevRank(r.keyword)} />
                          </div>
                        </div>
                        <p className="mt-3 text-xs text-muted">Map top 3:</p>
                        <ol className="text-sm">
                          {r.mapTop3.map((t, i) => (
                            <li key={t.title} className={/sparks/i.test(t.title) ? "font-semibold text-orange-deep" : ""}>{i + 1}. {t.title}</li>
                          ))}
                        </ol>
                        <p className="mt-2 text-xs text-muted">Website link: {r.websiteRank !== null ? <b className="text-ink">#{r.websiteRank}</b> : r.websiteSource}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* 2. Why */}
            {latest && (
              <Card title="2 · What's behind each position" state="live" stateLabel="From the same check">
                <ul className="space-y-4">
                  {latest.rows.map((r) => {
                    const reasons = r.mapRank !== null && r.mapRank <= 3 ? [] : reasonsFor(r, latest.own);
                    return (
                      <li key={r.keyword} className="border-b border-line pb-3 last:border-0">
                        <p className="font-medium">“{r.keyword}” <span className="text-muted">· #{r.mapRank ?? "20+"}</span></p>
                        {reasons.length === 0 ? (
                          <p className="text-sm text-good">You&apos;re in the map. Keep the reviews coming to hold the spot.</p>
                        ) : (
                          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{reasons.map((x) => <li key={x}>{x}</li>)}</ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {latest.own && <p className="mt-3 text-xs text-muted">Your Google listing: {latest.own.types.join(" · ")} · {latest.own.rating}★ from {latest.own.reviews} reviews. Google lists your main category first.</p>}
              </Card>
            )}

            {/* 3. Checklist */}
            {latest && (
              <Card title="3 · What moves you up the map">
                <ul className="divide-y divide-line">
                  {checklist.map((c) => (
                    <li key={c.title} className="flex gap-3 py-3">
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm text-white ${c.ok ? "bg-good" : "bg-bad"}`}>{c.ok ? "✓" : "!"}</span>
                      <div className="text-sm">
                        <p className="font-medium">{c.title}</p>
                        <p className="text-muted">{c.detail}</p>
                        {c.link && <Link href={c.link.href} className="text-xs font-medium text-orange-deep underline">{c.link.label}</Link>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* 4. Keywords */}
            <Card
              title="4 · Which searches we watch, and why"
              state={kw.data?.updatedAt ? "live" : "off"}
              stateLabel={kw.data?.updatedAt ? `Updated ${new Date(kw.data.updatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : "Not chosen yet"}
              action={<button className="btn btn-ghost py-1.5" onClick={findKeywords} disabled={busy !== ""}>{busy === "find" ? "Looking…" : "Find keywords again (free)"}</button>}
            >
              <p className="mb-3 text-sm text-muted">
                Picked from what people type into Google for each of your services, best one per service. Refreshed monthly, so they change when demand changes. Pin one to always watch it.
              </p>
              {!tracked.length ? <p className="text-sm text-muted">Click “Find keywords again” to choose them.</p> : (
                <ul className="space-y-2">
                  {tracked.map((t) => (
                    <li key={t.keyword} className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] bg-paper px-3 py-2 text-sm">
                      <span><b>{t.keyword}</b> {t.pinned && <Pill state="demo">Pinned</Pill>}<br /><span className="text-xs text-muted">{t.reasons.join(" · ")}</span></span>
                      <span className="flex gap-2 text-xs">
                        <button className="underline" onClick={() => change(t.keyword, t.pinned ? "unpin" : "pin")}>{t.pinned ? "Unpin" : "Pin"}</button>
                        <button className="text-bad underline" onClick={() => change(t.keyword, "ignore")}>Stop watching</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!!kw.data?.candidates?.length && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-muted">Other searches people make ({kw.data.candidates.length})</summary>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {kw.data.candidates.map((c) => (
                      <li key={c.keyword}><button className="rounded-[4px] border border-line px-2 py-1 hover:border-orange" onClick={() => change(c.keyword, "pin")}>+ {c.keyword}</button></li>
                    ))}
                  </ul>
                </details>
              )}
              {!!kw.data?.brand?.length && <p className="mt-3 text-sm">People also search for you by name: {kw.data.brand.map((b) => <b key={b}>“{b}”</b>)}. That&apos;s earned reputation.</p>}
              {kw.data?.sources && <p className="mt-2 text-xs text-muted">Sources: Google Autocomplete ({kw.data.sources.autocomplete}). Search Console: {kw.data.sources.searchConsole}.</p>}
            </Card>
          </>
        )}
      </Page>
    </>
  );
}
