export type KillSwitchInputs = {
  manualEngaged?: boolean;
  reconciliationBreaks?: number;
  consecutiveExecutionErrors?: number;
  staleCriticalSources?: number;
  dailyLossPercent?: number;
  dataConfidence?: number;
  auditChainValid?: boolean;
};

export type KillSwitchDecision = {
  engaged: boolean;
  reasons: string[];
};

export const KILL_SWITCH_LIMITS = {
  maxReconciliationBreaks: 0,
  maxConsecutiveExecutionErrors: 2,
  maxStaleCriticalSources: 0,
  maxDailyLossPercent: 4,
  minDataConfidence: 90,
} as const;

export function evaluateKillSwitch(inputs: KillSwitchInputs): KillSwitchDecision {
  const reasons: string[] = [];

  if (inputs.manualEngaged === true) reasons.push("manual kill switch engaged");
  if (inputs.auditChainValid === false) reasons.push("audit chain integrity failure");
  if (Number(inputs.reconciliationBreaks || 0) > KILL_SWITCH_LIMITS.maxReconciliationBreaks) {
    reasons.push("unresolved reconciliation break detected");
  }
  if (Number(inputs.consecutiveExecutionErrors || 0) > KILL_SWITCH_LIMITS.maxConsecutiveExecutionErrors) {
    reasons.push("execution error threshold exceeded");
  }
  if (Number(inputs.staleCriticalSources || 0) > KILL_SWITCH_LIMITS.maxStaleCriticalSources) {
    reasons.push("critical source is stale");
  }
  if (Math.abs(Number(inputs.dailyLossPercent || 0)) >= KILL_SWITCH_LIMITS.maxDailyLossPercent) {
    reasons.push("daily loss threshold reached");
  }
  if (Number(inputs.dataConfidence ?? 0) < KILL_SWITCH_LIMITS.minDataConfidence) {
    reasons.push("data confidence below kill-switch threshold");
  }

  return { engaged: reasons.length > 0, reasons };
}
