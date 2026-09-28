// Passcode session: a signed cookie, no user database.
// "admin" can trigger jobs/sends; "viewer" (optional second passcode) is read-only,
// which is what we hand to the client for a look-around during the pitch.

export type Role = "admin" | "viewer";
export const SESSION_COOKIE = "sparks_session";
const MAX_AGE_S = 60 * 60 * 24 * 14;

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(data: string): Promise<string> {
  const secret = process.env.PORTAL_SESSION_SECRET;
  if (!secret) throw new Error("PORTAL_SESSION_SECRET is not set");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function createSession(role: Role): Promise<{ value: string; maxAge: number }> {
  const payload = b64url(enc.encode(JSON.stringify({ role, exp: Date.now() + MAX_AGE_S * 1000 })));
  return { value: `${payload}.${await hmac(payload)}`, maxAge: MAX_AGE_S };
}

export async function readSession(token: string | undefined): Promise<Role | null> {
  if (!token || !process.env.PORTAL_SESSION_SECRET) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || (await hmac(payload)) !== sig) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof json.exp !== "number" || json.exp < Date.now()) return null;
    return json.role === "admin" || json.role === "viewer" ? json.role : null;
  } catch {
    return null;
  }
}

export function roleForPasscode(passcode: string): Role | null {
  const admin = process.env.PORTAL_PASSCODE;
  const viewer = process.env.PORTAL_VIEW_PASSCODE;
  if (admin && passcode === admin) return "admin";
  if (viewer && passcode === viewer) return "viewer";
  return null;
}
