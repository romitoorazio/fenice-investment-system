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

function freshnessPenalty(asset: MarketReading) {
  if (!asset.observedAt) return 4;
  const observedAt = new Date(asset.observedAt).getTime();
  if (!Number.isFinite(observedAt)) return 4;
  const ageHours = (Date.now() - observedAt) / 3_600_000;
  if (ageHours <= 24) return 0;
  if (ageHours <= 72) return 3;
  return 8;
}

function classAdjustment(asset: MarketReading) {
  const symbol = asset.symbol.toUpperCase();
  if (asset.assetClass === "ETF") return 6;
  if (asset.assetClass === "Obbligazioni" || asset.assetClass === "Materie prime") return 3;
  if (asset.assetClass === "Azioni" || asset.assetClass === "Semiconduttori") return 4;
  if (asset.assetClass === "Biotech" || asset.assetClass === "AI Biotech") return 1;
  if (asset.assetClass === "Criptovaluta") {
    if (majorCrypto.has(symbol)) return -2;
    if (speculativeCrypto.has(symbol)) return -12;
    return -7;
  }
  return 0;
}

function actionFor(conviction: number, risk: number): RankedAsset["action"] {
  if (risk >= 78 || conviction < 35) return "EVITA";
  if (conviction >= 72 && risk <= 55) return "ACCUMULA";
  if (conviction >= 56 && risk <= 68) return "MANTIENI";
  return "ATTENDI";
}

function rankAsset(asset: MarketReading): RankedAsset {
  const momentum = clamp((asset.changePercent ?? 0) * 2 + 50);
  const conviction = Math.round(
    clamp(
      asset.score * 0.55 +
        (100 - asset.risk) * 0.3 +
        momentum * 0.15 +
        classAdjustment(asset) -
        freshnessPenalty(asset),
    ),
  );
  const action = actionFor(conviction, asset.risk);
  const reason =
    action === "ACCUMULA"
      ? "Punteggio elevato, rischio sotto controllo, dati sufficientemente freschi e momentum favorevole."
      : action === "MANTIENI"
        ? "Tesi valida e rischio accettabile, ma il margine non giustifica un aumento deciso."
        : action === "ATTENDI"
          ? "Qualità interessante, ma rischio, prezzo o freschezza dei dati richiedono pazienza."
          : "Rapporto rischio/rendimento insufficiente secondo i dati disponibili.";

  return { ...asset, conviction, action, reason };
}

function selectDiversifiedAssets(markets: MarketReading[]) {
  const ranked = markets
    .filter((asset) => !isStablecoin(asset))
    .map(rankAsset)
    .sort((a, b) => b.conviction - a.conviction || a.risk - b.risk);

  const core = ranked
    .filter((asset) => ["ETF", "Obbligazioni", "Materie prime"].includes(asset.assetClass))
    .slice(0, 3);
  const growth = ranked
    .filter((asset) => !["ETF", "Obbligazioni", "Materie prime", "Criptovaluta"].includes(asset.assetClass))
    .slice(0, 6);
  const crypto = ranked
    .filter((asset) => asset.assetClass === "Criptovaluta")
    .slice(0, 3);

  const selected = [...core, ...growth, ...crypto];
  const selectedKeys = new Set(selected.map((asset) => `${asset.symbol}:${asset.source}`));

  for (const asset of ranked) {
    if (selected.length >= 12) break;
    const key = `${asset.symbol}:${asset.source}`;
    if (selectedKeys.has(key)) continue;
    if (asset.assetClass === "Criptovaluta" && selected.filter((item) => item.assetClass === "Criptovaluta").length >= 3) continue;
    selected.push(asset);
    selectedKeys.add(key);
  }

  return selected
    .sort((a, b) => b.conviction - a.conviction || a.risk - b.risk)
    .slice(0, 12);
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

  const cashTargetPercent = regime === "DIFENSIVO" ? 25 : regime === "OFFENSIVO" ? 10 : 15;
  const growthPercent = regime === "OFFENSIVO" ? 35 : regime === "DIFENSIVO" ? 20 : 30;
  const corePercent = 100 - cashTargetPercent - growthPercent;

  const buckets: MissionBucket[] = [
    {
      id: "core",
      label: "Nucleo diversificato",
      targetPercent: corePercent,
      targetAmount: Math.round((CAPITAL * corePercent) / 100),
      rationale: "ETF globali e strumenti ampi per sostenere la crescita composta.",
    },
    {
      id: "growth",
      label: "Opportunità ad alto potenziale",
      targetPercent: growthPercent,
      targetAmount: Math.round((CAPITAL * growthPercent) / 100),
      rationale: "AI, biotech, robotica, energia e altri temi selezionati dal motore.",
    },
    {
      id: "reserve",
      label: "Riserva strategica",
      targetPercent: cashTargetPercent,
      targetAmount: Math.round((CAPITAL * cashTargetPercent) / 100),
      rationale: "Liquidità per correzioni, sostituzioni e nuove opportunità.",
    },
  ];

  const rankedAssets = selectDiversifiedAssets(snapshot.markets);
  const accumula = rankedAssets.filter((asset) => asset.action === "ACCUMULA").length;
  const avoid = rankedAssets.filter((asset) => asset.action === "EVITA").length;
  const dataQuality = Math.round(clamp(confidence));

  const nextActions = [
    `Mantenere la liquidità obiettivo al ${cashTargetPercent}%.`,
    accumula > 0
      ? `Valutare ingressi progressivi su ${accumula} strumenti con segnale ACCUMULA.`
      : "Non forzare nuovi ingressi finché non emerge un segnale ACCUMULA.",
    "Limitare ogni singola posizione ad alto rischio al 5-7% del capitale totale.",
    "Riesaminare il piano dopo ogni aggiornamento trimestrale o variazione strutturale del rischio.",
  ];

  const warnings = [
    ...snapshot.warnings,
    ...(avoid > 0 ? [`${avoid} strumenti mostrano un rapporto rischio/rendimento insufficiente.`] : []),
    ...(dataQuality < 60 ? ["Copertura dati insufficiente: nessuna decisione forte senza conferma aggiuntiva."] : []),
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
