# n8n backend

`node n8n/build.mjs` builds everything on the n8n instance named in `.env.local`. It's idempotent: re-run it after any change and it updates workflows in place.

## What it creates

**Credentials** (secrets stay in n8n and never appear in workflow JSON)
- `Sparks · portal secret`: header auth `x-sparks-secret`, on every portal webhook
- `Sparks · worker secret`: header auth `x-worker-secret`, for calls to the Maps worker and its callbacks
- `Sparks · n8n API`: lets workflows read and write Data Tables through n8n's own API (internal port)
- the existing OpenAI credential is reused for drafting

**Data Tables**: `sparks_kv` (settings, workerUrl, publishing, messaging), `sparks_activity`, `sparks_lead_jobs`,
`sparks_lead_results`, `sparks_grid_jobs`, `sparks_gsc`, `sparks_audits`, `sparks_posts`, `sparks_reviews`

**Workflows** (all webhooks are under `/webhook/sparks/...`)

| Workflow | Routes |
|---|---|
| Sparks · Portal Core | `GET/POST settings`, `GET activity` |
| Sparks · Lead Finder | `POST leads/start`, `GET leads/jobs`, `GET leads/rows?jobId=`, `POST leads/resume`, worker callback `POST worker/leads` |
| Sparks · Maps Rank Grid | `POST grid/start`, `GET grid/jobs`, worker callback `POST worker/grid` |
| Sparks · Search Console | `POST gsc/sync`, `GET gsc/queries?days=`, daily 6am schedule |
| Sparks · Website Audit | `POST audit/run`, `GET audit/latest` |
| Sparks · Content Studio | `POST content/draft`, `POST content/publish` (needs `approved: true`), `GET content/list` |
| Sparks · Reviews | `POST reviews/request` (needs `approved` + `consent`), `POST reviews/reply-draft`, `GET reviews/list` |

Errors come back as readable JSON with 4xx codes. 424 means "a connected service isn't set up yet"; it's used instead of 502 because the RepoCloud proxy replaces 502 bodies.

## Connecting the remaining services (in the n8n UI)

1. **Maps worker**: deploy `worker/` (see worker/README.md), put its URL in `.env.local` as `WORKER_URL`, re-run the build.
2. **Search Console**: create an *OAuth2 API* credential (Google auth URL `https://accounts.google.com/o/oauth2/v2/auth`,
   token URL `https://oauth2.googleapis.com/token`, scope `https://www.googleapis.com/auth/webmasters.readonly`,
   auth query `access_type=offline&prompt=consent`) and select it on **Query Search Console**.
3. **Facebook posting**: *Query Auth* credential (`access_token` = long-lived Page token) on **Post to Facebook**. Then set
   `sparks_kv` key `publishing` to `{"facebookPageId":"…","gbpAccountId":"…","gbpLocationId":"…"}`.
4. **Google Business Profile posting**: needs Google's Business Profile API access approval, then an OAuth2 credential
   with scope `https://www.googleapis.com/auth/business.manage` on **Post to Google**.
5. **Review requests**: Twilio basic-auth credential on **Send SMS**, and/or a Resend header credential
   (`Authorization: Bearer re_…`) on **Send email**. Set `sparks_kv` key `messaging` to `{"twilioAccountSid":"…","twilioFrom":"+61…","emailFrom":"Sparks <reviews@…>"}`.

Until a service is connected, its part of the portal says so. Nothing breaks and nothing sends.
