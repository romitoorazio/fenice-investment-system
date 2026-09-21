import assert from "node:assert/strict";
import { evaluateMarketDataQuorum } from "../lib/trading/market-data-quorum.ts";

const now = Date.parse("2026-09-21T18:00:00.000Z");
const t = (secondsAgo) => new Date(now - secondsAgo * 1000).toISOString();

const green = evaluateMarketDataQuorum([
  { source: "source-a", price: 100, observedAt: t(10) },
  { source: "source-b", price: 100.2, observedAt: t(12) },
  { source: "source-c", price: 99.9, observedAt: t(8) },
], undefined, now);
assert.equal(green.state, "GREEN");
assert.equal(green.allowNewRisk, true);
assert.equal(green.independentSources, 3);
assert.ok(Number(green.maxSpreadPercent) <= 0.75);

const caution = evaluateMarketDataQuorum([
  { source: "source-a", price: 100, observedAt: t(10) },
  { source: "source-b", price: 100.1, observedAt: t(10) },
], undefined, now);
assert.equal(caution.state, "CAUTION");
assert.equal(caution.allowNewRisk, true);
assert.equal(caution.independentSources, 2);

const insufficient = evaluateMarketDataQuorum([
  { source: "source-a", price: 100, observedAt: t(10) },
], undefined, now);
assert.equal(insufficient.state, "BLOCKED");
assert.equal(insufficient.allowNewRisk, false);

const stale = evaluateMarketDataQuorum([
  { source: "source-a", price: 100, observedAt: t(500) },
  { source: "source-b", price: 100.1, observedAt: t(500) },
], undefined, now);
assert.equal(stale.state, "BLOCKED");
assert.equal(stale.allowNewRisk, false);

const divergent = evaluateMarketDataQuorum([
  { source: "source-a", price: 100, observedAt: t(10) },
  { source: "source-b", price: 102, observedAt: t(10) },
  { source: "source-c", price: 99.9, observedAt: t(10) },
], undefined, now);
assert.equal(divergent.state, "BLOCKED");
assert.equal(divergent.allowNewRisk, false);

const duplicateSource = evaluateMarketDataQuorum([
  { source: "source-a", price: 100, observedAt: t(20) },
  { source: "SOURCE-A", price: 100.05, observedAt: t(5) },
  { source: "source-b", price: 100.1, observedAt: t(10) },
], undefined, now);
assert.equal(duplicateSource.independentSources, 2);
assert.equal(duplicateSource.state, "CAUTION");

const invalidExcluded = evaluateMarketDataQuorum([
  { source: "source-a", price: 100, observedAt: t(10) },
  { source: "source-b", price: 100.1, observedAt: t(10) },
  { source: "bad", price: 0, observedAt: t(10) },
], undefined, now);
assert.equal(invalidExcluded.allowNewRisk, true);
assert.equal(invalidExcluded.invalidEvidence, 1);

console.log("Fenice market-data quorum tests: PASS");
