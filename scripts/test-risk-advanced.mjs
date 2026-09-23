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
  lotSize: 0.1,
});
assert.equal(sized.allowed, true);
assert.equal(sized.quantity, 0.5);
assert.ok(sized.riskAtStopEuro <= sized.riskBudgetEuro + 0.01);
assert.ok(sized.notionalEuro <= 50.01);

const sizedWholeUnits = calculatePositionSize({
  capitalEuro: 10000,
  riskPerTradePercent: 1,
  entryPrice: 50,
  stopPrice: 48,
  fxToEuro: 1,
  maxPositionPercent: 15,
  maxOrderNotionalPercent: 5,
  lotSize: 1,
});
assert.equal(sizedWholeUnits.allowed, true);
assert.ok(sizedWholeUnits.quantity > 0);
assert.ok(sizedWholeUnits.riskAtStopEuro <= 100.01);
assert.ok(sizedWholeUnits.notionalEuro <= 500.01);

const invalidStop = calculatePositionSize({
  capitalEuro: 10000,
  riskPerTradePercent: 1,
  entryPrice: 100,
  stopPrice: 101,
  fxToEuro: 1,
});
assert.equal(invalidStop.allowed, false);
assert.equal(invalidStop.quantity, 0);

const zeroTradable = calculatePositionSize({
  capitalEuro: 1000,
  riskPerTradePercent: 0.1,
  entryPrice: 1000,
  stopPrice: 990,
  fxToEuro: 1,
  maxPositionPercent: 5,
  maxOrderNotionalPercent: 5,
  lotSize: 1,
});
assert.equal(zeroTradable.allowed, false);
assert.equal(zeroTradable.quantity, 0);

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

const defensive = evaluateDrawdown({
  currentEquityEuro: 8950,
  dayStartEquityEuro: 9000,
  weekStartEquityEuro: 9200,
  highWaterMarkEuro: 10000,
});
assert.equal(defensive.state, "DEFENSIVE");
assert.equal(defensive.allowNewRisk, true);
assert.equal(defensive.riskMultiplier, 0.5);

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
