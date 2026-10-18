import assert from "node:assert/strict";
import { appendAuditEvent } from "../lib/trading/audit-chain.ts";
import { valuePaperRecordedQuantities as value } from "../lib/ui/paper-valuation-evidence.ts";
import { parseTwelveDataQuoteTime } from "../lib/trading/twelve-data-batch.mjs";
const now = Date.parse("2026-10-12T13:00:00.000Z");
const at = seconds => new Date(now - seconds * 1000).toISOString();
const fill = { clientOrderId: "offline-fixture", symbol: "TEST", side: "BUY", status: "PAPER_FILLED",
  filledQuantity: 1, fillPrice: 100, notionalEuro: 90, currency: "USD", fxToEuro: 0.9,
  fxProvider: "twelve-data",
  fxObservedAt: at(95), filledAt: at(90), estimatedFeeEuro: 1.5, estimatedSlippageEuro: 0.09 };
const paper = { generatedAt: at(85), mode: "PAPER", liveTradingAllowed: false, brokerConnectivityAllowed: false,
  executions: [fill], positions: [{ symbol: "TEST", quantity: 1, averagePrice: 100, currency: "USD", fxToEuro: 0.9 }],
  reconciliation: { balanced: true, breaks: [] }, auditChain: appendAuditEvent([], {
    timestamp: fill.filledAt, eventType: "PAPER_FILLED", entityId: fill.clientOrderId,
    payload: { symbol: "TEST", side: "BUY", filledQuantity: 1, fillPrice: 100, currency: "USD",
      fxToEuro: 0.9, fxProvider: "twelve-data", fxObservedAt: fill.fxObservedAt,
      estimatedFeeEuro: fill.estimatedFeeEuro, riskAllowed: true } }) };
const input = { paper, quotes: { generatedAt: at(0), policy: { liveTradingAllowed: false }, observations: [
  { symbol: "TEST", currency: "USD", sourceFamily: "alpaca", eligibility: "PAPER", provenanceVerified: true,
    provenanceMethod: "authenticated-alpaca-iex-latest-quote", price: 110, observedAt: at(10) },
  { symbol: "TEST", currency: "USD", sourceFamily: "twelve-data", eligibility: "PAPER", provenanceVerified: true,
    provenanceMethod: "provider-response-us-realtime-venue", price: 110, observedAt: at(10) }] },
  fx: { generatedAt: at(0), provider: "twelve-data", baseCurrency: "EUR", provenanceVerified: true,
    liveTradingAllowed: false, brokerConnectivityAllowed: false, ratesToEuro: { USD: { rate: 0.95, observedAt: at(20) } } },
  session: { generatedAt: at(0), configured: true, liveTradingAllowed: false,
    evidence: { state: "OPEN", venue: "US_EQUITIES", authoritative: true, observedAt: at(5) } } };
const before = JSON.stringify(input);
const report = value(input, now);
assert.equal(report.state, "VALUED_SAMPLE", report.reason);
assert.equal(report.estimatedRecordedQuantityValueEuro, 104.5);
assert.equal(report.priceFxChangeEuro, 14.5);
assert.equal(report.changeAfterEstimatedEntryFeesEuro, 13, "slippage is already in fill basis and must not be deducted twice");
assert.equal(report.netRealizedProfitEuro, null);
assert.equal(report.portfolioNavEuro, null);
assert.equal(report.profitabilityProven, false);
assert.equal(report.executionAuthorized, false);
assert.equal(JSON.stringify(input), before);
assert.equal(value(input, now + 3600_000).sampleCurrentWithin120Seconds, false, "a replayed sample is never labelled current");
const blocked = mutate => { const copy = structuredClone(input); mutate(copy); const r = value(copy, now);
  assert.equal(r.state, "INSUFFICIENT"); assert.equal(r.estimatedRecordedQuantityValueEuro, null); assert.equal(r.rows.length, 0); };
const providerTime = parseTwelveDataQuoteTime({ timestamp: (now - 10_000) / 1000 });
assert.equal(providerTime.paperTimestampVerified, true);
const fallbackMethods = {
  alpaca: "authenticated-alpaca-iex-latest-trade-fallback",
  "twelve-data": `provider-batch-quote-${providerTime.source}-us-realtime-venue`,
};
for (const families of [["alpaca"], ["twelve-data"], ["alpaca", "twelve-data"]]) {
  const copy = structuredClone(input);
  for (const quote of copy.quotes.observations) {
    if (families.includes(quote.sourceFamily)) quote.provenanceMethod = fallbackMethods[quote.sourceFamily];
  }
  const fallbackValuation = value(copy, now);
  assert.equal(fallbackValuation.state, "VALUED_SAMPLE", fallbackValuation.reason);
  assert.equal(fallbackValuation.estimatedRecordedQuantityValueEuro, report.estimatedRecordedQuantityValueEuro,
    "supported producer fallback prices must agree between valuation and runtime method recognition");
  assert.equal(fallbackValuation.profitabilityProven, false);
  assert.equal(fallbackValuation.executionAuthorized, false);
  for (const patch of [
    { provenanceVerified: false }, { eligibility: "LIVE" }, { eligibility: "VALIDATION_ONLY" },
    { observedAt: at(-0.001) }, { observedAt: at(120.001) },
    { provenanceMethod: "unrecognized-method" },
  ]) {
    const invalid = structuredClone(copy);
    Object.assign(invalid.quotes.observations[0], patch);
    assert.equal(value(invalid, now).state, "INSUFFICIENT",
      "method recognition cannot bypass valuation eligibility or chronology");
  }
}
blocked(x => { x.quotes.observations[1].provenanceMethod = fallbackMethods.alpaca; });
blocked(x => { x.quotes.observations[1].sourceFamily = "directa";
  x.quotes.observations[1].provenanceMethod = "directa-readonly-entitlement-isin-topbook"; });
// The observation timestamp must never exceed the timestamp of its own source artifact.
blocked(x => { x.quotes.generatedAt = at(40); x.quotes.observations[1].observedAt = at(35); });
blocked(x => { x.fx.generatedAt = at(40); x.fx.ratesToEuro.USD.observedAt = at(35); });
blocked(x => { x.session.generatedAt = at(40); x.session.evidence.observedAt = at(35); });
blocked(x => { x.session.generatedAt = at(200); });
blocked(x => { x.paper.executions[0].estimatedFeeEuro = 999999; });
blocked(x => { x.paper.auditChain[0].payload.estimatedFeeEuro = 999999; });
blocked(x => { x.fx.ratesToEuro.USD.observedAt = at(121); });
blocked(x => { x.fx.ratesToEuro.USD.rate = 0; });
blocked(x => { x.fx.brokerConnectivityAllowed = true; });
blocked(x => { x.quotes.observations[1].observedAt = at(-1); });
blocked(x => { x.quotes.observations[1].currency = "EUR"; });
blocked(x => { x.quotes.observations[1].price = 130; });
blocked(x => { x.quotes.observations[1].provenanceVerified = false; });
blocked(x => { x.quotes.observations[1].sourceFamily = "unregistered"; });
blocked(x => { x.session.evidence.state = "CLOSED"; });
blocked(x => { x.session.evidence.observedAt = at(61); });
blocked(x => { x.paper.auditChain[0].payload.fillPrice = 99; });
blocked(x => { x.paper.executions[0].fxProvider = "synthetic-stress"; });
blocked(x => { x.paper.positions[0].quantity = 2; });
blocked(x => { x.paper.mode = "LIVE"; });
blocked(x => { x.quotes.generatedAt = at(-1); });
blocked(x => { x.paper.generatedAt = "2026-02-30T13:00:00.000Z"; });
blocked(x => { x.quotes.observations.forEach(q => { q.price = 1e308; }); });
blocked(x => { x.quotes.observations.forEach(q => { q.price = 1e307; }); });
blocked(x => { x.quotes.observations.forEach(q => { q.price = Number.MAX_VALUE; }); });
// Frozen V6 audit payloads do not carry fee proofs: valuation is permitted, after-fee PnL is not.
const noFee = structuredClone(input);
const feeLessPayload = { ...noFee.paper.auditChain[0].payload };
delete feeLessPayload.estimatedFeeEuro;
noFee.paper.auditChain = appendAuditEvent([], {
  timestamp: fill.filledAt, eventType: "PAPER_FILLED", entityId: fill.clientOrderId,
  payload: feeLessPayload,
});
const noFeeReport = value(noFee, now);
assert.equal(noFeeReport.state, "VALUED_SAMPLE");
assert.equal(noFeeReport.estimatedEntryFeesEuro, null);
assert.equal(noFeeReport.changeAfterEstimatedEntryFeesEuro, null);
assert.equal(noFeeReport.profitabilityProven, false);
console.log("PAPER recorded quantities: strict source chronology and audited-fee reporting PASS");
