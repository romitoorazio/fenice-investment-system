import assert from "node:assert/strict";
import { buildSmartOrderRoutePlan } from "../lib/trading/smart-order-router.ts";

const now = "2026-09-21T22:00:00.000Z";
const base = {
  sourceFamily: "broker-shadow",
  currency: "EUR",
  eligibility: "PAPER",
  bid: 99.9,
  ask: 100,
  bidSize: 100,
  askSize: 100,
  feeBps: 2,
  estimatedSlippageBps: 1,
  fillProbability: 0.9,
  latencyMs: 10,
  observedAt: "2026-09-21T21:59:59.000Z",
  tradingStatus: "OPEN",
};
const intent = {
  clientOrderId: "sor-test-1",
  symbol: "TEST",
  side: "BUY",
  orderType: "MARKET",
  quantity: 10,
  currency: "EUR",
};

{
  const plan = buildSmartOrderRoutePlan(intent, [
    { ...base, venueId: "A", ask: 100, feeBps: 12 },
    { ...base, venueId: "B", ask: 100.04, feeBps: 1 },
  ], undefined, now);
  assert.equal(plan.status, "ROUTABLE");
  assert.equal(plan.legs[0].venueId, "B", "router must prefer lower total consideration, not headline price alone");
  assert.equal(plan.transmitted, false);
  assert.equal(plan.liveTradingAllowed, false);
}

{
  const plan = buildSmartOrderRoutePlan(intent, [
    { ...base, venueId: "FAST", ask: 100, feeBps: 2, fillProbability: 0.75, latencyMs: 1 },
    { ...base, venueId: "LIKELY", ask: 100.005, feeBps: 2, fillProbability: 0.98, latencyMs: 25 },
  ], { requiredEligibility: "PAPER", maxQuoteAgeMs: 5000, minFillProbability: 0.5, maxVenues: 4, nearPriceToleranceBps: 1, allowPartial: false }, now);
  assert.equal(plan.legs[0].venueId, "LIKELY", "near-equal total consideration should prefer likelihood before speed");
}

{
  const plan = buildSmartOrderRoutePlan({ ...intent, quantity: 150 }, [
    { ...base, venueId: "A", ask: 100, askSize: 100 },
    { ...base, venueId: "B", ask: 100.01, askSize: 75 },
  ], undefined, now);
  assert.equal(plan.status, "ROUTABLE");
  assert.equal(plan.legs.length, 2);
  assert.equal(plan.routedQuantity, 150);
}

{
  const plan = buildSmartOrderRoutePlan({ ...intent, orderType: "LIMIT", limitPrice: 99.95 }, [
    { ...base, venueId: "A", ask: 100 },
  ], undefined, now);
  assert.equal(plan.status, "BLOCKED");
  assert.equal(plan.legs.length, 0);
}

{
  const plan = buildSmartOrderRoutePlan(intent, [
    { ...base, venueId: "STALE", observedAt: "2026-09-21T21:59:40.000Z" },
    { ...base, venueId: "VALIDATION", eligibility: "VALIDATION_ONLY" },
  ], undefined, now);
  assert.equal(plan.status, "BLOCKED");
  assert.equal(plan.legs.length, 0);
}

{
  const plan = buildSmartOrderRoutePlan({ ...intent, directedVenueId: "B" }, [
    { ...base, venueId: "A", ask: 99.5 },
    { ...base, venueId: "B", ask: 100 },
  ], undefined, now);
  assert.equal(plan.status, "ROUTABLE");
  assert.equal(plan.directed, true);
  assert.equal(plan.legs[0].venueId, "B", "specific client venue instruction must be respected when eligible");
}

{
  const plan = buildSmartOrderRoutePlan({ ...intent, quantity: 200 }, [
    { ...base, venueId: "A", askSize: 50 },
  ], undefined, now);
  assert.equal(plan.status, "BLOCKED");
  assert.equal(plan.legs.length, 0, "full-fill policy must fail closed instead of silently partial routing");
}

console.log("Smart Order Router invariants: PASS");
