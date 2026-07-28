import snapshot from "@/data/latest-snapshot.json";
import type { AutonomySnapshot } from "@/lib/autonomy";
import { buildEventIntelligence } from "@/lib/event-intelligence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return Response.json(buildEventIntelligence(snapshot as AutonomySnapshot), {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
