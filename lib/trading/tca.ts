import type { PaperExecution } from "./types.ts";

export type TcaReport = {
  fills: number;
  grossNotionalEuro: number;
  totalFeesEuro: number;
  totalSlippageEuro: number;
  implementationShortfallEuro: number;
  weightedSlippageBps: number;
};

export function calculateTransactionCosts(executions: PaperExecution[]): TcaReport {
  const fills = executions.filter((execution) => execution.status === "PAPER_FILLED" && execution.fillPrice !== null);
  let grossNotionalEuro = 0;
  let totalFeesEuro = 0;
  let totalSlippageEuro = 0;
  let weightedSlippageNumerator = 0;

  for (const execution of fills) {
    const notional = Math.abs(Number(execution.notionalEuro) || 0);
    const fee = Math.abs(Number(execution.estimatedFeeEuro) || 0);
    const slippage = Math.abs(Number(execution.estimatedSlippageEuro) || 0);
    const referencePrice = Number(execution.referencePrice);
    const fillPrice = Number(execution.fillPrice);
    const direction = execution.side === "BUY" ? 1 : -1;
    const slippageBps = referencePrice > 0
      ? direction * ((fillPrice - referencePrice) / referencePrice) * 10_000
      : 0;

    grossNotionalEuro += notional;
    totalFeesEuro += fee;
    totalSlippageEuro += slippage;
    weightedSlippageNumerator += slippageBps * notional;
  }

  const round = (value: number) => Number(value.toFixed(4));
  return {
    fills: fills.length,
    grossNotionalEuro: round(grossNotionalEuro),
    totalFeesEuro: round(totalFeesEuro),
    totalSlippageEuro: round(totalSlippageEuro),
    implementationShortfallEuro: round(totalFeesEuro + totalSlippageEuro),
    weightedSlippageBps: grossNotionalEuro > 0 ? round(weightedSlippageNumerator / grossNotionalEuro) : 0,
  };
}
