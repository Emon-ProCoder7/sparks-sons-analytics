"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import SplitHeading from "@/components/motion/SplitHeading";
import Magnet from "@/components/reactbits/Magnet";
import ClickSparks from "@/components/motion/ClickSparks";

const EmberField = dynamic(() => import("@/components/motion/EmberField"), { ssr: false });

export default function LoginPage() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Sign-in failed.");
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    window.location.href = next.startsWith("/") ? next : "/";
  }

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <section
        className="relative isolate hidden flex-col justify-end overflow-hidden bg-steel p-10 text-white md:flex"
        style={{ backgroundImage: "linear-gradient(0deg, rgba(35,35,35,.92), rgba(35,35,35,.55)), url(/sparks-hero.jpg)", backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-[radial-gradient(70%_100%_at_60%_100%,rgba(255,120,26,.25),transparent_70%)]" />
        <EmberField count={220} className="-z-10" />
        <p className="font-display text-sm text-orange">Since 1968 · North Geelong</p>
        <SplitHeading className="font-display mt-2 text-4xl leading-tight">Trailer, caravan & towbar marketing — in one place</SplitHeading>
        <p className="mt-3 max-w-md text-sm text-white/75">Google Maps visibility, keywords, reviews, posts and new-customer leads, explained in plain English.</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <motion.form onSubmit={submit} className="w-full max-w-sm" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sparks-logo.png" alt="F. Sparks & Sons" className="mb-8 h-auto w-64" />
          <label className="label" htmlFor="passcode">Portal passcode</label>
          <input id="passcode" type="password" autoComplete="current-password" className="field" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoFocus />
          {error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>}
          <Magnet padding={40} magnetStrength={7} wrapperClassName="mt-4 w-full" innerClassName="w-full" style={{ display: "block" }}>
            <button className="btn btn-primary w-full" disabled={busy || !passcode}>{busy ? "Checking…" : "Sign in"}</button>
          </Magnet>
          <p className="mt-6 text-xs text-muted">Built and managed by Truetel · Ravenhall VIC</p>
        </motion.form>
      </section>
      <ClickSparks />
    </main>
  );
}
