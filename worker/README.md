# Sparks Maps worker

The one job n8n can't do itself: drive a real Chromium browser against Google Maps.
n8n calls it; it runs one job at a time and calls n8n back with progress and results.

- **Lead finder**: runs each search, reads every listing by navigating to its own URL and waiting until the heading matches
  that business, so phone and website details can't land on the wrong business. It drops results outside the chosen state
  and dedupes by (name, phone). It widens ring by ring only when a run comes up short. Then it checks each phone against the
  business's own site, keeps only own-domain or freemail addresses, pulls owner/director names from the cached pages
  (blank when none is found, never guessed), and flags franchises and national chains.
- **Rank grid**: searches Maps from each grid point and records the business's position and the top 3 at that point.
- State is saved to `/data` after every search. A restart marks running jobs `interrupted`, and `POST /leads/jobs/{id}/resume`
  continues from the last completed search.

## Deploy on RepoCloud

1. New app → Docker / custom image from this GitHub repo, **build context `worker/`** (it has its own Dockerfile).
2. Env: `WORKER_SECRET` = the value in the project's `.env.local` (the same one n8n uses).
3. Persistent volume at `/data`. Port `8000`. Health check `GET /health`.
4. Put the public URL in `.env.local` as `WORKER_URL`, then run `node n8n/build.mjs` to register it.

## Run locally

```bash
pip install -r requirements.txt && playwright install chromium
WORKER_SECRET=... uvicorn app:app --port 8765
```

This scrapes Google Maps directly, which is against Google's ToS; the business accepted that risk. Keep it slow (one job at a
time, one search at a time). Call lists must be checked against the Do Not Call Register, and cold email must comply with the
Spam Act 2003.
