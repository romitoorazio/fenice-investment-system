import type { AutonomySnapshot, MarketReading, ProviderState } from "./autonomy";

export type DataHubAssetClass = {
  name: string;
  instruments: number;
  freshInstruments: number;
  sources: string[];
  averageScore: number;
  averageRisk: number;
  lastObservedAt: string | null;
};

export type DataHubProviderSummary = {
  id: string;
  name: string;
  state: ProviderState;
  coverage: string[];
  detail: string;
  lastSuccessAt: string | null;
  healthScore: number;
};

export type DataHubOperatingStatus = "operativo" | "degradato" | "bloccato";

export type GlobalDataHub = {
  generatedAt: string;
  checkedAt: string;
  mode: AutonomySnapshot["mode"];
  headline: string;
  operatingStatus: DataHubOperatingStatus;
  signalGenerationAllowed: boolean;
  healthScore: number;
  freshnessScore: number;
  coverageScore: number;
  sourceDiversityScore: number;
  totalInstruments: number;
  freshInstruments: number;
  staleInstruments: number;
  uniqueSources: number;
  assetClasses: DataHubAssetClass[];
  providers: DataHubProviderSummary[];
  blockers: string[];
  recommendations: string[];
  warnings: string[];
};

const DAY_MS = 86_400_000;

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function validTimestamp(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function observedTimestamp(reading: MarketReading) {
  return validTimestamp(reading.observedAt ?? reading.updatedAt);
}

function isFresh(reading: MarketReading, now: number) {
  const timestamp = observedTimestamp(reading);
  return timestamp !== null && now - timestamp <= DAY_MS;
}

function providerHealth(state: ProviderState, lastSuccessAt?: string) {
  const base = state === "operativo" ? 100 : state === "parziale" ? 65 : state === "non configurato" ? 25 : 10;
  const lastSuccess = validTimestamp(lastSuccessAt);
  if (lastSuccess === null) return base;
  const ageDays = (Date.now() - lastSuccess) / DAY_MS;
  return Math.round(clamp(base - Math.max(0, ageDays - 1) * 5));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildGlobalDataHub(snapshot: AutonomySnapshot): GlobalDataHub {
  const now = Date.now();
  const generatedAt = snapshot.generatedAt ?? new Date(now).toISOString();
  const grouped = new Map<string, MarketReading[]>();

  for (const reading of snapshot.markets) {
    const key = reading.assetClass || "Non classificato";
    grouped.set(key, [...(grouped.get(key) ?? []), reading]);
  }

  const assetClasses = [...grouped.entries()]
    .map(([name, readings]) => {
      const timestamps = readings.map(observedTimestamp).filter((value): value is number => value !== null);
      return {
        name,
        instruments: readings.length,
        freshInstruments: readings.filter((reading) => isFresh(reading, now)).length,
        sources: [...new Set(readings.map((reading) => reading.source).filter(Boolean))].sort(),
        averageScore: Math.round(average(readings.map((reading) => reading.score))),
        averageRisk: Math.round(average(readings.map((reading) => reading.risk))),
        lastObservedAt: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null,
      } satisfies DataHubAssetClass;
    })
    .sort((a, b) => b.instruments - a.instruments || a.name.localeCompare(b.name, "it"));

  const providers = snapshot.providers
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      state: provider.state,
      coverage: provider.coverage,
      detail: provider.detail,
      lastSuccessAt: provider.lastSuccessAt ?? null,
      healthScore: providerHealth(provider.state, provider.lastSuccessAt),
    }))
    .sort((a, b) => b.healthScore - a.healthScore || a.name.localeCompare(b.name, "it"));

  const totalInstruments = snapshot.markets.length;
  const freshInstruments = snapshot.markets.filter((reading) => isFresh(reading, now)).length;
  const staleInstruments = totalInstruments - freshInstruments;
  const sources = new Set(snapshot.markets.map((reading) => reading.source).filter(Boolean));
  const freshnessScore = totalInstruments > 0 ? Math.round((freshInstruments / totalInstruments) * 100) : 0;
  const coverageScore = Math.round(clamp(assetClasses.length * 9 + Math.min(totalInstruments, 40) * 1.2));
  const sourceDiversityScore = Math.round(clamp(sources.size * 14));
  const providerScore = Math.round(average(providers.map((provider) => provider.healthScore)));
  const healthScore = Math.round(
    clamp(freshnessScore * 0.35 + coverageScore * 0.25 + sourceDiversityScore * 0.2 + providerScore * 0.2),
  );

  const blockers = [
    ...(totalInstruments === 0 ? ["Nessuno strumento disponibile."] : []),
    ...(freshnessScore < 40 ? ["Freschezza dati inferiore alla soglia minima del 40%."] : []),
    ...(sources.size < 2 ? ["Manca la conferma da almeno due fonti indipendenti."] : []),
    ...(healthScore < 45 ? ["Salute complessiva del Data Hub inferiore alla soglia minima."] : []),
  ];

  const signalGenerationAllowed = blockers.length === 0;
  const operatingStatus: DataHubOperatingStatus = !signalGenerationAllowed
    ? "bloccato"
    : healthScore >= 75 && freshnessScore >= 70
      ? "operativo"
      : "degradato";

  const recommendations = [
    ...(freshnessScore < 70 ? ["Aggiornare i feed di mercato prima della prossima analisi."] : []),
    ...(sources.size < 4 ? ["Aumentare la diversità delle fonti per ridurre il rischio di dati errati."] : []),
    ...(providers.some((provider) => provider.state === "errore") ? ["Ripristinare i provider in errore o sostituirli con una fonte alternativa."] : []),
    ...(assetClasses.length < 6 ? ["Ampliare la copertura ad almeno sei classi di attività."] : []),
  ];

  const warnings = [
    ...snapshot.warnings,
    ...(totalInstruments === 0 ? ["Nessuno strumento disponibile nel Global Data Hub."] : []),
    ...(freshnessScore < 60 ? ["Meno del 60% degli strumenti dispone di dati osservati nelle ultime 24 ore."] : []),
    ...(sources.size < 3 ? ["Diversità delle fonti insufficiente: servono almeno tre fonti indipendenti."] : []),
    ...(providers.some((provider) => provider.state === "errore") ? ["Uno o più provider risultano in errore."] : []),
  ];

  return {
    generatedAt,
    checkedAt: new Date(now).toISOString(),
    mode: snapshot.mode,
    headline: snapshot.headline,
    operatingStatus,
    signalGenerationAllowed,
    healthScore,
    freshnessScore,
    coverageScore,
    sourceDiversityScore,
    totalInstruments,
    freshInstruments,
    staleInstruments,
    uniqueSources: sources.size,
    assetClasses,
    providers,
    blockers: [...new Set(blockers)],
    recommendations: [...new Set(recommendations)],
    warnings: [...new Set(warnings)].slice(0, 20),
  };
}
