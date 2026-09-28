import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const role = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (role) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|sparks-logo.png|sparks-hero.jpg|robots.txt).*)"],
};
