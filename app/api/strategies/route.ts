import strategies from "@/data/strategy-lab.json";
import type { StrategyLabReport } from "@/lib/strategy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return Response.json(strategies as StrategyLabReport, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
