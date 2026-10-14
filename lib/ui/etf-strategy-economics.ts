/**
 * FENICE100K: empirical ETF strategy comparisons using ONLY existing
 * terminal backtests. No provider calls, valuation guesses or broker actions.
 *
 * A strong strategy is not one with many signals: it must beat a comparable
 * buy-and-hold reference net of the modeled friction, on a separate sample.
 * This module cannot prove independent out-of-sample performance.
 */
export type StrategyObservation = {
  id: string;
  label?: string;
  annualizedReturnPercent?: number | null;
  totalReturnPercent?: number | null;
  maxDrawdownPercent?: number | null;
  observations?: number | null;
  trades?: number | null;
  transactionCostPercent?: number | null;
  exposurePercent?: number | null;
};
export type EtfTerminalAsset = {
  symbol?: string;
  name?: string;
  assetClass?: string;
  technical?: {
    strategies?: StrategyObservation[];
    observedAt?: string;
    timestampSemantics?: string;
  };
};
export type EtfComparedStrategy = {
  id: string;
  label: string;
  annualizedReturnPercent: number;
  maxDrawdownPercent: number;
  annualizedGapVersusHoldPoints: number;
  drawdownReductionPoints: number;
  trades: number;
  exposurePercent: number | null;
  outperformedHold: boolean;
};
export type EtfEconomicComparison = {
  symbol: string;
  name: string;
  observedAt: string | null;
  observationCount: number;
  reference: { annualizedReturnPercent: number; maxDrawdownPercent: number };
  assumedPerTradeCostPercent: number;
  alternatives: EtfComparedStrategy[];
  bestAlternative: EtfComparedStrategy;
  finding: "BUY_AND_HOLD_OUTPERFORMED" | "TACTICAL_OUTPERFORMED_IN_BACKTEST";
  independentForwardValidation: false;
  sourceContainsActualDirectaFees: false;
  returnForecastPercent: null;
  changesCommitteeScore: false;
  tradingAllowed: false;
};
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const bounded = (x: unknown, low: number, high: number): x is number =>
  finite(x) && x >= low && x <= high;
const n2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const admissible = (row: StrategyObservation): boolean =>
  typeof row.id === "string" &&
  bounded(row.annualizedReturnPercent, -100, 10000) &&
  bounded(row.maxDrawdownPercent, -100, 0) &&
  Number.isSafeInteger(row.observations ?? NaN) && (row.observations ?? 0) >= 100 &&
  Number.isSafeInteger(row.trades ?? NaN) && (row.trades ?? -1) >= 0 &&
  bounded(row.transactionCostPercent, 0, 20) &&
  (row.exposurePercent === undefined || bounded(row.exposurePercent, 0, 100));

export function buildEtfStrategyLab(
  assets: readonly EtfTerminalAsset[] | null | undefined,
  maxEtfs = 6,
): EtfEconomicComparison[] {
  if (!Array.isArray(assets) || !Number.isSafeInteger(maxEtfs) || maxEtfs < 1) return [];
  const output: EtfEconomicComparison[] = [];
  const seen = new Set<string>();
  for (const asset of assets) {
    if (String(asset?.assetClass || "").toUpperCase() !== "ETF") continue;
    const symbol = typeof asset.symbol === "string" ? asset.symbol.trim().toUpperCase() : "";
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    const list = asset.technical?.strategies;
    if (!Array.isArray(list)) continue;
    const base = list.find(s => s?.id === "buy-hold");
    if (!base || !admissible(base) || !bounded(base.exposurePercent, 0, 100)) continue;
    // Only apples-to-apples backtests: same observation window and assumed
    // transaction cost as the source buy-hold reference. No interpolation.
    const validAlts = list.filter(row => row?.id !== "buy-hold" && row && admissible(row)
      && row.observations === base.observations
      && row.transactionCostPercent === base.transactionCostPercent
      && row.id !== "buy-hold");
    if (validAlts.length === 0) continue;
    const alternatives: EtfComparedStrategy[] = validAlts.map(row => {
      const relative = n2((row.annualizedReturnPercent as number) - (base.annualizedReturnPercent as number));
      return {
        id: row.id,
        label: typeof row.label === "string" && row.label.trim() ? row.label.trim() : row.id,
        annualizedReturnPercent: row.annualizedReturnPercent as number,
        maxDrawdownPercent: row.maxDrawdownPercent as number,
        annualizedGapVersusHoldPoints: relative,
        drawdownReductionPoints: n2(Math.abs(base.maxDrawdownPercent as number) - Math.abs(row.maxDrawdownPercent as number)),
        trades: row.trades as number,
        exposurePercent: bounded(row.exposurePercent, 0, 100) ? row.exposurePercent : null,
        outperformedHold: relative > 0,
      };
    }).sort((a,b)=>b.annualizedReturnPercent-a.annualizedReturnPercent||a.trades-b.trades);
    const bestAlternative = alternatives[0];
    output.push({
      symbol,
      name: typeof asset.name === "string" ? asset.name : symbol,
      observedAt: typeof asset.technical?.observedAt === "string" ? asset.technical.observedAt : null,
      observationCount: base.observations as number,
      reference: {
        annualizedReturnPercent: base.annualizedReturnPercent as number,
        maxDrawdownPercent: base.maxDrawdownPercent as number,
      },
      assumedPerTradeCostPercent: base.transactionCostPercent as number,
      alternatives,
      bestAlternative,
      finding: bestAlternative.outperformedHold ? "TACTICAL_OUTPERFORMED_IN_BACKTEST" : "BUY_AND_HOLD_OUTPERFORMED",
      independentForwardValidation: false,
      sourceContainsActualDirectaFees: false,
      returnForecastPercent: null,
      changesCommitteeScore: false,
      tradingAllowed: false,
    });
  }
  return output.slice(0,maxEtfs);
}
