import snapshot from "@/data/latest-snapshot.json";
import sourceHealth from "@/data/global-source-health.json";
import type { AutonomySnapshot } from "@/lib/autonomy";
import { buildGlobalDataHub } from "@/lib/global-data-hub";
import { overlaySourceHealth } from "@/lib/source-health-overlay";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const reconciled = overlaySourceHealth(snapshot as AutonomySnapshot, sourceHealth);
  const hub = buildGlobalDataHub(reconciled);

  return Response.json(hub, {
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
