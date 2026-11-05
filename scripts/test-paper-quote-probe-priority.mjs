import assert from "node:assert/strict";
import { prioritizeMissingSecondSource } from "../lib/trading/paper-quote-probe-priority.mjs";

const now = Date.parse("2026-11-05T17:34:00Z");
const candidates = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "IWM"].map(symbol => ({ symbol }));
const observations = [
  ...["SPY", "QQQ", "AAPL", "MSFT"].flatMap(symbol => ["alpaca", "twelve-data"].map(sourceFamily => ({ symbol, sourceFamily, eligibility: "PAPER", observedAt: new Date(now - 20_000).toISOString() }))),
  ...["NVDA", "IWM"].map(symbol => ({ symbol, sourceFamily: "alpaca", eligibility: "PAPER", observedAt: new Date(now - 10_000).toISOString() }))
];
assert.deepEqual(prioritizeMissingSecondSource(candidates, observations, now).map(x => x.symbol),
  ["NVDA", "IWM", "SPY", "QQQ", "AAPL", "MSFT"]);
assert.deepEqual(prioritizeMissingSecondSource(candidates, observations, now + 300_000).map(x => x.symbol),
  ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "IWM"]);
assert.deepEqual(prioritizeMissingSecondSource(candidates, [{ symbol: "NVDA", sourceFamily: "alpaca", eligibility: "VALIDATION_ONLY", observedAt: new Date(now).toISOString() }], now).map(x => x.symbol),
  candidates.map(x => x.symbol));
console.log("PAPER quote probe prioritization: PASS");
