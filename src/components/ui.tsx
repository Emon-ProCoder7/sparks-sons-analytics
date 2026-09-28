"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import SplitHeading from "./motion/SplitHeading";
import ShinyText from "./reactbits/ShinyText";
import SpotlightCard from "./reactbits/SpotlightCard";
import CountUp from "./reactbits/CountUp";

const EmberField = dynamic(() => import("./motion/EmberField"), { ssr: false });

const EASE = [0.22, 1, 0.36, 1] as const;
const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" },
  transition: { duration: 0.65, ease: EASE, delay },
});

export type SourceState = "live" | "snapshot" | "demo" | "off" | "loading" | "error";

const PILL: Record<SourceState, string> = {
  live: "bg-good text-white",
  snapshot: "border border-ink text-ink",
  demo: "border border-orange text-orange-deep",
  off: "bg-line text-muted",
  loading: "bg-line text-muted",
  error: "bg-bad text-white",
};

export function Pill({ state, children }: { state: SourceState; children: ReactNode }) {
  return <span className={`font-display inline-block rounded-[3px] px-1.5 py-0.5 text-[0.68rem] leading-tight tracking-wider ${PILL[state]}`}>{children}</span>;
}

export function Hero({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <section
      className="relative isolate overflow-hidden bg-steel px-5 py-9 text-white sm:px-8"
      style={{ backgroundImage: "linear-gradient(90deg, #2d2e32 45%, rgba(45,46,50,.82)), url(/sparks-hero.jpg)", backgroundSize: "cover", backgroundPosition: "right center" }}
    >
      {/* faint heat glow at the base, where the embers are born */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-[radial-gradient(60%_100%_at_75%_100%,rgba(255,120,26,.22),transparent_70%)]" />
      <EmberField className="-z-10" />
      {kicker && (
        <p className="font-display text-xs">
          <ShinyText text={kicker} color="#ff781a" shineColor="#ffe2c7" speed={3.2} delay={2.5} spread={110} />
        </p>
      )}
      <SplitHeading className="font-display mt-1 text-3xl leading-tight sm:text-4xl">{title}</SplitHeading>
      {children && (
        <motion.div className="mt-2 max-w-3xl text-sm text-white/75" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE, delay: 0.35 }}>
          {children}
        </motion.div>
      )}
    </section>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-8">{children}</main>;
}

export function Card({ title, state, stateLabel, action, children, className = "", delay = 0 }: {
  title?: string;
  state?: SourceState;
  stateLabel?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.section {...reveal(delay)} className={`card min-w-0 p-5 ${className}`}>
      {(title || state || action) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {title && <h2 className="font-display text-lg">{title}</h2>}
            {state && <Pill state={state}>{stateLabel ?? state}</Pill>}
          </div>
          {action}
        </header>
      )}
      {children}
    </motion.section>
  );
}

/** A number that counts up when it scrolls into view, with fixed text around it ("4.4★ · 87"). */
export type Count = { to: number; before?: string; after?: string; separator?: string };

export function Stat({ label, value, count, meaning, state, stateLabel, accent = false, delay = 0 }: {
  label: string;
  value?: ReactNode;
  count?: Count;
  meaning: string;
  state: SourceState;
  stateLabel: string;
  accent?: boolean;
  delay?: number;
}) {
  return (
    <motion.div {...reveal(delay)} className="h-full">
      <SpotlightCard className="card flex h-full flex-col p-4 transition-shadow duration-300 hover:shadow-[0_8px_30px_-12px_rgba(17,17,17,.25)]">
        <div className="relative flex items-start justify-between gap-2">
          <p className="font-display text-xs text-muted">{label}</p>
          <Pill state={state}>{stateLabel}</Pill>
        </div>
        <p className={`font-display relative mt-2 text-[2.1rem] leading-none tabular-nums ${accent ? "text-orange-deep" : ""}`}>
          {count ? (
            <>
              {count.before}
              <CountUp to={count.to} duration={1.4} separator={count.separator} delay={delay} />
              {count.after}
            </>
          ) : (
            value
          )}
        </p>
        <p className="relative mt-2 text-[0.8rem] leading-snug text-muted">{meaning}</p>
      </SpotlightCard>
    </motion.div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const cls = {
    info: "border-line bg-white",
    warn: "border-warn/40 bg-[#fff8eb]",
    error: "border-bad/40 bg-[#fdf0f0]",
    ok: "border-good/40 bg-[#eef8f2]",
  }[tone];
  return <div className={`rounded-[6px] border px-4 py-3 text-sm ${cls}`} role={tone === "error" ? "alert" : undefined}>{children}</div>;
}

export function NotConnected({ what, how }: { what: string; how: string }) {
  return (
    <div className="rounded-[6px] border border-dashed border-[#cfcfcf] bg-paper px-4 py-6 text-center">
      <p className="font-display text-sm">{what} — not connected yet</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted">{how}</p>
    </div>
  );
}
