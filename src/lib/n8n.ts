// The portal <-> n8n contract. The browser never talks to n8n directly:
// it calls /api/n8n/<action>, which is checked against this allow-list and
// forwarded server-side with the shared secret header.
// n8n/CONTRACT.md documents the payload of every route.

export type Action = keyof typeof ROUTES;

export const ROUTES = {
  "settings.get": { method: "GET", path: "sparks/settings", write: false },
  "settings.save": { method: "POST", path: "sparks/settings", write: true },
  "activity.list": { method: "GET", path: "sparks/activity", write: false },
  "quota.get": { method: "GET", path: "sparks/serpapi/quota", write: false },

  "visibility.latest": { method: "GET", path: "sparks/visibility/latest", write: false },
  "visibility.run": { method: "POST", path: "sparks/visibility/run", write: true },
  "keywords.get": { method: "GET", path: "sparks/keywords", write: false },
  "keywords.discover": { method: "POST", path: "sparks/keywords/discover", write: true },
  "keywords.update": { method: "POST", path: "sparks/keywords/update", write: true },

  "leads.start": { method: "POST", path: "sparks/leads/start", write: true },
  "leads.jobs": { method: "GET", path: "sparks/leads/jobs", write: false },
  "leads.rows": { method: "GET", path: "sparks/leads/rows", write: false },

  "grid.start": { method: "POST", path: "sparks/grid/start", write: true },
  "grid.jobs": { method: "GET", path: "sparks/grid/jobs", write: false },

  "gsc.queries": { method: "GET", path: "sparks/gsc/queries", write: false },
  "gsc.sync": { method: "POST", path: "sparks/gsc/sync", write: true },

  "audit.run": { method: "POST", path: "sparks/audit/run", write: true },
  "audit.latest": { method: "GET", path: "sparks/audit/latest", write: false },

  "content.draft": { method: "POST", path: "sparks/content/draft", write: true },
  "content.publish": { method: "POST", path: "sparks/content/publish", write: true },
  "content.list": { method: "GET", path: "sparks/content/list", write: false },

  "reviews.request": { method: "POST", path: "sparks/reviews/request", write: true },
  "reviews.replyDraft": { method: "POST", path: "sparks/reviews/reply-draft", write: true },
  "reviews.list": { method: "GET", path: "sparks/reviews/list", write: false },
} as const;

export function isAction(a: string): a is Action {
  return Object.prototype.hasOwnProperty.call(ROUTES, a);
}

export function n8nConfigured(): boolean {
  return Boolean(process.env.N8N_WEBHOOK_BASE && process.env.N8N_SHARED_SECRET);
}

/** An HTML page instead of JSON means the request never reached n8n (Cloudflare / host error page). */
const isHtml = (s: string) => /^\s*(<!doctype html|<html)/i.test(s);

export async function callN8n(action: Action, opts: { query?: URLSearchParams; body?: unknown } = {}) {
  // Reads are safe to repeat, so retry once if the server hiccups. Writes (starting a check, sending)
  // are never retried automatically, so nothing runs or spends searches twice.
  const first = await callOnce(action, opts);
  if (ROUTES[action].method === "GET" && first.unreachable) {
    await new Promise((r) => setTimeout(r, 1500));
    return callOnce(action, opts);
  }
  return first;
}

async function callOnce(action: Action, opts: { query?: URLSearchParams; body?: unknown }) {
  const route = ROUTES[action];
  const base = process.env.N8N_WEBHOOK_BASE!.replace(/\/+$/, "");
  const url = `${base}/${route.path}${opts.query && [...opts.query].length ? `?${opts.query}` : ""}`;
  const res = await fetch(url, {
    method: route.method,
    headers: {
      "content-type": "application/json",
      "x-sparks-secret": process.env.N8N_SHARED_SECRET!,
    },
    body: route.method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(action === "content.draft" || action === "reviews.replyDraft" ? 90_000 : 30_000),
  });
  const text = await res.text();
  if (isHtml(text) || (res.status >= 520 && res.status <= 530)) {
    return {
      status: 503,
      unreachable: true,
      data: { error: `The automation server didn't answer (HTTP ${res.status}). It may be restarting. Please try again in a minute.` },
    };
  }
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 300) || `n8n returned HTTP ${res.status}` };
  }
  return { status: res.status, unreachable: false, data };
}
