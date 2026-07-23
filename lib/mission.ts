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
};

const CAPITAL = 10_000;
const GOAL = 100_000;
const YEARS = 10;

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function requiredAnnualReturn() {
  return (Math.pow(GOAL / CAPITAL, 1 / YEARS) - 1) * 100;
}

function actionFor(conviction: number, risk: number): RankedAsset["action"] {
  if (risk >= 75 || conviction < 35) return "EVITA";
  if (conviction >= 72 && risk <= 55) return "ACCUMULA";
  if (conviction >= 55) return "MANTIENI";
  return "ATTENDI";
}

function rankAsset(asset: MarketReading): RankedAsset {
  const momentum = clamp((asset.changePercent ?? 0) * 2 + 50);
  const conviction = Math.round(
    clamp(asset.score * 0.55 + (100 - asset.risk) * 0.3 + momentum * 0.15),
  );
  const action = actionFor(conviction, asset.risk);
  const reason =
    action === "ACCUMULA"
      ? "Punteggio elevato, rischio sotto controllo e momentum favorevole."
      : action === "MANTIENI"
        ? "Tesi ancora valida, ma senza margine sufficiente per aumentare con decisione."
        : action === "ATTENDI"
          ? "Qualità interessante, ma rischio o prezzo richiedono pazienza."
          : "Rapporto rischio/rendimento insufficiente secondo i dati disponibili.";

  return { ...asset, conviction, action, reason };
}

export function buildMissionControl(snapshot: AutonomySnapshot): MissionControl {
  const opportunity = snapshot.pulse.opportunity;
  const risk = snapshot.pulse.risk;
  const confidence = snapshot.pulse.confidence;

  const regime: MissionControl["regime"] =
    risk >= 65 || confidence < 45
      ? "DIFENSIVO"
      : opportunity >= 65 && risk <= 50
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

  const rankedAssets = snapshot.markets
    .map(rankAsset)
    .sort((a, b) => b.conviction - a.conviction)
    .slice(0, 12);

  const accumula = rankedAssets.filter((asset) => asset.action === "ACCUMULA").length;
  const avoid = rankedAssets.filter((asset) => asset.action === "EVITA").length;
  const providerQuality = snapshot.providers.length
    ? snapshot.providers.filter((provider) => provider.state === "operativo").length / snapshot.providers.length
    : 0;
  const dataQuality = Math.round(clamp(providerQuality * 70 + confidence * 0.3));

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
    warnings,
    dataQuality,
  };
}
