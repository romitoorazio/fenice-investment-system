import snapshot from "@/data/latest-snapshot.json";
import sourceHealth from "@/data/global-source-health.json";
import type { AutonomySnapshot } from "@/lib/autonomy";
import { overlaySourceHealth } from "@/lib/data-hub-source-overlay";
import { buildGlobalDataHub } from "@/lib/global-data-hub";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const enrichedSnapshot = overlaySourceHealth(
    snapshot as AutonomySnapshot,
    sourceHealth,
  );
  const hub = buildGlobalDataHub(enrichedSnapshot);

  return Response.json(hub, {
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
