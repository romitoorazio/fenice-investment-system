import { answerFeniceResearch } from "@/lib/ui/fenice-grounded-analyst";
import { feniceSameOrigin, feniceSessionCookieFromRequest, verifyFeniceOwnerSession } from "@/lib/ai/fenice-owner-session";
import { generateGroundedExplanation, generativeAvailability, isOwnerAuthorized, FENICE_GENERATIVE_MODEL, FENICE_AI_MAX_REQUEST_BYTES } from "@/lib/ai/fenice-generative-research";
import { feniceAnalystContext } from "@/lib/ui/fenice-analyst-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const context = feniceAnalystContext;
const headers = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const json = (payload: unknown, status = 200) => Response.json(payload, { status, headers });
const environment = () => ({
  FENICE_GENERATIVE_AI_ENABLED: process.env.FENICE_GENERATIVE_AI_ENABLED,
  FENICE_AI_MANUAL_ONLY: process.env.FENICE_AI_MANUAL_ONLY,
  FENICE_AI_OWNER_TOKEN: process.env.FENICE_AI_OWNER_TOKEN,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
});

// Readiness is public; NEVER expose whether a particular token is valid or
// any provider credentials. No GET request ever consumes provider credits.
export async function GET() {
  const available = generativeAvailability(environment());
  return json({
    state: available === "READY" ? "READY" : "SETUP_REQUIRED",
    model: FENICE_GENERATIVE_MODEL,
    ownerAccessRequired: true,
    costMetered: true,
    brokerOrderAllowed: false,
    explanation: available === "READY"
      ? "Il modello è pronto. Le domande generative richiedono il codice del proprietario."
      : "La IA richiede OPENAI_API_KEY, accesso proprietario e consenso all'uso esclusivamente manuale delle API. Nessuna richiesta avviene automaticamente.",
  });
}

async function readLimitedBody(request: Request): Promise<unknown | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  let length = 0;
  const parts: Buffer[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.byteLength;
    if (length > FENICE_AI_MAX_REQUEST_BYTES) {
      await reader.cancel();
      return null;
    }
    parts.push(Buffer.from(part.value));
  }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { return null; }
}

export async function POST(request: Request) {
  const env = environment();
  if (generativeAvailability(env) !== "READY") {
    return json({ error: "AI_NOT_CONFIGURED", brokerOrderAllowed: false }, 503);
  }
  // A browser session always needs a same-origin POST (CSRF guard).
  // Existing bearer clients remain supported without a cookie.
  const origin = request.headers.get("origin");
  if (origin && !feniceSameOrigin(request)) {
    return json({ error: "ORIGIN_DENIED", brokerOrderAllowed: false }, 403);
  }
  const bearer = isOwnerAuthorized(request.headers.get("authorization")?.replace(/^Bearer /i, ""), env.FENICE_AI_OWNER_TOKEN);
  const session = feniceSameOrigin(request) && verifyFeniceOwnerSession(
    feniceSessionCookieFromRequest(request), env.FENICE_AI_OWNER_TOKEN, Date.now(),
  );
  if (!bearer && !session) {
    return json({ error: "OWNER_AUTH_REQUIRED", brokerOrderAllowed: false }, 401);
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(declaredLength) || declaredLength > FENICE_AI_MAX_REQUEST_BYTES
      || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return json({ error: "INVALID_REQUEST", brokerOrderAllowed: false }, 400);
  }
  const data = await readLimitedBody(request);
  if (!data || typeof data !== "object" || Array.isArray(data)
      || !("question" in data) || typeof data.question !== "string"
      || data.question.trim().length < 2 || data.question.length > 240) {
    return json({ error: "QUESTION_INVALID", brokerOrderAllowed: false }, 400);
  }
  const now = Date.now();
  const grounded = answerFeniceResearch(data.question, context, now);
  const openaiToken = env.OPENAI_API_KEY || "";
  const result = await generateGroundedExplanation({
    question: data.question, grounded, openaiToken, now,
  });
  return json({ ...result, grounded });
}
