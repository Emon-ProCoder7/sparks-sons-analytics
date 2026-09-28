import { NextResponse } from "next/server";
import { createSession, roleForPasscode, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  const { passcode } = (await request.json().catch(() => ({}))) as { passcode?: string };
  if (!process.env.PORTAL_PASSCODE || !process.env.PORTAL_SESSION_SECRET) {
    return NextResponse.json({ error: "Portal is not configured: set PORTAL_PASSCODE and PORTAL_SESSION_SECRET." }, { status: 500 });
  }
  const role = roleForPasscode(String(passcode ?? ""));
  if (!role) return NextResponse.json({ error: "That passcode isn't right." }, { status: 401 });

  const { value, maxAge } = await createSession(role);
  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(SESSION_COOKIE, value, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
