import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Persistent owner browser session, signed with the existing private owner credential.
 * The cookie contains ONLY an issue timestamp and a MAC. Neither the OpenAI
 * API key nor the original owner credential is stored or sent to the browser.
 * Rolling 400-day expiry is refreshed when the owner opens the analyst.
 * Rotation of FENICE_AI_OWNER_TOKEN revokes every issued cookie.
 */
export const FENICE_AI_SESSION_DAYS = 400;
export const FENICE_AI_SESSION_SECONDS = FENICE_AI_SESSION_DAYS * 24 * 60 * 60;
export const FENICE_AI_SESSION_COOKIE = "__Host-fenice_ai_session";
const SESSION_DOMAIN = "fenice-ai-owner-session-v2-persistent";

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

/** Owner authentication is independent of paid/generative service readiness. */
export async function handleFeniceOwnerSessionRequest(request:Request,{
  secret,verifyCredential,now=Date.now(),
}:{secret:string|undefined;verifyCredential:(token:unknown,secret:string|undefined)=>boolean;now?:number}){
  const headers={"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
  if(request.method==="GET"){
    const authenticated=verifyFeniceOwnerSession(feniceSessionCookieFromRequest(request),secret,now);
    const response=Response.json({authenticated,sessionDurationDays:FENICE_AI_SESSION_DAYS,
      renewsAutomatically:authenticated,brokerOrderAllowed:false},{headers});
    if(authenticated){
      const renewed=createFeniceOwnerSession(secret,now);
      if(renewed)response.headers.set("Set-Cookie",feniceSessionSetCookie(renewed));
    }
    return response;
  }
  if(!["POST","DELETE"].includes(request.method))return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405,headers});
  if(!feniceSameOrigin(request))return Response.json({error:"ORIGIN_DENIED"},{status:403,headers});
  if(request.method==="DELETE"){
    const response=Response.json({authenticated:false,brokerOrderAllowed:false},{headers});
    response.headers.set("Set-Cookie",feniceSessionClearCookie());return response;
  }
  if(!secret||secret.length<32)return Response.json({error:"OWNER_ACCESS_NOT_CONFIGURED"},{status:503,headers});
  const auth=request.headers.get("authorization"),token=auth?.startsWith("Bearer ")?auth.slice(7):null;
  if(!verifyCredential(token,secret))return Response.json({error:"ACCESS_DENIED"},{status:401,headers});
  const session=createFeniceOwnerSession(secret,now);
  if(!session)return Response.json({error:"SESSION_NOT_AVAILABLE"},{status:503,headers});
  const response=Response.json({authenticated:true,sessionDurationDays:FENICE_AI_SESSION_DAYS,
    renewsAutomatically:true,brokerOrderAllowed:false},{headers});
  response.headers.set("Set-Cookie",feniceSessionSetCookie(session));return response;
}
