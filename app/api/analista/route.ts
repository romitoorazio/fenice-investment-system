import { answerFeniceResearch } from "@/lib/ui/fenice-grounded-analyst";
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

export async function GET() {
  return Response.json(answerFeniceResearch("stato Fenice oggi", context, Date.now()), { headers });
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 1024 || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "INPUT_NON_VALIDO" }, { status: 413, headers });
  }
  let payload: unknown;
  try {
    // No provider calls, broker access or mutation; bound the request body even
    // if Content-Length is absent/untrusted.
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "CORPO_MANCANTE" }, { status: 400, headers });
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > 1024) {
        await reader.cancel();
        return Response.json({ error: "RICHIESTA_TROPPO_LUNGA" }, { status: 413, headers });
      }
      chunks.push(part.value);
    }
    const body = Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString("utf-8");
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "JSON_NON_VALIDO" }, { status: 400, headers });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || !("question" in payload) || typeof payload.question !== "string"
    || payload.question.length < 2 || payload.question.length > 240) {
    return Response.json({ error: "DOMANDA_NON_VALIDA" }, { status: 400, headers });
  }
  return Response.json(answerFeniceResearch(payload.question, context, Date.now()), { headers });
}
