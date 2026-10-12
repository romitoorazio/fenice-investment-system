import assert from "node:assert/strict";
import { appendAuditEvent } from "../lib/trading/audit-chain.ts";
import { valuePaperRecordedQuantities as value } from "../lib/ui/paper-valuation-evidence.ts";
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
      fxToEuro: 0.9, fxProvider: "twelve-data", fxObservedAt: fill.fxObservedAt, riskAllowed: true } }) };
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
console.log("PAPER recorded quantities: coeval quote/FX/audit valuation and honest historic status PASS");
