"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Card, Hero, Notice, Page, Pill } from "@/components/ui";
import { n8n, useN8n } from "@/lib/useN8n";
import type { ReviewRequest, Settings } from "@/lib/types";

const DEFAULT_MSG = "Hi {name}, thanks for choosing F. Sparks & Sons. If you have a minute, a quick Google review really helps a local family business: {link}";

export default function Reviews() {
  const settings = useN8n<Settings>("settings.get");
  const history = useN8n<ReviewRequest[]>("reviews.list");
  const [placeIdEdit, setPlaceId] = useState<string | null>(null);
  const placeId = placeIdEdit ?? settings.data?.googlePlaceId ?? "";
  const [qrFor, setQrFor] = useState<{ link: string; url: string } | null>(null);

  const link = placeId.trim() ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId.trim())}` : "";
  const qr = qrFor && qrFor.link === link ? qrFor.url : "";

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { width: 640, margin: 1, color: { dark: "#111111", light: "#ffffff" } }).then((url) => setQrFor({ link, url }));
  }, [link]);

  function printSign() {
    const w = window.open("", "_blank", "width=700,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><title>Review us — F. Sparks & Sons</title>
      <style>body{font-family:Oswald,Arial Narrow,sans-serif;text-align:center;padding:40px;color:#111}h1{font-size:44px;margin:.2em 0;text-transform:uppercase}
      p{font-family:Poppins,Arial,sans-serif;font-size:18px}img.qr{width:340px}.bar{height:10px;background:#ff781a;margin:24px 0}</style>
      <img src="${location.origin}/sparks-logo.png" style="width:380px"><div class="bar"></div>
      <h1>Happy with the job?</h1><p>Scan to leave us a quick Google review. It takes 30 seconds.</p>
      <img class="qr" src="${qr}"><p style="font-size:14px;color:#666">Thank you from the Sparks family, since 1968</p>
      <script>onload=()=>setTimeout(()=>print(),300)</script>`);
    w.document.close();
  }

  // --- send a request
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [messageEdit, setMessage] = useState<string | null>(null);
  const message = messageEdit ?? (settings.data?.reviewMessage || DEFAULT_MSG);
  const [consent, setConsent] = useState(false);
  const [approved, setApproved] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const preview = message.replace("{name}", name || "Sam").replace("{link}", link || "[review link]");

  async function send() {
    setSending(true);
    setSendMsg(null);
    const r = await n8n("reviews.request", { body: { customerName: name, contact, channel, message: preview, reviewLink: link, consent, approved } });
    setSending(false);
    if (!r.ok) return setSendMsg({ tone: "error", text: r.error });
    setSendMsg({ tone: "ok", text: `Review request sent to ${name}.` });
    setName(""); setContact(""); setConsent(false); setApproved(false);
    history.reload();
  }

  // --- reply drafter
  const [reviewText, setReviewText] = useState("");
  const [stars, setStars] = useState(5);
  const [reviewer, setReviewer] = useState("");
  const [reply, setReply] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [replyErr, setReplyErr] = useState("");

  async function draftReply() {
    setDrafting(true);
    setReplyErr("");
    const r = await n8n<{ reply: string }>("reviews.replyDraft", { body: { reviewText, stars, reviewer } });
    setDrafting(false);
    if (!r.ok) return setReplyErr(r.error);
    setReply(r.data?.reply ?? "");
  }

  return (
    <>
      <Hero kicker="Google reviews" title="Reviews">
        Fresh reviews are one of the few ranking signals that keep getting stronger. This makes asking for one take seconds, at the counter or by text after a job.
      </Hero>
      <Page>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Counter QR code">
            <label className="label" htmlFor="pid">Google Place ID</label>
            <input id="pid" className="field" placeholder="ChIJ…" value={placeId} onChange={(e) => setPlaceId(e.target.value)} />
            <p className="mt-1 text-xs text-muted">
              Find it with Google&apos;s <a className="underline" href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noreferrer">Place ID Finder</a>. Saved in Settings.
            </p>
            {qr ? (
              <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="QR code linking to the Google review form" className="h-44 w-44 border border-line" />
                <div className="space-y-2">
                  <p className="break-all text-xs text-muted">{link}</p>
                  <div className="flex flex-wrap gap-2">
                    <a className="btn btn-primary" href={qr} download="sparks-review-qr.png">Download QR</a>
                    <button className="btn btn-ghost" onClick={printSign}>Print counter sign</button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">Enter the Place ID to generate the QR code.</p>
            )}
          </Card>

          <Card title="Ask a customer by text or email">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="cn">Customer first name</label><input id="cn" className="field" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div>
                <label className="label" htmlFor="ch">Send by</label>
                <select id="ch" className="field" value={channel} onChange={(e) => setChannel(e.target.value as "sms" | "email")}><option value="sms">SMS</option><option value="email">Email</option></select>
              </div>
              <div className="sm:col-span-2"><label className="label" htmlFor="ct">{channel === "sms" ? "Mobile (04…)" : "Email"}</label><input id="ct" className="field" value={contact} onChange={(e) => setContact(e.target.value)} /></div>
              <div className="sm:col-span-2"><label className="label" htmlFor="msg">Message ({"{name}"} and {"{link}"} are filled in)</label><textarea id="msg" rows={3} className="field" value={message} onChange={(e) => setMessage(e.target.value)} /></div>
            </div>
            <p className="mt-2 rounded-[6px] bg-paper p-3 text-sm">{preview}</p>
            <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> This person is a real customer who agreed to hear from us (Spam Act 2003).</label>
            <label className="mt-1 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={approved} onChange={(e) => setApproved(e.target.checked)} /> I&apos;ve checked the message. Send it.</label>
            <button className="btn btn-primary mt-3" onClick={send} disabled={sending || !name || !contact || !link || !consent || !approved}>{sending ? "Sending…" : "Send request"}</button>
            {!link && <p className="mt-2 text-xs text-muted">Add the Place ID first so the message has a review link.</p>}
            {sendMsg && <div className="mt-3"><Notice tone={sendMsg.tone}>{sendMsg.text}</Notice></div>}
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Draft a reply to a review">
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <div><label className="label" htmlFor="rv">Reviewer name</label><input id="rv" className="field" value={reviewer} onChange={(e) => setReviewer(e.target.value)} /></div>
              <div>
                <label className="label" htmlFor="st">Stars</label>
                <select id="st" className="field" value={stars} onChange={(e) => setStars(Number(e.target.value))}>{[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{s}★</option>)}</select>
              </div>
              <div className="sm:col-span-2"><label className="label" htmlFor="rt">Their review</label><textarea id="rt" rows={4} className="field" value={reviewText} onChange={(e) => setReviewText(e.target.value)} /></div>
            </div>
            <button className="btn btn-primary mt-3" onClick={draftReply} disabled={drafting || !reviewText.trim()}>{drafting ? "Drafting…" : "Draft reply"}</button>
            {replyErr && <div className="mt-3"><Notice tone="error">{replyErr}</Notice></div>}
            {reply && (
              <div className="mt-3">
                <textarea className="field" rows={5} value={reply} onChange={(e) => setReply(e.target.value)} />
                <button className="btn btn-ghost mt-2" onClick={() => navigator.clipboard.writeText(reply)}>Copy</button>
                <p className="mt-1 text-xs text-muted">Paste it into Google. Replies are never posted automatically.</p>
              </div>
            )}
          </Card>

          <Card title="Requests sent" state={history.connected ? "live" : "off"} stateLabel={history.connected ? "Live" : "Not connected"}>
            {!history.data?.length ? <p className="text-sm text-muted">{history.connected ? "None yet." : "Appears once n8n is connected."}</p> : (
              <table className="data">
                <thead><tr><th>When</th><th>Customer</th><th>By</th><th>Status</th></tr></thead>
                <tbody>
                  {history.data.slice(0, 30).map((r) => (
                    <tr key={r.id}><td className="text-xs">{new Date(r.createdAt).toLocaleString("en-AU")}</td><td>{r.customerName}</td><td>{r.channel.toUpperCase()}</td><td><Pill state={r.status === "sent" ? "live" : "error"}>{r.status}</Pill></td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </Page>
    </>
  );
}
