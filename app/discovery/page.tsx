import snapshot from "@/data/latest-snapshot.json";
import DiscoveryBoard from "@/components/DiscoveryBoard";
import type { AutonomySnapshot } from "@/lib/autonomy";
import { buildDiscoveryReport } from "@/lib/discovery-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function DiscoveryPage() {
  const report = buildDiscoveryReport(snapshot as AutonomySnapshot);
  return <DiscoveryBoard report={report} />;
}
