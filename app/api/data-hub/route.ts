import snapshot from "@/data/latest-snapshot.json";
import sourceHealth from "@/data/global-source-health.json";
import type { AutonomySnapshot, ProviderState } from "@/lib/autonomy";
import { buildGlobalDataHub } from "@/lib/global-data-hub";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SourceHealthEntry = {
  id?: string;
  status?: string;
  detail?: string;
  checkedAt?: string;
  lastSuccessfulAt?: string;
};

const providerAliases: Record<string, string> = {
  alphavantage: "alpha-vantage",
};

function healthState(status: string | undefined): ProviderState | null {
  if (status === "healthy") return "operativo";
  if (status === "degraded") return "parziale";
  if (status === "failed") return "errore";
  if (status === "unconfigured") return "non configurato";
  return null;
}

function time(value: unknown) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  const snapshotGeneratedAt = time(snapshot.generatedAt);
  const healthGeneratedAt = time(sourceHealth.generatedAt);
  const useHealthOverlay = healthGeneratedAt >= snapshotGeneratedAt;

  const healthById = new Map(
    (Array.isArray(sourceHealth.sources) ? sourceHealth.sources : [])
      .map((item) => item as SourceHealthEntry)
      .filter((item) => item.id)
      .map((item) => [String(item.id), item] as const),
  );

  const enrichedSnapshot: AutonomySnapshot = {
    ...(snapshot as AutonomySnapshot),
    providers: (snapshot as AutonomySnapshot).providers.map((provider) => {
      if (!useHealthOverlay) return provider;
      const healthId = providerAliases[provider.id] || provider.id;
      const health = healthById.get(healthId);
      const state = healthState(health?.status);
      if (!health || !state) return provider;

      const healthCheckedAt = time(health.checkedAt);
      const providerLastSuccessAt = time(provider.lastSuccessAt);
      if (healthCheckedAt > 0 && healthCheckedAt < providerLastSuccessAt) return provider;

      return {
        ...provider,
        state,
        detail: health.detail || provider.detail,
        lastSuccessAt: health.lastSuccessfulAt || provider.lastSuccessAt,
      };
    }),
  };

  const hub = buildGlobalDataHub(enrichedSnapshot);

  return Response.json(hub, {
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
