import assert from "node:assert/strict";
import { buildV7NetEvidence } from "./report-v7-net-evidence.mjs";

// Synthetic fixtures only: no broker, network or PAPER campaign writes.
const now = Date.parse("2026-10-10T16:00:00.000Z");
const fixture = generatedAt => ({
  shadow: {
    generatedAt,
    methodology: { sourceFreshnessHours: 26 },
    safety: { diagnosticOnly: true, liveTradingAllowed: false },
    matured7d: { sampleSize: 0, maturity: "INSUFFICIENT" },
    matured30d: { sampleSize: 0, maturity: "INSUFFICIENT" },
    latestRecords: [{ symbol: "TEST", stagedMarkToMarketPercent: 1.5 }],
  },
  promotion: { state: "LOCKED", safety: { diagnosticOnly: true, liveTradingAllowed: false }, blockers: ["NO_MATURE_BUY_SAMPLES"] },
  campaign: { liveTradingAllowed: false, dailyEvidence: [] },
});

const exact = buildV7NetEvidence(fixture(new Date(now - 26 * 3600_000).toISOString()), now);
assert.equal(exact.source.fresh, true, "exact freshness boundary should pass");
const expired = buildV7NetEvidence(fixture(new Date(now - 26 * 3600_000 - 1000).toISOString()), now);
assert.equal(expired.source.fresh, false, "one second over freshness boundary must fail closed");
assert.ok(expired.source.ageHours > 26, "source age must not be rounded to hide staleness");
for (const value of [new Date(now + 1000).toISOString(), "bad timestamp", null]) {
  assert.equal(buildV7NetEvidence(fixture(value), now).source.fresh, false);
}
assert.equal(expired.liveTradingAllowed, false);
assert.equal(expired.brokerOrderSubmissionAllowed, false);
assert.equal(expired.shadowPromotion.automaticPromotionAllowed, false);
assert.equal(expired.conclusion, "NO_VERIFIED_NET_EDGE");
assert.equal(expired.horizons[0].verifiedNetReturnPercent, null);
assert.equal(expired.horizons[0].performanceClaimAllowed, false);
assert.equal(expired.latestResearchMarks[0].executedBrokerOrder, false);
assert.throws(() => buildV7NetEvidence({ ...fixture(new Date(now).toISOString()), campaign: { liveTradingAllowed: true } }, now), /safety flags/i);
console.log("PASS: V7 exact freshness, future timestamps, fail-closed safety and no net-performance claims");
