import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Eight-hour owner session, signed with the existing private owner credential.
 * The cookie contains ONLY an issue timestamp and a MAC. Neither the OpenAI
 * API key nor the original owner credential is stored or sent to the browser.
 * Rotation of FENICE_AI_OWNER_TOKEN revokes every issued cookie.
 */
export const FENICE_AI_SESSION_SECONDS = 8 * 60 * 60;
export const FENICE_AI_SESSION_COOKIE = "__Host-fenice_ai_session";
const SESSION_DOMAIN = "fenice-ai-owner-session-v1";

function sign(secret: string, issuedSeconds: number): Buffer {
  return createHmac("sha256", secret).update(`${SESSION_DOMAIN}:${issuedSeconds}`).digest();
}

export function createFeniceOwnerSession(secret: string | undefined, now: number): string | null {
  if (!secret || secret.length < 32 || !Number.isFinite(now) || now <= 0) return null;
  const issuedSeconds = Math.floor(now / 1000);
  const mac = sign(secret, issuedSeconds).toString("base64url");
  return `${issuedSeconds}.${mac}`;
}

export function verifyFeniceOwnerSession(token: unknown, secret: string | undefined, now: number): boolean {
  if (typeof token !== "string" || !secret || secret.length < 32 || !Number.isFinite(now)) return false;
  if (!/^\d{9,12}\.[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const [seconds, suppliedMac] = token.split(".");
  const issued = Number(seconds);
  if (!Number.isSafeInteger(issued)) return false;
  const nowSeconds = Math.floor(now / 1000);
  if (issued > nowSeconds || nowSeconds - issued >= FENICE_AI_SESSION_SECONDS) return false;
  const expected = sign(secret, issued);
  const actual = Buffer.from(suppliedMac, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function feniceSessionCookieFromRequest(request: Request): string | null {
  const source = request.headers.get("cookie") || "";
  if (source.length > 4096) return null;
  const prefix = FENICE_AI_SESSION_COOKIE + "=";
  const entry = source.split(";").map(part => part.trim()).find(part => part.startsWith(prefix));
  return entry?.slice(prefix.length) ?? null;
}

export function feniceSessionSetCookie(session: string): string {
  return `${FENICE_AI_SESSION_COOKIE}=${session}; Max-Age=${FENICE_AI_SESSION_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}
export function feniceSessionClearCookie(): string {
  return `${FENICE_AI_SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}
export function feniceSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}
