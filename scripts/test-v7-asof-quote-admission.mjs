import assert from "node:assert/strict";
import { admitV7ResearchQuotes } from "../lib/intelligence/v7-asof-quote-admission.mjs";
import { selectDecisionOutcomeCandidates, updateDecisionOutcomeLedger } from "../lib/intelligence/decision-outcomes.mjs";

const now = new Date("2026-10-14T17:00:00Z");
const generatedAt = "2026-10-14T16:50:00.000Z";
const original = {
  symbol: "SPY", currentPrice: 500.01, decision: "ATTENDI", currency: "USD",
  priceEvidence: {
    price: 500.005, observedAt: "2026-10-14T16:49:59.000Z",
    source: "Yahoo Finance chart META regularMarketPrice/regularMarketTime",
    evidenceType: "YAHOO_REGULAR_TRADE_META_RESEARCH_ONLY",
    executionEligible: false, paperCertificationEligible: false,
    brokerSubmissionAllowed: false, liveTradingAllowed: false,
  },
};
const committee = { generatedAt, allDecisions: [original] };
const ok = admitV7ResearchQuotes(committee, now);
assert.equal(ok.state, "RESEARCH_ONLY");
assert.equal(ok.accepted.length, 1);
assert.equal(ok.prices.get("SPY"), 500.01);
assert.equal(ok.snapshotAsOf, generatedAt);
assert.equal(ok.safety.brokerSubmissionAllowed, false);
const candidates = selectDecisionOutcomeCandidates(ok.accepted);
const ledger = updateDecisionOutcomeLedger({ records: [] }, candidates, ok.prices, {
  now: new Date(ok.snapshotAsOf), cycleId: generatedAt,
});
assert.equal(ledger.records.length, 1);
assert.equal(ledger.records[0].createdAt, generatedAt, "as-of source time, not job run time");

const rejection = [
  ["no proof", { priceEvidence: undefined }, "PRICE_MISSING_OR_MISMATCH"],
  ["quote from future", { priceEvidence: { ...original.priceEvidence, observedAt: "2026-10-14T16:50:01.000Z" } }, "PRICE_TIME_INVALID_STALE_OR_FUTURE"],
  ["quote from tomorrow", { priceEvidence: { ...original.priceEvidence, observedAt: "2026-10-15T16:49:00.000Z" } }, "PRICE_TIME_INVALID_STALE_OR_FUTURE"],
  ["unverifiable timestamp", { priceEvidence: { ...original.priceEvidence, observedAt: "2026-02-30T16:49:59.000Z" } }, "PRICE_TIME_INVALID_STALE_OR_FUTURE"],
  ["old quote", { priceEvidence: { ...original.priceEvidence, observedAt: "2026-10-14T11:49:59.000Z" } }, "PRICE_TIME_INVALID_STALE_OR_FUTURE"],
  ["price changed", { currentPrice: 505 }, "PRICE_MISSING_OR_MISMATCH"],
  ["missing current price", { currentPrice: null }, "PRICE_MISSING_OR_MISMATCH"],
  ["research-only authority missing", { priceEvidence: { ...original.priceEvidence, liveTradingAllowed: true } }, "RESEARCH_ONLY_PROVENANCE_NOT_VERIFIED"],
  ["untrusted source", { priceEvidence: { ...original.priceEvidence, source: "Anonymous" } }, "RESEARCH_ONLY_PROVENANCE_NOT_VERIFIED"],
  ["invalid symbol", { symbol: "<script>" }, "INVALID_SYMBOL"],
];
for (const [name, change, code] of rejection) {
  const result = admitV7ResearchQuotes({ generatedAt, allDecisions: [{ ...original, ...change }] }, now);
  assert.equal(result.accepted.length, 0, name);
  assert.equal(result.evidence.reasonCounts[code], 1, name);
}
const old = admitV7ResearchQuotes({ generatedAt: "2026-10-12T16:50:00.000Z", allDecisions: [original] }, now);
assert.equal(old.state, "SOURCE_STALE_BLOCKED");
assert.equal(old.accepted.length, 0);
const future = admitV7ResearchQuotes({ generatedAt: "2026-10-14T17:00:01.000Z", allDecisions: [original] }, now);
assert.equal(future.accepted.length, 0);
const duplicates = admitV7ResearchQuotes({ generatedAt, allDecisions: [original, original] }, now);
assert.equal(duplicates.accepted.length, 1);
assert.equal(duplicates.evidence.reasonCounts.DUPLICATE_SYMBOL, 1);
const noData = admitV7ResearchQuotes(null, now);
assert.equal(noData.accepted.length, 0);
assert.equal(noData.state, "SOURCE_STALE_BLOCKED");
assert.throws(() => admitV7ResearchQuotes(committee, new Date("invalid")), /INVALID_V7_ADMISSION_CLOCK/);
console.log("Fenice V7 quote provenance and no-lookahead admission: PASS");
