import type { PaperExecution } from "./types.ts";

export type TcaReport = {
  fills: number;
  invalidFills: number;
  grossNotionalEuro: number;
  referenceNotionalEuro: number;
  buyFills: number;
  sellFills: number;
  buyNotionalEuro: number;
  sellNotionalEuro: number;
  totalFeesEuro: number;
  feeCostBps: number;
  totalSlippageEuro: number;
  reportedEstimatedSlippageEuro: number;
  slippageEstimateErrorEuro: number;
  signedPriceImpactEuro: number;
  implementationShortfallEuro: number;
  implementationShortfallBps: number;
  weightedSlippageBps: number;
  absoluteSlippageP50Bps: number;
  absoluteSlippageP95Bps: number;
  favorableFills: number;
  adverseFills: number;
  flatFills: number;
};

function round(value: number, decimals = 4): number {
  return Number(value.toFixed(decimals));
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const position = Math.max(0, Math.min(1, percentileValue)) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function isValidFilledExecution(execution: PaperExecution): boolean {
  return execution?.status === "PAPER_FILLED"
    && Number.isFinite(Number(execution.fillPrice))
    && Number(execution.fillPrice) > 0
    && Number.isFinite(Number(execution.referencePrice))
    && Number(execution.referencePrice) > 0
    && Number.isFinite(Number(execution.filledQuantity))
    && Number(execution.filledQuantity) > 0
    && Number.isFinite(Number(execution.notionalEuro))
    && Math.abs(Number(execution.notionalEuro)) > 0
    && ["BUY", "SELL"].includes(String(execution.side));
}

/**
 * Transaction-cost analysis reconstructed from the actual simulated fill and
 * arrival/reference price. Reported estimated slippage is retained only as an
 * audit cross-check; it is not trusted as the primary realized-cost measure.
 */
export function calculateTransactionCosts(executions: PaperExecution[]): TcaReport {
  const allFilled = (Array.isArray(executions) ? executions : [])
    .filter((execution) => execution?.status === "PAPER_FILLED");
  const fills = allFilled.filter(isValidFilledExecution);
  const invalidFills = allFilled.length - fills.length;

  let grossNotionalEuro = 0;
  let referenceNotionalEuro = 0;
  let buyFills = 0;
  let sellFills = 0;
  let buyNotionalEuro = 0;
  let sellNotionalEuro = 0;
  let totalFeesEuro = 0;
  let totalSlippageEuro = 0;
  let reportedEstimatedSlippageEuro = 0;
  let signedPriceImpactEuro = 0;
  let weightedSlippageNumerator = 0;
  let favorableFills = 0;
  let adverseFills = 0;
  let flatFills = 0;
  const absoluteSlippageBps: number[] = [];

  for (const execution of fills) {
    const notional = Math.abs(Number(execution.notionalEuro));
    const fee = Math.abs(Number(execution.estimatedFeeEuro) || 0);
    const reportedSlippage = Math.abs(Number(execution.estimatedSlippageEuro) || 0);
    const referencePrice = Number(execution.referencePrice);
    const fillPrice = Number(execution.fillPrice);
    const direction = execution.side === "BUY" ? 1 : -1;
    const directionalSlippageBps = direction * ((fillPrice - referencePrice) / referencePrice) * 10_000;

    // notionalEuro is measured at the fill. Reconstruct the corresponding
    // reference notional without requiring FX to be stored again in the fill.
    const referenceNotional = notional * (referencePrice / fillPrice);
    const directionalPriceImpactEuro = direction * (notional - referenceNotional);
    const absolutePriceImpactEuro = Math.abs(directionalPriceImpactEuro);

    grossNotionalEuro += notional;
    referenceNotionalEuro += referenceNotional;
    totalFeesEuro += fee;
    totalSlippageEuro += absolutePriceImpactEuro;
    reportedEstimatedSlippageEuro += reportedSlippage;
    signedPriceImpactEuro += directionalPriceImpactEuro;
    weightedSlippageNumerator += directionalSlippageBps * referenceNotional;
    absoluteSlippageBps.push(Math.abs(directionalSlippageBps));

    if (execution.side === "BUY") {
      buyFills += 1;
      buyNotionalEuro += notional;
    } else {
      sellFills += 1;
      sellNotionalEuro += notional;
    }

    if (directionalSlippageBps > 1e-9) adverseFills += 1;
    else if (directionalSlippageBps < -1e-9) favorableFills += 1;
    else flatFills += 1;
  }

  const implementationShortfallEuro = signedPriceImpactEuro + totalFeesEuro;
  const feeCostBps = referenceNotionalEuro > 0 ? (totalFeesEuro / referenceNotionalEuro) * 10_000 : 0;
  const implementationShortfallBps = referenceNotionalEuro > 0
    ? (implementationShortfallEuro / referenceNotionalEuro) * 10_000
    : 0;

  return {
    fills: fills.length,
    invalidFills,
    grossNotionalEuro: round(grossNotionalEuro),
    referenceNotionalEuro: round(referenceNotionalEuro),
    buyFills,
    sellFills,
    buyNotionalEuro: round(buyNotionalEuro),
    sellNotionalEuro: round(sellNotionalEuro),
    totalFeesEuro: round(totalFeesEuro),
    feeCostBps: round(feeCostBps),
    totalSlippageEuro: round(totalSlippageEuro),
    reportedEstimatedSlippageEuro: round(reportedEstimatedSlippageEuro),
    slippageEstimateErrorEuro: round(reportedEstimatedSlippageEuro - totalSlippageEuro),
    signedPriceImpactEuro: round(signedPriceImpactEuro),
    implementationShortfallEuro: round(implementationShortfallEuro),
    implementationShortfallBps: round(implementationShortfallBps),
    weightedSlippageBps: referenceNotionalEuro > 0 ? round(weightedSlippageNumerator / referenceNotionalEuro) : 0,
    absoluteSlippageP50Bps: round(percentile(absoluteSlippageBps, 0.5)),
    absoluteSlippageP95Bps: round(percentile(absoluteSlippageBps, 0.95)),
    favorableFills,
    adverseFills,
    flatFills,
  };
}
