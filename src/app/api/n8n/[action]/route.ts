import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import { callN8n, isAction, n8nConfigured, ROUTES } from "@/lib/n8n";

async function handle(request: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (!isAction(action)) return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 404 });

  const route = ROUTES[action];
  if (request.method !== route.method) return NextResponse.json({ error: `${action} expects ${route.method}` }, { status: 405 });

  const role = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (route.write && role !== "admin") {
    return NextResponse.json({ error: "View-only access. Ask the account admin to run this." }, { status: 403 });
  }

  if (!n8nConfigured()) {
    return NextResponse.json(
      { connected: false, error: "Automation backend (n8n) is not connected yet. Set N8N_WEBHOOK_BASE and N8N_SHARED_SECRET." },
      { status: 503 },
    );
  }

  let body: Record<string, unknown> | undefined;
  if (route.method === "POST") {
    body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    // Approval gate, enforced server-side as well as in the UI (and again inside n8n).
    if ((action === "content.publish" || action === "reviews.request") && body.approved !== true) {
      return NextResponse.json({ error: "Tick the approval box before sending." }, { status: 400 });
    }
  }

  try {
    const { status, data } = await callN8n(action, { query: request.nextUrl.searchParams, body });
    return NextResponse.json(data, { status });
  } catch (e) {
    const msg = e instanceof Error && e.name === "TimeoutError" ? "n8n took too long to answer." : "Couldn't reach n8n.";
    return NextResponse.json({ connected: true, error: msg }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
