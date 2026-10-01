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
async function findCredByName(name) {
  if (DRY) return { id: "dry", name };
  const list = (await api("GET", "/credentials?limit=250")).data ?? [];
  const c = list.find((x) => x.name === name);
  return c ? { id: c.id, name: c.name } : null;
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
  sparks_visibility: [["runId", "string"], ["result_object", "string"]],
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

  // SerpApi budget (account endpoint does not use a search)
  w.lane();
  w.chain(
    hook(w, "GET search budget", "GET", "sparks/serpapi/quota"),
    w.add("SerpApi account", "n8n-nodes-base.httpRequest", 4.2, { method: "GET", url: "https://serpapi.com/account.json", authentication: "predefinedCredentialType", nodeCredentialType: "serpApi", options: { timeout: 15000 } }, { credentials: { serpApi: C.serp }, onError: "continueRegularOutput" }),
    respond(w, "Return budget", "={{ { plan: $json.plan_name, perMonth: $json.searches_per_month, left: $json.plan_searches_left ?? $json.total_searches_left, usedThisMonth: $json.this_month_usage, error: $json.error ? String($json.error.message || $json.error) : undefined } }}"),
  );
  return w;
}

// ================================================================== 2. Lead Finder (SerpApi, all in n8n)
const LIB = readFileSync(join(ROOT, "n8n", "code", "lib-leads.js"), "utf8");
const MAX_SEARCHES_PER_RUN = 60; // SerpApi free plan = 250 searches/month
const MAX_VERIFY = 300; // websites crawled per run; keeps the n8n execution light

/** Google Maps search through SerpApi (credential "Sparks SerpApi"). One call per input item. */
function serpMaps(w, name, qExpr, llExpr) {
  const q = [
    { name: "engine", value: "google_maps" },
    { name: "type", value: "search" },
    { name: "q", value: qExpr },
    { name: "hl", value: "en" },
    { name: "gl", value: "au" },
  ];
  if (llExpr) q.push({ name: "ll", value: llExpr });
  return w.add(name, "n8n-nodes-base.httpRequest", 4.2, {
    method: "GET",
    url: "https://serpapi.com/search.json",
    authentication: "predefinedCredentialType",
    nodeCredentialType: "serpApi",
    sendQuery: true,
    queryParameters: { parameters: q },
    options: { timeout: 60000, batching: { batch: { batchSize: 1, batchInterval: 400 } } },
  }, { credentials: { serpApi: C.serp }, retryOnFail: true, maxTries: 2, waitBetweenTries: 2000, onError: "continueRegularOutput" });
}

const fetchPage = (w, name, urlExpr) =>
  w.add(name, "n8n-nodes-base.httpRequest", 4.2, {
    method: "GET",
    url: urlExpr,
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "User-Agent", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" }] },
    options: { timeout: 12000, batching: { batch: { batchSize: 8, batchInterval: 150 } }, response: { response: { neverError: true, responseFormat: "text" } } },
  }, { onError: "continueRegularOutput" });

const leadRow = `(r, q) => ({ name: r.title, phone: r.phone || '', website: r.website || '', address: r.address || '', rating: r.rating ?? '', reviews: r.reviews ?? '', category: r.type || '', leadCategory: q.category, suburb: q.suburb, query: q.query })`;

function leadFinder() {
  const w = workflow("Sparks · Lead Finder");
  w.lane();
  w.note("## Sparks · Lead Finder\nRuns entirely in n8n: Google Maps results come from **SerpApi** (credential *Sparks SerpApi*, free plan 250 searches/month), then n8n fetches each business's own site to verify the phone, collect own-domain email and look for the owner/director. Widening ring by ring only when a run comes up short. Results land in sparks_lead_results; the portal polls sparks_lead_jobs.", [-420, -60], [420, 240]);
  const start = hook(w, "Start run", "POST", "sparks/leads/start");
  const validate = code(w, "Validate request", `
const b = $json.body || {};
const cfg = b.config || {};
const queries = Array.isArray(b.queries) ? b.queries : [];
const problems = [];
if (b.acknowledgedCompliance !== true) problems.push('Tick the Do Not Call / Spam Act acknowledgement first.');
if (!queries.length) problems.push('Pick at least one business type and suburb.');
if (queries.length > ${MAX_SEARCHES_PER_RUN}) problems.push('That is ' + queries.length + ' searches. The free SerpApi plan allows 250 a month, so keep one run to ${MAX_SEARCHES_PER_RUN} or fewer.');
const target = Number(cfg.target);
if (!(target >= 1 && target <= ${MAX_VERIFY})) problems.push('Lead count must be between 1 and ${MAX_VERIFY}.');
cfg.maxPerQuery = Math.min(20, Math.max(5, Number(cfg.maxPerQuery) || 20));
cfg.state = String(cfg.state || 'VIC').toUpperCase();
const jobId = 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
return [{ json: { ok: problems.length === 0, error: problems.join(' '), jobId, label: String(cfg.label || 'Lead run').slice(0, 120), config: cfg, queries } }];`);
  const ok = ifTrue(w, "Valid?", "={{ $json.ok }}");
  w.chain(start, validate, ok);
  w.link(ok, respond(w, "Reject", "={{ { error: $json.error } }}", 400), 1);
  const rec = dt(w, "Record job", "sparks_lead_jobs", "insert", {
    body: "{jobId:$json.jobId,label:$json.label,status:'scraping',summary_object:JSON.stringify({jobId:$json.jobId,label:$json.label,status:'scraping',target:$json.config.target,queriesTotal:$json.queries.length,queriesDone:0,scraped:0,unique:0,phoneVerified:0,withEmail:0,withDecisionMaker:0,withDirectMobile:0,widenedInto:[]})}",
  });
  w.link(ok, rec, 0);
  const started = respond(w, "Started", "={{ { jobId: $('Validate request').item.json.jobId } }}");
  const list = code(w, "Search list", "return $('Validate request').first().json.queries.map(q => ({ json: q }));");
  const search = serpMaps(w, "Search Maps", "={{ $json.query }}");
  const collect = code(w, "Collect results", `${LIB}
const v = $('Validate request').first().json;
const cfg = v.config, qs = v.queries;
const toRow = ${leadRow};
let scraped = 0, dropped = 0, errors = 0, firstError = '';
const seen = new Set(), rows = [];
$input.all().forEach((it, i) => {
  if (it.json.error) { errors++; firstError = firstError || String(it.json.error.message || it.json.error).slice(0, 160); }
  const q = qs[i] || {};
  const lr = (it.json.local_results || []).slice(0, cfg.maxPerQuery);
  scraped += lr.length;
  for (const r of lr) {
    if (!r.title) continue;
    if (!inState(r.address, cfg.state)) { dropped++; continue; }
    const key = r.title.toLowerCase() + '|' + digits(r.phone);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(toRow(r, q));
  }
});
let widen = [], widenedInto = [], reason = '';
if (cfg.widen && rows.length < cfg.target && errors < qs.length) {
  let short = cfg.target - rows.length;
  for (const ring of cfg.rings || []) {
    if (short <= 0) break;
    const ringQs = [];
    for (const c of cfg.categories || []) for (const s of ring) for (const vv of c.variants || []) if (String(vv).trim()) ringQs.push({ query: vv + ' in ' + s + ' ' + cfg.state, category: c.label, suburb: s });
    widen.push(...ringQs);
    widenedInto.push(...ring);
    short -= ringQs.length * 12; // rough: ~12 new unique businesses per extra search
  }
  reason = 'only ' + rows.length + ' unique leads from the chosen suburbs; target is ' + cfg.target;
  widen = widen.slice(0, Math.max(0, ${MAX_SEARCHES_PER_RUN} - qs.length)); // stay inside the per-run search budget
}
return [{ json: { rows, scraped, dropped, errors, firstError, widen, widenedInto, reason } }];`);
  const needMore = ifTrue(w, "Widen?", "={{ $json.widen.length > 0 }}");
  w.chain(rec, started, list, search, collect, needMore);
  const ringList = code(w, "Wider search list", "return $('Collect results').first().json.widen.map(q => ({ json: q }));");
  const ringSearch = serpMaps(w, "Search Maps (wider)", "={{ $json.query }}");
  const build = code(w, "Build candidates", `${LIB}
const c = $('Collect results').first().json;
const cfg = $('Validate request').first().json.config;
const toRow = ${leadRow};
const rows = [...c.rows];
let scraped = c.scraped, dropped = c.dropped, errors = c.errors, extraSearches = 0;
if ($('Search Maps (wider)').isExecuted) {
  const seen = new Set(rows.map(r => r.name.toLowerCase() + '|' + digits(r.phone)));
  $('Search Maps (wider)').all().forEach((it, i) => {
    extraSearches++;
    if (it.json.error) errors++;
    const q = c.widen[i] || {};
    const lr = (it.json.local_results || []).slice(0, cfg.maxPerQuery);
    scraped += lr.length;
    for (const r of lr) {
      if (!r.title) continue;
      if (!inState(r.address, cfg.state)) { dropped++; continue; }
      const key = r.title.toLowerCase() + '|' + digits(r.phone);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(toRow(r, q));
    }
  });
}
const meta = { scraped, dropped, errors, unique: rows.length, extraSearches };
// verify the strongest candidates first (review count), capped to keep the run light
rows.sort((a, b) => (Number(b.reviews) || 0) - (Number(a.reviews) || 0));
const pick = rows.slice(0, Math.min(${MAX_VERIFY}, Math.max(cfg.target, Math.ceil(cfg.target * 1.5))));
if (!pick.length) return [{ json: { empty: true, meta } }];
return pick.map(r => {
  const m = String(r.website).match(/^[a-z]+:\\/\\/[^/?#]+/i);
  return { json: { ...r, contactUrl: m ? m[0] + '/contact' : '', meta } };
});`);
  w.link(needMore, ringList, 0);
  w.chain(ringList, ringSearch, build);
  w.link(needMore, build, 1);
  const verifying = dt(w, "Mark verifying", "sparks_lead_jobs", "update", {
    filter: eqFilter("jobId", "$('Validate request').first().json.jobId"),
    body: "{status:'verifying',summary_object:JSON.stringify({jobId:$('Validate request').first().json.jobId,label:$('Validate request').first().json.label,status:'verifying',target:$('Validate request').first().json.config.target,queriesTotal:$('Validate request').first().json.queries.length+$json.meta.extraSearches,queriesDone:$('Validate request').first().json.queries.length+$json.meta.extraSearches,scraped:$json.meta.scraped,unique:$json.meta.unique,phoneVerified:0,withEmail:0,withDecisionMaker:0,withDirectMobile:0,widenedInto:$('Collect results').first().json.widenedInto,widenReason:$('Collect results').first().json.reason})}",
    extra: { executeOnce: true, onError: "continueRegularOutput" },
  });
  w.link(build, verifying);
  const home = fetchPage(w, "Fetch homepage", "={{ $json.website || 'http://no-website.invalid' }}");
  const contact = fetchPage(w, "Fetch contact page", "={{ $('Build candidates').item.json.contactUrl || 'http://no-website.invalid' }}");
  const verify = code(w, "Verify and rank", `${LIB}
const v = $('Validate request').first().json;
const cfg = v.config;
const c = $('Collect results').first().json;
const cands = $('Build candidates').all().map(i => i.json);
const meta = cands[0].meta;
const leads = cands.filter(l => !l.empty);
const homes = $('Fetch homepage').all();
const abouts = $('Fetch about page').all();
const teams = $('Fetch team page').all();
const contacts = $input.all();
const out = leads.map((l, i) => {
  const home = String((homes[i] && homes[i].json.data) || '');
  const contact = String((contacts[i] && contacts[i].json.data) || '');
  const about = String((abouts[i] && abouts[i].json.data) || '') + ' ' + String((teams[i] && teams[i].json.data) || '');
  const raw = home + ' ' + contact + ' ' + about;
  const text = toText(home) + ' | ' + toText(contact) + ' | ' + toText(about);
  let pv = '';
  if (!l.website) pv = l.phone ? 'no website found — phone from Google Maps only' : '';
  else if (!home) pv = 'No (website unreachable)';
  else { const ph = digits(l.phone).slice(-8); pv = ph && (digits(text) + digits(raw)).includes(ph) ? 'Yes' : 'No'; }
  const emails = l.website ? goodEmails(raw, l.website) : [];
  const dm = l.website && home ? extractDecisionMaker(text, l.name) : { name: '', role: '', mobile: '' };
  return { ...l, pv, email: emails[0] || '', dm };
});
const byName = {};
out.forEach(r => { if (r.dm.name) { const k = r.dm.name.toLowerCase(); (byName[k] = byName[k] || new Set()).add(r.name); } });
out.sort((a, b) => ((a.pv !== 'Yes') - (b.pv !== 'Yes')) || ((!a.email) - (!b.email)) || ((Number(b.reviews) || 0) - (Number(a.reviews) || 0)));
const rows = out.slice(0, cfg.target).map(r => {
  const [size, basis] = sizeEstimate(r.name, r.reviews, cfg.franchiseBrands, cfg.nationalBrands);
  const shared = r.dm.name && byName[r.dm.name.toLowerCase()].size > 1;
  return {
    business_name: r.name, category: r.category || r.leadCategory, suburb_area: r.suburb, address: r.address,
    business_phone: r.phone, phone_verified_on_own_site: r.pv, business_email: r.email, website: r.website,
    google_rating: String(r.rating), google_reviews: String(r.reviews),
    decision_maker_name: r.dm.name, decision_maker_role: r.dm.role, decision_maker_direct_mobile: r.dm.mobile,
    decision_maker_shared_with_other_listing: shared ? 'shared with another listing — confirm which office before calling' : '',
    decision_maker_source: r.dm.name ? "auto-extracted from the business's own website — spot-check before relying on it" : '',
    business_size_estimate: size, size_basis: basis, maps_search_query: r.query,
  };
});
const searches = v.queries.length + meta.extraSearches;
let message = rows.length + ' leads delivered from ' + meta.unique + ' unique listings (' + searches + ' SerpApi searches used)';
if (meta.dropped) message += '; ' + meta.dropped + ' results outside ' + cfg.state + ' dropped';
if (meta.errors) message += '; ' + meta.errors + ' searches failed' + (c.firstError ? ' (' + c.firstError + ')' : '');
if (meta.unique < cfg.target) message += '. Only ' + meta.unique + ' found, short of the ' + cfg.target + ' target' + (c.widenedInto.length ? ' even after widening.' : '; turn on widening or add suburbs/phrasings.');
const summary = {
  jobId: v.jobId, label: v.label, status: rows.length || !meta.errors ? 'done' : 'failed', target: cfg.target,
  queriesTotal: searches, queriesDone: searches, scraped: meta.scraped, unique: meta.unique,
  phoneVerified: rows.filter(r => r.phone_verified_on_own_site === 'Yes').length,
  withEmail: rows.filter(r => r.business_email).length,
  withDecisionMaker: rows.filter(r => r.decision_maker_name).length,
  withDirectMobile: rows.filter(r => r.decision_maker_direct_mobile).length,
  widenedInto: c.widenedInto, widenReason: c.reason, message,
};
return [{ json: { rows, summary } }];`);
  // From each homepage, pick up to 2 same-site About/Team/Story links (one item in, one item out, so pairing holds).
  const findAbout = w.add("Find about/team links", "n8n-nodes-base.code", 2, {
    mode: "runOnceForEachItem",
    jsCode: readFileSync(join(ROOT, "n8n", "code", "find-about-links.js"), "utf8"),
  });
  const about1 = fetchPage(w, "Fetch about page", "={{ $json.about1 || 'http://no-website.invalid' }}");
  const about2 = fetchPage(w, "Fetch team page", "={{ $('Find about/team links').item.json.about2 || 'http://no-website.invalid' }}");
  w.link(build, home);
  w.chain(
    home, findAbout, about1, about2, contact, verify,
    dt(w, "Store results", "sparks_lead_results", "upsert", { filter: eqFilter("jobId", "$json.summary.jobId"), body: "{jobId:$json.summary.jobId,rows_object:JSON.stringify($json.rows)}" }),
    dt(w, "Mark done", "sparks_lead_jobs", "upsert", {
      filter: eqFilter("jobId", "$('Verify and rank').first().json.summary.jobId"),
      body: "{jobId:$('Verify and rank').first().json.summary.jobId,label:$('Verify and rank').first().json.summary.label,status:$('Verify and rank').first().json.summary.status,summary_object:JSON.stringify($('Verify and rank').first().json.summary)}",
    }),
    activity(w, "Log finished", "leads", "'Lead run finished: ' + $('Verify and rank').first().json.summary.message"),
  );

  // reads
  w.lane(); w.lane();
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

// ================================================================== 3. Maps Rank Grid (SerpApi, all in n8n)
function rankGrid() {
  const w = workflow("Sparks · Maps Rank Grid");
  w.lane();
  w.note("## Sparks · Maps Rank Grid\nSearches Google Maps (via **SerpApi**, one search per grid point) as if the customer were standing at each point, and records the business's rank and the top 3 there. 3×3 = 9 searches, 5×5 = 25.", [-420, -60], [420, 200]);
  const start = hook(w, "Start scan", "POST", "sparks/grid/start");
  const v = code(w, "Validate scan", `
const b = $json.body || {};
const size = Number(b.gridSize), km = Number(b.spacingKm), lat = Number(b.centerLat), lng = Number(b.centerLng);
const problems = [];
if (!String(b.keyword || '').trim()) problems.push('Enter a search phrase.');
if (![3, 5, 7].includes(size)) problems.push('Grid must be 3, 5 or 7.');
if (!(km > 0 && km <= 10)) problems.push('Spacing must be 0–10 km.');
if (!(lat < -9 && lat > -45 && lng > 110 && lng < 155)) problems.push('Centre must be in Australia.');
if (!String(b.businessName || '').trim()) problems.push('Business name is required.');
const job = { jobId: 'G' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), keyword: String(b.keyword).trim().slice(0, 120), businessName: String(b.businessName).trim(), gridSize: size, spacingKm: km, centerLat: lat, centerLng: lng, depth: 20 };
return [{ json: { ok: !problems.length, error: problems.join(' '), job } }];`);
  const ok = ifTrue(w, "Valid?", "={{ $json.ok }}");
  w.chain(start, v, ok);
  w.link(ok, respond(w, "Reject", "={{ { error: $json.error } }}", 400), 1);
  const rec = dt(w, "Record scan", "sparks_grid_jobs", "insert", {
    body: "{jobId:$json.job.jobId,keyword:$json.job.keyword,status:'running',job_object:JSON.stringify({...$json.job,status:'running',points:[],createdAt:$now.toISO()})}",
  });
  w.link(ok, rec, 0);
  const pts = code(w, "Grid points", `
const j = $('Validate scan').first().json.job;
const half = (j.gridSize - 1) / 2, dlat = j.spacingKm / 111.32, dlng = j.spacingKm / (111.32 * Math.cos(j.centerLat * Math.PI / 180));
const out = [];
for (let r = 0; r < j.gridSize; r++) for (let c = 0; c < j.gridSize; c++)
  out.push({ json: { lat: +(j.centerLat + (half - r) * dlat).toFixed(6), lng: +(j.centerLng + (c - half) * dlng).toFixed(6) } });
return out;`);
  const search = serpMaps(w, "Search Maps at point", "={{ $('Validate scan').first().json.job.keyword }}", "={{ '@' + $json.lat + ',' + $json.lng + ',14z' }}");
  const rank = code(w, "Rank each point", `${LIB}
const j = $('Validate scan').first().json.job;
const pts = $('Grid points').all().map(p => p.json);
let failed = 0, firstError = '';
const points = $input.all().map((it, i) => {
  const p = pts[i];
  if (it.json.error) { failed++; firstError = firstError || String(it.json.error.message || it.json.error).slice(0, 160); return { lat: p.lat, lng: p.lng, rank: null, top: [], error: 'search failed' }; }
  const names = (it.json.local_results || []).map(r => r.title).filter(Boolean).slice(0, j.depth);
  if (!names.length && it.json.place_results && it.json.place_results.title) names.push(it.json.place_results.title);
  const idx = names.findIndex(n => namesMatch(n, j.businessName));
  return { lat: p.lat, lng: p.lng, rank: idx >= 0 ? idx + 1 : null, top: names.slice(0, 3) };
});
const status = failed === points.length ? 'failed' : 'done';
return [{ json: { ...j, status, points, createdAt: $('Record scan').first().json.createdAt || new Date().toISOString(), message: failed ? failed + ' of ' + points.length + ' searches failed' + (firstError ? ' (' + firstError + ')' : '') : '' } }];`);
  w.chain(
    rec, respond(w, "Started", "={{ { jobId: $('Validate scan').item.json.job.jobId } }}"), pts, search, rank,
    dt(w, "Save scan", "sparks_grid_jobs", "upsert", { filter: eqFilter("jobId", "$json.jobId"), body: "{jobId:$json.jobId,keyword:$json.keyword,status:$json.status,job_object:JSON.stringify($json)}" }),
    activity(w, "Log scan", "maps", "'Maps rank scan ' + $('Rank each point').first().json.status + ': \"' + $('Rank each point').first().json.keyword + '\"'"),
  );

  w.lane(); w.lane();
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
  w.note("## Sparks · Search Console\nPulls real search queries from Google Search Console daily and on demand.\n**Setup:** create a *Google Search Console OAuth2 API* credential in n8n (the build picks it up automatically) and set the property in portal Settings.", undefined, [400, 230]);
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
    authentication: "predefinedCredentialType",
    nodeCredentialType: "googleSearchConsoleOAuth2Api",
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify({ startDate: $json.startDate, endDate: $json.endDate, dimensions: ['query'], rowLimit: 1000 }) }}",
    options: { timeout: 30000 },
  }, { credentials: C.gsc ? { googleSearchConsoleOAuth2Api: C.gsc } : undefined, onError: "continueErrorOutput" });
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

// ================================================================== 8. Google Visibility (keywords + map/link positions)
const SEEDS_JS = readFileSync(join(ROOT, "n8n", "code", "kw-seeds.js"), "utf8");
const BUSINESS_LL = "@-38.10492,144.34584,14z"; // 80 Cowie St, North Geelong (used to find Sparks' own listing)
const GEELONG_LL = "@-38.1499,144.3617,13z"; // central Geelong: where the scoreboard searches from (searching from Sparks' door would flatter them)

const parsedKv = (node) => `(() => { const r = $('${node}').first().json.data?.[0]; try { return r ? JSON.parse(r.value_object) : {}; } catch (e) { return {}; } })()`;

function googleVisibility() {
  const w = workflow("Sparks · Google Visibility");

  // --- keyword discovery: free (Google Autocomplete), monthly + on demand
  w.lane();
  w.note("## Sparks · Google Visibility\n**Keywords** are chosen from real demand: Google Autocomplete for every Sparks service + 'geelong' (free, no key), plus Sparks' own Search Console once connected. Best keyword per service family, pins respected, refreshed monthly.\n**Visibility check**: for each tracked keyword, the Google Maps position searched from central Geelong (SerpApi), the map top 3 and their Google categories, and Sparks' own listing. Website-link position comes from Sparks' Search Console when connected (SerpApi's simulated web results proved unreliable). 1 search per keyword + 1. Weekly + on demand.", [-460, -80], [440, 280]);
  const disc = hook(w, "Find keywords", "POST", "sparks/keywords/discover");
  const monthly = w.add("Monthly (1st, 6am)", "n8n-nodes-base.scheduleTrigger", 1.2, { rule: { interval: [{ field: "months", triggerAtDayOfMonth: 1, triggerAtHour: 6 }] } });
  const rk = kvGet(w, "Read keywords", "keywords");
  w.link(disc, rk);
  w.link(monthly, rk);
  const seedList = code(w, "Seed list", `${SEEDS_JS}\nreturn SEEDS.map(([q, family]) => ({ json: { q: q + ' geelong', family } }));`);
  const ac = w.add("Google Autocomplete", "n8n-nodes-base.httpRequest", 4.2, {
    method: "GET",
    url: "https://suggestqueries.google.com/complete/search",
    sendQuery: true,
    queryParameters: { parameters: [{ name: "client", value: "firefox" }, { name: "gl", value: "au" }, { name: "hl", value: "en-AU" }, { name: "q", value: "={{ $json.q }}" }] },
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "User-Agent", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0 Safari/537.36" }] },
    options: { timeout: 15000, batching: { batch: { batchSize: 1, batchInterval: 300 } }, response: { response: { responseFormat: "text", neverError: true } } },
  }, { onError: "continueRegularOutput" });
  const score = code(w, "Score keywords", `${SEEDS_JS}\n${readFileSync(join(ROOT, "n8n", "code", "kw-score.js"), "utf8")}`);
  const fromPortal = ifTrue(w, "Asked from portal?", "={{ $('Find keywords').isExecuted }}");
  w.chain(
    rk, kvGet(w, "Read settings", "settings"),
    dt(w, "Read search console", "sparks_gsc", "list", { filter: eqFilter("rangeDays", "'90'"), limit: 1 }),
    seedList, ac, score,
    dt(w, "Save keywords", "sparks_kv", "upsert", { filter: eqFilter("key", "'keywords'"), body: "{key:'keywords',value_object:JSON.stringify($json)}" }),
    activity(w, "Log keywords", "keywords", "'Keywords refreshed: tracking ' + $('Score keywords').first().json.tracked.map(t => t.keyword).join(', ')"),
    fromPortal,
  );
  w.link(fromPortal, respond(w, "Return keywords", "={{ $('Score keywords').first().json }}"), 0);

  // --- read keywords
  w.lane(); w.lane();
  w.chain(hook(w, "Get keywords", "GET", "sparks/keywords"), kvGet(w, "Read keywords (get)", "keywords"), respond(w, "Return saved keywords", `={{ ${parsedKv("Read keywords (get)")} }}`));

  // --- pin / unpin / ignore a keyword
  w.lane();
  const upd = hook(w, "Change keyword", "POST", "sparks/keywords/update");
  const apply = code(w, "Apply change", `
const b = $('Change keyword').first().json.body || {};
const kw = String(b.keyword || '').toLowerCase().trim();
const action = String(b.action || '');
const k = ${parsedKv("Read keywords (update)")};
if (!kw || !['pin', 'unpin', 'ignore', 'unignore'].includes(action)) return [{ json: { ok: false, error: 'Send a keyword and an action (pin, unpin, ignore, unignore).' } }];
k.pinned = (k.pinned || []).filter(x => x !== kw);
k.ignored = (k.ignored || []).filter(x => x !== kw);
k.tracked = k.tracked || []; k.candidates = k.candidates || [];
const find = (arr) => arr.find(x => x.keyword === kw);
if (action === 'pin') {
  k.pinned.push(kw);
  const c = find(k.tracked) || find(k.candidates) || { keyword: kw, family: 'other', score: 0, reasons: [], seeds: [] };
  c.pinned = true; c.reasons = [...new Set([...(c.reasons || []), 'Pinned by you'])];
  k.candidates = k.candidates.filter(x => x.keyword !== kw);
  if (!find(k.tracked)) k.tracked.push(c);
}
if (action === 'unpin') { const c = find(k.tracked); if (c) { c.pinned = false; c.reasons = (c.reasons || []).filter(r => r !== 'Pinned by you'); } }
if (action === 'ignore') { k.ignored.push(kw); k.tracked = k.tracked.filter(x => x.keyword !== kw); k.candidates = k.candidates.filter(x => x.keyword !== kw); }
k.updatedAt = new Date().toISOString();
return [{ json: { ok: true, keywords: k } }];`);
  const okUpd = ifTrue(w, "Change OK?", "={{ $json.ok }}");
  w.chain(upd, kvGet(w, "Read keywords (update)", "keywords"), apply, okUpd);
  w.link(okUpd, respond(w, "Reject change", "={{ { error: $json.error } }}", 400), 1);
  const saveUpd = dt(w, "Save change", "sparks_kv", "upsert", { filter: eqFilter("key", "'keywords'"), body: "{key:'keywords',value_object:JSON.stringify($('Apply change').first().json.keywords)}" });
  w.link(okUpd, saveUpd, 0);
  w.chain(saveUpd, respond(w, "Return changed", "={{ $('Apply change').first().json.keywords }}"));

  // --- visibility check: weekly + on demand (SerpApi)
  w.lane(); w.lane();
  const run = hook(w, "Check now", "POST", "sparks/visibility/run");
  const weekly = w.add("Weekly (Mon 7am)", "n8n-nodes-base.scheduleTrigger", 1.2, { rule: { interval: [{ field: "weeks", triggerAtDay: [1], triggerAtHour: 7 }] } });
  const rk2 = kvGet(w, "Read keywords (check)", "keywords");
  w.link(run, rk2);
  w.link(weekly, rk2);
  const budget = w.add("Search budget", "n8n-nodes-base.httpRequest", 4.2, { method: "GET", url: "https://serpapi.com/account.json", authentication: "predefinedCredentialType", nodeCredentialType: "serpApi", options: { timeout: 15000 } }, { credentials: { serpApi: C.serp }, onError: "continueRegularOutput" });
  const plan = code(w, "Plan check", `
const k = ${parsedKv("Read keywords (check)")};
const tracked = (k.tracked || []).slice(0, 8);
const left = Number($('Search budget').first().json.plan_searches_left ?? $('Search budget').first().json.total_searches_left ?? 0);
const needed = tracked.length + 1; // one Google Maps search per keyword + Sparks' own listing
let error = '';
if (!tracked.length) error = 'No keywords yet. Click "Find keywords" first (it is free).';
else if (left < needed) error = 'This check needs ' + needed + ' Google searches but only ' + left + ' are left on the free plan this month.';
return [{ json: { ok: !error, error, needed, left, tracked } }];`);
  const okPlan = ifTrue(w, "Enough searches?", "={{ $json.ok }}");
  w.chain(rk2, kvGet(w, "Read settings (check)", "settings"), dt(w, "Read search console (check)", "sparks_gsc", "list", { filter: eqFilter("rangeDays", "'28'"), limit: 1 }), budget, plan, okPlan);
  const errPortal = ifTrue(w, "Portal asked? (error)", "={{ $('Check now').isExecuted }}");
  w.link(okPlan, errPortal, 1);
  w.link(errPortal, respond(w, "Cannot check", "={{ { error: $json.error } }}", 424), 0);
  const okPortal = ifTrue(w, "Portal asked?", "={{ $('Check now').isExecuted }}");
  w.link(okPlan, okPortal, 0);
  const startedResp = respond(w, "Check started", "={{ { ok: true, searches: $json.needed } }}");
  w.link(okPortal, startedResp, 0);
  const own = w.add("Find own listing", "n8n-nodes-base.httpRequest", 4.2, {
    method: "GET",
    url: "https://serpapi.com/search.json",
    authentication: "predefinedCredentialType",
    nodeCredentialType: "serpApi",
    sendQuery: true,
    queryParameters: { parameters: [
      { name: "engine", value: "google_maps" }, { name: "type", value: "search" },
      { name: "q", value: `={{ (${parsedKv("Read settings (check)")}.businessNameOnGoogle || 'F Sparks & Sons') + ' North Geelong' }}` },
      { name: "ll", value: BUSINESS_LL }, { name: "hl", value: "en" }, { name: "gl", value: "au" },
    ] },
    options: { timeout: 60000 },
  }, { credentials: { serpApi: C.serp }, executeOnce: true, retryOnFail: true, maxTries: 2, onError: "continueRegularOutput" });
  w.link(startedResp, own);
  w.link(okPortal, own, 1);
  const items = code(w, "Keyword items", "return $('Plan check').first().json.tracked.map(t => ({ json: { keyword: t.keyword, family: t.family, reasons: t.reasons || [] } }));");
  const m = serpMaps(w, "Search Google Maps", "={{ $json.keyword }}", GEELONG_LL);
  const compute = code(w, "Work out positions", `${LIB}\n${readFileSync(join(ROOT, "n8n", "code", "vis-compute.js"), "utf8")}`);
  w.chain(
    own, items, m, compute,
    dt(w, "Save check", "sparks_visibility", "insert", { body: "{runId:$json.runId,result_object:JSON.stringify($json)}" }),
    activity(w, "Log check", "visibility", "'Google visibility checked for ' + $('Work out positions').first().json.rows.length + ' keywords (' + $('Work out positions').first().json.searchesUsed + ' searches)'"),
  );

  // --- latest two checks (for arrows: up / down since last time)
  w.lane(); w.lane();
  w.chain(
    hook(w, "Get latest", "GET", "sparks/visibility/latest"),
    dt(w, "Read checks", "sparks_visibility", "list", { limit: 2 }),
    respond(w, "Return checks", "={{ (() => { const p = (r) => { try { return r ? JSON.parse(r.result_object) : null; } catch (e) { return null; } }; const d = $json.data || []; return { latest: p(d[0]), previous: p(d[1]) }; })() }}"),
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
    serp: await findCredByName("Sparks SerpApi"),
    gsc: await findCred("googleSearchConsoleOAuth2Api"),
  };
  if (!C.serp) throw new Error('Create the n8n credential "Sparks SerpApi" (type SerpApi) first');
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

  for (const build of [portalCore, leadFinder, rankGrid, searchConsole, websiteAudit, contentStudio, reviews, googleVisibility]) await upsertWorkflow(build());
  console.log(DRY ? "dry run written to n8n/dist/" : "done");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
