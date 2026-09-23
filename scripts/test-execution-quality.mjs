import assert from "node:assert/strict";
import { evaluateExecutionQuality } from "../lib/trading/execution-quality.ts";
import { calculateTransactionCosts } from "../lib/trading/tca.ts";

function fill(index, {
  referencePrice = 100,
  quantity = 10,
  side = "BUY",
  slippageBps = 5,
  feeBps = 5,
} = {}) {
  const direction = side === "BUY" ? 1 : -1;
  const fillPrice = referencePrice * (1 + direction * slippageBps / 10_000);
  const notional = quantity * fillPrice;
  const referenceNotional = quantity * referencePrice;
  const fee = notional * feeBps / 10_000;
  const slippage = Math.abs(notional - referenceNotional);
  return {
    clientOrderId: `test-${index}`,
    symbol: "TEST",
    side,
    status: "PAPER_FILLED",
    requestedQuantity: quantity,
    filledQuantity: quantity,
    referencePrice,
    fillPrice: Number(fillPrice.toFixed(6)),
    notionalEuro: Number(notional.toFixed(4)),
    estimatedFeeEuro: Number(fee.toFixed(4)),
    estimatedSlippageEuro: Number(slippage.toFixed(4)),
    createdAt: "2026-09-21T12:00:00Z",
    filledAt: "2026-09-21T12:00:01Z",
    risk: { allowed: true, orderNotionalEuro: notional, resultingPositionWeightPercent: 1, resultingGrossExposurePercent: 1, resultingDailyTurnoverPercent: 1, checks: [], reasons: [] },
  };
}

const insufficient = evaluateExecutionQuality(Array.from({ length: 5 }, (_, index) => fill(index)));
assert.equal(insufficient.state, "INSUFFICIENT");
assert.equal(insufficient.allowPilot, false);

const healthyFills = Array.from({ length: 12 }, (_, index) => fill(index));
const healthy = evaluateExecutionQuality(healthyFills);
assert.equal(healthy.state, "HEALTHY", healthy.reasons.join(" | "));
assert.equal(healthy.allowPilot, true);
assert(healthy.slippageCostBps < 20);
assert(healthy.implementationShortfallBps < 40);
assert.equal(healthy.absoluteSlippageP95Bps, 5);
assert.equal(healthy.invalidFills, 0);

const tca = calculateTransactionCosts([
  fill(100, { side: "BUY", slippageBps: 5 }),
  fill(101, { side: "SELL", slippageBps: 7 }),
  fill(102, { side: "BUY", slippageBps: -3 }),
]);
assert.equal(tca.buyFills, 2);
assert.equal(tca.sellFills, 1);
assert.equal(tca.adverseFills, 2);
assert.equal(tca.favorableFills, 1);
assert(tca.referenceNotionalEuro > 0);
assert(tca.totalFeesEuro > 0);
assert(tca.absoluteSlippageP95Bps >= tca.absoluteSlippageP50Bps);

const watch = evaluateExecutionQuality(
  Array.from({ length: 12 }, (_, index) => fill(index, { slippageBps: 25, feeBps: 20 })),
);
assert.equal(watch.state, "WATCH", watch.reasons.join(" | "));
assert.equal(watch.allowPilot, true);
assert.equal(watch.riskMultiplier, 0.75);
assert(watch.slippageCostBps > 20 && watch.slippageCostBps < 35);

const poor = evaluateExecutionQuality(
  Array.from({ length: 12 }, (_, index) => fill(index, { slippageBps: 65, feeBps: 20 })),
);
assert.equal(poor.state, "POOR");
assert.equal(poor.allowPilot, false);
assert.equal(poor.riskMultiplier, 0);
assert(poor.absoluteSlippageP95Bps > 60);

const corrupt = healthyFills.map((item) => ({ ...item }));
corrupt[0].fillPrice = 0;
const corruptDecision = evaluateExecutionQuality(corrupt);
assert.equal(corruptDecision.state, "POOR");
assert.equal(corruptDecision.allowPilot, false);
assert.equal(corruptDecision.invalidFills, 1);
assert(corruptDecision.reasons.some((reason) => reason.includes("structurally invalid")));

console.log("Fenice execution quality gate tests: PASS");
