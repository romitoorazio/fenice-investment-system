import snapshot from "@/data/latest-snapshot.json";
import type { AutonomySnapshot } from "@/lib/autonomy";
import { buildGlobalDataHub } from "@/lib/global-data-hub";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const hub = buildGlobalDataHub(snapshot as AutonomySnapshot);

  return Response.json(hub, {
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
