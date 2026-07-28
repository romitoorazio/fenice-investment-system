import type { AutonomySnapshot, DiscoverySignal, MarketReading } from "./autonomy";

export type DiscoveryCandidate = {
  id: string;
  symbol: string;
  name: string;
  category: string;
  source: string;
  observedAt: string | null;
  opportunityScore: number;
  riskScore: number;
  confidenceScore: number;
  priorityScore: number;
  status: "PRIORITARIA" | "DA STUDIARE" | "OSSERVARE" | "SCARTARE";
  thesis: string;
  evidence: string[];
  blockers: string[];
};

export type DiscoveryReport = {
  generatedAt: string;
  mode: AutonomySnapshot["mode"];
  candidateCount: number;
  priorityCount: number;
  studyCount: number;
  averageConfidence: number;
  candidates: DiscoveryCandidate[];
  warnings: string[];
  methodology: string[];
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

function freshnessScore(date?: string | null) {
  if (!date) return 35;
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return 30;
  const hours = Math.max(0, (Date.now() - timestamp) / 3_600_000);
  if (hours <= 24) return 100;
  if (hours <= 72) return 80;
  if (hours <= 168) return 60;
  return 30;
}

function marketCandidate(asset: MarketReading): DiscoveryCandidate {
  const freshness = freshnessScore(asset.observedAt ?? asset.updatedAt);
  const opportunity = clamp(asset.score);
  const risk = clamp(asset.risk);
  const sourceConfidence = /SEC|FRED|FDA|EDGAR|official/i.test(asset.source) ? 92 : /Alpha Vantage|CoinGecko/i.test(asset.source) ? 82 : 72;
  const confidence = Math.round(clamp(freshness * 0.45 + sourceConfidence * 0.35 + (asset.price != null ? 20 : 5)));
  const priority = Math.round(clamp(opportunity * 0.5 + (100 - risk) * 0.25 + confidence * 0.25));
  const blockers = [
    ...(risk >= 78 ? ["Rischio superiore alla soglia Fenice."] : []),
    ...(confidence < 55 ? ["Confidenza dati insufficiente."] : []),
    ...(asset.price == null ? ["Prezzo corrente non disponibile."] : []),
  ];
  const status: DiscoveryCandidate["status"] = blockers.length > 0 || priority < 42
    ? "SCARTARE"
    : priority >= 72 && opportunity >= 68 && risk <= 60 && confidence >= 70
      ? "PRIORITARIA"
      : priority >= 58
        ? "DA STUDIARE"
        : "OSSERVARE";
  const evidence = [
    `Punteggio opportunità ${Math.round(opportunity)}/100.`,
    `Rischio ${Math.round(risk)}/100.`,
    `Confidenza dati ${confidence}/100.`,
    ...(asset.changePercent != null ? [`Variazione osservata ${asset.changePercent.toFixed(2)}%.`] : []),
    `Fonte: ${asset.source}.`,
  ];
  return {
    id: `market:${asset.symbol}:${asset.source}`,
    symbol: asset.symbol,
    name: asset.name,
    category: asset.assetClass,
    source: asset.source,
    observedAt: asset.observedAt ?? asset.updatedAt ?? null,
    opportunityScore: Math.round(opportunity),
    riskScore: Math.round(risk),
    confidenceScore: confidence,
    priorityScore: priority,
    status,
    thesis: status === "PRIORITARIA"
      ? "Convergenza favorevole tra opportunità, rischio e qualità dei dati: merita analisi fondamentale e catalizzatori."
      : status === "DA STUDIARE"
        ? "Profilo interessante, ma servono conferme aggiuntive prima di considerare un ingresso."
        : status === "OSSERVARE"
          ? "Segnale ancora incompleto: mantenere in osservazione senza allocare capitale."
          : "Il rapporto rischio, qualità e opportunità non supera i guardrail Fenice.",
    evidence,
    blockers,
  };
}

function signalCandidate(signal: DiscoverySignal): DiscoveryCandidate {
  const freshness = freshnessScore(signal.date);
  const opportunity = clamp(signal.score);
  const risk = clamp(signal.risk);
  const official = /SEC|FDA|EDGAR|NASDAQ|NYSE|company/i.test(signal.source);
  const confidence = Math.round(clamp(freshness * 0.45 + (official ? 45 : 30) + (signal.url ? 10 : 0)));
  const priority = Math.round(clamp(opportunity * 0.55 + (100 - risk) * 0.2 + confidence * 0.25));
  const blockers = [
    ...(risk >= 82 ? ["Rischio evento troppo elevato."] : []),
    ...(confidence < 55 ? ["Segnale non sufficientemente verificato."] : []),
    ...(!signal.url && !official ? ["Manca un riferimento verificabile."] : []),
  ];
  const status: DiscoveryCandidate["status"] = blockers.length > 0 || priority < 42
    ? "SCARTARE"
    : priority >= 72 && opportunity >= 68 && risk <= 65
      ? "PRIORITARIA"
      : priority >= 58
        ? "DA STUDIARE"
        : "OSSERVARE";
  return {
    id: signal.id,
    symbol: signal.id,
    name: signal.name,
    category: signal.category,
    source: signal.source,
    observedAt: signal.date ?? null,
    opportunityScore: Math.round(opportunity),
    riskScore: Math.round(risk),
    confidenceScore: confidence,
    priorityScore: priority,
    status,
    thesis: signal.signal,
    evidence: [`Categoria ${signal.category}.`, `Fonte: ${signal.source}.`, ...(signal.date ? [`Data: ${signal.date}.`] : [])],
    blockers,
  };
}

export function buildDiscoveryReport(snapshot: AutonomySnapshot): DiscoveryReport {
  const candidates = [
    ...snapshot.markets.map(marketCandidate),
    ...snapshot.discoveries.map(signalCandidate),
  ]
    .sort((a, b) => b.priorityScore - a.priorityScore || a.riskScore - b.riskScore)
    .slice(0, 50);

  const averageConfidence = candidates.length
    ? Math.round(candidates.reduce((sum, item) => sum + item.confidenceScore, 0) / candidates.length)
    : 0;

  return {
    generatedAt: snapshot.generatedAt ?? new Date().toISOString(),
    mode: snapshot.mode,
    candidateCount: candidates.length,
    priorityCount: candidates.filter((item) => item.status === "PRIORITARIA").length,
    studyCount: candidates.filter((item) => item.status === "DA STUDIARE").length,
    averageConfidence,
    candidates,
    warnings: [...new Set([
      ...snapshot.warnings,
      ...(snapshot.discoveries.length === 0 ? ["Nessun evento esterno strutturato disponibile: il ranking usa prevalentemente dati di mercato."] : []),
      ...(averageConfidence < 60 ? ["Confidenza media Discovery inferiore al 60%."] : []),
    ])].slice(0, 15),
    methodology: [
      "Nessun candidato viene promosso usando una sola metrica.",
      "La priorità combina opportunità, rischio, freschezza e affidabilità della fonte.",
      "Rischio elevato o dati insufficienti bloccano automaticamente la promozione.",
      "PRIORITARIA significa da approfondire, non da comprare automaticamente.",
    ],
  };
}
