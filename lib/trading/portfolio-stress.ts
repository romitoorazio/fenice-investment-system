export type FactorExposureMap = Record<string, number>;

export type StressPosition = {
  symbol: string;
  notionalEuro: number;
  factorExposures?: FactorExposureMap;
};

export type StressScenario = {
  id: string;
  label: string;
  factorShocksPercent: FactorExposureMap;
  directSymbolShocksPercent?: Record<string, number>;
};

export type PortfolioStressLimits = {
  maxScenarioLossPercent: number;
  defensiveLossPercent: number;
  cautionLossPercent: number;
  minFactorCoveragePercent: number;
  materialGrossExposurePercent: number;
};

export type StressScenarioResult = {
  id: string;
  label: string;
  pnlEuro: number;
  lossPercentCapital: number;
  shockedPositions: number;
};

export type PortfolioStressDecision = {
  state: "NORMAL" | "CAUTION" | "DEFENSIVE" | "FREEZE";
  allowNewRisk: boolean;
  riskMultiplier: number;
  grossExposurePercent: number;
  factorCoveragePercent: number;
  worstScenarioId: string | null;
  worstScenarioLossPercent: number;
  scenarios: StressScenarioResult[];
  reasons: string[];
};

export const DEFAULT_PORTFOLIO_STRESS_LIMITS: PortfolioStressLimits = {
  maxScenarioLossPercent: 10,
  defensiveLossPercent: 7,
  cautionLossPercent: 4,
  minFactorCoveragePercent: 80,
  materialGrossExposurePercent: 20,
};

const finitePositive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;
const finite = (value: unknown) => Number.isFinite(Number(value));

function normalizeFactorMap(input?: FactorExposureMap): FactorExposureMap {
  const out: FactorExposureMap = {};
  for (const [rawKey, rawValue] of Object.entries(input || {})) {
    const key = String(rawKey || "").trim().toUpperCase();
    const value = Number(rawValue);
    if (!key || !Number.isFinite(value)) continue;
    out[key] = value;
  }
  return out;
}

export function evaluatePortfolioStress(
  capitalEuro: number,
  rawPositions: readonly StressPosition[],
  rawScenarios: readonly StressScenario[],
  limits: PortfolioStressLimits = DEFAULT_PORTFOLIO_STRESS_LIMITS,
): PortfolioStressDecision {
  const capital = Number(capitalEuro);
  const reasons: string[] = [];
  if (!finitePositive(capital)) {
    return {
      state: "FREEZE",
      allowNewRisk: false,
      riskMultiplier: 0,
      grossExposurePercent: 999,
      factorCoveragePercent: 0,
      worstScenarioId: null,
      worstScenarioLossPercent: 999,
      scenarios: [],
      reasons: ["invalid portfolio capital; fail-closed"],
    };
  }

  const positions = rawPositions
    .filter((position) => position?.symbol && finitePositive(position.notionalEuro))
    .map((position) => ({
      symbol: String(position.symbol).trim().toUpperCase(),
      notionalEuro: Math.abs(Number(position.notionalEuro)),
      factorExposures: normalizeFactorMap(position.factorExposures),
    }));

  const scenarios = rawScenarios
    .filter((scenario) => scenario?.id && scenario?.label)
    .map((scenario) => ({
      ...scenario,
      id: String(scenario.id),
      label: String(scenario.label),
      factorShocksPercent: normalizeFactorMap(scenario.factorShocksPercent),
      directSymbolShocksPercent: Object.fromEntries(
        Object.entries(scenario.directSymbolShocksPercent || {})
          .map(([symbol, shock]) => [String(symbol).trim().toUpperCase(), Number(shock)])
          .filter(([symbol, shock]) => Boolean(symbol) && Number.isFinite(shock)),
      ),
    }));

  if (scenarios.length === 0) {
    return {
      state: "FREEZE",
      allowNewRisk: false,
      riskMultiplier: 0,
      grossExposurePercent: Number((positions.reduce((sum, p) => sum + p.notionalEuro, 0) / capital * 100).toFixed(2)),
      factorCoveragePercent: 0,
      worstScenarioId: null,
      worstScenarioLossPercent: 999,
      scenarios: [],
      reasons: ["no stress scenarios configured; fail-closed"],
    };
  }

  const grossEuro = positions.reduce((sum, position) => sum + position.notionalEuro, 0);
  const grossExposurePercent = grossEuro / capital * 100;
  const coveredEuro = positions
    .filter((position) => Object.keys(position.factorExposures).length > 0)
    .reduce((sum, position) => sum + position.notionalEuro, 0);
  const factorCoveragePercent = grossEuro > 0 ? coveredEuro / grossEuro * 100 : 100;

  const results: StressScenarioResult[] = [];
  for (const scenario of scenarios) {
    let pnlEuro = 0;
    let shockedPositions = 0;
    for (const position of positions) {
      const directShock = scenario.directSymbolShocksPercent[position.symbol];
      let shockPercent: number | null = finite(directShock) ? Number(directShock) : null;
      if (shockPercent === null) {
        let aggregateShock = 0;
        let matchedFactor = false;
        for (const [factor, exposure] of Object.entries(position.factorExposures)) {
          const factorShock = scenario.factorShocksPercent[factor];
          if (!finite(factorShock)) continue;
          aggregateShock += Number(exposure) * Number(factorShock);
          matchedFactor = true;
        }
        if (matchedFactor) shockPercent = aggregateShock;
      }
      if (shockPercent === null) continue;
      shockedPositions += 1;
      pnlEuro += position.notionalEuro * shockPercent / 100;
    }
    const lossPercentCapital = Math.max(0, -pnlEuro / capital * 100);
    results.push({
      id: scenario.id,
      label: scenario.label,
      pnlEuro: Number(pnlEuro.toFixed(2)),
      lossPercentCapital: Number(lossPercentCapital.toFixed(2)),
      shockedPositions,
    });
  }

  const worst = results.reduce<StressScenarioResult | null>(
    (current, item) => !current || item.lossPercentCapital > current.lossPercentCapital ? item : current,
    null,
  );
  const worstLoss = worst?.lossPercentCapital ?? 0;

  const coverageInsufficient = grossExposurePercent >= limits.materialGrossExposurePercent
    && factorCoveragePercent < limits.minFactorCoveragePercent;
  if (coverageInsufficient) {
    reasons.push(`factor stress coverage ${factorCoveragePercent.toFixed(2)}% < ${limits.minFactorCoveragePercent}% for materially invested portfolio`);
  }
  if (worstLoss > limits.maxScenarioLossPercent) {
    reasons.push(`worst stress loss ${worstLoss.toFixed(2)}% > ${limits.maxScenarioLossPercent}%`);
  }

  if (coverageInsufficient || worstLoss > limits.maxScenarioLossPercent) {
    return {
      state: "FREEZE",
      allowNewRisk: false,
      riskMultiplier: 0,
      grossExposurePercent: Number(grossExposurePercent.toFixed(2)),
      factorCoveragePercent: Number(factorCoveragePercent.toFixed(2)),
      worstScenarioId: worst?.id ?? null,
      worstScenarioLossPercent: Number(worstLoss.toFixed(2)),
      scenarios: results,
      reasons,
    };
  }

  const state = worstLoss >= limits.defensiveLossPercent
    ? "DEFENSIVE"
    : worstLoss >= limits.cautionLossPercent
      ? "CAUTION"
      : "NORMAL";
  const riskMultiplier = state === "DEFENSIVE" ? 0.5 : state === "CAUTION" ? 0.75 : 1;
  if (state !== "NORMAL") reasons.push(`portfolio stress state ${state}: worst loss ${worstLoss.toFixed(2)}%`);

  return {
    state,
    allowNewRisk: true,
    riskMultiplier,
    grossExposurePercent: Number(grossExposurePercent.toFixed(2)),
    factorCoveragePercent: Number(factorCoveragePercent.toFixed(2)),
    worstScenarioId: worst?.id ?? null,
    worstScenarioLossPercent: Number(worstLoss.toFixed(2)),
    scenarios: results,
    reasons,
  };
}
