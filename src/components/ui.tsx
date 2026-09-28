import type { ReactNode } from "react";

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
      className="bg-steel px-5 py-8 text-white sm:px-8"
      style={{ backgroundImage: "linear-gradient(90deg, #2d2e32 45%, rgba(45,46,50,.82)), url(/sparks-hero.jpg)", backgroundSize: "cover", backgroundPosition: "right center" }}
    >
      {kicker && <p className="font-display text-xs text-orange">{kicker}</p>}
      <h1 className="font-display mt-1 text-3xl leading-tight sm:text-4xl">{title}</h1>
      {children && <div className="mt-2 max-w-3xl text-sm text-white/75">{children}</div>}
    </section>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-8">{children}</main>;
}

export function Card({ title, state, stateLabel, action, children, className = "" }: {
  title?: string;
  state?: SourceState;
  stateLabel?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card min-w-0 p-5 ${className}`}>
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
    </section>
  );
}

export function Stat({ label, value, meaning, state, stateLabel, accent = false }: {
  label: string;
  value: ReactNode;
  meaning: string;
  state: SourceState;
  stateLabel: string;
  accent?: boolean;
}) {
  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-xs text-muted">{label}</p>
        <Pill state={state}>{stateLabel}</Pill>
      </div>
      <p className={`font-display mt-2 text-[2.1rem] leading-none ${accent ? "text-orange-deep" : ""}`}>{value}</p>
      <p className="mt-2 text-[0.8rem] leading-snug text-muted">{meaning}</p>
    </div>
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
