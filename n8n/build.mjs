#!/usr/bin/env node
// Builds (or rebuilds) the whole Sparks automation backend on an n8n instance:
//   - header-auth credentials (portal secret, worker secret, n8n API key) — secrets live in n8n, never in workflow JSON
//   - Data Tables (settings, activity, lead jobs/results, grid jobs, search console, audits, posts, reviews)
//   - 7 workflows, created or updated by name, then activated
//
// Idempotent: re-run after any change. Reads N8N_API_URL / N8N_API_KEY from ../.env.local and
// writes generated secrets back there (gitignored). Never prints secret values.
//
//   node n8n/build.mjs            build everything
//   node n8n/build.mjs --dry      print the workflow JSON to n8n/dist/ without touching n8n

import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(ROOT, ".env.local");
const DRY = process.argv.includes("--dry");

// ------------------------------------------------------------------ env
const env = Object.fromEntries(
  (existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
function secret(name) {
  if (!env[name]) {
    env[name] = randomBytes(24).toString("hex");
    appendFileSync(ENV_FILE, `\n${name}=${env[name]}`);
    console.log(`generated ${name} (saved to .env.local)`);
  }
  return env[name];
}
const API = (env.N8N_API_URL || "").replace(/\/+$/, "");
const KEY = env.N8N_API_KEY;
// n8n calling its own API over the public URL loops out through Cloudflare and fails intermittently;
// inside the container it listens on 5678. Override with N8N_INTERNAL_API_URL if your host differs.
const INTERNAL_API = (env.N8N_INTERNAL_API_URL || "http://127.0.0.1:5678").replace(/\/+$/, "");
const HOOK_BASE = (env.N8N_WEBHOOK_BASE || `${API}/webhook`).replace(/\/+$/, "");
if (!DRY && (!API || !KEY)) throw new Error("Set N8N_API_URL and N8N_API_KEY in .env.local");
const PORTAL_SECRET = secret("N8N_SHARED_SECRET");
const WORKER_SECRET = secret("WORKER_SECRET");

async function api(method, path, body) {
  if (DRY) return {};
  const res = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: { "X-N8N-API-KEY": KEY, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

// ------------------------------------------------------------------ credentials
async function headerCred(name, header, value, force = false) {
  if (DRY) return { id: "dry", name };
  const list = (await api("GET", "/credentials?limit=250")).data ?? [];
  const found = list.find((c) => c.name === name);
  if (found && !force) return { id: found.id, name };
  if (found) await api("DELETE", `/credentials/${found.id}`);
  const c = await api("POST", "/credentials", { name, type: "httpHeaderAuth", data: { name: header, value } });
  console.log(`credential created: ${name}`);
  return { id: c.id, name };
}
async function findCred(type) {
  if (DRY) return { id: "dry", name: type };
  const list = (await api("GET", "/credentials?limit=250")).data ?? [];
  const c = list.find((x) => x.type === type);
  return c ? { id: c.id, name: c.name } : null;
}

// ------------------------------------------------------------------ data tables
const TABLES = {
  sparks_kv: [["key", "string"], ["value_object", "string"]],
  sparks_activity: [["kind", "string"], ["summary", "string"], ["actor", "string"]],
  sparks_lead_jobs: [["jobId", "string"], ["label", "string"], ["status", "string"], ["summary_object", "string"]],
  sparks_lead_results: [["jobId", "string"], ["rows_object", "string"]],
  sparks_grid_jobs: [["jobId", "string"], ["keyword", "string"], ["status", "string"], ["job_object", "string"]],
  sparks_gsc: [["rangeDays", "string"], ["result_object", "string"]],
  sparks_audits: [["runId", "string"], ["site", "string"], ["pages_object", "string"]],
  sparks_posts: [["postId", "string"], ["status", "string"], ["post_object", "string"]],
  sparks_reviews: [["customerName", "string"], ["channel", "string"], ["status", "string"], ["contactMasked", "string"], ["detail", "string"]],
};
async function ensureTables() {
  const ids = {};
  const existing = DRY ? [] : (await api("GET", "/data-tables?limit=250")).data ?? [];
  for (const [name, cols] of Object.entries(TABLES)) {
    const t = existing.find((x) => x.name === name);
    if (t) ids[name] = t.id;
    else {
      const c = await api("POST", "/data-tables", { name, columns: cols.map(([n, type]) => ({ name: n, type })) });
      ids[name] = c.id ?? `dry_${name}`;
      console.log(`table created: ${name}`);
    }
  }
  return ids;
}

// ------------------------------------------------------------------ workflow DSL
function workflow(name) {
  const nodes = [];
  const connections = {};
  let lane = -1;
  let x = 0;
  const w = {
    name,
    nodes,
    connections,
    lane() { lane += 1; x = 0; return w; },
    add(nodeName, type, typeVersion, parameters, extra = {}) {
      nodes.push({ id: randomUUID(), name: nodeName, type, typeVersion, position: [x, lane * 260], parameters, ...extra });
      x += 240;
      return nodeName;
    },
    link(from, to, output = 0) {
      connections[from] ??= { main: [] };
      while (connections[from].main.length <= output) connections[from].main.push([]);
      connections[from].main[output].push({ node: to, type: "main", index: 0 });
      return to;
    },
    chain(...names) { for (let i = 0; i < names.length - 1; i++) w.link(names[i], names[i + 1]); return names.at(-1); },
    note(content, pos = [-420, lane * 260 - 40], size = [380, 200]) {
      nodes.push({ id: randomUUID(), name: `Note ${nodes.length}`, type: "n8n-nodes-base.stickyNote", typeVersion: 1, position: pos, parameters: { content, width: size[0], height: size[1] } });
    },
  };
  return w;
}

// Node factories -------------------------------------------------------
let C; // credentials, filled in main()
let T; // table ids

const hook = (w, name, method, path, cred = "portal") =>
  w.add(name, "n8n-nodes-base.webhook", 2, { httpMethod: method, path, authentication: "headerAuth", responseMode: "responseNode", options: {} }, {
    webhookId: randomUUID(),
    credentials: { httpHeaderAuth: cred === "portal" ? C.portal : C.worker },
  });

const respond = (w, name, body, code = 200) =>
  w.add(name, "n8n-nodes-base.respondToWebhook", 1.4, { respondWith: "json", responseBody: body, options: code === 200 ? {} : { responseCode: code } });

const code = (w, name, jsCode, extra = {}) => w.add(name, "n8n-nodes-base.code", 2, { jsCode }, extra);

const ifTrue = (w, name, expr) =>
  w.add(name, "n8n-nodes-base.if", 2.2, {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose" },
      conditions: [{ id: randomUUID(), leftValue: expr, rightValue: "", operator: { type: "boolean", operation: "true", singleValue: true } }],
      combinator: "and",
    },
    options: {},
  });

const eqFilter = (col, valueExpr) => `{type:'and',filters:[{columnName:'${col}',condition:'eq',value:${valueExpr}}]}`;

/** HTTP call to n8n's own Data Tables API. body/query are JS expression snippets (no {{ }}). */
function dt(w, name, table, op, { body, filter, sortBy, limit = 50, extra = {} } = {}) {
  const base = `${INTERNAL_API}/api/v1/data-tables/${T[table]}/rows`;
  const common = { authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", options: {} };
  const credentials = { httpHeaderAuth: C.n8nApi };
  if (op === "list") {
    const q = [{ name: "limit", value: String(limit) }, { name: "sortBy", value: sortBy ?? "createdAt:desc" }];
    if (filter) q.push({ name: "filter", value: `={{ JSON.stringify(${filter}) }}` });
    return w.add(name, "n8n-nodes-base.httpRequest", 4.2, { ...common, method: "GET", url: base, sendQuery: true, queryParameters: { parameters: q } }, { credentials, ...extra });
  }
  const url = { insert: base, upsert: `${base}/upsert`, update: `${base}/update`, delete: `${base}/delete` }[op];
  const method = { insert: "POST", upsert: "POST", update: "PATCH", delete: "DELETE" }[op];
  const payload =
    op === "insert" ? `{data:[].concat(${body}),returnType:'count'}` :
    op === "delete" ? null : `{filter:${filter},data:${body},returnData:false}`;
  if (op === "delete")
    return w.add(name, "n8n-nodes-base.httpRequest", 4.2, { ...common, method, url, sendQuery: true, queryParameters: { parameters: [{ name: "filter", value: `={{ JSON.stringify(${filter}) }}` }] } }, { credentials, ...extra });
  return w.add(name, "n8n-nodes-base.httpRequest", 4.2, { ...common, method, url, sendBody: true, specifyBody: "json", jsonBody: `={{ JSON.stringify(${payload}) }}` }, { credentials, ...extra });
}

const activity = (w, name, kind, summaryExpr) => dt(w, name, "sparks_activity", "insert", { body: `{kind:'${kind}',summary:${summaryExpr},actor:'portal'}`, extra: { onError: "continueRegularOutput" } });

/** GET the stored JSON value for a key in sparks_kv (settings, workerUrl, publishing, messaging). */
const kvGet = (w, name, key) => dt(w, name, "sparks_kv", "list", { filter: eqFilter("key", `'${key}'`), limit: 1 });
const kvValue = (node) => `(() => { const r = $('${node}').first().json.data?.[0]; try { return r ? JSON.parse(r.value_object) : {}; } catch (e) { return {}; } })()`;

function openAi(w, name, messagesExpr, extra = {}) {
  return w.add(name, "n8n-nodes-base.httpRequest", 4.2, {
    method: "POST",
    url: "https://api.openai.com/v1/chat/completions",
    authentication: "predefinedCredentialType",
    nodeCredentialType: "openAiApi",
    sendBody: true,
    specifyBody: "json",
    jsonBody: `={{ JSON.stringify({ model: 'gpt-4.1-mini', temperature: 0.4, response_format: { type: 'json_object' }, messages: ${messagesExpr} }) }}`,
    options: { timeout: 60000 },
  }, { credentials: C.openAi ? { openAiApi: C.openAi } : undefined, retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, onError: "continueErrorOutput", ...extra });
}

// ================================================================== 1. Portal Core
function portalCore() {
  const w = workflow("Sparks · Portal Core");
  w.lane();
  w.note("## Sparks · Portal Core\nSettings + activity feed for the F. Sparks & Sons portal.\nAll webhooks require the `x-sparks-secret` header (credential **Sparks · portal secret**). Storage is n8n Data Tables, written through n8n's own API (credential **Sparks · n8n API**).");
  w.chain(hook(w, "GET settings", "GET", "sparks/settings"), kvGet(w, "Read settings", "settings"), respond(w, "Return settings", `={{ ${kvValue("Read settings")} }}`));

  w.lane();
  w.chain(
    hook(w, "POST settings", "POST", "sparks/settings"),
    dt(w, "Save settings", "sparks_kv", "upsert", { filter: eqFilter("key", "'settings'"), body: "{key:'settings',value_object:JSON.stringify($('POST settings').item.json.body)}" }),
    activity(w, "Log settings change", "settings", "'Portal settings updated'"),
    respond(w, "Saved", "={{ { ok: true } }}"),
  );

  w.lane();
  w.chain(hook(w, "GET activity", "GET", "sparks/activity"), dt(w, "Read activity", "sparks_activity", "list", { limit: 40 }), respond(w, "Return activity", "={{ $json.data }}"));
  return w;
}

// ================================================================== 2. Lead Finder
function leadFinder() {
  const w = workflow("Sparks · Lead Finder");
  w.lane();
  w.note("## Sparks · Lead Finder\nPortal → validate → Maps worker (Playwright on RepoCloud) runs the scrape → worker calls back `sparks/worker/leads` with progress and the final result → stored in Data Tables → portal reads it.\nWorker URL lives in sparks_kv key `workerUrl`.", undefined, [380, 220]);
  const start = hook(w, "Start run", "POST", "sparks/leads/start");
  const validate = code(w, "Validate request", `
const b = $json.body || {};
const cfg = b.config || {};
const queries = Array.isArray(b.queries) ? b.queries : [];
const problems = [];
if (b.acknowledgedCompliance !== true) problems.push('Tick the Do Not Call / Spam Act acknowledgement first.');
if (!queries.length) problems.push('Pick at least one business type and suburb.');
if (queries.length > 600) problems.push('That is more than 600 searches. Narrow it down.');
const target = Number(cfg.target);
if (!(target >= 1 && target <= 1000)) problems.push('Lead count must be between 1 and 1000.');
const jobId = 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
return [{ json: { ok: problems.length === 0, error: problems.join(' '), jobId, label: String(cfg.label || 'Lead run').slice(0, 120), config: cfg, queries } }];`);
  const ok = ifTrue(w, "Valid?", "={{ $json.ok }}");
  w.chain(start, validate, ok);
  const bad = respond(w, "Reject", "={{ { error: $json.error } }}", 400);
  w.link(ok, bad, 1);
  const worker = kvGet(w, "Get worker URL", "workerUrl");
  w.link(ok, worker, 0);
  const call = w.add("Send to Maps worker", "n8n-nodes-base.httpRequest", 4.2, {
    method: "POST",
    url: `={{ (${kvValue("Get worker URL")}.url || 'http://worker-not-configured.invalid') + '/leads/jobs' }}`,
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendBody: true,
    specifyBody: "json",
    jsonBody: `={{ JSON.stringify({ jobId: $('Validate request').item.json.jobId, label: $('Validate request').item.json.label, config: $('Validate request').item.json.config, queries: $('Validate request').item.json.queries, callbackUrl: '${HOOK_BASE}/sparks/worker/leads' }) }}`,
    options: { timeout: 20000 },
  }, { credentials: { httpHeaderAuth: C.worker }, onError: "continueErrorOutput" });
  w.link(worker, call);
  const workerDown = respond(w, "Worker unreachable", "={{ { error: 'The Maps worker is not reachable. Check it is running on RepoCloud and its URL is set (sparks_kv → workerUrl).' } }}", 424);
  w.link(call, workerDown, 1);
  const save = dt(w, "Record job", "sparks_lead_jobs", "insert", { body: "{jobId:$json.jobId,label:$json.label,status:'queued',summary_object:JSON.stringify($json)}" });
  w.link(call, save, 0);
  w.chain(save, activity(w, "Log start", "leads", "'Lead run started: ' + $('Validate request').item.json.label"), respond(w, "Started", "={{ { jobId: $('Validate request').item.json.jobId } }}"));

  // worker callback
  w.lane();
  const cb = hook(w, "Worker callback", "POST", "sparks/worker/leads", "worker");
  const ack = respond(w, "Ack worker", "={{ { ok: true } }}");
  const up = dt(w, "Update job", "sparks_lead_jobs", "upsert", {
    filter: eqFilter("jobId", "$('Worker callback').item.json.body.jobId"),
    body: "{jobId:$('Worker callback').item.json.body.jobId,label:$('Worker callback').item.json.body.label,status:$('Worker callback').item.json.body.status,summary_object:JSON.stringify($('Worker callback').item.json.body)}",
  });
  const done = ifTrue(w, "Finished?", "={{ $('Worker callback').item.json.body.final === true && $('Worker callback').item.json.body.status === 'done' }}");
  w.chain(cb, ack, up, done);
  const wurl = kvGet(w, "Get worker URL (cb)", "workerUrl");
  const rows = w.add("Fetch rows from worker", "n8n-nodes-base.httpRequest", 4.2, {
    method: "GET",
    url: `={{ ${kvValue("Get worker URL (cb)")}.url + '/leads/jobs/' + $('Worker callback').item.json.body.jobId + '/rows' }}`,
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    options: { timeout: 30000, response: { response: { responseFormat: "text", outputPropertyName: "rowsText" } } },
  }, { credentials: { httpHeaderAuth: C.worker }, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000 });
  const store = dt(w, "Store results", "sparks_lead_results", "upsert", {
    filter: eqFilter("jobId", "$('Worker callback').item.json.body.jobId"),
    body: "{jobId:$('Worker callback').item.json.body.jobId,rows_object:$json.rowsText}",
  });
  w.link(done, wurl, 0);
  w.chain(wurl, rows, store, activity(w, "Log finished", "leads", "'Lead run finished: ' + $('Worker callback').item.json.body.message"));

  // resume
  w.lane();
  const rs = hook(w, "Resume run", "POST", "sparks/leads/resume");
  const rsUrl = kvGet(w, "Get worker URL (resume)", "workerUrl");
  const rsCall = w.add("Ask worker to resume", "n8n-nodes-base.httpRequest", 4.2, {
    method: "POST",
    url: `={{ ${kvValue("Get worker URL (resume)")}.url + '/leads/jobs/' + encodeURIComponent($('Resume run').item.json.body.jobId || '') + '/resume' }}`,
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    options: { timeout: 20000 },
  }, { credentials: { httpHeaderAuth: C.worker }, onError: "continueErrorOutput" });
  w.chain(rs, rsUrl, rsCall, activity(w, "Log resume", "leads", "'Lead run resumed'"), respond(w, "Resumed", "={{ { ok: true } }}"));
  w.link(rsCall, respond(w, "Resume failed", "={{ { error: 'Could not resume: ' + ($json.error?.message || 'worker unreachable') } }}", 424), 1);

  // reads
  w.lane();
  w.chain(
    hook(w, "List runs", "GET", "sparks/leads/jobs"),
    dt(w, "Read runs", "sparks_lead_jobs", "list", { limit: 30 }),
    respond(w, "Return runs", "={{ ($json.data || []).map(r => { let s = {}; try { s = JSON.parse(r.summary_object); } catch (e) {} return { ...s, jobId: r.jobId, label: r.label, status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt }; }) }}"),
  );
  w.lane();
  w.chain(
    hook(w, "Get rows", "GET", "sparks/leads/rows"),
    dt(w, "Read rows", "sparks_lead_results", "list", { filter: eqFilter("jobId", "String($('Get rows').item.json.query.jobId || '-')"), limit: 1 }),
    respond(w, "Return rows", "={{ (() => { const r = $json.data?.[0]; try { return r ? JSON.parse(r.rows_object) : []; } catch (e) { return []; } })() }}"),
  );
  return w;
}

// ================================================================== 3. Maps Rank Grid
function rankGrid() {
  const w = workflow("Sparks · Maps Rank Grid");
  w.lane();
  w.note("## Sparks · Maps Rank Grid\nSearches Google Maps from a grid of points (via the Maps worker) and records where the business ranks at each point.");
  const start = hook(w, "Start scan", "POST", "sparks/grid/start");
  const v = code(w, "Validate scan", `
const b = $json.body || {};
const size = Number(b.gridSize), km = Number(b.spacingKm), lat = Number(b.centerLat), lng = Number(b.centerLng);
const problems = [];
if (!String(b.keyword || '').trim()) problems.push('Enter a search phrase.');
if (![3, 5, 7, 9].includes(size)) problems.push('Grid must be 3, 5, 7 or 9.');
if (!(km > 0 && km <= 10)) problems.push('Spacing must be 0–10 km.');
if (!(lat < -9 && lat > -45 && lng > 110 && lng < 155)) problems.push('Centre must be in Australia.');
if (!String(b.businessName || '').trim()) problems.push('Business name is required.');
const job = { jobId: 'G' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), keyword: String(b.keyword).trim().slice(0, 120), businessName: String(b.businessName).trim(), gridSize: size, spacingKm: km, centerLat: lat, centerLng: lng, depth: Math.min(40, Number(b.depth) || 20) };
return [{ json: { ok: !problems.length, error: problems.join(' '), job } }];`);
  const ok = ifTrue(w, "Valid?", "={{ $json.ok }}");
  w.chain(start, v, ok);
  w.link(ok, respond(w, "Reject", "={{ { error: $json.error } }}", 400), 1);
  const wu = kvGet(w, "Get worker URL", "workerUrl");
  w.link(ok, wu, 0);
  const call = w.add("Send to Maps worker", "n8n-nodes-base.httpRequest", 4.2, {
    method: "POST",
    url: `={{ (${kvValue("Get worker URL")}.url || 'http://worker-not-configured.invalid') + '/grid/jobs' }}`,
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendBody: true,
    specifyBody: "json",
    jsonBody: `={{ JSON.stringify({ ...$('Validate scan').item.json.job, callbackUrl: '${HOOK_BASE}/sparks/worker/grid' }) }}`,
    options: { timeout: 20000 },
  }, { credentials: { httpHeaderAuth: C.worker }, onError: "continueErrorOutput" });
  w.link(wu, call);
  w.link(call, respond(w, "Worker unreachable", "={{ { error: 'The Maps worker is not reachable. Check it is running on RepoCloud and its URL is set (sparks_kv → workerUrl).' } }}", 424), 1);
  const rec = dt(w, "Record scan", "sparks_grid_jobs", "insert", {
    body: "{jobId:$('Validate scan').item.json.job.jobId,keyword:$('Validate scan').item.json.job.keyword,status:'queued',job_object:JSON.stringify({...$('Validate scan').item.json.job,status:'queued',points:[],createdAt:$now.toISO()})}",
  });
  w.link(call, rec, 0);
  w.chain(rec, activity(w, "Log scan", "maps", "'Maps rank scan started: \"' + $('Validate scan').item.json.job.keyword + '\"'"), respond(w, "Started", "={{ { jobId: $('Validate scan').item.json.job.jobId } }}"));

  w.lane();
  const cb = hook(w, "Worker callback", "POST", "sparks/worker/grid", "worker");
  w.chain(
    cb,
    respond(w, "Ack worker", "={{ { ok: true } }}"),
    dt(w, "Update scan", "sparks_grid_jobs", "upsert", {
      filter: eqFilter("jobId", "$('Worker callback').item.json.body.jobId"),
      body: "{jobId:$('Worker callback').item.json.body.jobId,keyword:$('Worker callback').item.json.body.keyword,status:$('Worker callback').item.json.body.status,job_object:JSON.stringify($('Worker callback').item.json.body)}",
    }),
  );

  w.lane();
  w.chain(
    hook(w, "List scans", "GET", "sparks/grid/jobs"),
    dt(w, "Read scans", "sparks_grid_jobs", "list", { limit: 20 }),
    respond(w, "Return scans", "={{ ($json.data || []).map(r => { let j = {}; try { j = JSON.parse(r.job_object); } catch (e) {} return { points: [], ...j, jobId: r.jobId, keyword: r.keyword, status: r.status, createdAt: j.createdAt || r.createdAt }; }) }}"),
  );
  return w;
}

// ================================================================== 4. Search Console
function searchConsole() {
  const w = workflow("Sparks · Search Console");
  w.lane();
  w.note("## Sparks · Search Console\nPulls real search queries from Google Search Console daily and on demand.\n**Setup:** create an *OAuth2 API* credential for Google with scope `https://www.googleapis.com/auth/webmasters.readonly`, select it on **Query Search Console**, and set the property in portal Settings.", undefined, [400, 230]);
  const sync = hook(w, "Sync now", "POST", "sparks/gsc/sync");
  const sched = w.add("Daily 6am", "n8n-nodes-base.scheduleTrigger", 1.2, { rule: { interval: [{ triggerAtHour: 6 }] } });
  const settings = kvGet(w, "Read settings", "settings");
  w.link(sync, settings);
  w.link(sched, settings);
  const range = code(w, "Work out date range", `
const s = ${kvValue("Read settings")};
let days = 28;
try { days = Number($('Sync now').first().json.body.days) || 28; } catch (e) {}
if (![7, 28, 90].includes(days)) days = 28;
const fmt = (d) => d.toISOString().slice(0, 10);
const end = new Date(Date.now() - 2 * 864e5); // GSC data lags ~2 days
const start = new Date(end.getTime() - (days - 1) * 864e5);
return [{ json: { property: s.gscProperty || 'sc-domain:sparks.com.au', days, startDate: fmt(start), endDate: fmt(end) } }];`);
  const q = w.add("Query Search Console", "n8n-nodes-base.httpRequest", 4.2, {
    method: "POST",
    url: "={{ 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent($json.property) + '/searchAnalytics/query' }}",
    authentication: "genericCredentialType",
    genericAuthType: "oAuth2Api",
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify({ startDate: $json.startDate, endDate: $json.endDate, dimensions: ['query'], rowLimit: 1000 }) }}",
    options: { timeout: 30000 },
  }, { onError: "continueErrorOutput" });
  w.chain(settings, range, q);
  const shape = code(w, "Shape result", `
const r = $('Work out date range').first().json;
const rows = ($json.rows || []).map(x => ({ query: x.keys[0], clicks: x.clicks, impressions: x.impressions, ctr: x.ctr, position: x.position }));
return [{ json: { property: r.property, startDate: r.startDate, endDate: r.endDate, days: r.days, syncedAt: new Date().toISOString(), rows } }];`);
  w.link(q, shape, 0);
  const store = dt(w, "Store result", "sparks_gsc", "upsert", { filter: eqFilter("rangeDays", "String($json.days)"), body: "{rangeDays:String($json.days),result_object:JSON.stringify($json)}" });
  const wasHook = ifTrue(w, "Called from portal?", "={{ $('Sync now').isExecuted }}");
  w.chain(shape, store, activity(w, "Log sync", "search console", "'Search Console synced (' + $('Shape result').first().json.rows.length + ' searches)'"), wasHook);
  w.link(wasHook, respond(w, "Synced", "={{ { ok: true, rows: $('Shape result').first().json.rows.length } }}"), 0);
  const errHook = ifTrue(w, "Error from portal call?", "={{ $('Sync now').isExecuted }}");
  w.link(q, errHook, 1);
  w.link(errHook, respond(w, "Not authorised", "={{ { error: 'Google Search Console is not connected in n8n yet (or the property is wrong): ' + String($json.error?.message || '').slice(0, 160) } }}", 424), 0);

  w.lane();
  w.chain(
    hook(w, "Get queries", "GET", "sparks/gsc/queries"),
    dt(w, "Read result", "sparks_gsc", "list", { filter: eqFilter("rangeDays", "String($('Get queries').item.json.query.days || '28')"), limit: 1 }),
    respond(w, "Return result", "={{ (() => { const r = $json.data?.[0]; try { return r ? JSON.parse(r.result_object) : {}; } catch (e) { return {}; } })() }}"),
  );
  return w;
}

// ================================================================== 5. Website Audit
const AUDIT_JS = `
const pages = [];
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const one = (rx, s) => { const m = s.match(rx); return m ? decode(m[1].trim()) : ''; };
const items = $input.all();
const urls = $('Parse sitemap').all().map(i => i.json.url);
items.forEach((it, i) => {
  const url = urls[i];
  const b = String(it.json.body ?? it.json.data ?? '');
  const status = it.json.statusCode || (b ? 200 : 0);
  if (!b) { pages.push({ url, status, error: it.json.error?.message || 'no response' }); return; }
  const body = b.replace(/<(script|style|noscript)[^>]*>[\\s\\S]*?<\\/\\1>/gi, ' ');
  const text = decode(body.replace(/<[^>]+>/g, ' ')).replace(/\\s+/g, ' ');
  const imgs = b.match(/<img\\b[^>]*>/gi) || [];
  const types = [];
  for (const m of b.matchAll(/<script type="application\\/ld\\+json">([\\s\\S]*?)<\\/script>/g)) for (const t of m[1].matchAll(/"@type"\\s*:\\s*"([^"]+)"/g)) types.push(t[1]);
  pages.push({
    url, status, kb: Math.round(b.length / 1024),
    title: one(/<title>([\\s\\S]*?)<\\/title>/i, b),
    description: one(/<meta name="description" content="([^"]*)"/i, b),
    canonical: one(/<link rel="canonical" href="([^"]*)"/i, b),
    h1: [...b.matchAll(/<h1[^>]*>([\\s\\S]*?)<\\/h1>/gi)].map(m => decode(m[1].replace(/<[^>]+>/g, '')).trim()),
    words: text.split(' ').filter(Boolean).length,
    images: imgs.length,
    images_no_alt: imgs.filter(x => !/alt="[^"]+"/i.test(x)).length,
    schema_types: [...new Set(types)].sort(),
    has_phone: text.includes('5278 1713'),
    has_address: text.includes('Cowie'),
  });
});
return [{ json: { runId: 'A' + Date.now().toString(36), site: $('Run audit').first().json.body?.site || 'https://www.sparks.com.au', createdAt: new Date().toISOString(), pages } }];`;

function websiteAudit() {
  const w = workflow("Sparks · Website Audit");
  w.lane();
  w.note("## Sparks · Website Audit\nCrawls every URL in the sitemap and records titles, descriptions, headings, word count, images and structured data. The portal turns this into plain-English findings.");
  const run = hook(w, "Run audit", "POST", "sparks/audit/run");
  const ack = respond(w, "Started", "={{ { ok: true, started: true } }}");
  const sm = w.add("Fetch sitemap", "n8n-nodes-base.httpRequest", 4.2, {
    method: "GET",
    sendHeaders: true, headerParameters: { parameters: [{ name: "User-Agent", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" }, { name: "Accept", value: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }] },
    url: "={{ ($('Run audit').item.json.body.site || 'https://www.sparks.com.au').replace(/\\/+$/, '') + '/sitemap.xml' }}",
    options: { timeout: 20000, response: { response: { responseFormat: "text" } } },
  }, { onError: "continueRegularOutput" });
  const parse = code(w, "Parse sitemap", `
const xml = String($json.data || '');
const urls = [...xml.matchAll(/<loc>([^<]+)<\\/loc>/g)].map(m => m[1].trim()).filter(u => !u.endsWith('.xml')).slice(0, 80);
const site = ($('Run audit').first().json.body?.site || 'https://www.sparks.com.au').replace(/\\/+$/, '');
return (urls.length ? urls : [site]).map(url => ({ json: { url } }));`);
  const get = w.add("Fetch each page", "n8n-nodes-base.httpRequest", 4.2, {
    method: "GET",
    sendHeaders: true, headerParameters: { parameters: [{ name: "User-Agent", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" }, { name: "Accept", value: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }] },
    url: "={{ $json.url }}",
    options: { timeout: 20000, batching: { batch: { batchSize: 4, batchInterval: 500 } }, response: { response: { fullResponse: true, neverError: true, responseFormat: "text" } } },
  }, { onError: "continueRegularOutput" });
  const analyse = code(w, "Analyse pages", AUDIT_JS);
  const store = dt(w, "Store audit", "sparks_audits", "upsert", { filter: eqFilter("runId", "'latest'"), body: "{runId:'latest',site:$json.site,pages_object:JSON.stringify($json)}" });
  w.chain(run, ack, sm, parse, get, analyse, store, activity(w, "Log audit", "website", "'Website audit finished: ' + $('Analyse pages').first().json.pages.length + ' pages'"));

  w.lane();
  w.chain(
    hook(w, "Get latest", "GET", "sparks/audit/latest"),
    dt(w, "Read audit", "sparks_audits", "list", { filter: eqFilter("runId", "'latest'"), limit: 1 }),
    respond(w, "Return audit", "={{ (() => { const r = $json.data?.[0]; try { return r ? JSON.parse(r.pages_object) : {}; } catch (e) { return {}; } })() }}"),
  );
  return w;
}

// ================================================================== 6. Content Studio
const BANNED = ["guarantee", "guaranteed", "best in", "cheapest", "#1", "number one", "lowest price", "free of charge", "100%", "award-winning", "in today's fast-paced", "look no further", "elevate", "unleash", "game-changer"];

function contentStudio() {
  const w = workflow("Sparks · Content Studio");
  w.lane();
  w.note("## Sparks · Content Studio\nDrafts Google Business Profile / Facebook posts from facts the owner types in. Writer is told to use ONLY those facts; output is scanned for banned claims. Publishing requires `approved: true` (re-checked here, not just in the UI).", undefined, [400, 220]);
  const d = hook(w, "Draft post", "POST", "sparks/content/draft");
  const s = kvGet(w, "Read settings", "settings");
  const prep = code(w, "Build prompt", `
const b = $('Draft post').first().json.body || {};
const facts = String(b.facts || '').trim();
const platforms = (Array.isArray(b.platforms) ? b.platforms : []).filter(p => ['google', 'facebook'].includes(p));
if (facts.length < 15 || !platforms.length) return [{ json: { ok: false, error: 'Add a sentence or two of facts and pick at least one platform.' } }];
const s = ${kvValue("Read settings")};
const system = [
  'You write short social posts for F. Sparks & Sons, a family-owned trailer, towbar and caravan business at 80 Cowie St, North Geelong VIC, operating since 1968. Phone (03) 5278 1713. Website sparks.com.au.',
  'Australian English. Plain, friendly, workshop-honest tone. No hype, no emojis except at most one, no hashtags on Google.',
  'STRICT: use ONLY the facts given below plus the business details above. Never invent prices, specs, warranties, timeframes, awards, statistics, customer names or promises. If a detail is not in the facts, leave it out.',
  'Google Business Profile post: 60-120 words, ends with a call to action to call or visit. Facebook post: 40-100 words, may end with up to 3 relevant hashtags.',
  'Return JSON: {"captions": {' + platforms.map(p => '"' + p + '": "..."').join(', ') + '}}',
].join('\\n');
const user = 'Post type: ' + (b.kind || 'job') + '\\nFacts from the owner:\\n' + facts + (s.extraFacts ? '\\nOther true facts about the business:\\n' + s.extraFacts : '');
return [{ json: { ok: true, platforms, kind: b.kind || 'job', imageUrl: b.imageUrl || '', messages: [{ role: 'system', content: system }, { role: 'user', content: user }] } }];`);
  const ok = ifTrue(w, "Enough to write?", "={{ $json.ok }}");
  w.chain(d, s, prep, ok);
  w.link(ok, respond(w, "Reject", "={{ { error: $json.error } }}", 400), 1);
  const ai = openAi(w, "Write drafts", "$json.messages");
  w.link(ok, ai, 0);
  w.link(ai, respond(w, "Writer failed", "={{ { error: 'The writing service failed: ' + String($json.error?.message || 'unknown').slice(0, 160) } }}", 424), 1);
  const check = code(w, "Check drafts", `
const plan = $('Build prompt').first().json;
let captions = {};
try { captions = JSON.parse($json.choices[0].message.content).captions || {}; } catch (e) {}
const banned = ${JSON.stringify(BANNED)};
const problems = [];
for (const p of plan.platforms) {
  const t = String(captions[p] || '').trim();
  if (!t) problems.push('No ' + p + ' draft came back.');
  const hit = banned.filter(w => t.toLowerCase().includes(w.toLowerCase()));
  if (hit.length) problems.push(p + ' draft used banned claims: ' + hit.join(', ') + '.');
  captions[p] = t.slice(0, 1500);
}
const post = { id: 'P' + Date.now().toString(36), createdAt: new Date().toISOString(), status: 'draft', kind: plan.kind, platforms: plan.platforms, captions, imageUrl: plan.imageUrl || undefined };
return [{ json: { ok: problems.length === 0, error: problems.join(' ') + ' Try again or reword the facts.', post } }];`);
  const clean = ifTrue(w, "Draft clean?", "={{ $json.ok }}");
  w.link(ai, check, 0);
  w.link(check, clean);
  w.link(clean, respond(w, "Draft rejected", "={{ { error: $json.error } }}", 422), 1);
  const save = dt(w, "Save draft", "sparks_posts", "insert", { body: "{postId:$json.post.id,status:'draft',post_object:JSON.stringify($json.post)}" });
  w.link(clean, save, 0);
  w.chain(save, activity(w, "Log draft", "content", "'Post drafted for ' + $('Check drafts').first().json.post.platforms.join(' + ')"), respond(w, "Return draft", "={{ $('Check drafts').first().json.post }}"));

  // publish
  w.lane();
  const pub = hook(w, "Publish post", "POST", "sparks/content/publish");
  const appr = ifTrue(w, "Approved?", "={{ $json.body.approved === true && !!$json.body.id }}");
  w.chain(pub, appr);
  w.link(appr, respond(w, "Not approved", "={{ { error: 'Publishing needs the approval tick.' } }}", 400), 1);
  const cfg = kvGet(w, "Read publishing config", "publishing");
  w.link(appr, cfg, 0);
  const plan = code(w, "Plan publish", `
const b = $('Publish post').first().json.body;
const c = ${kvValue("Read publishing config")};
const platforms = (b.platforms || []).filter(p => ['google', 'facebook'].includes(p));
return [{ json: {
  id: b.id, captions: b.captions || {}, imageUrl: b.imageUrl || '', platforms,
  fb: { want: platforms.includes('facebook'), ready: !!c.facebookPageId, pageId: c.facebookPageId || '', reason: 'not connected: set publishing.facebookPageId and the Facebook credential in n8n' },
  gbp: { want: platforms.includes('google'), ready: !!(c.gbpAccountId && c.gbpLocationId), account: c.gbpAccountId || '', location: c.gbpLocationId || '', reason: 'not connected: Google Business Profile API access + publishing.gbpAccountId/gbpLocationId needed' },
} }];`);
  w.link(cfg, plan);
  const fbQ = ifTrue(w, "Facebook?", "={{ $json.fb.want && $json.fb.ready }}");
  w.link(plan, fbQ);
  const fb = w.add("Post to Facebook", "n8n-nodes-base.httpRequest", 4.2, {
    method: "POST",
    url: "={{ 'https://graph.facebook.com/v21.0/' + $json.fb.pageId + ($json.imageUrl ? '/photos' : '/feed') }}",
    authentication: "genericCredentialType",
    genericAuthType: "httpQueryAuth",
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify($json.imageUrl ? { url: $json.imageUrl, caption: $json.captions.facebook } : { message: $json.captions.facebook }) }}",
    options: { timeout: 30000 },
  }, { onError: "continueRegularOutput" });
  const gbpQ = ifTrue(w, "Google?", "={{ $('Plan publish').first().json.gbp.want && $('Plan publish').first().json.gbp.ready }}");
  w.link(fbQ, fb, 0);
  w.link(fbQ, gbpQ, 1);
  w.link(fb, gbpQ);
  const gbp = w.add("Post to Google", "n8n-nodes-base.httpRequest", 4.2, {
    method: "POST",
    url: "={{ 'https://mybusiness.googleapis.com/v4/accounts/' + $('Plan publish').first().json.gbp.account + '/locations/' + $('Plan publish').first().json.gbp.location + '/localPosts' }}",
    authentication: "genericCredentialType",
    genericAuthType: "oAuth2Api",
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify(Object.assign({ languageCode: 'en-AU', topicType: 'STANDARD', summary: $('Plan publish').first().json.captions.google, callToAction: { actionType: 'CALL' } }, $('Plan publish').first().json.imageUrl ? { media: [{ mediaFormat: 'PHOTO', sourceUrl: $('Plan publish').first().json.imageUrl }] } : {})) }}",
    options: { timeout: 30000 },
  }, { onError: "continueRegularOutput" });
  const collect = code(w, "Collect results", `
const p = $('Plan publish').first().json;
const res = {};
const outcome = (node, okField) => {
  if (!$(node).isExecuted) return 'skipped';
  const j = $(node).first().json;
  return j[okField] || j.id ? 'published' : 'error: ' + String(j.error?.message || JSON.stringify(j.error || j)).slice(0, 160);
};
if (p.fb.want) res.facebook = p.fb.ready ? outcome('Post to Facebook', 'post_id') : p.fb.reason;
if (p.gbp.want) res.google = p.gbp.ready ? outcome('Post to Google', 'name') : p.gbp.reason;
const vals = Object.values(res);
const status = vals.every(v => v === 'published') ? 'published' : vals.some(v => v === 'published') ? 'partially_published' : 'failed';
return [{ json: { id: p.id, status, results: res, post: { id: p.id, createdAt: new Date().toISOString(), status, kind: 'post', platforms: p.platforms, captions: p.captions, imageUrl: p.imageUrl || undefined, results: res } } }];`);
  w.link(gbpQ, gbp, 0);
  w.link(gbpQ, collect, 1);
  w.link(gbp, collect);
  w.chain(
    collect,
    dt(w, "Update post", "sparks_posts", "update", { filter: eqFilter("postId", "$json.id"), body: "{status:$json.status,post_object:JSON.stringify($json.post)}", extra: { onError: "continueRegularOutput" } }),
    activity(w, "Log publish", "content", "'Post ' + $('Collect results').first().json.status + ': ' + JSON.stringify($('Collect results').first().json.results)"),
    respond(w, "Return result", "={{ $('Collect results').first().json.post }}"),
  );

  w.lane();
  w.chain(
    hook(w, "List posts", "GET", "sparks/content/list"),
    dt(w, "Read posts", "sparks_posts", "list", { limit: 40 }),
    respond(w, "Return posts", "={{ ($json.data || []).map(r => { let p = {}; try { p = JSON.parse(r.post_object); } catch (e) {} return { captions: {}, platforms: [], ...p, id: r.postId, status: r.status, createdAt: p.createdAt || r.createdAt }; }) }}"),
  );
  return w;
}

// ================================================================== 7. Reviews
function reviews() {
  const w = workflow("Sparks · Reviews");
  w.lane();
  w.note("## Sparks · Reviews\nReview requests by SMS (Twilio) or email (Resend) — only with consent + approval ticks, re-checked here. Reply drafts via OpenAI (never auto-posted).\nConfig: sparks_kv key `messaging` = {twilioAccountSid, twilioFrom, emailFrom}.", undefined, [400, 220]);
  const req = hook(w, "Send request", "POST", "sparks/reviews/request");
  const chk = code(w, "Check request", `
const b = $json.body || {};
const problems = [];
if (b.approved !== true) problems.push('Tick the approval box.');
if (b.consent !== true) problems.push('Confirm the customer agreed to hear from you.');
if (!String(b.customerName || '').trim()) problems.push('Customer name is missing.');
const channel = b.channel === 'email' ? 'email' : 'sms';
let to = String(b.contact || '').trim();
if (channel === 'sms') { to = to.replace(/[^0-9+]/g, ''); if (/^04\\d{8}$/.test(to)) to = '+61' + to.slice(1); if (!/^\\+614\\d{8}$/.test(to)) problems.push('Use an Australian mobile (04…).'); }
else if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(to)) problems.push('That email address looks wrong.');
if (!/^https:\\/\\/search\\.google\\.com\\/local\\/writereview\\?placeid=/.test(String(b.reviewLink || ''))) problems.push('The review link is missing. Set the Place ID first.');
const masked = channel === 'sms' ? to.slice(0, 5) + '•••' + to.slice(-3) : to.replace(/^(.).*(@.*)$/, '$1•••$2');
return [{ json: { ok: !problems.length, error: problems.join(' '), channel, to, masked, name: String(b.customerName || '').trim().slice(0, 60), message: String(b.message || '').slice(0, 480) } }];`);
  const ok = ifTrue(w, "OK to send?", "={{ $json.ok }}");
  w.chain(req, chk, ok);
  w.link(ok, respond(w, "Reject", "={{ { error: $json.error } }}", 400), 1);
  const mc = kvGet(w, "Read messaging config", "messaging");
  w.link(ok, mc, 0);
  const isSms = ifTrue(w, "SMS?", "={{ $('Check request').first().json.channel === 'sms' }}");
  w.link(mc, isSms);
  const sms = w.add("Send SMS (Twilio)", "n8n-nodes-base.httpRequest", 4.2, {
    method: "POST",
    url: `={{ 'https://api.twilio.com/2010-04-01/Accounts/' + ${kvValue("Read messaging config")}.twilioAccountSid + '/Messages.json' }}`,
    authentication: "genericCredentialType",
    genericAuthType: "httpBasicAuth",
    sendBody: true,
    contentType: "form-urlencoded",
    bodyParameters: { parameters: [
      { name: "To", value: "={{ $('Check request').first().json.to }}" },
      { name: "From", value: `={{ ${kvValue("Read messaging config")}.twilioFrom }}` },
      { name: "Body", value: "={{ $('Check request').first().json.message }}" },
    ] },
    options: { timeout: 20000 },
  }, { onError: "continueErrorOutput" });
  const email = w.add("Send email (Resend)", "n8n-nodes-base.httpRequest", 4.2, {
    method: "POST",
    url: "https://api.resend.com/emails",
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendBody: true,
    specifyBody: "json",
    jsonBody: `={{ JSON.stringify({ from: ${kvValue("Read messaging config")}.emailFrom, to: [$('Check request').first().json.to], subject: 'Thanks from F. Sparks & Sons', text: $('Check request').first().json.message }) }}`,
    options: { timeout: 20000 },
  }, { onError: "continueErrorOutput" });
  w.link(isSms, sms, 0);
  w.link(isSms, email, 1);
  const rec = (name, status) => dt(w, name, "sparks_reviews", "insert", {
    body: `{customerName:$('Check request').first().json.name,channel:$('Check request').first().json.channel,status:'${status}',contactMasked:$('Check request').first().json.masked,detail:${status === "sent" ? "''" : "String($json.error?.message || 'send failed').slice(0,200)"}}`,
  });
  const sent = rec("Record sent", "sent");
  const failed = rec("Record failed", "failed");
  w.link(sms, sent, 0); w.link(email, sent, 0);
  w.link(sms, failed, 1); w.link(email, failed, 1);
  w.chain(sent, activity(w, "Log sent", "reviews", "'Review request sent to ' + $('Check request').first().json.name + ' by ' + $('Check request').first().json.channel"), respond(w, "Sent", "={{ { ok: true } }}"));
  w.chain(failed, respond(w, "Send failed", "={{ { error: 'Could not send: SMS/email is not connected in n8n yet, or the provider rejected it.' } }}", 424));

  w.lane();
  const rd = hook(w, "Draft reply", "POST", "sparks/reviews/reply-draft");
  const rp = code(w, "Build reply prompt", `
const b = $json.body || {};
const text = String(b.reviewText || '').trim().slice(0, 3000);
const stars = Math.min(5, Math.max(1, Number(b.stars) || 5));
const system = 'You reply to Google reviews for F. Sparks & Sons, a family-owned trailer, towbar and caravan business in North Geelong since 1968. Australian English, warm, specific to what the reviewer said, 40-90 words, signed "The Sparks team". Never offer refunds, discounts or admit fault; for 1-3 star reviews thank them, acknowledge the concern and invite them to call (03) 5278 1713 to sort it out. Never invent details. Return JSON {"reply": "..."}.';
return [{ json: { messages: [{ role: 'system', content: system }, { role: 'user', content: 'Reviewer: ' + (b.reviewer || 'a customer') + '\\nStars: ' + stars + '\\nReview: ' + text }] } }];`);
  const ai = openAi(w, "Write reply", "$json.messages");
  w.chain(rd, rp, ai);
  w.link(ai, respond(w, "Reply", "={{ (() => { try { return { reply: JSON.parse($json.choices[0].message.content).reply }; } catch (e) { return { error: 'Could not read the draft.' }; } })() }}"), 0);
  w.link(ai, respond(w, "Writer failed", "={{ { error: 'The writing service failed: ' + String($json.error?.message || 'unknown').slice(0, 160) } }}", 424), 1);

  w.lane();
  w.chain(
    hook(w, "List requests", "GET", "sparks/reviews/list"),
    dt(w, "Read requests", "sparks_reviews", "list", { limit: 40 }),
    respond(w, "Return requests", "={{ ($json.data || []).map(r => ({ id: r.id, createdAt: r.createdAt, customerName: r.customerName, channel: r.channel, status: r.status })) }}"),
  );
  return w;
}

// ================================================================== main
async function upsertWorkflow(w) {
  const body = { name: w.name, nodes: w.nodes, connections: w.connections, settings: { executionOrder: "v1", saveDataErrorExecution: "all", saveDataSuccessExecution: "all", timezone: "Australia/Melbourne" } };
  if (DRY) {
    mkdirSync(join(ROOT, "n8n", "dist"), { recursive: true });
    writeFileSync(join(ROOT, "n8n", "dist", `${w.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`), JSON.stringify(body, null, 2));
    return;
  }
  const list = (await api("GET", `/workflows?limit=250`)).data ?? [];
  const found = list.find((x) => x.name === w.name);
  let id;
  if (found) {
    if (found.active) await api("POST", `/workflows/${found.id}/deactivate`);
    await api("PUT", `/workflows/${found.id}`, body);
    id = found.id;
    console.log(`updated: ${w.name}`);
  } else {
    id = (await api("POST", "/workflows", body)).id;
    console.log(`created: ${w.name}`);
  }
  await api("POST", `/workflows/${id}/activate`);
  console.log(`  active ✓`);
  return id;
}

async function main() {
  C = {
    portal: await headerCred("Sparks · portal secret", "x-sparks-secret", PORTAL_SECRET),
    worker: await headerCred("Sparks · worker secret", "x-worker-secret", WORKER_SECRET),
    n8nApi: await headerCred("Sparks · n8n API", "X-N8N-API-KEY", KEY || "dry"),
    openAi: await findCred("openAiApi"),
  };
  if (!C.openAi) console.warn("! no OpenAI credential found — assign one to the 'Write drafts' / 'Write reply' nodes");
  T = await ensureTables();

  if (!DRY && env.WORKER_URL) {
    await api("POST", `/data-tables/${T.sparks_kv}/rows/upsert`, {
      filter: { type: "and", filters: [{ columnName: "key", condition: "eq", value: "workerUrl" }] },
      data: { key: "workerUrl", value_object: JSON.stringify({ url: env.WORKER_URL.replace(/\/+$/, "") }) },
      returnData: false,
    });
    console.log("workerUrl set");
  }

  for (const build of [portalCore, leadFinder, rankGrid, searchConsole, websiteAudit, contentStudio, reviews]) await upsertWorkflow(build());
  console.log(DRY ? "dry run written to n8n/dist/" : "done");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
