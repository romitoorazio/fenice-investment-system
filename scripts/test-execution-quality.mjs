import assert from "node:assert/strict";
import { evaluateExecutionQuality } from "../lib/trading/execution-quality.ts";

function fill(index, { notional = 1000, fee = 0.5, slippage = 0.5 } = {}) {
  return {
    clientOrderId: `test-${index}`,
    symbol: "TEST",
    side: "BUY",
    status: "PAPER_FILLED",
    requestedQuantity: 10,
    filledQuantity: 10,
    referencePrice: 100,
    fillPrice: 100.05,
    notionalEuro: notional,
    estimatedFeeEuro: fee,
    estimatedSlippageEuro: slippage,
    createdAt: "2026-09-21T12:00:00Z",
    filledAt: "2026-09-21T12:00:01Z",
    risk: { allowed: true, orderNotionalEuro: notional, resultingPositionWeightPercent: 1, resultingGrossExposurePercent: 1, resultingDailyTurnoverPercent: 1, checks: [], reasons: [] },
  };
}

const insufficient = evaluateExecutionQuality(Array.from({ length: 5 }, (_, index) => fill(index)));
assert.equal(insufficient.state, "INSUFFICIENT");
assert.equal(insufficient.allowPilot, false);

const healthy = evaluateExecutionQuality(Array.from({ length: 12 }, (_, index) => fill(index)));
assert.equal(healthy.state, "HEALTHY", healthy.reasons.join(" | "));
assert.equal(healthy.allowPilot, true);
assert(healthy.slippageCostBps < 20);
assert(healthy.implementationShortfallBps < 40);

const watch = evaluateExecutionQuality(Array.from({ length: 12 }, (_, index) => fill(index, { fee: 1, slippage: 2.5 })));
assert.equal(watch.state, "WATCH", watch.reasons.join(" | "));
assert.equal(watch.allowPilot, true);
assert.equal(watch.riskMultiplier, 0.75);

const poor = evaluateExecutionQuality(Array.from({ length: 12 }, (_, index) => fill(index, { fee: 2, slippage: 6 })));
assert.equal(poor.state, "POOR");
assert.equal(poor.allowPilot, false);
assert.equal(poor.riskMultiplier, 0);

console.log("Fenice execution quality gate tests: PASS");
