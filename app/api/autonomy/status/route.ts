import snapshot from "@/data/latest-snapshot.json";
import type { AutonomySnapshot } from "@/lib/autonomy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = snapshot as AutonomySnapshot;

  return Response.json(
    {
      ...data,
      runtime: {
        generatedFromRepositorySnapshot: true,
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
