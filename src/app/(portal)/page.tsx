"use client";

import Link from "next/link";
import { Card, Hero, Page, Stat, Pill, Notice } from "@/components/ui";
import { useN8n } from "@/lib/useN8n";
import { analyse, OFFSITE_FINDINGS, type PageAudit } from "@/lib/audit";
import snapshot from "@/data/sparks-audit-2026-09-28.json";
import type { ActivityItem, ContentPost, GridJob, GscResult, LeadJob, Settings } from "@/lib/types";

export default function Overview() {
  const audit = useN8n<{ createdAt?: string; pages?: PageAudit[] }>("audit.latest");
  const liveAudit = audit.data?.pages?.length ? audit.data : null;
  const SNAP = analyse((liveAudit?.pages ?? snapshot) as PageAudit[]);
  const settings = useN8n<Settings>("settings.get");
  const grids = useN8n<GridJob[]>("grid.jobs");
  const gsc = useN8n<GscResult>("gsc.queries", { days: "28" });
  const leads = useN8n<LeadJob[]>("leads.jobs");
  const posts = useN8n<ContentPost[]>("content.list");
  const activity = useN8n<ActivityItem[]>("activity.list");

  const connected = settings.connected;
  const demo = settings.data?.demoAccountLabel;
  const liveState = demo ? "demo" : "live";
  const liveLabel = demo ? "Demo account" : "Live";

  const lastGrid = grids.data?.find((g) => g.status === "done");
  const inPack = lastGrid ? lastGrid.points.filter((p) => p.rank !== null && p.rank <= 3).length : null;
  const clicks = gsc.data?.rows?.reduce((s, r) => s + r.clicks, 0);
  const leadCount = leads.data?.reduce((s, j) => s + (j.unique ?? 0), 0);
  const drafts = posts.data?.filter((p) => p.status === "draft").length;

  const priorities = [...OFFSITE_FINDINGS, ...SNAP.findings].filter((f) => f.severity === "high").slice(0, 4);

  return (
    <>
      <Hero kicker="F. Sparks & Sons · North Geelong" title="Marketing overview">
        Where you show up on Google, what&apos;s holding you back, and what&apos;s been done about it, in plain English.
      </Hero>
      <Page>
        {!connected && (
          <Notice tone="warn">
            <b>Automation backend not connected yet.</b> Live cards will fill in once n8n is linked (Settings). The website health figures below are a real
            crawl of sparks.com.au taken on 28 Sep 2026.
          </Notice>
        )}
        {demo && (
          <Notice tone="info">
            <Pill state="demo">Demo account</Pill> <span className="ml-1">Live cards are running on <b>{demo}</b> to show how the tools work. They switch to Sparks&apos; own Google accounts once access is granted.</span>
          </Notice>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Stat
            label="Top-3 on Google Maps"
            value="—"
            count={inPack === null ? undefined : { to: inPack, after: `/${lastGrid!.points.length}` }}
            meaning={lastGrid ? `Grid points where you're in the top 3 for “${lastGrid.keyword}”. The top 3 is what people see without scrolling.` : "Run a Maps Rank Grid to see where you appear on the map around Geelong."}
            state={!connected ? "off" : lastGrid ? "live" : "off"}
            stateLabel={!connected ? "Not connected" : lastGrid ? `Scanned ${new Date(lastGrid.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : "No scan yet"}
            accent
          />
          <Stat
            label="Website health"
            count={{ to: SNAP.score, after: "/100" }}
            delay={0.06}
            meaning={`${SNAP.findings.length + OFFSITE_FINDINGS.length} issues found, ${priorities.length} of them high priority. See Website Health.`}
            state={liveAudit ? "live" : "snapshot"}
            stateLabel={liveAudit?.createdAt ? `Audited ${new Date(liveAudit.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : "Snapshot 28 Sep"}
          />
          <Stat
            label="Google clicks · 28 days"
            value="—"
            count={clicks === undefined ? undefined : { to: clicks, separator: "," }}
            delay={0.12}
            meaning="People who clicked through to the website from Google search (Search Console, not estimates)."
            state={!connected ? "off" : gsc.data?.rows ? liveState : "off"}
            stateLabel={!connected ? "Not connected" : gsc.data?.rows ? liveLabel : "Not synced"}
          />
          <Stat
            label="Leads found"
            value="—"
            count={leadCount === undefined ? undefined : { to: leadCount, separator: "," }}
            delay={0.18}
            meaning="Local businesses found by the Lead Finder that may buy trailers, towbars or parts."
            state={!connected ? "off" : leads.data?.length ? "live" : "off"}
            stateLabel={!connected ? "Not connected" : leads.data?.length ? "Live" : "No runs yet"}
          />
          <Stat
            label="Posts awaiting approval"
            value="—"
            count={drafts === undefined ? undefined : { to: drafts }}
            delay={0.24}
            meaning="Google/Facebook posts drafted for you. Nothing is published until you tick approve."
            state={!connected ? "off" : "live"}
            stateLabel={!connected ? "Not connected" : "Live"}
          />
          <Stat
            label="Reviews on Google"
            count={{ to: 87, before: "4.4★ · " }}
            delay={0.3}
            meaning="As shown in your Thryv Marketing Center (Sep 2026). A steady trickle of new reviews matters more than the total."
            state="snapshot"
            stateLabel="From Thryv screenshot"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card title="Fix these first" state={liveAudit ? "live" : "snapshot"} stateLabel={liveAudit ? "From latest audit" : "Audit 28 Sep"}>
            <ol className="space-y-3">
              {priorities.map((f, i) => (
                <li key={f.title} className="flex gap-3">
                  <span className="font-display grid h-6 w-6 shrink-0 place-items-center rounded-[3px] bg-orange text-sm">{i + 1}</span>
                  <div>
                    <p className="font-medium">{f.title}</p>
                    <p className="text-sm text-muted">{f.fix}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="btn btn-primary" href="/google">Google visibility</Link>
              <Link className="btn btn-ghost" href="/site-health">All website issues</Link>
            </div>
          </Card>

          <Card delay={0.1} title="Recent activity" state={connected ? "live" : "off"} stateLabel={connected ? "Live" : "Not connected"}>
            {!activity.data?.length ? (
              <p className="text-sm text-muted">{connected ? "Nothing yet. Every scan, post and send will be logged here." : "Activity appears once n8n is connected."}</p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {activity.data.slice(0, 12).map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span className="w-24 shrink-0 text-xs text-muted">{new Date(a.createdAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                    <span><span className="font-display mr-1.5 text-xs text-orange-deep">{a.kind}</span>{a.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </Page>
    </>
  );
}
