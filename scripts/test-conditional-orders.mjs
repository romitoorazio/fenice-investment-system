import assert from "node:assert/strict";
import {
  applyConditionalMarketPrice,
  applyOcoMarketPrice,
  createConditionalOrderState,
  createLongBracketOco,
  createOcoState,
} from "../lib/trading/conditional-orders.ts";

const now = "2026-09-21T18:00:00.000Z";

let stop = createConditionalOrderState({
  clientOrderId: "stop-1",
  symbol: "TEST",
  side: "SELL",
  kind: "STOP",
  quantity: 1,
  stopPrice: 95,
});
stop = applyConditionalMarketPrice(stop, 96, now);
assert.equal(stop.status, "WORKING");
stop = applyConditionalMarketPrice(stop, 94, now);
assert.equal(stop.status, "TRIGGERED");
assert.equal(stop.activation?.orderType, "MARKET");

let stopLimit = createConditionalOrderState({
  clientOrderId: "stop-limit-1",
  symbol: "TEST",
  side: "SELL",
  kind: "STOP_LIMIT",
  quantity: 1,
  stopPrice: 95,
  limitPrice: 94.5,
});
stopLimit = applyConditionalMarketPrice(stopLimit, 94.8, now);
assert.equal(stopLimit.status, "TRIGGERED");
assert.equal(stopLimit.activation?.orderType, "LIMIT");
assert.equal(stopLimit.activation?.limitPrice, 94.5);

let trailing = createConditionalOrderState({
  clientOrderId: "trail-1",
  symbol: "TEST",
  side: "SELL",
  kind: "TRAILING_STOP",
  quantity: 1,
  trailPercent: 5,
}, 100);
trailing = applyConditionalMarketPrice(trailing, 110, now);
assert.equal(trailing.status, "WORKING");
assert.equal(trailing.anchorPrice, 110);
trailing = applyConditionalMarketPrice(trailing, 104, now);
assert.equal(trailing.status, "TRIGGERED");

let oco = createOcoState(
  "oco-1",
  { clientOrderId: "oco-tp", symbol: "TEST", side: "SELL", kind: "LIMIT", quantity: 1, limitPrice: 110 },
  { clientOrderId: "oco-sl", symbol: "TEST", side: "SELL", kind: "STOP", quantity: 1, stopPrice: 95 },
  100,
);
oco = applyOcoMarketPrice(oco, 111, now);
assert.equal(oco.status, "TRIGGERED");
assert.equal(oco.triggeredOrderId, "oco-tp");
assert.equal(oco.second.status, "CANCELLED");

let bracket = createLongBracketOco({
  groupId: "bracket-1",
  symbol: "TEST",
  quantity: 2,
  takeProfitPrice: 120,
  stopLossPrice: 90,
  initialMarketPrice: 100,
});
bracket = applyOcoMarketPrice(bracket, 89, now);
assert.equal(bracket.status, "TRIGGERED");
assert.equal(bracket.triggeredOrderId, "bracket-1:stop-loss");
assert.equal(bracket.first.status, "CANCELLED");

assert.throws(
  () => createConditionalOrderState({
    clientOrderId: "bad-trail",
    symbol: "TEST",
    side: "SELL",
    kind: "TRAILING_STOP",
    quantity: 1,
    trailPercent: 5,
    trailAmount: 2,
  }),
  /INVALID_CONDITIONAL_ORDER/,
);

assert.throws(
  () => createLongBracketOco({
    groupId: "bad-bracket",
    symbol: "TEST",
    quantity: 1,
    takeProfitPrice: 90,
    stopLossPrice: 95,
  }),
  /INVALID_BRACKET/,
);

console.log("Fenice conditional order tests: PASS");
