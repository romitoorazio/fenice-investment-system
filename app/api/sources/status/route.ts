import health from "@/data/source-health.json";
import snapshot from "@/data/latest-snapshot.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
  const sourceHealth = Array.isArray(health.sources) ? health.sources : [];
  const healthy = sourceHealth.filter((source) => source.status === "healthy").length;
  const degraded = sourceHealth.filter((source) => source.status === "degraded").length;
  const failed = sourceHealth.filter((source) => source.status === "failed").length;

  return Response.json(
    {
      generatedAt: health.generatedAt,
      job: health.job,
      summary: {
        configuredProviders: providers.length,
        checkedSources: sourceHealth.length,
        healthy,
        degraded,
        failed,
      },
      providers,
      sourceHealth,
      policy: {
        multipleSourcesPreferred: true,
        sourceTimestampRequired: true,
        autonomousTrading: false,
      },
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
