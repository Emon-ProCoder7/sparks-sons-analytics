"use client";

import { useCallback, useEffect, useState } from "react";
import type { Action } from "./n8n";

export type N8nResult<T> = {
  data: T | null;
  error: string | null;
  connected: boolean;
  loading: boolean;
  reload: () => void;
};

export async function n8n<T = unknown>(action: Action, opts: { query?: Record<string, string>; body?: unknown } = {}) {
  const qs = opts.query ? `?${new URLSearchParams(opts.query)}` : "";
  const res = await fetch(`/api/n8n/${action}${qs}`, {
    method: opts.body !== undefined ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false as const, status: res.status, connected: json.connected !== false, error: String(json.error ?? `Request failed (${res.status})`), data: null };
  }
  return { ok: true as const, status: res.status, connected: true, error: null, data: json as T };
}

/** GET an n8n read route; reports "not connected" separately from real errors. */
export function useN8n<T>(action: Action, query?: Record<string, string>, pollMs?: number): N8nResult<T> {
  const [state, setState] = useState<Omit<N8nResult<T>, "reload">>({ data: null, error: null, connected: true, loading: true });
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(query ?? {});

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const r = await n8n<T>(action, { query: JSON.parse(key) });
      if (alive) setState({ data: r.data, error: r.connected ? r.error : null, connected: r.connected, loading: false });
    };
    run();
    const id = pollMs ? setInterval(run, pollMs) : undefined;
    return () => {
      alive = false;
      if (id) clearInterval(id);
    };
  }, [action, key, tick, pollMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
