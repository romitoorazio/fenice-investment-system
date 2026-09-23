import type { BrokerReconciliationReport } from "./broker-reconciliation.ts";
import type { BrokerWatchdogReport } from "./watchdog.ts";

export type RecoveryInput = {
  auditChainValid: boolean;
  reconciliation: BrokerReconciliationReport;
  watchdog: BrokerWatchdogReport;
  unresolvedInternalOrders: number;
  ambiguousExecutionState: boolean;
};

export type RecoveryDecision = {
  status: "RECOVERY_OK_FOR_PAPER_SHADOW" | "RECOVERY_BLOCKED";
  paperShadowAllowed: boolean;
  liveAllowed: false;
  reasons: string[];
};

/**
 * Restart recovery is intentionally stricter than normal operation. Any
 * ambiguity forces a manual/reconciliation path. This function can never
 * authorize live execution.
 */
export function evaluateRecovery(input: RecoveryInput): RecoveryDecision {
  const reasons: string[] = [];
  if (!input.auditChainValid) reasons.push("audit chain integrity is not valid");
  if (!input.reconciliation.balanced) reasons.push("broker reconciliation is not balanced");
  if (!input.watchdog.safeForShadow) reasons.push("broker watchdog is not healthy enough for shadow mode");
  if (!Number.isFinite(input.unresolvedInternalOrders) || input.unresolvedInternalOrders > 0) {
    reasons.push("unresolved internal orders require recovery review");
  }
  if (input.ambiguousExecutionState) reasons.push("ambiguous execution state must be resolved before resuming");

  const paperShadowAllowed = reasons.length === 0;
  return {
    status: paperShadowAllowed ? "RECOVERY_OK_FOR_PAPER_SHADOW" : "RECOVERY_BLOCKED",
    paperShadowAllowed,
    liveAllowed: false,
    reasons,
  };
}
