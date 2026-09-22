import snapshot from "@/data/latest-snapshot.json";
import sourceHealth from "@/data/global-source-health.json";
import type { AutonomySnapshot } from "@/lib/autonomy";
import { overlaySourceHealth } from "@/lib/source-health-overlay";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = overlaySourceHealth(snapshot as AutonomySnapshot, sourceHealth);

  return Response.json(
    {
      ...data,
      runtime: {
        generatedFromRepositorySnapshot: true,
        sourceHealthReconciled: true,
        autonomousAnalysisEnabled: true,
        autonomousTradingEnabled: false,
      },
    },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    },
  );
}
