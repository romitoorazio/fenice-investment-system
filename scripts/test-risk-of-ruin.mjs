import assert from "node:assert/strict";
import { evaluateRiskOfRuin } from "../lib/trading/risk-of-ruin.ts";

const green = evaluateRiskOfRuin({
  capitalEuro: 10000,
  riskPerTradePercent: 0.5,
  validatedTrades: 120,
  winRate: 0.55,
  averageWinLossRatio: 1.5,
  currentDrawdownPercent: 2,
});
assert.equal(green.allowNewRisk, true);
assert.ok(["GREEN", "CAUTION"].includes(green.state));
assert.ok(green.allowedRiskPerTradePercent >= 0.5);
assert.ok(green.projectedTotalDrawdownPercent < 20);

const insufficientEvidence = evaluateRiskOfRuin({
  capitalEuro: 10000,
  riskPerTradePercent: 0.5,
  validatedTrades: 10,
  winRate: 0.6,
  averageWinLossRatio: 1.5,
});
assert.equal(insufficientEvidence.state, "BLOCKED");
assert.equal(insufficientEvidence.allowNewRisk, false);
assert.ok(insufficientEvidence.reasons.some((reason) => reason.includes("insufficient validated trades")));

const negativeEdge = evaluateRiskOfRuin({
  capitalEuro: 10000,
  riskPerTradePercent: 0.25,
  validatedTrades: 100,
  winRate: 0.4,
  averageWinLossRatio: 1,
});
assert.equal(negativeEdge.state, "BLOCKED");
assert.equal(negativeEdge.allowNewRisk, false);
assert.ok(negativeEdge.reasons.some((reason) => reason.includes("edge")));

const excessiveRisk = evaluateRiskOfRuin({
  capitalEuro: 10000,
  riskPerTradePercent: 2,
  validatedTrades: 200,
  winRate: 0.6,
  averageWinLossRatio: 1.8,
});
assert.equal(excessiveRisk.state, "BLOCKED");
assert.equal(excessiveRisk.allowNewRisk, false);
assert.ok(excessiveRisk.reasons.some((reason) => reason.includes("conservative cap")));

const drawdownPressure = evaluateRiskOfRuin({
  capitalEuro: 10000,
  riskPerTradePercent: 0.5,
  validatedTrades: 150,
  winRate: 0.6,
  averageWinLossRatio: 1.5,
  currentDrawdownPercent: 18,
  maxConsecutiveLosses: 8,
  maxProjectedDrawdownPercent: 20,
});
assert.equal(drawdownPressure.state, "BLOCKED");
assert.equal(drawdownPressure.allowNewRisk, false);

const invalid = evaluateRiskOfRuin({
  capitalEuro: 0,
  riskPerTradePercent: 0.5,
  validatedTrades: 100,
  winRate: 0.6,
  averageWinLossRatio: 1.5,
});
assert.equal(invalid.state, "BLOCKED");
assert.equal(invalid.allowNewRisk, false);

console.log("Fenice risk-of-ruin firewall tests: PASS");
