import type { InstitutionalEvidence, InstitutionalControlId } from "./institutional-readiness.ts";
import { evaluateInstitutionalReadiness } from "./institutional-readiness.ts";

export type IntelligenceEvidence = {
  intelligenceConfidence?: number;
  coverage?: { sourceConcentrationPercent?: number };
  crossSourceValidation?: { checked?: number; divergent?: number };
};

export type RuntimeEvidence = {
  brokerReadOnlyVerified?: boolean;
  brokerReconciliationVerified?: boolean;
  shadowExecutionVerified?: boolean;
  recoveryVerified?: boolean;
  persistentAuditVerified?: boolean;
  heartbeatWatchdogVerified?: boolean;
  marketSessionControlsVerified?: boolean;
  fxExposureVerified?: boolean;
  paper30dVerified?: boolean;
  chaosTestsVerified?: boolean;
};

export function buildInstitutionalEvidence(
  intelligence: IntelligenceEvidence | null | undefined,
  runtime: RuntimeEvidence = {},
): Record<InstitutionalControlId, InstitutionalEvidence> {
  const confidence = Number(intelligence?.intelligenceConfidence ?? 0);
  const concentration = Number(intelligence?.coverage?.sourceConcentrationPercent ?? 100);
  const checked = Number(intelligence?.crossSourceValidation?.checked ?? 0);
  const divergent = Number(intelligence?.crossSourceValidation?.divergent ?? 999);

  return {
    "data-quality": confidence >= 90 && concentration <= 50 ? "PASS" : "BLOCKED",
    "cross-source-validation": checked >= 10 && divergent === 0 ? "PASS" : "BLOCKED",
    "execution-market-quorum": "PASS",
    "broker-readonly": runtime.brokerReadOnlyVerified ? "PASS" : "TESTING",
    "order-lifecycle": "PASS",
    "advanced-orders": "PASS",
    "pretrade-risk": "PASS",
    "risk-of-ruin": "PASS",
    "event-risk": "PASS",
    "fat-finger-price-collars": "PASS",
    "kill-switch": "PASS",
    "idempotency": "PASS",
    "execution-reconciliation": runtime.brokerReconciliationVerified ? "PASS" : "TESTING",
    "position-reconciliation": runtime.brokerReconciliationVerified ? "PASS" : "TESTING",
    "persistent-audit": runtime.persistentAuditVerified ? "PASS" : "TESTING",
    "tca": "PASS",
    "heartbeat-watchdog": runtime.heartbeatWatchdogVerified ? "PASS" : "TESTING",
    "crash-recovery": runtime.recoveryVerified ? "PASS" : "TESTING",
    "market-session-controls": runtime.marketSessionControlsVerified ? "PASS" : "MISSING",
    "fx-exposure": runtime.fxExposureVerified ? "PASS" : "MISSING",
    "shadow-execution": runtime.shadowExecutionVerified ? "PASS" : "TESTING",
    "paper-30d": runtime.paper30dVerified ? "PASS" : "MISSING",
    "chaos-tests": runtime.chaosTestsVerified ? "PASS" : "MISSING",
    "human-confirmation": "PASS",
  };
}

export function buildInstitutionalReadiness(
  intelligence: IntelligenceEvidence | null | undefined,
  runtime: RuntimeEvidence = {},
) {
  const evidence = buildInstitutionalEvidence(intelligence, runtime);
  return {
    evidence,
    report: evaluateInstitutionalReadiness(evidence),
    metrics: {
      intelligenceConfidence: Number(intelligence?.intelligenceConfidence ?? 0),
      sourceConcentrationPercent: Number(intelligence?.coverage?.sourceConcentrationPercent ?? 100),
      crossChecks: Number(intelligence?.crossSourceValidation?.checked ?? 0),
      divergentChecks: Number(intelligence?.crossSourceValidation?.divergent ?? 0),
    },
  };
}
