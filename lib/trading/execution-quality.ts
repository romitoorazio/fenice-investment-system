import { calculateTransactionCosts } from "./tca.ts";
import type { PaperExecution } from "./types.ts";

export type ExecutionQualityLimits = {
  minFills: number;
  watchSlippageCostBps: number;
  maxSlippageCostBps: number;
  watchImplementationShortfallBps: number;
  maxImplementationShortfallBps: number;
};

export type ExecutionQualityDecision = {
  state: "INSUFFICIENT" | "HEALTHY" | "WATCH" | "POOR";
  allowPilot: boolean;
  riskMultiplier: number;
  fills: number;
  grossNotionalEuro: number;
  slippageCostBps: number | null;
  implementationShortfallBps: number | null;
  weightedDirectionalSlippageBps: number;
  reasons: string[];
};

export const DEFAULT_EXECUTION_QUALITY_LIMITS: ExecutionQualityLimits = {
  minFills: 10,
  watchSlippageCostBps: 20,
  maxSlippageCostBps: 35,
  watchImplementationShortfallBps: 40,
  maxImplementationShortfallBps: 75,
};

export function evaluateExecutionQuality(
  executions: PaperExecution[],
  limits: ExecutionQualityLimits = DEFAULT_EXECUTION_QUALITY_LIMITS,
): ExecutionQualityDecision {
  const report = calculateTransactionCosts(Array.isArray(executions) ? executions : []);
  const gross = Number(report.grossNotionalEuro || 0);
  const slippageCostBps = gross > 0 ? (Number(report.totalSlippageEuro || 0) / gross) * 10_000 : null;
  const implementationShortfallBps = gross > 0 ? (Number(report.implementationShortfallEuro || 0) / gross) * 10_000 : null;
  const reasons: string[] = [];

  if (report.fills < Math.max(1, Number(limits.minFills || 1))) {
    reasons.push(`execution-quality sample ${report.fills} fill(s) < required ${limits.minFills}`);
    return {
      state: "INSUFFICIENT",
      allowPilot: false,
      riskMultiplier: 0,
      fills: report.fills,
      grossNotionalEuro: gross,
      slippageCostBps: slippageCostBps === null ? null : Number(slippageCostBps.toFixed(2)),
      implementationShortfallBps: implementationShortfallBps === null ? null : Number(implementationShortfallBps.toFixed(2)),
      weightedDirectionalSlippageBps: report.weightedSlippageBps,
      reasons,
    };
  }

  const hardBreach = (slippageCostBps !== null && slippageCostBps > limits.maxSlippageCostBps)
    || (implementationShortfallBps !== null && implementationShortfallBps > limits.maxImplementationShortfallBps);
  if (hardBreach) {
    if (slippageCostBps !== null && slippageCostBps > limits.maxSlippageCostBps) {
      reasons.push(`slippage cost ${slippageCostBps.toFixed(2)} bps > ${limits.maxSlippageCostBps} bps`);
    }
    if (implementationShortfallBps !== null && implementationShortfallBps > limits.maxImplementationShortfallBps) {
      reasons.push(`implementation shortfall ${implementationShortfallBps.toFixed(2)} bps > ${limits.maxImplementationShortfallBps} bps`);
    }
    return {
      state: "POOR",
      allowPilot: false,
      riskMultiplier: 0,
      fills: report.fills,
      grossNotionalEuro: gross,
      slippageCostBps: slippageCostBps === null ? null : Number(slippageCostBps.toFixed(2)),
      implementationShortfallBps: implementationShortfallBps === null ? null : Number(implementationShortfallBps.toFixed(2)),
      weightedDirectionalSlippageBps: report.weightedSlippageBps,
      reasons,
    };
  }

  const watch = (slippageCostBps !== null && slippageCostBps > limits.watchSlippageCostBps)
    || (implementationShortfallBps !== null && implementationShortfallBps > limits.watchImplementationShortfallBps);
  if (watch) reasons.push("execution costs are elevated but remain inside hard limits");

  return {
    state: watch ? "WATCH" : "HEALTHY",
    allowPilot: true,
    riskMultiplier: watch ? 0.75 : 1,
    fills: report.fills,
    grossNotionalEuro: gross,
    slippageCostBps: slippageCostBps === null ? null : Number(slippageCostBps.toFixed(2)),
    implementationShortfallBps: implementationShortfallBps === null ? null : Number(implementationShortfallBps.toFixed(2)),
    weightedDirectionalSlippageBps: report.weightedSlippageBps,
    reasons,
  };
}
