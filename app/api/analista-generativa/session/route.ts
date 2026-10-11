import { generativeAvailability, isOwnerAuthorized } from "@/lib/ai/fenice-generative-research";
import {
  createFeniceOwnerSession,
  feniceSameOrigin,
  feniceSessionClearCookie,
  feniceSessionCookieFromRequest,
  feniceSessionSetCookie,
  verifyFeniceOwnerSession,
  FENICE_AI_SESSION_SECONDS,
} from "@/lib/ai/fenice-owner-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
function enabled() {
  return generativeAvailability({
    FENICE_GENERATIVE_AI_ENABLED: process.env.FENICE_GENERATIVE_AI_ENABLED,
    FENICE_AI_MANUAL_ONLY: process.env.FENICE_AI_MANUAL_ONLY,
    FENICE_AI_OWNER_TOKEN: process.env.FENICE_AI_OWNER_TOKEN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  }) === "READY";
}

export async function GET(request: Request) {
  const authenticated = enabled() && verifyFeniceOwnerSession(
    feniceSessionCookieFromRequest(request),
    process.env.FENICE_AI_OWNER_TOKEN,
    Date.now(),
  );
  return Response.json({ authenticated, sessionDurationHours: 8, brokerOrderAllowed: false }, { headers });
}

export async function POST(request: Request) {
  if (!feniceSameOrigin(request)) {
    return Response.json({ error: "ORIGIN_DENIED" }, { status: 403, headers });
  }
  if (!enabled()) return Response.json({ error: "AI_NOT_CONFIGURED" }, { status: 503, headers });
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!isOwnerAuthorized(token, process.env.FENICE_AI_OWNER_TOKEN)) {
    return Response.json({ error: "ACCESS_DENIED" }, { status: 401, headers });
  }
  const session = createFeniceOwnerSession(process.env.FENICE_AI_OWNER_TOKEN, Date.now());
  if (!session) return Response.json({ error: "SESSION_NOT_AVAILABLE" }, { status: 503, headers });
  const response = Response.json({
    authenticated: true,
    sessionDurationHours: FENICE_AI_SESSION_SECONDS / 3600,
    brokerOrderAllowed: false,
  }, { headers });
  response.headers.set("Set-Cookie", feniceSessionSetCookie(session));
  return response;
}

export async function DELETE(request: Request) {
  if (!feniceSameOrigin(request)) {
    return Response.json({ error: "ORIGIN_DENIED" }, { status: 403, headers });
  }
  const response = Response.json({ authenticated: false, brokerOrderAllowed: false }, { headers });
  response.headers.set("Set-Cookie", feniceSessionClearCookie());
  return response;
}
