import assert from "node:assert/strict";
import { describePersistedPaperQuoteHealth } from "../lib/trading/paper-quote-diagnostics.ts";

const now = Date.parse("2026-10-09T16:00:00Z");
const at = (secondsAgo) => new Date(now - secondsAgo * 1000).toISOString();
const quote = (symbol, sourceFamily, age, eligibility = "PAPER", verified = true) => ({
  symbol, sourceFamily, eligibility, provenanceVerified: verified,
  provenanceMethod: sourceFamily === "alpaca" ? "authenticated-alpaca-iex-latest-quote"
    : sourceFamily === "twelve-data" ? "provider-batch-quote-last_quote_at-us-realtime-venue" : "unknown",
  price: 100, currency: "USD", observedAt: at(age),
});
const evidence = {
  generatedAt: at(12),
  observations: [
    quote("AAPL", "alpaca", 34), quote("AAPL", "twelve-data", 25),
    quote("AAPL", "alpaca", 90), // older same-family sample
    quote("MSFT", "alpaca", 20),
    quote("SPY", "yahoo", 15, "VALIDATION_ONLY"),
    quote("SPY", "rogue-provider", 20),
    quote("SPY", "twelve-data", 15, "LIVE"),
  ],
};
const coverage = {
  generatedAt: at(6), evidenceGeneratedAt: at(12),
  requestedSymbols: 3, paperEligibleSymbols: 1,
  rows: [
    { symbol: "AAPL", paperEligible: true },
    { symbol: "MSFT", paperEligible: false },
    { symbol: "SPY", paperEligible: false },
  ],
  policy: { approvedIndependentPaperSourceFamilies: ["alpaca", "twelve-data"], liveTradingAllowed: false },
};
const current = describePersistedPaperQuoteHealth(evidence, coverage, now);
assert.equal(current.snapshotCurrent, true);
assert.equal(current.samePersistedQuoteBatch, true);
const mismatchedBatch = describePersistedPaperQuoteHealth(evidence,
  { ...coverage, evidenceGeneratedAt: at(13) }, now);
assert.equal(mismatchedBatch.samePersistedQuoteBatch, false);
assert.equal(mismatchedBatch.snapshotCurrent, false);
assert.equal(mismatchedBatch.symbols[0].state, "SNAPSHOT_EXPIRED");
const missingBatch = describePersistedPaperQuoteHealth(evidence,
  { ...coverage, evidenceGeneratedAt: undefined }, now);
assert.equal(missingBatch.snapshotCurrent, false);
const invertedBatch = describePersistedPaperQuoteHealth(evidence,
  { ...coverage, generatedAt: at(20) }, now);
assert.equal(invertedBatch.snapshotCurrent, false);
assert.equal(current.diagnosticState, "QUORUM_NOT_MET", "one qualifying symbol never satisfies whole-portfolio quorum");
assert.equal(current.symbols.length, 3);
const aapl = current.symbols.find((row) => row.symbol === "AAPL");
assert.equal(aapl.state, "SOURCE_CANDIDATE_ONLY");
assert.deepEqual(aapl.historicalVerifiedFamilies, ["alpaca", "twelve-data"]);
assert.deepEqual(aapl.freshVerifiedFamilies, ["alpaca", "twelve-data"]);
assert.equal(aapl.newestQuoteAgeSeconds, 25, "newest quote selected without counting duplicates");
assert.equal(aapl.snapshotPaperEligible, true);
const msft = current.symbols.find((row) => row.symbol === "MSFT");
assert.equal(msft.state, "FRESH_SOURCE_QUORUM_MISSING");
assert.deepEqual(msft.freshVerifiedFamilies, ["alpaca"]);
const spy = current.symbols.find((row) => row.symbol === "SPY");
assert.equal(spy.state, "NO_VERIFIED_PAPER_SOURCES", "LIVE/unknown/validation-only quotes never count");
assert.equal(spy.historicalVerifiedFamilies.length, 0);
assert.equal(current.orderAuthorized, false);
assert.equal(current.liveTradingAllowed, false);
assert.equal(current.liveProviderRefreshAvailable, false);
const expired = describePersistedPaperQuoteHealth(evidence, coverage, now + 130_000);
assert.equal(expired.snapshotCurrent, false);
assert.equal(expired.diagnosticState, "SNAPSHOT_EXPIRED");
assert(expired.symbols.every((row) => row.state === "SNAPSHOT_EXPIRED"));
assert(expired.blockingReasons.some((reason) => reason.includes("older than 120 seconds")));
assert.equal(expired.orderAuthorized, false);
const future = describePersistedPaperQuoteHealth({
  ...evidence,
  observations: [quote("AAPL", "alpaca", -180)],
}, coverage, now);
assert.equal(future.symbols[0].state, "NO_VERIFIED_PAPER_SOURCES");
const falseProvenance = describePersistedPaperQuoteHealth({
  ...evidence,
  observations: evidence.observations.map(row => row.symbol === "AAPL" && row.sourceFamily === "twelve-data"
    ? { ...row, provenanceMethod: undefined } : row),
}, coverage, now);
assert.equal(falseProvenance.symbols[0].state, "FRESH_SOURCE_QUORUM_MISSING",
  "UI source proof must agree with runtime provenance requirements");
const quotedString = describePersistedPaperQuoteHealth({
  ...evidence, observations: evidence.observations.map(row => row.symbol === "AAPL" && row.sourceFamily === "twelve-data"
    ? { ...row, price: "100" } : row),
}, coverage, now);
assert.equal(quotedString.symbols[0].state, "FRESH_SOURCE_QUORUM_MISSING");
const invalidDate = describePersistedPaperQuoteHealth({
  ...evidence, generatedAt: "2026-02-30T16:00:00.000Z",
}, { ...coverage, evidenceGeneratedAt: "2026-02-30T16:00:00.000Z" }, now);
assert.equal(invalidDate.snapshotCurrent, false, "calendar-normalized invalid dates are not a current quote batch");
const noData = describePersistedPaperQuoteHealth(null, null, now);
assert.equal(noData.diagnosticState, "SNAPSHOT_EXPIRED");
assert.equal(noData.symbols.length, 0);
assert.equal(noData.orderAuthorized, false);
const badTimestamp = describePersistedPaperQuoteHealth({ ...evidence, generatedAt: "invalid" }, coverage, now);
assert.equal(badTimestamp.snapshotCurrent, false);

const mixedCurrency = describePersistedPaperQuoteHealth({
  ...evidence,
  observations: evidence.observations.map((row) =>
    row.symbol === "AAPL" && row.sourceFamily === "twelve-data" ? { ...row, currency: "EUR" } : row,
  ),
}, coverage, now);
assert.equal(mixedCurrency.symbols.find((row) => row.symbol === "AAPL").state, "CURRENCY_NOT_VERIFIED");
assert.equal(mixedCurrency.orderAuthorized, false);
assert(mixedCurrency.blockingReasons.some((reason) => reason.includes("currency")));
const missingCurrency = describePersistedPaperQuoteHealth({
  ...evidence,
  observations: evidence.observations.map((row) =>
    row.symbol === "AAPL" && row.sourceFamily === "twelve-data" ? { ...row, currency: undefined } : row,
  ),
}, coverage, now);
assert.equal(missingCurrency.symbols.find((row) => row.symbol === "AAPL").state, "CURRENCY_NOT_VERIFIED");

console.log("Fenice persisted PAPER quote age and per-symbol reason diagnostics: PASS.");
