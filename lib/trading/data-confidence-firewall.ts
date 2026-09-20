export type DataConfidenceInput = {
  confidence: number;
  sourceConcentrationPercent: number;
  crossChecks: number;
  divergentChecks: number;
  criticalSourcesHealthy: boolean;
  staleCriticalData: boolean;
};

export type DataConfidenceDecision = {
  state: "GREEN" | "CAUTION" | "BLOCKED";
  allowNewRisk: boolean;
  reasons: string[];
};

/**
 * Fail-closed gate for any decision that can increase portfolio risk.
 * This module does not submit orders and must remain independent from broker write paths.
 */
export function evaluateDataConfidence(input: DataConfidenceInput): DataConfidenceDecision {
  const reasons: string[] = [];

  if (!input.criticalSourcesHealthy) reasons.push("critical-source-unhealthy");
  if (input.staleCriticalData) reasons.push("critical-data-stale");
  if (input.divergentChecks > 0) reasons.push("cross-source-divergence");
  if (input.crossChecks < 10) reasons.push("insufficient-cross-checks");
  if (input.confidence < 90) reasons.push("confidence-below-certification-floor");
  if (input.sourceConcentrationPercent > 50) reasons.push("source-concentration-too-high");

  if (reasons.length > 0) {
    return { state: "BLOCKED", allowNewRisk: false, reasons };
  }

  return { state: "GREEN", allowNewRisk: true, reasons: [] };
}
