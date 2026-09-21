import assert from "node:assert/strict";
import {
  buildWalkForwardWindows,
  evaluateCostSensitivity,
  evaluateParameterStability,
  pairedBlockBootstrapOutperformance,
  summarizeWalkForward,
} from "../lib/intelligence/strategy-robustness.mjs";

const windows = buildWalkForwardWindows(1260, { minimumTrain: 504, testSize: 126, stepSize: 126 });
assert(windows.length >= 5);
assert.equal(windows[0].testStart, 504);
assert.equal(windows[0].testEnd, 630);
assert(windows.every((row) => row.trainEnd === row.testStart && row.testEnd <= 1260));

const strongWalkForward = summarizeWalkForward(Array.from({ length: 6 }, (_, index) => ({
  excessAnnualizedReturnPercent: 5 + index * 0.2,
  sharpe: 0.8 + index * 0.05,
  maxDrawdownPercent: -12 - index,
  trades: 4,
})));
assert.equal(strongWalkForward.state, "ROBUST", JSON.stringify(strongWalkForward));
assert(strongWalkForward.positiveWindowPercent >= 65);

const fragileWalkForward = summarizeWalkForward([
  { excessAnnualizedReturnPercent: -5, sharpe: -0.2, maxDrawdownPercent: -25, trades: 1 },
  { excessAnnualizedReturnPercent: -2, sharpe: 0.1, maxDrawdownPercent: -22, trades: 1 },
  { excessAnnualizedReturnPercent: 1, sharpe: 0.2, maxDrawdownPercent: -20, trades: 1 },
]);
assert.equal(fragileWalkForward.state, "FRAGILE");

const stable = evaluateParameterStability([
  { excessAnnualizedReturnPercent: 4.8, sharpe: 0.8 },
  { excessAnnualizedReturnPercent: 5.2, sharpe: 0.9 },
  { excessAnnualizedReturnPercent: 4.5, sharpe: 0.7 },
]);
assert.equal(stable.state, "STABLE", JSON.stringify(stable));

const unstable = evaluateParameterStability([
  { excessAnnualizedReturnPercent: 20, sharpe: 1.5 },
  { excessAnnualizedReturnPercent: -12, sharpe: -0.5 },
  { excessAnnualizedReturnPercent: -8, sharpe: -0.3 },
]);
assert.equal(unstable.state, "FRAGILE");

const strategyReturns = Array.from({ length: 252 }, (_, index) => 0.0008 + (index % 7 === 0 ? 0.001 : -0.0001));
const benchmarkReturns = Array.from({ length: 252 }, (_, index) => 0.0002 + (index % 11 === 0 ? 0.0003 : -0.00005));
const bootstrap = pairedBlockBootstrapOutperformance(strategyReturns, benchmarkReturns, { iterations: 300, blockSize: 10, seed: 42 });
assert.equal(bootstrap.state, "ROBUST", JSON.stringify(bootstrap));
assert(bootstrap.probabilityOutperformPercent >= 65);

const insufficientBootstrap = pairedBlockBootstrapOutperformance([0.01, 0.02], [0.01, 0.01]);
assert.equal(insufficientBootstrap.state, "INSUFFICIENT");

const robustCost = evaluateCostSensitivity([
  { costBps: 10, excessAnnualizedReturnPercent: 6 },
  { costBps: 25, excessAnnualizedReturnPercent: 4 },
  { costBps: 50, excessAnnualizedReturnPercent: 1 },
]);
assert.equal(robustCost.state, "ROBUST");

const fragileCost = evaluateCostSensitivity([
  { costBps: 10, excessAnnualizedReturnPercent: 1 },
  { costBps: 25, excessAnnualizedReturnPercent: -1 },
  { costBps: 50, excessAnnualizedReturnPercent: -3 },
]);
assert.equal(fragileCost.state, "FRAGILE");

console.log("Fenice strategy robustness tests: PASS");
