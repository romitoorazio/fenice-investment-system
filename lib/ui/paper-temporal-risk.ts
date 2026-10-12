import { evaluatePreTradeRisk, DEFAULT_RISK_LIMITS } from "../trading/risk-engine.ts";
import { evaluateInstitutionalReadiness } from "../trading/institutional-readiness.ts";
import type { InstitutionalControlId, InstitutionalEvidence } from "../trading/institutional-readiness.ts";
import type { ProposedOrder, RiskContext, RiskLimits, RiskCheck } from "../trading/types.ts";
import { paperTimestamp } from "../trading/paper-timestamp-integrity.ts";
export { paperTimestamp } from "../trading/paper-timestamp-integrity.ts";

/** Strict read-only boundary around the immutable V6 risk implementation. */
export function evaluateStrictPaperPreTradeRisk(
  order: ProposedOrder, context: RiskContext,
  limits: RiskLimits = DEFAULT_RISK_LIMITS, now = Date.now(),
) {
  const result = evaluatePreTradeRisk(order, context, limits, now);
  const quote = paperTimestamp(context.quoteObservedAt);
  const requested = paperTimestamp(order.requestedAt);
  const validClock = typeof now === "number" && Number.isSafeInteger(now) && now >= 0 && now <= 8.64e15;
  const maxAge = limits.maxQuoteAgeSeconds;
  const validLimit = typeof maxAge === "number" && Number.isFinite(maxAge) && maxAge > 0 && maxAge <= 120;
  const temporalChecks: RiskCheck[] = [
    { code: "temporal-clock", passed: validClock, message: "A valid UTC execution clock is required." },
    { code: "quote-temporal-integrity", passed: validClock && validLimit && quote !== null
      && quote <= now && now - quote <= maxAge * 1000,
      message: "Future, invalid or stale quote timestamps are forbidden." },
    { code: "request-temporal-integrity", passed: validClock && requested !== null
      && requested <= now && now - requested <= 120_000,
      message: "Future, invalid or stale proposal timestamps are forbidden." },
  ];
  const checks = [...result.checks, ...temporalChecks];
  const rejected = temporalChecks.filter(check => !check.passed);
  return { ...result, checks, allowed: result.allowed && rejected.length === 0,
    reasons: [...result.reasons, ...rejected.map(check => `${check.code}: ${check.message}`)] };
}

/** Pure negative fixtures; never submit orders or alter certification evidence. */
export function assessCoreTemporalRiskSafety() {
  const now = Date.parse("2026-10-12T13:00:00.000Z");
  const order: ProposedOrder = { clientOrderId: "offline-temporal-readiness", symbol: "TEST",
    side: "BUY", orderType: "MARKET", timeInForce: "DAY", quantity: 1, referencePrice: 100,
    currency: "EUR", mode: "PAPER", requestedAt: new Date(now).toISOString(), humanConfirmed: true };
  const context: RiskContext = { capitalEuro: 10_000, fxToEuro: 1, existingPositionNotionalEuro: 0,
    currentGrossExposureEuro: 0, dailyTurnoverEuro: 0, openOrders: 0, dataConfidence: 95,
    independentSources: 2, riskScore: 20, quoteObservedAt: new Date(now + 1).toISOString(),
    dataDivergent: false, sourceStale: false, killSwitchEngaged: false,
    brokerConnectivityAllowed: false, liveTradingReleased: false };
  const futureQuoteRejected = !evaluatePreTradeRisk(order, context, DEFAULT_RISK_LIMITS, now).allowed;
  const invalidQuoteRejected = !evaluatePreTradeRisk(order, { ...context, quoteObservedAt: "invalid" }, DEFAULT_RISK_LIMITS, now).allowed;
  const invalidClockRejected = !evaluatePreTradeRisk(order, context, DEFAULT_RISK_LIMITS, Number.NaN).allowed;
  const coreVerified = futureQuoteRejected && invalidQuoteRejected && invalidClockRejected;
  return { coreVerified, futureQuoteRejected, invalidQuoteRejected, invalidClockRejected,
    reviewBoundaryFutureQuoteRejected: !evaluateStrictPaperPreTradeRisk(order, context, DEFAULT_RISK_LIMITS, now).allowed,
    status: coreVerified ? "VERIFIED" : "CORE_PATCH_PENDING",
    orderSubmitted: false, liveTradingAllowed: false, brokerConnectivityAllowed: false };
}

export function applyTemporalRiskReadiness<T extends {
  evidence: Record<InstitutionalControlId, InstitutionalEvidence>;
}>(readiness: T) {
  const temporalRiskSafety = assessCoreTemporalRiskSafety();
  const evidence = { ...readiness.evidence };
  // A passing legacy suite must not conceal a confirmed core defect.
  if (!temporalRiskSafety.coreVerified) evidence["pretrade-risk"] = "TESTING";
  return { ...readiness, evidence, report: evaluateInstitutionalReadiness(evidence), temporalRiskSafety };
}
