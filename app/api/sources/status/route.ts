import legacyHealth from "@/data/source-health.json";
import globalHealth from "@/data/global-source-health.json";
import snapshot from "@/data/latest-snapshot.json";
import { reconcileSourceStatus } from "@/lib/ui/source-status-reconciliation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // Keep the existing response contract but stop showing a stale FINRA 403
  // when a newer, valid authenticated Fixed Income check returned HTTP 200.
  const merged = reconcileSourceStatus(legacyHealth, globalHealth, Date.now());
  const providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
  return Response.json({
    generatedAt: merged.latestReportAt,
    reconciledAt: merged.reconciledAt,
    job: "source-status-reconciliation",
    summary: {
      configuredProviders: providers.length,
      ...merged.summary,
    },
    providers,
    sourceHealth: merged.sources,
    policy: {
      multipleSourcesPreferred: true,
      sourceTimestampRequired: true,
      autonomousTrading: false,
      ...merged.policy,
    },
  }, { headers: { "cache-control": "no-store, max-age=0" } });
}
