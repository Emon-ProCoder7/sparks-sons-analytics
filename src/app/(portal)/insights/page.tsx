import Link from "next/link";
import { Card, Hero, Page, Pill } from "@/components/ui";

const COMPARE: [string, string, string][] = [
  ["Measures the Google Maps (“places”) results", "Not in the reports you shared: they track the normal blue-link results", "Yes: a rank grid across Geelong, Bellarine & Surf Coast, re-run on demand"],
  ["Which keywords are tracked", "A fixed list tied to the plan size", "As many as you like. Search Console data is free, so there's no reason to cap it"],
  ["Explains why a number moved", "Scores and arrows", "Plain-English notes next to every number"],
  ["Review requests", "Suggested a QR code", "QR code for the counter + one-tap SMS/email requests, logged"],
  ["Google & Facebook posts", "You write and schedule them yourself", "Drafted for you from your real jobs; you tick approve and it posts"],
  ["Finding new trade customers", "Not included", "Lead Finder: caravan dealers, hire yards, builders, landscapers around Geelong, verified"],
  ["Who owns the accounts & data", "—", "You do. Google profile, Search Console and every export stay in your name"],
];

export default function Insights() {
  return (
    <>
      <Hero kicker="Answering your questions" title="Why you're on page 1 but not in the map">
        You&apos;re right that it doesn&apos;t add up. Here&apos;s what&apos;s actually going on, with the evidence.
      </Hero>
      <Page>
        <Card title="1 · Google shows two different sets of results">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[6px] bg-paper p-4">
              <p className="font-display text-orange-deep">The map (“places”)</p>
              <p className="mt-1 text-sm">The three businesses with pins, shown <b>above</b> everything else. For a local trade like yours this is where most calls come from. You&apos;re not showing here for “trailer manufacturers Geelong”.</p>
            </div>
            <div className="rounded-[6px] bg-paper p-4">
              <p className="font-display">The normal blue links</p>
              <p className="mt-1 text-sm">The website results underneath. This is what the Thryv dashboard measures (“100% of tracked keywords on page 1”). Your site <i>does</i> appear here, but below the map.</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted">These are ranked by two different systems. Doing well in one doesn&apos;t mean you&apos;re doing well in the other, which is why the report can look great while you still don&apos;t appear on the map.</p>
        </Card>

        <Card title="2 · How Google picks the three map results">
          <p className="text-sm">Google says it uses three things (<a className="underline" href="https://support.google.com/business/answer/7091" target="_blank" rel="noreferrer">Google Business Profile help: “How Google determines local ranking”</a>):</p>
          <ul className="mt-3 grid gap-3 text-sm md:grid-cols-3">
            <li className="rounded-[6px] border border-line p-3"><b className="font-display">Relevance</b><br />Does the listing match the search? Mostly driven by the <b>primary category</b> on your Google profile, then services, business description and your website.</li>
            <li className="rounded-[6px] border border-line p-3"><b className="font-display">Distance</b><br />How close you are to the person searching.</li>
            <li className="rounded-[6px] border border-line p-3"><b className="font-display">Prominence</b><br />How well known you are: reviews (number, rating, how recent), links, directory listings, activity.</li>
          </ul>
        </Card>

        <Card title="3 · What Google Maps actually shows, from your front door" state="snapshot" stateLabel="Scanned 28 Sep 2026">
          <p className="text-sm">We searched Google Maps the way a customer would, from 80 Cowie St and 8 other points up to 3 km away:</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="rounded-[6px] border border-line p-3">
              <p className="font-display text-sm">“towbars geelong”</p>
              <ol className="mt-2 space-y-1 text-sm">
                <li className="font-semibold text-good">1. F Sparks &amp; Sons ← you</li>
                <li>2. West Coast Trailers</li>
                <li>3. Geelong 4WD and Camping</li>
              </ol>
            </div>
            <div className="rounded-[6px] border border-line p-3">
              <p className="font-display text-sm">“trailer manufacturers geelong”</p>
              <ol className="mt-2 space-y-1 text-sm">
                <li>1. Geelong Standard Trailers</li>
                <li>2. Trailer &amp; Trailers Geelong</li>
                <li>3. Ultimate Plant Trailers</li>
                <li className="text-muted">4. West Coast Trailers</li>
                <li className="text-muted">5. Pacific Trailers</li>
                <li className="font-semibold text-bad">6. F Sparks &amp; Sons ← you (#5–6 at every point scanned)</li>
              </ol>
            </div>
          </div>
          <p className="mt-3 text-sm">
            So Google isn&apos;t ignoring you. <b>For towbars you&apos;re #1.</b> It has simply filed you as a <b>towbar business</b>. For trailer manufacturing, every business ahead of you
            is a dedicated trailer builder. West Coast Trailers is at <b>67 Douro St</b>, a few streets from you, so distance isn&apos;t the difference, and as you said, they aren&apos;t
            especially active on Google either. The difference is <b>relevance</b>: how Google categorises each business.
          </p>
          <p className="mt-3 rounded-[6px] bg-orange-tint p-3 text-sm">
            <b>The likely fix:</b> set the primary and secondary categories on your Google profile so they cover trailer manufacturing as well as towbars, and back it up with a stronger
            trailer-manufacturing page on the website. An industry survey of local search experts ranks a wrong primary category as the <b>#2 thing that holds a business back</b> in the map
            (<a className="underline" href="https://whitespark.ca/local-search-ranking-factors/" target="_blank" rel="noreferrer">Whitespark 2026</a>). With manager access we can confirm your
            current categories in five minutes. <Pill state="snapshot">To verify</Pill>
          </p>
          <p className="mt-2 text-xs text-muted">Map results shift a little with the searcher&apos;s exact location and time, which is why you saw West Coast Trailers 3rd. Re-run it any time in the Maps Rank Grid.</p>
        </Card>

        <Card title="4 · What Pat got right, and what he left out">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="font-display text-good">Fair points</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
                <li>Reviews genuinely help, especially recent ones. A QR code on the counter is a good idea (we&apos;ve built one; see Reviews).</li>
                <li>Regular photos and posts on your Google profile do count, and their weight has grown in 2026.</li>
              </ul>
            </div>
            <div>
              <p className="font-display text-bad">Left out</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
                <li><b>Categories</b> are the bigger lever, and setting them is part of what an SEO provider should do, not something to hand back to you.</li>
                <li>Your business name appears <b>three different ways</b> across the web, and there are <b>two Yellow Pages listings</b> for you. Cleaning that up is standard local SEO work.</li>
                <li>Your service pages don&apos;t tell Google they belong to a local business at 80 Cowie St (missing structured data), and most page titles are too long to display.</li>
                <li><b>“Fewer keywords = lower rankings” isn&apos;t how it works.</b> A keyword in a report is just a measurement. Taking it out of the report doesn&apos;t change where you rank. What matters is whether the actual work (pages, profile, reviews, links) keeps happening.</li>
              </ul>
            </div>
          </div>
        </Card>

        <Card title="5 · What changes with this portal">
          <div className="overflow-x-auto">
            <table className="data min-w-[640px]">
              <thead>
                <tr><th></th><th>Current setup</th><th>This portal</th></tr>
              </thead>
              <tbody>
                {COMPARE.map(([k, a, b]) => (
                  <tr key={k}>
                    <td className="font-medium">{k}</td>
                    <td className="text-muted">{a}</td>
                    <td>{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">“Current setup” is based on the Thryv dashboard and Marketing Center screenshots you shared in September 2026.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/visibility" className="btn btn-primary">See the Maps Rank Grid</Link>
            <Link href="/site-health" className="btn btn-ghost">Website issues found</Link>
          </div>
        </Card>
      </Page>
    </>
  );
}
