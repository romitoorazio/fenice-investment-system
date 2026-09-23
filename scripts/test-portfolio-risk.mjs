import assert from "node:assert/strict";
import { evaluatePortfolioRisk } from "../lib/trading/portfolio-risk.ts";

const seriesA = Array.from({ length: 30 }, (_, i) => Math.sin(i / 4) * 0.01 + i * 0.0001);
const seriesB = Array.from({ length: 30 }, (_, i) => Math.cos(i / 5) * 0.008 - i * 0.00005);
const seriesC = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 0.004 : -0.004));

const normal = evaluatePortfolioRisk(10_000, [
  { symbol: "A", notionalEuro: 700, sector: "TECH", assetClass: "EQUITY", returns: seriesA },
  { symbol: "B", notionalEuro: 600, sector: "HEALTH", assetClass: "EQUITY", returns: seriesB },
  { symbol: "C", notionalEuro: 500, sector: "ENERGY", assetClass: "COMMODITY", returns: seriesC },
]);
assert.equal(normal.allowNewRisk, true);
assert.ok(["NORMAL", "CAUTION"].includes(normal.state));
assert.ok(normal.largestPositionPercent <= 15);
assert.ok(normal.correlationPairs >= 3);

const sectorFreeze = evaluatePortfolioRisk(10_000, [
  { symbol: "A", notionalEuro: 1_500, sector: "TECH", assetClass: "EQUITY" },
  { symbol: "B", notionalEuro: 1_200, sector: "TECH", assetClass: "EQUITY" },
  { symbol: "C", notionalEuro: 1_000, sector: "TECH", assetClass: "EQUITY" },
]);
assert.equal(sectorFreeze.state, "FREEZE");
assert.equal(sectorFreeze.allowNewRisk, false);
assert.ok(sectorFreeze.reasons.some((reason) => reason.includes("sector exposure")));

const correlated = Array.from({ length: 30 }, (_, i) => Math.sin(i / 3) * 0.01);
const correlationFreeze = evaluatePortfolioRisk(10_000, [
  { symbol: "A", notionalEuro: 1_500, sector: "TECH", assetClass: "EQUITY", returns: correlated },
  { symbol: "B", notionalEuro: 1_500, sector: "HEALTH", assetClass: "EQUITY", returns: correlated.map((x) => x * 1.01) },
  { symbol: "C", notionalEuro: 1_500, sector: "ENERGY", assetClass: "ETF", returns: correlated.map((x) => x * 0.99) },
]);
assert.equal(correlationFreeze.state, "FREEZE");
assert.equal(correlationFreeze.allowNewRisk, false);
assert.ok((correlationFreeze.maxCorrelatedClusterPercent ?? 0) >= 45);

const missingCorrelation = evaluatePortfolioRisk(10_000, [
  { symbol: "A", notionalEuro: 1_100, sector: "TECH", assetClass: "EQUITY" },
  { symbol: "B", notionalEuro: 1_100, sector: "HEALTH", assetClass: "EQUITY" },
]);
assert.equal(missingCorrelation.allowNewRisk, true);
assert.equal(missingCorrelation.state, "CAUTION");
assert.ok(missingCorrelation.reasons.some((reason) => reason.includes("correlation evidence unavailable")));

const invalid = evaluatePortfolioRisk(0, []);
assert.equal(invalid.state, "FREEZE");
assert.equal(invalid.allowNewRisk, false);

console.log("Fenice portfolio concentration/correlation risk tests: PASS");
