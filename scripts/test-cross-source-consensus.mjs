import assert from "node:assert/strict";
import {
  buildCrossSourceValidation,
  deriveCryptoConflictEscalationTargets,
  mergeEvidenceBySource,
} from "../lib/intelligence/cross-source-consensus.mjs";

const baseConflict = [
  {
    symbol: "BCH", name: "Bitcoin Cash", assetClass: "Criptovaluta", currency: "USD",
    source: "CoinGecko", price: 500, observedAt: "2026-09-23T10:00:00Z",
  },
  {
    symbol: "BCH", name: "Bitcoin Cash", assetClass: "Criptovaluta", currency: "USD",
    source: "Yahoo Finance independent validation", price: 515, observedAt: "2026-09-23T10:00:10Z",
  },
];

const unresolved = buildCrossSourceValidation(baseConflict);
assert.equal(unresolved.length, 1);
assert.equal(unresolved[0].status, "divergente", "two-source >2% conflict must remain fail-closed");
assert(unresolved[0].spreadPercent > 2);
assert.equal(unresolved[0].confidenceCredit, 0, "divergent evidence must never receive confidence credit");

const targets = deriveCryptoConflictEscalationTargets(baseConflict, { limit: 4 });
assert.equal(targets.length, 1);
assert.equal(targets[0].symbol, "BCH");
assert(targets[0].spreadPercent > 2);

const venueConsensus = mergeEvidenceBySource(baseConflict, [
  {
    symbol: "BCH", name: "Bitcoin Cash", assetClass: "Criptovaluta", currency: "USD",
    source: "Coinbase Exchange independent validation", price: 500.4, observedAt: "2026-09-23T10:00:12Z",
  },
  {
    symbol: "BCH", name: "Bitcoin Cash", assetClass: "Criptovaluta", currency: "USD",
    source: "Kraken independent validation", price: 500.2, observedAt: "2026-09-23T10:00:13Z",
  },
]);
const resolved = buildCrossSourceValidation(venueConsensus);
assert.equal(resolved.length, 1);
assert.equal(resolved[0].status, "attenzione", "strict venue majority may isolate one outlier but must not silently mark the instrument confirmed");
assert.deepEqual(new Set(resolved[0].consensusSources), new Set([
  "CoinGecko",
  "Coinbase Exchange independent validation",
  "Kraken independent validation",
]));
assert.deepEqual(resolved[0].outlierSources, ["Yahoo Finance independent validation"]);
assert(resolved[0].consensusSpreadPercent <= 0.5);
assert(resolved[0].spreadPercent > 2, "raw full-range spread remains visible after outlier isolation");
assert.equal(resolved[0].confidenceCredit, 0, "majority consensus must not earn confidence credit when the full range breaches divergence");

const moderateMajority = buildCrossSourceValidation([
  { symbol: "SOL", assetClass: "Criptovaluta", currency: "USD", source: "A", price: 100 },
  { symbol: "SOL", assetClass: "Criptovaluta", currency: "USD", source: "B", price: 100.2 },
  { symbol: "SOL", assetClass: "Criptovaluta", currency: "USD", source: "C", price: 101.2 },
]);
assert.equal(moderateMajority[0].status, "attenzione");
assert.equal(moderateMajority[0].consensusSources.length, 2);
assert(moderateMajority[0].spreadPercent < 2);
assert.equal(moderateMajority[0].confidenceCredit, 1, "strict majority inside confirmation band may earn full validation credit while remaining ATTENTION");

const ordinaryAttention = buildCrossSourceValidation([
  { symbol: "ETH", assetClass: "Criptovaluta", currency: "USD", source: "A", price: 100 },
  { symbol: "ETH", assetClass: "Criptovaluta", currency: "USD", source: "B", price: 101 },
]);
assert.equal(ordinaryAttention[0].status, "attenzione");
assert(ordinaryAttention[0].confidenceCredit > 0 && ordinaryAttention[0].confidenceCredit < 1, "ordinary ATTENTION must receive graded—not binary—confidence credit");
assert.equal(ordinaryAttention[0].confirmationBandPercent, 0.5);
assert.equal(ordinaryAttention[0].divergenceBandPercent, 2);

const noMajority = buildCrossSourceValidation([
  { symbol: "XYZ", assetClass: "Criptovaluta", currency: "USD", source: "A", price: 100 },
  { symbol: "XYZ", assetClass: "Criptovaluta", currency: "USD", source: "B", price: 103 },
  { symbol: "XYZ", assetClass: "Criptovaluta", currency: "USD", source: "C", price: 106 },
]);
assert.equal(noMajority[0].status, "divergente", "three-way disagreement without strict majority must stay divergent");
assert.equal(noMajority[0].confidenceCredit, 0);

const confirmedPair = [
  { symbol: "BTC", name: "Bitcoin", assetClass: "Criptovaluta", currency: "USD", source: "A", price: 100000 },
  { symbol: "BTC", name: "Bitcoin", assetClass: "Criptovaluta", currency: "USD", source: "B", price: 100300 },
];
const confirmed = buildCrossSourceValidation(confirmedPair)[0];
assert.equal(confirmed.status, "confermato");
assert.equal(confirmed.confidenceCredit, 1);
assert.equal(deriveCryptoConflictEscalationTargets(confirmedPair).length, 0, "already confirmed pair must not spend escalation calls");

const newer = mergeEvidenceBySource([
  { symbol: "ETH", currency: "USD", source: "A", price: 4000, observedAt: "2026-09-23T09:00:00Z" },
], [
  { symbol: "ETH", currency: "USD", source: "A", price: 4010, observedAt: "2026-09-23T10:00:00Z" },
]);
assert.equal(newer.length, 1);
assert.equal(newer[0].price, 4010, "evidence merge must keep the newest observation per source");

console.log("Fenice cross-source consensus tests: PASS");
