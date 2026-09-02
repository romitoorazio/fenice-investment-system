import healthData from "@/data/global-source-health.json";
import registryData from "@/data/global-source-registry.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SourceStatus = "healthy" | "degraded" | "failed" | "unconfigured";

type SourceHealth = {
  id: string;
  name: string;
  category: string;
  authority: string;
  critical: boolean;
  status: SourceStatus;
  checkedAt: string | null;
  latencyMs: number | null;
  httpStatus: number | null;
  detail: string;
  regions: string[];
  endpointUsed?: string | null;
  attempts?: number;
  bytes?: number;
  contentType?: string;
};

type RegistrySource = {
  id: string;
  name: string;
  category: string;
  authority: string;
  critical?: boolean;
  regions?: string[];
};

type RawHealthSource = {
  id: string;
  status?: string;
  critical?: boolean;
  checkedAt?: string;
  latencyMs?: number | null;
  httpStatus?: number | null;
  detail?: string;
  endpointUsed?: string | null;
  attempts?: number;
  bytes?: number;
  contentType?: string;
  name?: string;
  category?: string;
  authority?: string;
  regions?: string[];
};

function isSourceStatus(value: string | undefined): value is SourceStatus {
  return value === "healthy" || value === "degraded" || value === "failed" || value === "unconfigured";
}

export async function GET() {
  const health = healthData as unknown as {
    version: number;
    generatedAt: string | null;
    totalSources: number;
    summary: Record<string, number>;
    sources: RawHealthSource[];
  };
  const registry = registryData as unknown as {
    version: number;
    updatedAt: string;
    sources: RegistrySource[];
  };

  const registryById = new Map(registry.sources.map((source) => [source.id, source]));
  const sources: SourceHealth[] = health.sources.map((source) => {
    const registered = registryById.get(source.id);
    return {
      id: source.id,
      name: source.name ?? registered?.name ?? source.id,
      category: source.category ?? registered?.category ?? "unknown",
      authority: source.authority ?? registered?.authority ?? "unknown",
      critical: source.critical ?? Boolean(registered?.critical),
      status: isSourceStatus(source.status) ? source.status : "failed",
      checkedAt: source.checkedAt ?? health.generatedAt,
      latencyMs: source.latencyMs ?? null,
      httpStatus: source.httpStatus ?? null,
      detail: source.detail ?? "Tracked health snapshot sanitized; run the live source check for full diagnostics.",
      regions: source.regions ?? registered?.regions ?? [],
      endpointUsed: source.endpointUsed ?? null,
      attempts: source.attempts ?? 0,
      bytes: source.bytes ?? 0,
      contentType: source.contentType ?? "",
    };
  });

  return Response.json(
    {
      generatedAt: health.generatedAt,
      registryUpdatedAt: registry.updatedAt,
      registeredSources: registry.sources.length,
      summary: health.summary,
      sources,
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
