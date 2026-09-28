# F. Sparks & Sons — Marketing Portal

A private portal for F. Sparks & Sons (North Geelong trailers, towbars & caravan repairs) that shows where the business
appears on Google, and why, in plain English. It also puts the day-to-day marketing tools in one place.

| Page | What it does | Runs on |
|---|---|---|
| Overview | Headline numbers with honest status labels (LIVE / SNAPSHOT / DEMO / NOT CONNECTED) | n8n |
| Why we're not in Maps | Evidence-based answer to "we're on page 1 but not in the map" | static + real scan |
| Maps Rank Grid | Searches Google Maps from a grid of points and records the business's rank at each | n8n → Maps worker |
| Keywords | Real Google Search Console queries, unlimited tracked phrases | n8n → Search Console API |
| Website Health | Crawls the sitemap, turns issues into plain-English fixes | n8n |
| Reviews | Counter QR code, SMS/email review requests (consent + approval gated), AI reply drafts | n8n → Twilio / Resend / OpenAI |
| Posts & Photos | AI drafts from the owner's own facts; nothing publishes without an approval tick | n8n → OpenAI → Facebook / Google Business Profile |
| Lead Finder | Owner-configurable Google Maps lead scraping, verification and decision-maker extraction; one ranked CSV | n8n → Maps worker |

## Architecture

```
Browser ─▶ Next.js on Vercel ─▶ /api/n8n/<action>  (passcode session; allow-listed; x-sparks-secret)
                                   │
                                   ▼
                         n8n on RepoCloud  (7 workflows, Data Tables storage, all secrets in n8n credentials)
                          │            │                │
                          ▼            ▼                ▼
                  Maps worker     OpenAI / Google   Twilio / Resend / Facebook
              (Playwright, Docker)  APIs
```

- `src/` — the portal (Next.js 16, Tailwind 4). Design rules in [DESIGN.md](DESIGN.md), taken from sparks.com.au.
- `n8n/build.mjs` — creates/updates every n8n credential, Data Table and workflow through the n8n API. See [n8n/README.md](n8n/README.md).
- `worker/` — the Google Maps worker (FastAPI + Playwright). See [worker/README.md](worker/README.md).

## Guardrails

- The browser never sees an API key. Every third-party call happens in n8n, and n8n keeps secrets in its encrypted credential store.
- Writes need an admin session. `PORTAL_VIEW_PASSCODE` gives a read-only login for the client.
- Publishing and review requests need an approval tick. The portal API and the n8n workflow each check it again.
- The AI writer is told to use only the facts it's given, and its output is scanned for banned claims before anyone sees it.
- Demo data is labelled in the UI. Numbers are never made up; a card with no data says so.

## Local development

```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev
```
