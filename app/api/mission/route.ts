import snapshot from "@/data/latest-snapshot.json";
import type { AutonomySnapshot } from "@/lib/autonomy";
import { buildMissionControl } from "@/lib/mission";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const mission = buildMissionControl(snapshot as AutonomySnapshot);

  return Response.json(mission, {
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
