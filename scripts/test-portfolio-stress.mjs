import assert from "node:assert/strict";
import { evaluatePortfolioStress } from "../lib/trading/portfolio-stress.ts";

const scenarios = [
  {
    id: "equity-shock",
    label: "Global equity selloff",
    factorShocksPercent: { MARKET: -12, TECH: -8, ENERGY: -5 },
  },
  {
    id: "rates-up",
    label: "Rates shock",
    factorShocksPercent: { RATES: -10, DURATION: -12, MARKET: -3 },
  },
];

const diversified = evaluatePortfolioStress(10_000, [
  { symbol: "A", notionalEuro: 1_500, factorExposures: { MARKET: 0.7, TECH: 0.2 } },
  { symbol: "B", notionalEuro: 1_000, factorExposures: { MARKET: 0.4, ENERGY: 0.6 } },
  { symbol: "C", notionalEuro: 1_000, factorExposures: { RATES: 0.5, DURATION: 0.5 } },
], scenarios);
assert.equal(diversified.allowNewRisk, true, diversified.reasons.join(" | "));
assert.notEqual(diversified.state, "FREEZE");
assert(diversified.factorCoveragePercent >= 99);
assert(diversified.worstScenarioLossPercent < 10);

const highBeta = evaluatePortfolioStress(10_000, [
  { symbol: "TECH1", notionalEuro: 6_000, factorExposures: { MARKET: 1.4, TECH: 1.2 } },
], scenarios);
assert.equal(highBeta.allowNewRisk, false);
assert.equal(highBeta.state, "FREEZE");
assert(highBeta.worstScenarioLossPercent > 10);

const missingCoverage = evaluatePortfolioStress(10_000, [
  { symbol: "UNKNOWN", notionalEuro: 3_000 },
  { symbol: "KNOWN", notionalEuro: 500, factorExposures: { MARKET: 1 } },
], scenarios);
assert.equal(missingCoverage.allowNewRisk, false);
assert.equal(missingCoverage.state, "FREEZE");
assert(missingCoverage.reasons.some((reason) => reason.includes("factor stress coverage")));

const noScenarios = evaluatePortfolioStress(10_000, [
  { symbol: "A", notionalEuro: 1_000, factorExposures: { MARKET: 1 } },
], []);
assert.equal(noScenarios.allowNewRisk, false);
assert.equal(noScenarios.state, "FREEZE");

console.log("Fenice portfolio factor stress tests: PASS");
