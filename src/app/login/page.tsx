"use client";

import { useState } from "react";

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
        className="relative hidden flex-col justify-end bg-steel p-10 text-white md:flex"
        style={{ backgroundImage: "linear-gradient(0deg, rgba(35,35,35,.92), rgba(35,35,35,.55)), url(/sparks-hero.jpg)", backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <p className="font-display text-sm text-orange">Since 1968 · North Geelong</p>
        <h1 className="font-display mt-2 text-4xl leading-tight">Trailer, caravan & towbar marketing — in one place</h1>
        <p className="mt-3 max-w-md text-sm text-white/75">Google Maps visibility, keywords, reviews, posts and new-customer leads, explained in plain English.</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sparks-logo.png" alt="F. Sparks & Sons" className="mb-8 h-auto w-64" />
          <label className="label" htmlFor="passcode">Portal passcode</label>
          <input id="passcode" type="password" autoComplete="current-password" className="field" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoFocus />
          {error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>}
          <button className="btn btn-primary mt-4 w-full" disabled={busy || !passcode}>{busy ? "Checking…" : "Sign in"}</button>
          <p className="mt-6 text-xs text-muted">Built and managed by Truetel · Ravenhall VIC</p>
        </form>
      </section>
    </main>
  );
}
