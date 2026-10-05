import assert from "node:assert/strict";
import { selectPaperV7ProbeSymbols } from "../lib/trading/paper-v7-probe-selection.mjs";

const universe = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "IWM", "META", "GOOGL", "AMZN", "ASML", "TSM", "BTC"];
const base = ["SPY", "QQQ", "AAPL", "MSFT"];

const actualCase = selectPaperV7ProbeSymbols({
  baseSymbols: base,
  promotionSymbols: ["ASML"],
  allowedUniverse: universe,
});
assert.deepEqual(actualCase.selectedSymbols, ["SPY", "QQQ", "AAPL", "MSFT", "ASML"]);
assert.deepEqual(actualCase.includedPromotions, ["ASML"]);
assert.equal(actualCase.additionalBatchCredits, 1);
assert.equal(actualCase.maxBatchSymbols, 8);

const normalized = selectPaperV7ProbeSymbols({
  baseSymbols: [" spy ", "QQQ", "SPY", "aapl", "msft"],
  promotionSymbols: ["asml", "ASML", "SPY"],
  allowedUniverse: universe,
});
assert.deepEqual(normalized.baseSymbols, base);
assert.deepEqual(normalized.requestedPromotions, ["ASML", "SPY"]);
assert.deepEqual(normalized.selectedSymbols, ["SPY", "QQQ", "AAPL", "MSFT", "ASML"]);

const constrained = selectPaperV7ProbeSymbols({
  baseSymbols: base,
  promotionSymbols: ["ASML", "TSM"],
  allowedUniverse: universe,
  maxBatchSymbols: 5,
});
assert.deepEqual(constrained.includedPromotions, ["ASML"]);
assert.deepEqual(constrained.deferredByCeiling, ["TSM"]);
assert.equal(constrained.additionalBatchCredits, 1);

const unknown = selectPaperV7ProbeSymbols({
  baseSymbols: base,
  promotionSymbols: ["UNKNOWN", "ASML"],
  allowedUniverse: universe,
});
assert.deepEqual(unknown.missingPromotions, ["UNKNOWN"]);
assert.deepEqual(unknown.includedPromotions, ["ASML"]);

const clamped = selectPaperV7ProbeSymbols({
  baseSymbols: base,
  promotionSymbols: ["ASML", "TSM", "NVDA", "IWM", "META", "GOOGL"],
  allowedUniverse: universe,
  maxBatchSymbols: 99,
});
assert.equal(clamped.maxBatchSymbols, 8);
assert.equal(clamped.selectedSymbols.length, 8);
assert.deepEqual(clamped.deferredByCeiling, ["META", "GOOGL"]);

assert.throws(
  () => selectPaperV7ProbeSymbols({
    baseSymbols: [...base, "MISSING"],
    promotionSymbols: [],
    allowedUniverse: universe,
  }),
  /PAPER_V7_BASE_OUTSIDE_ALLOWED_UNIVERSE:MISSING/,
);

assert.throws(
  () => selectPaperV7ProbeSymbols({
    baseSymbols: ["SPY", "QQQ", "AAPL", "MSFT", "NVDA"],
    promotionSymbols: [],
    allowedUniverse: universe,
    maxBatchSymbols: 4,
  }),
  /PAPER_V7_BASE_EXCEEDS_BATCH_CEILING:5>4/,
);

console.log("paper V7 fail-closed probe selector tests: PASS");
