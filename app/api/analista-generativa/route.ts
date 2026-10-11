import { answerFeniceResearch } from "@/lib/ui/fenice-grounded-analyst";
import { generateGroundedExplanation, generativeAvailability, isOwnerAuthorized, FENICE_GENERATIVE_MODEL, FENICE_AI_MAX_REQUEST_BYTES } from "@/lib/ai/fenice-generative-research";
import committee from "@/data/investment-committee.json";
import quality from "@/data/intelligence-quality.json";
import sourceHealth from "@/data/global-source-health.json";
import campaign from "@/data/paper-validation-campaign.json";
import calibration from "@/data/calibration-analysis.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const context = { committee, quality, sources: sourceHealth, campaign, calibration };
const headers = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
const json = (payload: unknown, status = 200) => Response.json(payload, { status, headers });
const environment = () => ({
  FENICE_GENERATIVE_AI_ENABLED: process.env.FENICE_GENERATIVE_AI_ENABLED,
  FENICE_AI_BUDGET_CONFIRMED: process.env.FENICE_AI_BUDGET_CONFIRMED,
  FENICE_AI_OWNER_TOKEN: process.env.FENICE_AI_OWNER_TOKEN,
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
  VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN,
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
      : "Servono attivazione esplicita, budget AI Gateway, codice proprietario e credenziale Gateway/OIDC. Nessun costo è stato attivato da questa pagina.",
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
  // Explicit owner bearer token: a public Fenice page must never expose a
  // metered LLM endpoint to anonymous requests.
  if (!isOwnerAuthorized(request.headers.get("authorization")?.replace(/^Bearer /i, ""), env.FENICE_AI_OWNER_TOKEN)) {
    return json({ error: "OWNER_AUTH_REQUIRED", brokerOrderAllowed: false }, 401);
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "ORIGIN_DENIED", brokerOrderAllowed: false }, 403);
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
  const gatewayToken = env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN || "";
  const result = await generateGroundedExplanation({
    question: data.question, grounded, gatewayToken, now,
  });
  return json({ ...result, grounded });
}
