import type { AutonomySnapshot, MarketReading } from "./autonomy";

export type MissionBucket = {
  id: "core" | "growth" | "reserve";
  label: string;
  targetPercent: number;
  targetAmount: number;
  rationale: string;
};

export type RankedAsset = MarketReading & {
  conviction: number;
  action: "ACCUMULA" | "MANTIENI" | "ATTENDI" | "EVITA";
  reason: string;
  scoreBreakdown: {
    opportunity: number;
    riskAdjusted: number;
    momentum: number;
    freshness: number;
    diversification: number;
    regimeFit: number;
  };
  entryReadiness: number;
  confidenceBand: "ALTA" | "MEDIA" | "BASSA";
  riskBand: "BASSO" | "MEDIO" | "ALTO" | "ESTREMO";
};

export type MissionControl = {
  generatedAt: string;
  capital: number;
  horizonYears: number;
  stretchGoal: number;
  requiredAnnualReturn: number;
  regime: "OFFENSIVO" | "BILANCIATO" | "DIFENSIVO";
  cashTargetPercent: number;
  buckets: MissionBucket[];
  rankedAssets: RankedAsset[];
  nextActions: string[];
  warnings: string[];
  dataQuality: number;
  freshnessStatus: "near-real-time" | "aggiornato" | "stale" | "non disponibile";
};

const CAPITAL = 10_000;
const GOAL = 100_000;
const YEARS = 10;
const stableSymbols = new Set(["USDT", "USDC", "DAI", "USDE", "USDS", "USD1", "USDG", "USYC", "PYUSD", "FDUSD", "TUSD", "USDP", "RLUSD", "EURC", "EURT"]);
const majorCrypto = new Set(["BTC", "ETH"]);
const speculativeCrypto = new Set(["DOGE", "SHIB", "PEPE", "WIF", "BONK"]);

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function requiredAnnualReturn() {
  return (Math.pow(GOAL / CAPITAL, 1 / YEARS) - 1) * 100;
}

function isStablecoin(asset: MarketReading) {
  const symbol = asset.symbol.toUpperCase();
  const name = asset.name.toLowerCase();
  return asset.classification === "stablecoin" || stableSymbols.has(symbol) || /stablecoin|global dollar|paypal usd/.test(name);
}

function freshnessScore(asset: MarketReading) {
  const raw = asset.observedAt ?? asset.updatedAt;
  if (!raw) return 42;
  const observedAt = new Date(raw).getTime();
  if (!Number.isFinite(observedAt)) return 40;
  const ageHours = Math.max(0, (Date.now() - observedAt) / 3_600_000);
  if (ageHours <= 6) return 100;
  if (ageHours <= 24) return 92;
  if (ageHours <= 72) return 74;
  if (ageHours <= 168) return 55;
  return 30;
}

function classAdjustment(asset: MarketReading) {
  const symbol = asset.symbol.toUpperCase();
  if (asset.assetClass === "ETF") return 7;
  if (asset.assetClass === "Obbligazioni") return 5;
  if (asset.assetClass === "Materie prime") return 3;
  if (asset.assetClass === "Azioni" || asset.assetClass === "Semiconduttori") return 4;
  if (asset.assetClass === "Biotech" || asset.assetClass === "AI Biotech") return 1;
  if (asset.assetClass === "Criptovaluta") {
    if (majorCrypto.has(symbol)) return -2;
    if (speculativeCrypto.has(symbol)) return -14;
    return -8;
  }
  return 0;
}

function thematicAdjustment(asset: MarketReading) {
  const themes = asset.themes ?? [];
  const sector = (asset.sector ?? "").toLowerCase();
  const strategic = new Set(["ai", "cybersecurity", "robotics", "nuclear", "uranium", "grid", "agritech", "gene-editing", "space", "defense", "power-infrastructure"]);
  const strategicThemes = themes.filter((theme) => strategic.has(theme.toLowerCase())).length;
  const diversificationBoost = ["financials", "consumer-staples", "agriculture", "energy", "utilities", "government-bonds", "gold"].includes(sector) ? 3 : 0;
  return Math.min(5, strategicThemes * 1.25) + diversificationBoost;
}

function momentumScore(asset: MarketReading) {
  const change = asset.changePercent ?? 0;
  // Fenice premia forza moderata, non euforia verticale.
  if (change >= 12) return 45;
  if (change >= 7) return 62;
  if (change >= 2) return 78;
  if (change >= -2) return 68;
  if (change >= -6) return 58;
  if (change >= -12) return 42;
  return 28;
}

function riskBand(risk: number): RankedAsset["riskBand"] {
  if (risk >= 82) return "ESTREMO";
  if (risk >= 65) return "ALTO";
  if (risk >= 42) return "MEDIO";
  return "BASSO";
}

function confidenceBand(score: number): RankedAsset["confidenceBand"] {
  if (score >= 75) return "ALTA";
  if (score >= 55) return "MEDIA";
  return "BASSA";
}

function regimeFit(asset: MarketReading, regime: MissionControl["regime"]) {
  const sector = (asset.sector ?? asset.assetClass ?? "").toLowerCase();
  const assetClass = asset.assetClass.toLowerCase();
  const growthSensitive = /technology|software|semicondutt|biotech|ai|growth/.test(`${sector} ${assetClass}`);
  const defensive = /utilities|consumer-staples|healthcare|government-bonds|obbligazioni|gold|materie prime/.test(`${sector} ${assetClass}`);

  if (regime === "OFFENSIVO") {
    if (growthSensitive) return 86;
    if (defensive) return 64;
    return 72;
  }
  if (regime === "DIFENSIVO") {
    if (defensive) return 86;
    if (growthSensitive) return 48;
    return 66;
  }
  return defensive || growthSensitive ? 72 : 68;
}

function actionFor(conviction: number, risk: number, readiness: number, confidence: number): RankedAsset["action"] {
  if (risk >= 82 || conviction < 34 || confidence < 40) return "EVITA";
  if (conviction >= 74 && risk <= 58 && readiness >= 68 && confidence >= 60) return "ACCUMULA";
  if (conviction >= 58 && risk <= 70 && confidence >= 50) return "MANTIENI";
  return "ATTENDI";
}

function rankAsset(asset: MarketReading, regime: MissionControl["regime"], dataQuality: number): RankedAsset {
  const opportunity = clamp(asset.score);
  const riskAdjusted = clamp(100 - asset.risk);
  const momentum = momentumScore(asset);
  const freshness = freshnessScore(asset);
  const diversification = clamp(55 + classAdjustment(asset) * 3 + thematicAdjustment(asset) * 4);
  const fit = regimeFit(asset, regime);

  const conviction = Math.round(
    clamp(
      opportunity * 0.36 +
        riskAdjusted * 0.24 +
        momentum * 0.11 +
        freshness * 0.1 +
        diversification * 0.08 +
        fit * 0.11,
    ),
  );

  const dataConfidence = clamp(dataQuality * 0.65 + freshness * 0.35);
  const entryReadiness = Math.round(
    clamp(
      conviction * 0.42 +
        riskAdjusted * 0.23 +
        momentum * 0.13 +
        freshness * 0.12 +
        fit * 0.1 -
        ((asset.changePercent ?? 0) > 8 ? 10 : 0),
    ),
  );

  const action = actionFor(conviction, asset.risk, entryReadiness, dataConfidence);
  const reason =
    action === "ACCUMULA"
      ? "Fenice Score 2.0 rileva convergenza tra qualità, rischio, regime e timing: candidato per ingresso progressivo, non per acquisto automatico."
      : action === "MANTIENI"
        ? "Tesi interessante e rischio gestibile, ma il vantaggio sul prezzo/timing non è ancora abbastanza ampio per aumentare con decisione."
        : action === "ATTENDI"
          ? "Il candidato merita attenzione, ma rischio, timing, regime o qualità dati non superano ancora la soglia di ingresso Fenice."
          : "Il rapporto rischio/rendimento o la qualità informativa non supera i guardrail Fenice.";

  return {
    ...asset,
    conviction,
    action,
    reason,
    scoreBreakdown: {
      opportunity: Math.round(opportunity),
      riskAdjusted: Math.round(riskAdjusted),
      momentum: Math.round(momentum),
      freshness: Math.round(freshness),
      diversification: Math.round(diversification),
      regimeFit: Math.round(fit),
    },
    entryReadiness,
    confidenceBand: confidenceBand(dataConfidence),
    riskBand: riskBand(asset.risk),
  };
}

function selectDiversifiedAssets(markets: MarketReading[], regime: MissionControl["regime"], dataQuality: number) {
  const ranked = markets
    .filter((asset) => !isStablecoin(asset))
    .map((asset) => rankAsset(asset, regime, dataQuality))
    .sort((a, b) => b.conviction - a.conviction || b.entryReadiness - a.entryReadiness || a.risk - b.risk);

  const selected: RankedAsset[] = [];
  const selectedKeys = new Set<string>();
  const sectorCount = new Map<string, number>();
  const regionCount = new Map<string, number>();
  const classCount = new Map<string, number>();

  const canAdd = (asset: RankedAsset) => {
    const key = `${asset.symbol}:${asset.source}`;
    if (selectedKeys.has(key)) return false;
    const sector = asset.sector || asset.assetClass || "other";
    const region = asset.region || "unknown";
    const assetClass = asset.assetClass || "other";
    if ((sectorCount.get(sector) ?? 0) >= 3) return false;
    if (region === "US" && (regionCount.get(region) ?? 0) >= 6) return false;
    if (assetClass === "Criptovaluta" && (classCount.get(assetClass) ?? 0) >= 1) return false;
    if (asset.risk >= 82 && selected.some((item) => item.risk >= 82)) return false;
    return true;
  };

  const add = (asset: RankedAsset) => {
    const key = `${asset.symbol}:${asset.source}`;
    selected.push(asset);
    selectedKeys.add(key);
    const sector = asset.sector || asset.assetClass || "other";
    const region = asset.region || "unknown";
    const assetClass = asset.assetClass || "other";
    sectorCount.set(sector, (sectorCount.get(sector) ?? 0) + 1);
    regionCount.set(region, (regionCount.get(region) ?? 0) + 1);
    classCount.set(assetClass, (classCount.get(assetClass) ?? 0) + 1);
  };

  const preferredGroups = [
    ranked.filter((asset) => ["ETF", "Obbligazioni", "Materie prime"].includes(asset.assetClass)),
    ranked.filter((asset) => !["ETF", "Obbligazioni", "Materie prime", "Criptovaluta"].includes(asset.assetClass)),
    ranked.filter((asset) => asset.assetClass === "Criptovaluta"),
  ];

  for (const group of preferredGroups) {
    for (const asset of group) {
      if (selected.length >= 12) break;
      if (canAdd(asset)) add(asset);
    }
  }

  for (const asset of ranked) {
    if (selected.length >= 12) break;
    if (canAdd(asset)) add(asset);
  }

  return selected.sort((a, b) => b.conviction - a.conviction || b.entryReadiness - a.entryReadiness || a.risk - b.risk).slice(0, 12);
}

export function buildMissionControl(snapshot: AutonomySnapshot): MissionControl {
  const opportunity = snapshot.pulse.opportunity;
  const risk = snapshot.pulse.risk;
  const confidence = snapshot.dataQuality ?? snapshot.pulse.confidence;

  const regime: MissionControl["regime"] =
    risk >= 65 || confidence < 45
      ? "DIFENSIVO"
      : opportunity >= 65 && risk <= 50 && confidence >= 70
        ? "OFFENSIVO"
        : "BILANCIATO";

  const cashTargetPercent = regime === "DIFENSIVO" ? 30 : regime === "OFFENSIVO" ? 10 : 20;
  const growthPercent = regime === "OFFENSIVO" ? 40 : regime === "DIFENSIVO" ? 20 : 30;
  const corePercent = 100 - cashTargetPercent - growthPercent;
  const dataQuality = Math.round(clamp(confidence));

  const buckets: MissionBucket[] = [
    {
      id: "core",
      label: "Nucleo globale diversificato",
      targetPercent: corePercent,
      targetAmount: Math.round((CAPITAL * corePercent) / 100),
      rationale: "ETF, leader globali e strumenti diversificanti per sostenere la crescita composta senza dipendere da una singola narrativa.",
    },
    {
      id: "growth",
      label: "Migliori opportunità globali",
      targetPercent: growthPercent,
      targetAmount: Math.round((CAPITAL * growthPercent) / 100),
      rationale: "Il capitale va soltanto dove Fenice rileva un vantaggio concreto: AI, biotech, energia, difesa, agritech, robotica o qualunque altro settore.",
    },
    {
      id: "reserve",
      label: "Riserva strategica",
      targetPercent: cashTargetPercent,
      targetAmount: Math.round((CAPITAL * cashTargetPercent) / 100),
      rationale: "Liquidità intenzionale per correzioni, sostituzioni, shock macro/geopolitici e opportunità ad alta convinzione.",
    },
  ];

  const rankedAssets = selectDiversifiedAssets(snapshot.markets, regime, dataQuality);
  const accumula = rankedAssets.filter((asset) => asset.action === "ACCUMULA").length;
  const avoid = rankedAssets.filter((asset) => asset.action === "EVITA").length;
  const highReadiness = rankedAssets.filter((asset) => asset.entryReadiness >= 70 && asset.action === "ACCUMULA").length;

  const nextActions = [
    `Mantenere la liquidità obiettivo al ${cashTargetPercent}% nel regime ${regime.toLowerCase()}.`,
    highReadiness > 0
      ? `${highReadiness} strumenti superano anche la soglia di timing: approfondire prezzo, fondamentali e catalizzatori prima dell'ordine.`
      : "Nessun candidato supera ancora contemporaneamente qualità e timing: non forzare ingressi.",
    accumula > 0
      ? `Sono presenti ${accumula} segnali ACCUMULA, ma vanno verificati prima di qualunque ordine reale.`
      : "Non forzare nuovi ingressi finché non emerge un segnale ACCUMULA verificato.",
    "Confrontare ogni nuova posizione con la migliore alternativa disponibile nel radar globale.",
    "Limitare ogni singola posizione ad alto rischio al 3-5% del capitale e le posizioni core al 8-12% salvo eccezioni motivate.",
  ];

  const warnings = [
    ...snapshot.warnings,
    ...(avoid > 0 ? [`${avoid} strumenti mostrano un rapporto rischio/rendimento insufficiente.`] : []),
    ...(dataQuality < 60 ? ["Copertura dati insufficiente: nessuna decisione forte senza conferma aggiuntiva."] : []),
    ...(snapshot.freshness?.status === "stale" ? ["Dati non abbastanza freschi: congelare nuovi segnali operativi."] : []),
  ];

  return {
    generatedAt: snapshot.generatedAt ?? new Date().toISOString(),
    capital: CAPITAL,
    horizonYears: YEARS,
    stretchGoal: GOAL,
    requiredAnnualReturn: Number(requiredAnnualReturn().toFixed(1)),
    regime,
    cashTargetPercent,
    buckets,
    rankedAssets,
    nextActions,
    warnings: [...new Set(warnings)].slice(0, 12),
    dataQuality,
    freshnessStatus: snapshot.freshness?.status ?? "non disponibile",
  };
}
