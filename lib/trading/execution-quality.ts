import { calculateTransactionCosts } from "./tca.ts";
import type { PaperExecution } from "./types.ts";

export type ExecutionQualityLimits = {
  minFills: number;
  watchSlippageCostBps: number;
  maxSlippageCostBps: number;
  watchImplementationShortfallBps: number;
  maxImplementationShortfallBps: number;
  watchP95AbsoluteSlippageBps: number;
  maxP95AbsoluteSlippageBps: number;
};

export type ExecutionQualityDecision = {
  state: "INSUFFICIENT" | "HEALTHY" | "WATCH" | "POOR";
  allowPilot: boolean;
  riskMultiplier: number;
  fills: number;
  invalidFills: number;
  grossNotionalEuro: number;
  referenceNotionalEuro: number;
  slippageCostBps: number | null;
  implementationShortfallBps: number | null;
  feeCostBps: number;
  weightedDirectionalSlippageBps: number;
  absoluteSlippageP50Bps: number;
  absoluteSlippageP95Bps: number;
  favorableFills: number;
  adverseFills: number;
  reasons: string[];
};

export const DEFAULT_EXECUTION_QUALITY_LIMITS: ExecutionQualityLimits = {
  minFills: 10,
  watchSlippageCostBps: 20,
  maxSlippageCostBps: 35,
  watchImplementationShortfallBps: 40,
  maxImplementationShortfallBps: 75,
  watchP95AbsoluteSlippageBps: 30,
  maxP95AbsoluteSlippageBps: 60,
};

function decisionPayload(report: ReturnType<typeof calculateTransactionCosts>, reasons: string[], state: ExecutionQualityDecision["state"], allowPilot: boolean, riskMultiplier: number): ExecutionQualityDecision {
  const basis = Number(report.referenceNotionalEuro || 0);
  const slippageCostBps = basis > 0 ? (Number(report.totalSlippageEuro || 0) / basis) * 10_000 : null;
  const implementationShortfallBps = basis > 0 ? Number(report.implementationShortfallBps || 0) : null;
  return {
    state,
    allowPilot,
    riskMultiplier,
    fills: report.fills,
    invalidFills: report.invalidFills,
    grossNotionalEuro: Number(report.grossNotionalEuro || 0),
    referenceNotionalEuro: basis,
    slippageCostBps: slippageCostBps === null ? null : Number(slippageCostBps.toFixed(2)),
    implementationShortfallBps: implementationShortfallBps === null ? null : Number(implementationShortfallBps.toFixed(2)),
    feeCostBps: Number(report.feeCostBps || 0),
    weightedDirectionalSlippageBps: Number(report.weightedSlippageBps || 0),
    absoluteSlippageP50Bps: Number(report.absoluteSlippageP50Bps || 0),
    absoluteSlippageP95Bps: Number(report.absoluteSlippageP95Bps || 0),
    favorableFills: Number(report.favorableFills || 0),
    adverseFills: Number(report.adverseFills || 0),
    reasons,
  };
}

export function evaluateExecutionQuality(
  executions: PaperExecution[],
  limits: ExecutionQualityLimits = DEFAULT_EXECUTION_QUALITY_LIMITS,
): ExecutionQualityDecision {
  const report = calculateTransactionCosts(Array.isArray(executions) ? executions : []);
  const basis = Number(report.referenceNotionalEuro || 0);
  const slippageCostBps = basis > 0 ? (Number(report.totalSlippageEuro || 0) / basis) * 10_000 : null;
  const implementationShortfallBps = basis > 0 ? Number(report.implementationShortfallBps || 0) : null;
  const p95 = Number(report.absoluteSlippageP95Bps || 0);
  const reasons: string[] = [];

  if (report.invalidFills > 0) {
    reasons.push(`${report.invalidFills} PAPER fill record(s) are structurally invalid; TCA fails closed`);
    return decisionPayload(report, reasons, "POOR", false, 0);
  }

  if (report.fills < Math.max(1, Number(limits.minFills || 1))) {
    reasons.push(`execution-quality sample ${report.fills} fill(s) < required ${limits.minFills}`);
    return decisionPayload(report, reasons, "INSUFFICIENT", false, 0);
  }

  const hardBreach = (slippageCostBps !== null && slippageCostBps > limits.maxSlippageCostBps)
    || (implementationShortfallBps !== null && implementationShortfallBps > limits.maxImplementationShortfallBps)
    || p95 > limits.maxP95AbsoluteSlippageBps;
  if (hardBreach) {
    if (slippageCostBps !== null && slippageCostBps > limits.maxSlippageCostBps) {
      reasons.push(`realized slippage cost ${slippageCostBps.toFixed(2)} bps > ${limits.maxSlippageCostBps} bps`);
    }
    if (implementationShortfallBps !== null && implementationShortfallBps > limits.maxImplementationShortfallBps) {
      reasons.push(`realized implementation shortfall ${implementationShortfallBps.toFixed(2)} bps > ${limits.maxImplementationShortfallBps} bps`);
    }
    if (p95 > limits.maxP95AbsoluteSlippageBps) {
      reasons.push(`p95 absolute slippage ${p95.toFixed(2)} bps > ${limits.maxP95AbsoluteSlippageBps} bps`);
    }
    return decisionPayload(report, reasons, "POOR", false, 0);
  }

  const watch = (slippageCostBps !== null && slippageCostBps > limits.watchSlippageCostBps)
    || (implementationShortfallBps !== null && implementationShortfallBps > limits.watchImplementationShortfallBps)
    || p95 > limits.watchP95AbsoluteSlippageBps;
  if (watch) {
    reasons.push("realized execution costs or tail slippage are elevated but remain inside hard limits");
  }

  return decisionPayload(report, reasons, watch ? "WATCH" : "HEALTHY", true, watch ? 0.75 : 1);
}
