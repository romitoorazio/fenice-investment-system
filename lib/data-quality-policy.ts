export const DATA_QUALITY_POLICY = {
  freshnessWindowMs: 24 * 60 * 60 * 1000,
  minimumFreshnessForSignals: 40,
  healthyFreshness: 70,
  warningFreshness: 60,
  minimumIndependentSources: 2,
  recommendedIndependentSources: 4,
  warningIndependentSources: 3,
  minimumHubHealthForSignals: 45,
  healthyHubHealth: 75,
  recommendedAssetClasses: 6,
  maximumWarnings: 20,
} as const;

export type DataQualityPolicy = typeof DATA_QUALITY_POLICY;

export function assessOperatingStatus(input: {
  healthScore: number;
  freshnessScore: number;
  sourceCount: number;
  instrumentCount: number;
}) {
  const blockers = [
    ...(input.instrumentCount === 0 ? ["Nessuno strumento disponibile."] : []),
    ...(input.freshnessScore < DATA_QUALITY_POLICY.minimumFreshnessForSignals
      ? [`Freschezza dati inferiore alla soglia minima del ${DATA_QUALITY_POLICY.minimumFreshnessForSignals}%.`]
      : []),
    ...(input.sourceCount < DATA_QUALITY_POLICY.minimumIndependentSources
      ? [`Manca la conferma da almeno ${DATA_QUALITY_POLICY.minimumIndependentSources} fonti indipendenti.`]
      : []),
    ...(input.healthScore < DATA_QUALITY_POLICY.minimumHubHealthForSignals
      ? ["Salute complessiva del Data Hub inferiore alla soglia minima."]
      : []),
  ];

  const signalGenerationAllowed = blockers.length === 0;
  const operatingStatus = !signalGenerationAllowed
    ? "bloccato"
    : input.healthScore >= DATA_QUALITY_POLICY.healthyHubHealth &&
        input.freshnessScore >= DATA_QUALITY_POLICY.healthyFreshness
      ? "operativo"
      : "degradato";

  return {
    blockers,
    signalGenerationAllowed,
    operatingStatus,
  } as const;
}
