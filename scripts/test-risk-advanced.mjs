import assert from "node:assert/strict";
import { calculatePositionSize } from "../lib/trading/position-sizing.ts";
import { evaluateDrawdown } from "../lib/trading/drawdown-engine.ts";

const sized = calculatePositionSize({
  capitalEuro: 1000,
  riskPerTradePercent: 1,
  entryPrice: 100,
  stopPrice: 95,
  fxToEuro: 1,
  maxPositionPercent: 10,
  maxOrderNotionalPercent: 5,
  lotSize: 1,
});
assert.equal(sized.allowed, true);
assert.equal(sized.quantity, 0 === 0 ? 0 : sized.quantity);
assert.ok(sized.riskAtStopEuro <= sized.riskBudgetEuro + 0.01);
assert.ok(sized.notionalEuro <= 50.01);

const sizedFractional = calculatePositionSize({
  capitalEuro: 10000,
  riskPerTradePercent: 1,
  entryPrice: 50,
  stopPrice: 48,
  fxToEuro: 1,
  maxPositionPercent: 15,
  maxOrderNotionalPercent: 5,
  lotSize: 1,
});
assert.equal(sizedFractional.allowed, true);
assert.ok(sizedFractional.quantity > 0);
assert.ok(sizedFractional.riskAtStopEuro <= 100.01);
assert.ok(sizedFractional.notionalEuro <= 500.01);

const invalidStop = calculatePositionSize({
  capitalEuro: 10000,
  riskPerTradePercent: 1,
  entryPrice: 100,
  stopPrice: 101,
  fxToEuro: 1,
});
assert.equal(invalidStop.allowed, false);
assert.equal(invalidStop.quantity, 0);

const normal = evaluateDrawdown({
  currentEquityEuro: 10000,
  dayStartEquityEuro: 10000,
  weekStartEquityEuro: 10000,
  highWaterMarkEuro: 10000,
});
assert.equal(normal.state, "NORMAL");
assert.equal(normal.allowNewRisk, true);
assert.equal(normal.riskMultiplier, 1);

const caution = evaluateDrawdown({
  currentEquityEuro: 9700,
  dayStartEquityEuro: 10000,
  weekStartEquityEuro: 10000,
  highWaterMarkEuro: 10000,
});
assert.equal(caution.state, "CAUTION");
assert.equal(caution.allowNewRisk, true);
assert.ok(caution.riskMultiplier < 1);

const freeze = evaluateDrawdown({
  currentEquityEuro: 9500,
  dayStartEquityEuro: 10000,
  weekStartEquityEuro: 10000,
  highWaterMarkEuro: 10000,
});
assert.equal(freeze.state, "FREEZE");
assert.equal(freeze.allowNewRisk, false);
assert.equal(freeze.riskMultiplier, 0);
assert.equal(freeze.killSwitchRequired, true);

const invalidEquity = evaluateDrawdown({
  currentEquityEuro: 0,
  dayStartEquityEuro: 10000,
  weekStartEquityEuro: 10000,
  highWaterMarkEuro: 10000,
});
assert.equal(invalidEquity.state, "FREEZE");
assert.equal(invalidEquity.allowNewRisk, false);

console.log("Fenice advanced risk tests: PASS");
