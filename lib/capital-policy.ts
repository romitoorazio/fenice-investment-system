import type { TerminalReport, UnifiedAsset } from "@/lib/terminal";

const round = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

function category(asset: UnifiedAsset): "core" | "growth" | "speculative" {
  if (["ETF", "Obbligazioni", "Materie prime"].includes(asset.assetClass)) return "core";
  if (asset.businessStage === "pre-commerciale" || asset.assetClass === "Criptovaluta" || asset.decision === "SPECULATIVA") return "speculative";
  return "growth";
}

function speculativeEligible(asset: UnifiedAsset) {
  return (
    asset.decision === "SPECULATIVA" &&
    asset.unifiedScore >= 40 &&
    asset.confidence >= 60 &&
    asset.riskScore <= 90 &&
    asset.technical.signal !== "NEGATIVO" &&
    !["obsoleto", "non disponibile"].includes(asset.technical.freshness?.status ?? "non disponibile")
  );
}

export function applyFinalCapitalPolicy(input: TerminalReport): TerminalReport {
  const report = structuredClone(input);
  let releasedSpeculativeWeight = 0;

  for (const asset of report.assets) {
    const invalidDecision = ["ATTENDI", "EVITA"].includes(asset.decision);
    const invalidSpeculative = category(asset) === "speculative" && !speculativeEligible(asset);
    if ((invalidDecision || invalidSpeculative) && asset.targetWeightPercent > 0) {
      if (invalidSpeculative) releasedSpeculativeWeight += asset.targetWeightPercent;
      asset.targetWeightPercent = 0;
      asset.targetAmountEuro = 0;
    }
  }

  const totals = {
    core: round(report.assets.filter((asset) => category(asset) === "core").reduce((sum, asset) => sum + asset.targetWeightPercent, 0)),
    growth: round(report.assets.filter((asset) => category(asset) === "growth").reduce((sum, asset) => sum + asset.targetWeightPercent, 0)),
    speculative: round(report.assets.filter((asset) => category(asset) === "speculative").reduce((sum, asset) => sum + asset.targetWeightPercent, 0)),
  };
  const invested = round(totals.core + totals.growth + totals.speculative);
  const reserve = round(Math.max(0, 100 - invested));
  const capital = Number(report.capitalEuro || 10_000);

  report.portfolio = [
    {
      id: "core",
      label: "Nucleo diversificato",
      targetPercent: totals.core,
      targetAmountEuro: Math.round(capital * totals.core / 100),
      rationale: "ETF, obbligazioni e strumenti ampi realmente eleggibili.",
    },
    {
      id: "growth",
      label: "Crescita selezionata",
      targetPercent: totals.growth,
      targetAmountEuro: Math.round(capital * totals.growth / 100),
      rationale: "Azioni con decisione ACCUMULA o MANTIENI e limiti di concentrazione.",
    },
    {
      id: "speculative",
      label: "Opportunità speculative",
      targetPercent: totals.speculative,
      targetAmountEuro: Math.round(capital * totals.speculative / 100),
      rationale: "Capitale assegnato solo con score ≥40, confidenza ≥60, rischio ≤90 e segnale non negativo.",
    },
    {
      id: "reserve",
      label: "Riserva strategica",
      targetPercent: reserve,
      targetAmountEuro: Math.round(capital * reserve / 100),
      rationale: "Liquidità liberata da ATTENDI/EVITA, limiti di rischio e speculative non qualificate.",
    },
  ];
  report.allocationCheck = {
    investedPercent: invested,
    reservePercent: reserve,
    totalPercent: round(invested + reserve),
    valid: Math.abs(invested + reserve - 100) <= 0.2,
  };

  const core = report.assets.filter((asset) => category(asset) === "core");
  const growth = report.assets.filter((asset) => category(asset) === "growth");
  const speculative = report.assets.filter((asset) => category(asset) === "speculative");
  const maxCore = Math.max(0, ...core.map((asset) => asset.targetWeightPercent));
  const maxGrowth = Math.max(0, ...growth.map((asset) => asset.targetWeightPercent));
  const maxSpeculative = Math.max(0, ...speculative.map((asset) => asset.targetWeightPercent));
  const cryptoTotal = round(report.assets.filter((asset) => asset.assetClass === "Criptovaluta").reduce((sum, asset) => sum + asset.targetWeightPercent, 0));
  const violations: string[] = [];
  if (maxCore > 20.001) violations.push("Limite singola posizione core superato.");
  if (maxGrowth > 7.001) violations.push("Limite singola posizione growth superato.");
  if (maxSpeculative > 2.501) violations.push("Limite singola posizione speculativa superato.");
  if (cryptoTotal > 5.001) violations.push("Limite crypto complessivo superato.");
  if (totals.speculative > 5.001) violations.push("Limite area speculativa superato.");
  if (!report.allocationCheck.valid) violations.push("Allocazione totale diversa dal 100%.");
  report.guardrails = {
    maxCoreWeightPercent: round(maxCore),
    maxGrowthWeightPercent: round(maxGrowth),
    maxSpeculativeWeightPercent: round(maxSpeculative),
    cryptoTotalPercent: cryptoTotal,
    speculativeTotalPercent: totals.speculative,
    violations,
  };

  report.warnings = [...new Set([
    ...(report.warnings ?? []).filter((warning) => !warning.startsWith("Quota speculativa trasferita")),
    ...(releasedSpeculativeWeight > 0
      ? [`Quota speculativa trasferita alla riserva: ${round(releasedSpeculativeWeight)}% non superava le soglie minime di qualità.`]
      : []),
    ...violations,
  ])];
  return report;
}
