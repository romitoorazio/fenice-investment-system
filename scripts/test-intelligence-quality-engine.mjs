import assert from "node:assert/strict";
import {
  computeIntelligenceConfidence,
  computeSourceConcentration,
  deriveCryptoVenueTargets,
  deriveStooqTargets,
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

assert.equal(computeSourceConcentration([
  { source: "A" }, { source: "A" }, { source: "B" }, { source: "C" },
]), 0.5);

const healthy = computeIntelligenceConfidence({
  sourceQuality: [
    { state: "operativo", qualityScore: 98 },
    { state: "operativo", qualityScore: 96 },
    { state: "parziale", qualityScore: 90 },
    { state: "errore", qualityScore: 8 },
  ],
  criticalHealth: { gate: "GREEN", ready: 9, total: 9 },
  validations: Array.from({ length: 12 }, () => ({ status: "confermato" })),
  sourceCount: 4,
  assetClassCount: 4,
  concentration: 0.42,
});
assert(healthy.confidence >= 90, `healthy confidence too low: ${healthy.confidence}`);

const missingCritical = computeIntelligenceConfidence({
  sourceQuality: [{ state: "operativo", qualityScore: 100 }],
  criticalHealth: { gate: "RED", ready: 8, total: 9 },
  validations: Array.from({ length: 20 }, () => ({ status: "confermato" })),
  sourceCount: 5,
  assetClassCount: 5,
  concentration: 0.2,
});
assert(missingCritical.confidence <= 74);

const divergent = computeIntelligenceConfidence({
  sourceQuality: [{ state: "operativo", qualityScore: 100 }],
  criticalHealth: { gate: "GREEN", ready: 9, total: 9 },
  validations: [
    ...Array.from({ length: 12 }, () => ({ status: "confermato" })),
    { status: "divergente" },
  ],
  sourceCount: 5,
  assetClassCount: 5,
  concentration: 0.2,
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
