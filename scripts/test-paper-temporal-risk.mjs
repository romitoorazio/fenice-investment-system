import assert from "node:assert/strict";
import { evaluateStrictPaperPreTradeRisk as assess, paperTimestamp,
  assessCoreTemporalRiskSafety, applyTemporalRiskReadiness } from "../lib/ui/paper-temporal-risk.ts";
import { buildInstitutionalReadiness } from "../lib/trading/readiness-evidence.ts";

const now = Date.parse("2026-10-12T13:00:00.000Z");
const order = { clientOrderId: "offline-fixture", symbol: "TEST", side: "BUY", orderType: "LIMIT",
  timeInForce: "DAY", quantity: 1, referencePrice: 100, limitPrice: 100, currency: "EUR",
  mode: "PAPER", requestedAt: new Date(now).toISOString(), humanConfirmed: true };
const context = { capitalEuro: 10_000, fxToEuro: 1, existingPositionNotionalEuro: 0,
  currentGrossExposureEuro: 0, dailyTurnoverEuro: 0, openOrders: 0, dataConfidence: 95,
  independentSources: 2, riskScore: 20, quoteObservedAt: new Date(now - 30_000).toISOString(),
  dataDivergent: false, sourceStale: false, killSwitchEngaged: false,
  brokerConnectivityAllowed: false, liveTradingReleased: false };
assert.equal(assess(order, context, undefined, now).allowed, true);
for (const quoteObservedAt of [new Date(now + 1).toISOString(), new Date(now - 120_001).toISOString(),
  "invalid", "2026-02-30T13:00:00.000Z", "2026-10-12", "2026-10-12T13:00:00"]) {
  assert.equal(assess(order, { ...context, quoteObservedAt }, undefined, now).allowed, false);
}
for (const clock of [Number.NaN, Infinity, -1, "1791800000000"]) {
  assert.equal(assess(order, context, undefined, clock).allowed, false);
}
for (const requestedAt of [new Date(now + 1).toISOString(), new Date(now - 120_001).toISOString(), "invalid"]) {
  assert.equal(assess({ ...order, requestedAt }, context, undefined, now).allowed, false);
}
assert.equal(paperTimestamp("2026-02-30T13:00:00Z"), null);
assert.equal(paperTimestamp("2026-10-12T13:00:00Z"), now);
assert.equal(assess({ ...order, mode: "LIVE" }, context, undefined, now).allowed, false);
assert.equal(assess(order, { ...context, brokerConnectivityAllowed: true }, undefined, now).allowed, false);
const state = assessCoreTemporalRiskSafety();
assert.equal(state.coreVerified, false, "V6 defect must not be silently labelled PASS");
assert.equal(state.reviewBoundaryFutureQuoteRejected, true);
assert.equal(state.orderSubmitted, false);
const readiness = applyTemporalRiskReadiness(buildInstitutionalReadiness({ intelligenceConfidence: 95,
  coverage: { sourceConcentrationPercent: 40 }, crossSourceValidation: { checked: 20, divergent: 0 } }));
assert.equal(readiness.evidence["pretrade-risk"], "TESTING");
assert(readiness.report.blockers.some(row => row.id === "pretrade-risk"));
assert.equal(readiness.report.capitalReady, false);
console.log("PAPER strict temporal boundary and honest core readiness: PASS");
