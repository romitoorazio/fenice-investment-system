import healthData from "@/data/global-source-health.json";
import registryData from "@/data/global-source-registry.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SourceHealth = {
  id: string;
  name: string;
  category: string;
  authority: string;
  status: "healthy" | "degraded" | "failed" | "unconfigured";
  checkedAt: string;
  latencyMs: number | null;
  httpStatus: number | null;
  detail: string;
  regions: string[];
};

export async function GET() {
  const health = healthData as {
    version: number;
    generatedAt: string | null;
    totalSources: number;
    summary: Record<string, number>;
    sources: SourceHealth[];
  };
  const registry = registryData as {
    version: number;
    updatedAt: string;
    sources: Array<Record<string, unknown>>;
  };

  return Response.json(
    {
      generatedAt: health.generatedAt,
      registryUpdatedAt: registry.updatedAt,
      registeredSources: registry.sources.length,
      summary: health.summary,
      sources: health.sources,
      policy: {
        institutionalSourcesFirst: true,
        crossSourceValidationRequired: true,
        paidMarketFeedsRequiredForRealtimeExchangeCoverage: true,
        autonomousTrading: false,
      },
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
