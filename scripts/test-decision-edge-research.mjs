import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateDecisionBenchmarkEdge } from "../lib/intelligence/decision-edge-research.mjs";

const start = "2026-10-01T18:00:00.000Z";
const exit = "2026-10-02T18:00:00.000Z";
const now = new Date("2026-10-08T21:00:00Z");

function row(symbol, decision, initial, final, options = {}) {
  const percentage = (final / initial - 1) * 100;
  return {
    id: `2026-10-01:${symbol}:${decision}`,
    symbol, currency: "USD", decision, createdAt: start,
    observationDate: "2026-10-01", referencePrice: initial,
    historicalBackfill: true,
    checkpoints: {
      "1d": { measuredAt: exit, source: "committee-history", price: final, returnPercent: Math.round(percentage * 100) / 100 },
    },
    ...options,
  };
}

const spy = row("SPY", "ATTENDI", 100, 102);
const nvidia = row("NVDA", "COMPRA", 50, 55);
const qqq = row("QQQ", "OSSERVA", 200, 198, { historicalBackfill: false });

const data = evaluateDecisionBenchmarkEdge([spy, nvidia, qqq], { now });
const day = data.horizons["1d"];
assert.equal(data.benchmark, "SPY");
assert.equal(data.currency, "USD");
assert.equal(data.assumedRoundTripCostPercent, 0.3);
assert.equal(day.pairedSamples, 2);
assert.equal(day.uniqueDays, 1);
assert.equal(day.buySignalSamples, 1);
assert.equal(day.waitOrAvoidSamples, 1);
assert.equal(day.historicalBackfillSamples, 1);
assert.equal(day.forwardObservedSamples, 1);
assert.equal(day.hypotheticalMeanReturnAfterCostPercent, 4.2);
assert.equal(day.benchmarkMeanGrossReturnPercent, 2);
assert.equal(day.hypotheticalMeanExcessVsBenchmarkPercent, 2.2);
assert.equal(day.hypotheticalPositiveNetRatePercent, 50);
assert.equal(day.hypotheticalBeatBenchmarkRatePercent, 50);
assert.equal(data.hasVerifiedProfit, false);
assert.equal(data.isolation.liveTradingAllowed, false);
assert.equal(data.isolation.executionEligible, false);
assert.equal(data.isolation.paperCertificationEligible, false);
assert.equal(data.isolation.feedsV6CalibrationPolicy, false);
assert.equal(data.horizons["30d"].hypotheticalMeanExcessVsBenchmarkPercent, null);

assert.equal(
  evaluateDecisionBenchmarkEdge([spy, qqq, nvidia, { ...nvidia, decision: "EVITA", id: "duplicate" }], { now }).horizons["1d"].pairedSamples,
  2, "ticker/date may only be scored once, regardless of committee decision changes",
);

const unsafeCases = [
  ["missing quote", { referencePrice: null }],
  ["blank quote", { referencePrice: "" }],
  ["zero quote", { referencePrice: 0 }],
  ["missing end quote", { checkpoints: { "1d": { ...nvidia.checkpoints["1d"], price: null } } }],
  ["fabricated +999% return", { checkpoints: { "1d": { ...nvidia.checkpoints["1d"], returnPercent: 999 } } }],
  ["missing source", { checkpoints: { "1d": { ...nvidia.checkpoints["1d"], source: "" } } }],
  ["unverified source", { checkpoints: { "1d": { ...nvidia.checkpoints["1d"], source: "rss-headline" } } }],
  ["wrong currency", { currency: "EUR" }],
  ["missing currency", { currency: null }],
  ["forged origin date", { observationDate: "2026-09-30" }],
  ["checkpoint before time horizon", { checkpoints: { "1d": { ...nvidia.checkpoints["1d"], measuredAt: "2026-10-01T20:00:00Z" } } }],
  ["checkpoint too late", { checkpoints: { "1d": { ...nvidia.checkpoints["1d"], measuredAt: "2026-10-10T20:00:00Z" } } }],
  ["wrong decision", { decision: "BUY_NOW" }],
  ["malformed createdAt", { createdAt: "2026-02-30T18:00:00Z" }],
];
for (const [name, changes] of unsafeCases) {
  const altered = { ...nvidia, ...changes };
  const result = evaluateDecisionBenchmarkEdge([spy, altered], { now });
  assert.equal(result.horizons["1d"].pairedSamples, 0, name);
  assert.equal(result.horizons["1d"].hypotheticalMeanExcessVsBenchmarkPercent, null, name);
}
const differentExit = { ...nvidia, checkpoints: { "1d": { ...nvidia.checkpoints["1d"], measuredAt: "2026-10-03T18:00:00Z" } } };
assert.equal(evaluateDecisionBenchmarkEdge([spy, differentExit], { now }).horizons["1d"].pairedSamples, 0, "same exit date required");
assert.equal(evaluateDecisionBenchmarkEdge([spy, nvidia], { now: new Date("2026-10-02T00:00:00Z") }).horizons["1d"].pairedSamples, 0, "future marks must not be scored");
assert.equal(evaluateDecisionBenchmarkEdge([nvidia], { now }).horizons["1d"].pairedSamples, 0, "missing independent benchmark must remain N/D");
assert.equal(evaluateDecisionBenchmarkEdge([spy, nvidia], { now, costPercent: 10 }).horizons["1d"].hypotheticalMeanExcessVsBenchmarkPercent, -2);
assert.throws(() => evaluateDecisionBenchmarkEdge([spy, nvidia], { now, costPercent: -1 }), /Invalid cost/);
assert.throws(() => evaluateDecisionBenchmarkEdge([spy, nvidia], { now: new Date("invalid") }), /Invalid valuation/);

const runner = await readFile(new URL("./run-decision-outcomes.mjs", import.meta.url), "utf8");
assert.match(runner, /researchEdge: evaluateDecisionBenchmarkEdge\(ledger\.records, \{ now \}\)/);
assert.match(runner, /modifiesV6DecisionLedger: false/);
console.log("V7 SPY same-window cost-aware opportunity research, evidence checks, no fake profits: PASS");
