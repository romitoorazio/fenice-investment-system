import healthData from "@/data/global-source-health.json";
import registryData from "@/data/global-source-registry.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SourceHealth = {
  id: string;
  name: string;
  category: string;
  authority: string;
  critical?: boolean;
  status: "healthy" | "degraded" | "failed" | "unconfigured";
  checkedAt: string;
  latencyMs: number | null;
  httpStatus: number | null;
  detail: string;
  regions: string[];
  attempts?: number;
  bytes?: number;
  contentType?: string;
  endpointUsed?: string | null;
};

type PublicSourceHealth = Pick<
  SourceHealth,
  | "id"
  | "name"
  | "category"
  | "authority"
  | "critical"
  | "status"
  | "checkedAt"
  | "latencyMs"
  | "httpStatus"
  | "detail"
  | "regions"
  | "attempts"
  | "bytes"
  | "contentType"
>;

function toPublicSource(source: SourceHealth): PublicSourceHealth {
  return {
    id: source.id,
    name: source.name,
    category: source.category,
    authority: source.authority,
    critical: source.critical,
    status: source.status,
    checkedAt: source.checkedAt,
    latencyMs: source.latencyMs,
    httpStatus: source.httpStatus,
    detail: source.detail,
    regions: source.regions,
    attempts: source.attempts,
    bytes: source.bytes,
    contentType: source.contentType,
  };
}

export async function GET() {
  const health = healthData as {
    version: number;
    generatedAt: string | null;
    totalSources: number;
    summary: Record<string, number>;
    reliabilityScore?: number;
    qualityScore?: number;
    gate?: "GREEN" | "AMBER" | "RED";
    institutionalGate?: "GREEN" | "AMBER" | "RED";
    critical?: {
      ready?: number;
      total?: number;
      failures?: string[];
      gate?: "GREEN" | "AMBER" | "RED";
    };
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
      reliabilityScore: health.reliabilityScore ?? null,
      qualityScore: health.qualityScore ?? null,
      gate: health.gate ?? null,
      institutionalGate: health.institutionalGate ?? null,
      critical: health.critical ?? null,
      sources: health.sources.map(toPublicSource),
      policy: {
        institutionalSourcesFirst: true,
        crossSourceValidationRequired: true,
        paidMarketFeedsRequiredForRealtimeExchangeCoverage: true,
        autonomousTrading: false,
        endpointMetadataPublic: false,
      },
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
