import { LIVE_TRADING_RELEASED } from "../brokers/safety.ts";

export type InstitutionalControlId =
  | "data-quality"
  | "cross-source-validation"
  | "broker-readonly"
  | "order-lifecycle"
  | "pretrade-risk"
  | "fat-finger-price-collars"
  | "kill-switch"
  | "idempotency"
  | "execution-reconciliation"
  | "position-reconciliation"
  | "persistent-audit"
  | "tca"
  | "heartbeat-watchdog"
  | "crash-recovery"
  | "market-session-controls"
  | "fx-exposure"
  | "shadow-execution"
  | "paper-30d"
  | "chaos-tests"
  | "human-confirmation";

export type InstitutionalEvidence = "PASS" | "TESTING" | "MISSING" | "BLOCKED";

export type InstitutionalControl = {
  id: InstitutionalControlId;
  label: string;
  domain: "DATA" | "OMS" | "RISK" | "BROKER" | "RESILIENCE" | "AUDIT" | "EXECUTION";
  critical: boolean;
  weight: number;
  benchmark: string;
};

export const INSTITUTIONAL_CONTROLS: readonly InstitutionalControl[] = [
  { id: "data-quality", label: "Qualità dati con soglie fail-closed", domain: "DATA", critical: true, weight: 8, benchmark: "multi-source institutional data controls" },
  { id: "cross-source-validation", label: "Cross-check indipendente prezzi/dati", domain: "DATA", critical: true, weight: 6, benchmark: "execution-grade data validation" },
  { id: "broker-readonly", label: "Broker read-only certificato", domain: "BROKER", critical: true, weight: 6, benchmark: "Saxo/IBKR portfolio and order monitoring" },
  { id: "order-lifecycle", label: "Lifecycle ordini e partial fill", domain: "OMS", critical: true, weight: 7, benchmark: "IBKR orderStatus + execution lifecycle" },
  { id: "pretrade-risk", label: "Pre-trade risk indipendente", domain: "RISK", critical: true, weight: 9, benchmark: "TT risk controls / market-access discipline" },
  { id: "fat-finger-price-collars", label: "Fat-finger, size e price collars", domain: "RISK", critical: true, weight: 7, benchmark: "TT price reasonability controls" },
  { id: "kill-switch", label: "Kill switch con reset esplicito", domain: "RISK", critical: true, weight: 8, benchmark: "FINRA disable mechanism / professional lockdown" },
  { id: "idempotency", label: "Idempotenza end-to-end", domain: "OMS", critical: true, weight: 6, benchmark: "duplicate-order prevention" },
  { id: "execution-reconciliation", label: "Riconciliazione ordini/eseguiti", domain: "EXECUTION", critical: true, weight: 7, benchmark: "broker execution reconciliation" },
  { id: "position-reconciliation", label: "Riconciliazione posizioni e liquidità", domain: "EXECUTION", critical: true, weight: 7, benchmark: "front-to-back OMS controls" },
  { id: "persistent-audit", label: "Audit persistente e tamper-evident", domain: "AUDIT", critical: true, weight: 6, benchmark: "TT audit trail / NIST log integrity" },
  { id: "tca", label: "TCA pre/intra/post trade", domain: "EXECUTION", critical: false, weight: 4, benchmark: "FlexTCA full trade lifecycle analytics" },
  { id: "heartbeat-watchdog", label: "Heartbeat e watchdog broker", domain: "RESILIENCE", critical: true, weight: 5, benchmark: "Saxo streaming heartbeat" },
  { id: "crash-recovery", label: "Crash/restart recovery deterministico", domain: "RESILIENCE", critical: true, weight: 6, benchmark: "resilient OMS recovery" },
  { id: "market-session-controls", label: "Calendari, sessioni e trading halts", domain: "RISK", critical: true, weight: 4, benchmark: "venue/session controls" },
  { id: "fx-exposure", label: "FX e rischio valuta certificati", domain: "RISK", critical: false, weight: 3, benchmark: "multi-asset exposure controls" },
  { id: "shadow-execution", label: "Shadow execution prolungata", domain: "EXECUTION", critical: true, weight: 7, benchmark: "pilot deployment before production" },
  { id: "paper-30d", label: "Checkpoint paper reali a 30 giorni", domain: "EXECUTION", critical: true, weight: 5, benchmark: "time-matured validation evidence" },
  { id: "chaos-tests", label: "Failure/chaos tests su rete e broker", domain: "RESILIENCE", critical: true, weight: 4, benchmark: "system validation under adverse conditions" },
  { id: "human-confirmation", label: "Conferma umana non bypassabile", domain: "RISK", critical: true, weight: 5, benchmark: "Fenice governance requirement" },
] as const;

export type InstitutionalReadinessReport = {
  engineeringScore: number;
  passedWeight: number;
  totalWeight: number;
  criticalPassed: number;
  criticalTotal: number;
  shadowReady: boolean;
  capitalReady: boolean;
  liveReleaseOpen: boolean;
  blockers: InstitutionalControl[];
  testing: InstitutionalControl[];
  controls: Array<InstitutionalControl & { status: InstitutionalEvidence }>;
};

/**
 * This score measures engineering completeness, not expected returns and not
 * permission to trade. Real-money eligibility remains fail-closed behind the
 * independent compile-time live release lock.
 */
export function evaluateInstitutionalReadiness(
  evidence: Partial<Record<InstitutionalControlId, InstitutionalEvidence>>,
): InstitutionalReadinessReport {
  const controls = INSTITUTIONAL_CONTROLS.map((control) => ({
    ...control,
    status: evidence[control.id] ?? "MISSING",
  }));
  const totalWeight = controls.reduce((sum, control) => sum + control.weight, 0);
  const passedWeight = controls
    .filter((control) => control.status === "PASS")
    .reduce((sum, control) => sum + control.weight, 0);
  const critical = controls.filter((control) => control.critical);
  const criticalPassed = critical.filter((control) => control.status === "PASS").length;
  const blockers = critical.filter((control) => control.status !== "PASS");
  const testing = controls.filter((control) => control.status === "TESTING");
  const shadowReady = blockers.every((control) => control.id === "paper-30d")
    && controls.find((control) => control.id === "shadow-execution")?.status === "PASS";
  const capitalReady = LIVE_TRADING_RELEASED && blockers.length === 0;

  return {
    engineeringScore: totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 0,
    passedWeight,
    totalWeight,
    criticalPassed,
    criticalTotal: critical.length,
    shadowReady,
    capitalReady,
    liveReleaseOpen: LIVE_TRADING_RELEASED,
    blockers,
    testing,
    controls,
  };
}
