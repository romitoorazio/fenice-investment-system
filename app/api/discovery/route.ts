import snapshot from "@/data/latest-snapshot.json";
import type { AutonomySnapshot } from "@/lib/autonomy";
import { buildDiscoveryReport } from "@/lib/discovery-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const report = buildDiscoveryReport(snapshot as AutonomySnapshot);
  return Response.json(report, {
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
