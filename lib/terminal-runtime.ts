import type { FreshnessStatus, TerminalDecision, TerminalReport, UnifiedAsset } from "@/lib/terminal";

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const round = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

function freshnessPenalty(status?: FreshnessStatus) {
  if (status === "aggiornato") return 2;
  if (status === "ritardato") return 8;
  if (status === "obsoleto") return 20;
  if (status === "non disponibile") return 25;
  return 0;
}

function currentFreshness(asset: UnifiedAsset) {
  const observed = new Date(asset.technical.observedAt || 0).getTime();
  if (!Number.isFinite(observed) || observed <= 0) return { ageHours: 9999, status: "non disponibile" as FreshnessStatus, penalty: 25 };
  const ageHours = Math.max(0, (Date.now() - observed) / 3_600_000);
  const crypto = asset.assetClass === "Criptovaluta";
  const nearLimit = crypto ? 36 : 48;
  const updatedLimit = crypto ? 72 : 96;
  const delayedLimit = crypto ? 120 : 168;
  if (ageHours <= nearLimit) return { ageHours: round(ageHours), status: "quasi in tempo reale" as FreshnessStatus, penalty: 0 };
  if (ageHours <= updatedLimit) return { ageHours: round(ageHours), status: "aggiornato" as FreshnessStatus, penalty: 2 };
  if (ageHours <= delayedLimit) return { ageHours: round(ageHours), status: "ritardato" as FreshnessStatus, penalty: 8 };
  return { ageHours: round(ageHours), status: "obsoleto" as FreshnessStatus, penalty: 20 };
}

function decisionFor(asset: UnifiedAsset): TerminalDecision {
  if (asset.businessStage === "pre-commerciale") return "SPECULATIVA";
  const freshness = asset.technical.freshness?.status;
  const overvalued = asset.valuation.status === "disponibile" && Number(asset.valuation.upsideBasePercent) <= -20;
  if (freshness === "obsoleto" || freshness === "non disponibile") return asset.unifiedScore >= 48 ? "ATTENDI" : "EVITA";
  if (["NEGATIVO", "DEBOLE"].includes(asset.technical.signal) || overvalued) return asset.unifiedScore >= 48 ? "ATTENDI" : "EVITA";
  const threshold = asset.assetClass === "ETF" ? 72 : 76;
  const valuationAcceptable = asset.valuation.status !== "disponibile" || Number(asset.valuation.upsideBasePercent) >= -10;
  if (asset.unifiedScore >= threshold && asset.confidence >= 75 && asset.riskScore <= 58 && ["FORTE", "POSITIVO"].includes(asset.technical.signal) && valuationAcceptable) return "ACCUMULA";
  if (asset.unifiedScore >= 63 && asset.riskScore <= 72 && asset.technical.signal !== "NEGATIVO") return "MANTIENI";
  return asset.unifiedScore >= 48 ? "ATTENDI" : "EVITA";
}

function reasonFor(asset: UnifiedAsset) {
  if (asset.decision === "ACCUMULA") return "Convergenza positiva tra punteggio, trend, rischio, freschezza e valutazione; eventuale ingresso soltanto graduale.";
  if (asset.decision === "MANTIENI") return "La tesi resta valida, ma non tutte le condizioni giustificano un incremento deciso.";
  if (asset.decision === "SPECULATIVA") return "Società pre-commerciale o asset ad alta incertezza: eventuale esposizione minima e subordinata a catalizzatori verificati.";
  if (asset.technical.freshness?.status === "obsoleto" || asset.technical.freshness?.status === "non disponibile") return "Dati troppo vecchi per una decisione operativa: il segnale è sospeso.";
  if (["NEGATIVO", "DEBOLE"].includes(asset.technical.signal)) return "Il quadro tecnico non conferma ancora la tesi fondamentale o la valutazione.";
  if (asset.valuation.status === "disponibile" && Number(asset.valuation.upsideBasePercent) <= -20) return "La valutazione indica un margine di sicurezza insufficiente nonostante altri fattori positivi.";
  if (asset.decision === "ATTENDI") return "Il quadro complessivo non offre ancora una convergenza sufficiente per un nuovo ingresso.";
  return "Rapporto rischio/rendimento insufficiente secondo i dati disponibili.";
}

function category(asset: UnifiedAsset): "core" | "growth" | "speculative" {
  if (["ETF", "Obbligazioni", "Materie prime"].includes(asset.assetClass)) return "core";
  if (asset.businessStage === "pre-commerciale" || asset.assetClass === "Criptovaluta") return "speculative";
  return "growth";
}

function policyFor(report: TerminalReport) {
  const regime = String(report.marketRegime || "").toUpperCase();
  if (/CAUTO|DIFENSIVO|ATTENDERE/.test(regime) || report.dataQuality < 60) return { core: 55, growth: 15, speculative: 5, reserve: 25 };
  if (/OFFENSIVO/.test(regime) && report.dataQuality >= 75) return { core: 50, growth: 35, speculative: 5, reserve: 10 };
  return { core: 55, growth: 25, speculative: 5, reserve: 15 };
}

function distribute(candidates: UnifiedAsset[], target: number, cap: number) {
  let remaining = target;
  const active = candidates.map((asset) => ({ asset, room: cap }));
  for (let iteration = 0; iteration < 10 && remaining > 0.001 && active.length; iteration += 1) {
    const denominator = active.reduce((sum, item) => sum + Math.max(1, item.asset.unifiedScore - 45), 0);
    let allocated = 0;
    for (let index = active.length - 1; index >= 0; index -= 1) {
      const item = active[index];
      const desired = remaining * (Math.max(1, item.asset.unifiedScore - 45) / denominator);
      const addition = Math.min(item.room, desired);
      item.asset.targetWeightPercent += addition;
      item.room -= addition;
      allocated += addition;
      if (item.room <= 0.001) active.splice(index, 1);
    }
    if (allocated <= 0.001) break;
    remaining -= allocated;
  }
}

function trimRoundedTotal(assets: UnifiedAsset[], maximum: number) {
  let total = round(assets.reduce((sum, asset) => sum + asset.targetWeightPercent, 0));
  if (total <= maximum) return;
  const ordered = [...assets].sort((left, right) => left.unifiedScore - right.unifiedScore || right.riskScore - left.riskScore);
  let excess = round(total - maximum);
  for (const asset of ordered) {
    if (excess <= 0) break;
    const reduction = Math.min(asset.targetWeightPercent, excess);
    asset.targetWeightPercent = round(asset.targetWeightPercent - reduction);
    excess = round(excess - reduction);
  }
  total = round(assets.reduce((sum, asset) => sum + asset.targetWeightPercent, 0));
  if (total > maximum && ordered.length) {
    ordered[0].targetWeightPercent = round(Math.max(0, ordered[0].targetWeightPercent - (total - maximum)));
  }
}

function allocate(report: TerminalReport) {
  const policy = policyFor(report);
  for (const asset of report.assets) {
    asset.targetWeightPercent = 0;
    asset.targetAmountEuro = 0;
  }
  const eligible = report.assets.filter((asset) => ["ACCUMULA", "MANTIENI", "SPECULATIVA"].includes(asset.decision));
  distribute(eligible.filter((asset) => category(asset) === "core"), policy.core, 20);
  distribute(eligible.filter((asset) => category(asset) === "growth"), policy.growth, 7);
  distribute(eligible.filter((asset) => category(asset) === "speculative"), policy.speculative, 2.5);
  for (const asset of report.assets) asset.targetWeightPercent = round(asset.targetWeightPercent);
  trimRoundedTotal(report.assets.filter((asset) => category(asset) === "core"), policy.core);
  trimRoundedTotal(report.assets.filter((asset) => category(asset) === "growth"), policy.growth);
  trimRoundedTotal(report.assets.filter((asset) => category(asset) === "speculative"), policy.speculative);
  trimRoundedTotal(report.assets.filter((asset) => asset.assetClass === "Criptovaluta"), 5);
  for (const asset of report.assets) asset.targetAmountEuro = Math.round(report.capitalEuro * asset.targetWeightPercent / 100);
  const invested = round(report.assets.reduce((sum, asset) => sum + asset.targetWeightPercent, 0));
  const reserve = round(Math.max(0, 100 - invested));
  const totals = {
    core: round(report.assets.filter((asset) => category(asset) === "core").reduce((sum, asset) => sum + asset.targetWeightPercent, 0)),
    growth: round(report.assets.filter((asset) => category(asset) === "growth").reduce((sum, asset) => sum + asset.targetWeightPercent, 0)),
    speculative: round(report.assets.filter((asset) => category(asset) === "speculative").reduce((sum, asset) => sum + asset.targetWeightPercent, 0)),
  };
  report.portfolio = [
    { id: "core", label: "Nucleo diversificato", targetPercent: totals.core, targetAmountEuro: Math.round(report.capitalEuro * totals.core / 100), rationale: "ETF, obbligazioni e strumenti ampi realmente eleggibili." },
    { id: "growth", label: "Crescita selezionata", targetPercent: totals.growth, targetAmountEuro: Math.round(report.capitalEuro * totals.growth / 100), rationale: "Azioni con decisione ACCUMULA o MANTIENI e limiti di concentrazione." },
    { id: "speculative", label: "Opportunità speculative", targetPercent: totals.speculative, targetAmountEuro: Math.round(report.capitalEuro * totals.speculative / 100), rationale: "Biotech pre-commerciali e crypto, massimo 2,5% per singolo strumento e 5% complessivo." },
    { id: "reserve", label: "Riserva strategica", targetPercent: reserve, targetAmountEuro: Math.round(report.capitalEuro * reserve / 100), rationale: "Liquidità liberata dagli strumenti in ATTENDI/EVITA e dai limiti di rischio." },
  ];
  report.allocationCheck = { investedPercent: invested, reservePercent: reserve, totalPercent: round(invested + reserve), valid: Math.abs(invested + reserve - 100) <= 0.2 };
}

function guardrails(report: TerminalReport) {
  const core = report.assets.filter((asset) => category(asset) === "core");
  const growth = report.assets.filter((asset) => category(asset) === "growth");
  const speculative = report.assets.filter((asset) => category(asset) === "speculative");
  const maxCore = Math.max(0, ...core.map((asset) => asset.targetWeightPercent));
  const maxGrowth = Math.max(0, ...growth.map((asset) => asset.targetWeightPercent));
  const maxSpeculative = Math.max(0, ...speculative.map((asset) => asset.targetWeightPercent));
  const crypto = report.assets.filter((asset) => asset.assetClass === "Criptovaluta").reduce((sum, asset) => sum + asset.targetWeightPercent, 0);
  const speculativeTotal = speculative.reduce((sum, asset) => sum + asset.targetWeightPercent, 0);
  const violations: string[] = [];
  if (maxCore > 20.001) violations.push("Limite singola posizione core superato.");
  if (maxGrowth > 7.001) violations.push("Limite singola posizione growth superato.");
  if (maxSpeculative > 2.501) violations.push("Limite singola posizione speculativa superato.");
  if (crypto > 5.001) violations.push("Limite crypto complessivo superato.");
  if (speculativeTotal > 5.001) violations.push("Limite area speculativa superato.");
  if (!report.allocationCheck?.valid) violations.push("Allocazione totale diversa dal 100%.");
  report.guardrails = {
    maxCoreWeightPercent: round(maxCore),
    maxGrowthWeightPercent: round(maxGrowth),
    maxSpeculativeWeightPercent: round(maxSpeculative),
    cryptoTotalPercent: round(crypto),
    speculativeTotalPercent: round(speculativeTotal),
    violations,
  };
}

export function buildRuntimeTerminal(input: TerminalReport, alertsCount = 0): TerminalReport {
  const report = structuredClone(input);
  let fresh = 0;
  let delayed = 0;
  let obsolete = 0;
  for (const asset of report.assets) {
    const previousPenalty = freshnessPenalty(asset.technical.freshness?.status);
    const rawScore = asset.rawUnifiedScore ?? clamp(asset.unifiedScore + previousPenalty);
    const rawConfidence = asset.rawConfidence ?? clamp(asset.confidence + previousPenalty * 1.2);
    const freshness = currentFreshness(asset);
    asset.rawUnifiedScore = rawScore;
    asset.rawConfidence = rawConfidence;
    asset.technical.freshness = { ageHours: freshness.ageHours, status: freshness.status };
    asset.unifiedScore = Math.round(clamp(rawScore - freshness.penalty));
    asset.confidence = Math.round(clamp(rawConfidence - freshness.penalty * 1.2));
    asset.decision = decisionFor(asset);
    asset.reason = reasonFor(asset);
    asset.technical.warnings = [...new Set([
      ...(asset.technical.warnings || []),
      ...(freshness.status === "ritardato" ? [`Prezzo giornaliero ritardato di circa ${freshness.ageHours} ore.`] : []),
      ...(["obsoleto", "non disponibile"].includes(freshness.status) ? ["Dato non utilizzabile per una decisione operativa."] : []),
    ])];
    asset.warnings = [...new Set([...(asset.warnings || []), ...asset.technical.warnings])];
    if (["quasi in tempo reale", "aggiornato"].includes(freshness.status)) fresh += 1;
    else if (freshness.status === "ritardato") delayed += 1;
    else obsolete += 1;
  }
  report.assets.sort((left, right) => right.unifiedScore - left.unifiedScore || left.riskScore - right.riskScore);
  allocate(report);
  guardrails(report);
  report.validatedAt = new Date().toISOString();
  report.freshAssetCount = fresh;
  report.freshnessStatus = obsolete ? "obsoleto" : delayed ? "ritardato" : fresh === report.assets.length ? "aggiornato" : "non disponibile";
  report.alertsCount = alertsCount;
  report.averageUnifiedScore = report.assets.length ? Math.round(report.assets.reduce((sum, asset) => sum + asset.unifiedScore, 0) / report.assets.length) : 0;
  report.dataQuality = Math.round(clamp(report.dataQuality - delayed * 1.5 - obsolete * 4));
  report.warnings = [...new Set([
    ...(report.warnings || []).filter((warning) => !/Limite area speculativa superato|Limite crypto complessivo superato/.test(warning)),
    ...(report.guardrails?.violations || []),
    ...(delayed ? [`${delayed} strumenti hanno dati ritardati.`] : []),
    ...(obsolete ? [`${obsolete} strumenti hanno dati obsoleti o non disponibili.`] : []),
  ])];
  return report;
}
