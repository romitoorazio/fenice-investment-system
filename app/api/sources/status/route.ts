import healthJson from "@/data/source-health.json";
import snapshot from "@/data/latest-snapshot.json";

type SourceHealthStatus = "healthy" | "degraded" | "failed" | "unknown";

type SourceHealthRecord = {
  id?: string;
  name?: string;
  status: SourceHealthStatus;
  checkedAt?: string;
  latencyMs?: number;
  detail?: string;
};

type SourceHealthFile = {
  generatedAt: string | null;
  job: string;
  sources: SourceHealthRecord[];
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const health = healthJson as SourceHealthFile;
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
