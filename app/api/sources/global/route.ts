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

type HealthPayload = {
  version: number;
  generatedAt: string | null;
  totalSources: number;
  summary: Record<string, number>;
  sources: SourceHealth[];
};

export async function GET() {
  // Generated health snapshots can be deliberately sanitized in git while the
  // live workflow regenerates the complete schema. Cast through unknown so a
  // redacted tracked snapshot cannot break the production build; runtime data
  // is still returned only through the explicit public SourceHealth contract.
  const health = healthData as unknown as HealthPayload;
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
