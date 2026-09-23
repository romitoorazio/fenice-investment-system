import assert from "node:assert/strict";
import {
  computeIntelligenceConfidence,
  computeSourceConcentration,
  deriveCryptoVenueTargets,
  deriveStooqTargets,
  filterFreshValidationEvidence,
  parseStooqTimestamp,
  settleWithConcurrency,
} from "../lib/intelligence/quality-engine.mjs";

const observations = [
  { symbol: "BTC", name: "Bitcoin", assetClass: "Criptovaluta", currency: "USD", source: "CoinGecko" },
  { symbol: "ETH", name: "Ethereum", assetClass: "Criptovaluta", currency: "USD", source: "CoinGecko" },
  { symbol: "SPY", assetClass: "ETF", currency: "USD", source: "Alpha Vantage" },
  { symbol: "QQQ", assetClass: "ETF", currency: "USD", source: "Alpha Vantage" },
];

const cryptoTargets = deriveCryptoVenueTargets(observations, 12);
assert.deepEqual(cryptoTargets.map(([symbol]) => symbol), ["BTC", "ETH"]);

const stooqTargets = deriveStooqTargets(observations, [["spy.us", "SPY", "ETF"]], 10);
assert(stooqTargets.some(([, symbol]) => symbol === "SPY"));
assert(stooqTargets.some(([, symbol]) => symbol === "QQQ"));
assert(!stooqTargets.some(([, symbol]) => symbol === "BTC"));

assert.equal(
  parseStooqTimestamp("2026-09-23", "16:00:00", "Europe/Warsaw"),
  "2026-09-23T14:00:00.000Z",
  "Stooq summer timestamps must respect Warsaw daylight saving time",
);
assert.equal(
  parseStooqTimestamp("2026-01-21", "16:00:00", "Europe/Warsaw"),
  "2026-01-21T15:00:00.000Z",
  "Stooq winter timestamps must respect Warsaw standard time",
);
assert.equal(parseStooqTimestamp("2026-09-23", "bad", "Europe/Warsaw"), null);
assert.equal(parseStooqTimestamp("bad", "16:00:00", "Europe/Warsaw"), null);
assert.equal(parseStooqTimestamp("2026-09-23", "16:00:00", "Not/AZone"), null);

assert.equal(computeSourceConcentration([
  { source: "A" }, { source: "A" }, { source: "B" }, { source: "C" },
]), 0.5);

const now = Date.parse("2026-09-21T18:00:00Z");
const freshEvidence = filterFreshValidationEvidence([
  { symbol: "BTC", assetClass: "Criptovaluta", observedAt: new Date(now - 2 * 3_600_000).toISOString() },
  { symbol: "ETH", assetClass: "Criptovaluta", observedAt: new Date(now - 5 * 3_600_000).toISOString() },
  { symbol: "SPY", assetClass: "ETF", observedAt: new Date(now - 72 * 3_600_000).toISOString() },
  { symbol: "QQQ", assetClass: "ETF", observedAt: new Date(now - 120 * 3_600_000).toISOString() },
  { symbol: "RXRX", assetClass: "AI Biotech", observedAt: "2026-09-21" },
  { symbol: "MISSING", assetClass: "ETF", observedAt: null },
], { now });
assert.deepEqual(freshEvidence.map((item) => item.symbol), ["BTC", "SPY"]);

const dateOnlyAllowedForNonCrossValidationUse = filterFreshValidationEvidence([
  { symbol: "RXRX", assetClass: "AI Biotech", observedAt: "2026-09-21" },
], { now, requirePreciseTimestamp: false });
assert.equal(dateOnlyAllowedForNonCrossValidationUse.length, 1);

const freshHealthAt = new Date(now - 60 * 60 * 1000).toISOString();

const healthy = computeIntelligenceConfidence({
  sourceQuality: [
    { state: "operativo", qualityScore: 98 },
    { state: "operativo", qualityScore: 96 },
    { state: "parziale", qualityScore: 90 },
    { state: "errore", qualityScore: 8 },
  ],
  criticalHealth: { gate: "GREEN", ready: 9, total: 9 },
  healthReportGeneratedAt: freshHealthAt,
  validations: Array.from({ length: 12 }, () => ({ status: "confermato" })),
  sourceCount: 4,
  assetClassCount: 4,
  concentration: 0.42,
  now,
});
assert(healthy.confidence >= 90, `healthy confidence too low: ${healthy.confidence}`);
assert.equal(healthy.metrics.criticalHealthFresh, true);

const missingCritical = computeIntelligenceConfidence({
  sourceQuality: [{ state: "operativo", qualityScore: 100 }],
  criticalHealth: { gate: "RED", ready: 8, total: 9 },
  healthReportGeneratedAt: freshHealthAt,
  validations: Array.from({ length: 20 }, () => ({ status: "confermato" })),
  sourceCount: 5,
  assetClassCount: 5,
  concentration: 0.2,
  now,
});
assert(missingCritical.confidence <= 74);

const staleCriticalHealth = computeIntelligenceConfidence({
  sourceQuality: [{ state: "operativo", qualityScore: 100 }],
  criticalHealth: { gate: "GREEN", ready: 9, total: 9 },
  healthReportGeneratedAt: new Date(now - 30 * 60 * 60 * 1000).toISOString(),
  validations: Array.from({ length: 20 }, () => ({ status: "confermato" })),
  sourceCount: 5,
  assetClassCount: 5,
  concentration: 0.2,
  now,
});
assert.equal(staleCriticalHealth.metrics.criticalHealthFresh, false);
assert(staleCriticalHealth.confidence <= 74, `stale critical health must cap confidence, got ${staleCriticalHealth.confidence}`);

const missingHealthTimestamp = computeIntelligenceConfidence({
  sourceQuality: [{ state: "operativo", qualityScore: 100 }],
  criticalHealth: { gate: "GREEN", ready: 9, total: 9 },
  validations: Array.from({ length: 20 }, () => ({ status: "confermato" })),
  sourceCount: 5,
  assetClassCount: 5,
  concentration: 0.2,
  now,
});
assert.equal(missingHealthTimestamp.metrics.criticalHealthFresh, false);
assert(missingHealthTimestamp.confidence <= 74);

const divergent = computeIntelligenceConfidence({
  sourceQuality: [{ state: "operativo", qualityScore: 100 }],
  criticalHealth: { gate: "GREEN", ready: 9, total: 9 },
  healthReportGeneratedAt: freshHealthAt,
  validations: [
    ...Array.from({ length: 12 }, () => ({ status: "confermato" })),
    { status: "divergente" },
  ],
  sourceCount: 5,
  assetClassCount: 5,
  concentration: 0.2,
  now,
});
assert(divergent.confidence <= 84);

let active = 0;
let peak = 0;
const tasks = Array.from({ length: 20 }, (_, index) => async () => {
  active += 1;
  peak = Math.max(peak, active);
  await new Promise((resolve) => setTimeout(resolve, 2));
  active -= 1;
  return index;
});
const results = await settleWithConcurrency(tasks, 4);
assert.equal(results.filter((item) => item.status === "fulfilled").length, 20);
assert(peak <= 4, `concurrency exceeded: ${peak}`);

console.log("Fenice intelligence quality engine tests: PASS");
