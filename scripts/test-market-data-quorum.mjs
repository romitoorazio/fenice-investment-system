import assert from "node:assert/strict";
import { evaluateMarketDataQuorum } from "../lib/trading/market-data-quorum.ts";

const now = Date.parse("2026-09-21T18:00:00.000Z");
const t = (secondsAgo) => new Date(now - secondsAgo * 1000).toISOString();
const paper = (source, sourceFamily, price, secondsAgo = 10) => ({
  source,
  sourceFamily,
  eligibility: "PAPER",
  price,
  observedAt: t(secondsAgo),
});

const green = evaluateMarketDataQuorum([
  paper("Provider A", "family-a", 100, 10),
  paper("Provider B", "family-b", 100.2, 12),
  paper("Provider C", "family-c", 99.9, 8),
], undefined, now);
assert.equal(green.state, "GREEN");
assert.equal(green.allowNewRisk, true);
assert.equal(green.independentSources, 3);
assert.deepEqual(green.sourceFamilies, ["family-a", "family-b", "family-c"]);
assert.ok(Number(green.maxSpreadPercent) <= 0.75);

const caution = evaluateMarketDataQuorum([
  paper("Provider A", "family-a", 100),
  paper("Provider B", "family-b", 100.1),
], undefined, now);
assert.equal(caution.state, "CAUTION");
assert.equal(caution.allowNewRisk, true);
assert.equal(caution.independentSources, 2);

const insufficient = evaluateMarketDataQuorum([
  paper("Provider A", "family-a", 100),
], undefined, now);
assert.equal(insufficient.state, "BLOCKED");
assert.equal(insufficient.allowNewRisk, false);

const stale = evaluateMarketDataQuorum([
  paper("Provider A", "family-a", 100, 500),
  paper("Provider B", "family-b", 100.1, 500),
], undefined, now);
assert.equal(stale.state, "BLOCKED");
assert.equal(stale.allowNewRisk, false);

const divergent = evaluateMarketDataQuorum([
  paper("Provider A", "family-a", 100),
  paper("Provider B", "family-b", 102),
  paper("Provider C", "family-c", 99.9),
], undefined, now);
assert.equal(divergent.state, "BLOCKED");
assert.equal(divergent.allowNewRisk, false);

const duplicateFamily = evaluateMarketDataQuorum([
  paper("Provider A primary", "family-a", 100, 20),
  paper("Provider A alias", "family-a", 100.05, 5),
  paper("Provider B", "family-b", 100.1, 10),
], undefined, now);
assert.equal(duplicateFamily.independentSources, 2, "two labels from the same provider family must count once");
assert.equal(duplicateFamily.state, "CAUTION");

const validationOnlyExcluded = evaluateMarketDataQuorum([
  paper("Provider A", "family-a", 100),
  { source: "EOD validation", sourceFamily: "eod-family", eligibility: "VALIDATION_ONLY", price: 100.1, observedAt: t(5) },
], undefined, now);
assert.equal(validationOnlyExcluded.allowNewRisk, false);
assert.equal(validationOnlyExcluded.independentSources, 1);
assert.equal(validationOnlyExcluded.ineligibleEvidence, 1);

const missingEligibilityFailsClosed = evaluateMarketDataQuorum([
  { source: "legacy-a", sourceFamily: "family-a", price: 100, observedAt: t(5) },
  { source: "legacy-b", sourceFamily: "family-b", price: 100.1, observedAt: t(5) },
], undefined, now);
assert.equal(missingEligibilityFailsClosed.allowNewRisk, false, "untagged legacy evidence must not silently become execution eligible");
assert.equal(missingEligibilityFailsClosed.ineligibleEvidence, 2);

const liveRequiresLive = evaluateMarketDataQuorum([
  paper("Paper A", "family-a", 100),
  paper("Paper B", "family-b", 100.1),
  { source: "Live C", sourceFamily: "family-c", eligibility: "LIVE", price: 100.05, observedAt: t(5) },
], { ...undefined, minIndependentSources: 2, preferredIndependentSources: 3, maxQuoteAgeSeconds: 120, maxSpreadPercent: 0.75, requiredEligibility: "LIVE" }, now);
assert.equal(liveRequiresLive.allowNewRisk, false);
assert.equal(liveRequiresLive.independentSources, 1);
assert.equal(liveRequiresLive.requiredEligibility, "LIVE");

const invalidExcluded = evaluateMarketDataQuorum([
  paper("Provider A", "family-a", 100),
  paper("Provider B", "family-b", 100.1),
  { source: "bad", sourceFamily: "bad", eligibility: "PAPER", price: 0, observedAt: t(10) },
], undefined, now);
assert.equal(invalidExcluded.allowNewRisk, true);
assert.equal(invalidExcluded.invalidEvidence, 1);

console.log("Fenice market-data quorum tests: PASS");
