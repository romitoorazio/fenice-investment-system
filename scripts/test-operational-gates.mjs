import assert from "node:assert/strict";
import { evaluateOperationalGates } from "../lib/trading/operational-gates.ts";

const now = Date.parse("2026-09-21T14:00:00.000Z");
const marketEvidence = [
  { source: "source-a", sourceFamily: "family-a", eligibility: "PAPER", price: 100, observedAt: new Date(now - 15_000).toISOString() },
  { source: "source-b", sourceFamily: "family-b", eligibility: "PAPER", price: 100.1, observedAt: new Date(now - 20_000).toISOString() },
  { source: "source-c", sourceFamily: "family-c", eligibility: "PAPER", price: 99.95, observedAt: new Date(now - 30_000).toISOString() },
];

const green = evaluateOperationalGates({
  marketEvidence,
  events: [],
  eventContext: { symbol: "TEST", currency: "EUR", assetClass: "EQUITY" },
  now,
});
assert.equal(green.state, "GREEN");
assert.equal(green.allowNewRisk, true);
assert.equal(green.riskMultiplier, 1);
assert.deepEqual(green.marketData.sourceFamilies, ["family-a", "family-b", "family-c"]);

const highEvent = evaluateOperationalGates({
  marketEvidence,
  events: [{
    id: "macro-high",
    label: "High impact macro release",
    scheduledAt: new Date(now + 10 * 60_000).toISOString(),
    severity: "HIGH",
    currencies: ["EUR"],
  }],
  eventContext: { symbol: "TEST", currency: "EUR", assetClass: "EQUITY" },
  now,
});
assert.equal(highEvent.state, "CAUTION");
assert.equal(highEvent.allowNewRisk, true);
assert.equal(highEvent.riskMultiplier, 0.5);

const criticalEvent = evaluateOperationalGates({
  marketEvidence,
  events: [{
    id: "macro-critical",
    label: "Critical market event",
    scheduledAt: new Date(now).toISOString(),
    severity: "CRITICAL",
  }],
  eventContext: { symbol: "TEST", currency: "EUR", assetClass: "EQUITY" },
  now,
});
assert.equal(criticalEvent.state, "BLOCKED");
assert.equal(criticalEvent.allowNewRisk, false);
assert.equal(criticalEvent.riskMultiplier, 0);

const staleMarket = evaluateOperationalGates({
  marketEvidence: marketEvidence.map((item) => ({ ...item, observedAt: new Date(now - 10 * 60_000).toISOString() })),
  events: [],
  eventContext: { symbol: "TEST" },
  now,
});
assert.equal(staleMarket.state, "BLOCKED");
assert.equal(staleMarket.allowNewRisk, false);
assert.equal(staleMarket.riskMultiplier, 0);

const divergentMarket = evaluateOperationalGates({
  marketEvidence: [
    { source: "source-a", sourceFamily: "family-a", eligibility: "PAPER", price: 100, observedAt: new Date(now - 10_000).toISOString() },
    { source: "source-b", sourceFamily: "family-b", eligibility: "PAPER", price: 103, observedAt: new Date(now - 12_000).toISOString() },
  ],
  events: [],
  eventContext: { symbol: "TEST" },
  now,
});
assert.equal(divergentMarket.state, "BLOCKED");
assert.equal(divergentMarket.allowNewRisk, false);

const validationOnlyCannotOpenGate = evaluateOperationalGates({
  marketEvidence: [
    { source: "source-a", sourceFamily: "family-a", eligibility: "PAPER", price: 100, observedAt: new Date(now - 10_000).toISOString() },
    { source: "eod", sourceFamily: "stooq", eligibility: "VALIDATION_ONLY", price: 100.05, observedAt: new Date(now - 5_000).toISOString() },
  ],
  events: [],
  eventContext: { symbol: "TEST" },
  now,
});
assert.equal(validationOnlyCannotOpenGate.state, "BLOCKED");
assert.equal(validationOnlyCannotOpenGate.allowNewRisk, false);
assert.equal(validationOnlyCannotOpenGate.marketData.ineligibleEvidence, 1);

console.log("Fenice operational gate integration tests: PASS");
