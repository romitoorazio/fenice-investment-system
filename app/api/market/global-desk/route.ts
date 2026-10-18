import globalUniverse from "@/data/global-market-universe.json";
import referenceCoverage from "@/data/global-reference-coverage.json";
import { buildGlobalResearchDesk } from "@/lib/ui/global-research-desk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Read-only world research navigator; no broker client, paid feed, trading API
// or inferred exchange OPEN status. Response reflects server request time.
export async function GET() {
  const desk = buildGlobalResearchDesk(globalUniverse, referenceCoverage, Date.now());
  return Response.json(desk, {
    headers: { "Cache-Control": "no-store, no-cache, max-age=0" },
  });
}
