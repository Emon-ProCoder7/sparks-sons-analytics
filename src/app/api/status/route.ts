import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import { n8nConfigured } from "@/lib/n8n";

export async function GET() {
  const role = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  return NextResponse.json({ role, n8n: n8nConfigured(), demoLabel: process.env.NEXT_PUBLIC_DEMO_ACCOUNT_LABEL ?? null });
}
