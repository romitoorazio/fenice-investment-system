import type { AutonomySnapshot, ProviderState } from "./autonomy";

export type SourceHealthEntry = {
  id?: string;
  status?: string;
  detail?: string;
  checkedAt?: string;
  lastSuccessfulAt?: string;
};

export type SourceHealthReport = {
  generatedAt?: string;
  sources?: SourceHealthEntry[];
};

const PROVIDER_ALIASES: Readonly<Record<string, string>> = {
  alphavantage: "alpha-vantage",
  clinicaltrials: "clinical-trials",
};

function healthState(status: string | undefined): ProviderState | null {
  if (status === "healthy") return "operativo";
  if (status === "degraded") return "parziale";
  if (status === "failed") return "errore";
  if (status === "unconfigured") return "non configurato";
  return null;
}

function timestamp(value: unknown): number {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Reconcile direct source cards with newer source-health evidence. Derived
 * internal pipelines are deliberately not mapped to upstream sources, because
 * upstream availability alone does not prove that the derived pipeline ran.
 */
export function overlaySourceHealth(
  snapshot: AutonomySnapshot,
  sourceHealth: SourceHealthReport | null | undefined,
): AutonomySnapshot {
  const snapshotGeneratedAt = timestamp(snapshot.generatedAt);
  const healthGeneratedAt = timestamp(sourceHealth?.generatedAt);
  if (!sourceHealth || healthGeneratedAt < snapshotGeneratedAt) return snapshot;

  const healthById = new Map(
    (Array.isArray(sourceHealth.sources) ? sourceHealth.sources : [])
      .filter((item) => item?.id)
      .map((item) => [String(item.id), item] as const),
  );

  return {
    ...snapshot,
    providers: snapshot.providers.map((provider) => {
      const healthId = PROVIDER_ALIASES[provider.id] || provider.id;
      const health = healthById.get(healthId);
      const state = healthState(health?.status);
      if (!health || !state) return provider;

      const healthCheckedAt = timestamp(health.checkedAt);
      const providerLastSuccessAt = timestamp(provider.lastSuccessAt);
      if (healthCheckedAt > 0 && healthCheckedAt < providerLastSuccessAt) return provider;

      return {
        ...provider,
        state,
        detail: health.detail || provider.detail,
        lastSuccessAt: health.lastSuccessfulAt || provider.lastSuccessAt,
      };
    }),
  };
}
