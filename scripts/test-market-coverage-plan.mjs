import assert from "node:assert/strict";
import { buildMarketCoveragePlan as plan } from "../lib/ui/market-coverage-plan.ts";

const now = Date.parse("2026-10-12T16:00:00Z");
const time = (secondsAgo) => new Date(now - secondsAgo * 1000).toISOString();
const master = [
  { ticker: "AAPL", name: "Apple", status: "active", assetClass: "equity", exchangeMic: "XNAS", currency: "USD" },
  { ticker: "ENEL", name: "Enel", status: "active", assetClass: "equity", exchangeMic: "XMIL", currency: "EUR" },
  { ticker: "BTC", status: "active", assetClass: "crypto", currency: "USD" },
];
const coverage = {
  generatedAt: time(10), evidenceGeneratedAt: time(20), requestedSymbols: 4,
  rows: [
    { symbol: "AAPL", state: "CAUTION", paperEligible: true, approvedIndependentPaperFamilies: ["alpaca", "twelve-data"] },
    { symbol: "ENEL", state: "BLOCKED", paperEligible: false, approvedIndependentPaperFamilies: [] },
    { symbol: "BTC", state: "CAUTION", paperEligible: true, approvedIndependentPaperFamilies: ["alpaca", "twelve-data"] },
    { symbol: "UNKNOWN", state: "GREEN", paperEligible: true, approvedIndependentPaperFamilies: ["alpaca", "twelve-data"] },
  ],
};
const recent = plan(coverage, master, now);
assert.equal(recent.snapshotCurrent, true);
assert.equal(recent.sampleEligibleAtCapture, 1);
assert.equal(recent.sampleEligibleNow, 1);
assert.equal(recent.identityReviews, 2);
assert.equal(recent.researchOnly, 1);
assert.equal(recent.rows[0].status, "RECENT_SAMPLE_ONLY");
assert.equal(recent.rows[1].status, "RESEARCH_ONLY");
assert.equal(recent.rows[2].status, "IDENTITY_REVIEW");
assert.equal(recent.rows[3].status, "IDENTITY_REVIEW");
assert.equal(recent.realBrokerConnectivityVerified, false);
assert.equal(recent.liveTradingAllowed, false);
assert(recent.rows.every(row => row.canBuy === false && row.canSell === false && row.directaPositionVerified === false));
const old = plan(coverage, master, now + 121_000);
assert.equal(old.snapshotCurrent, false);
assert.equal(old.sampleEligibleAtCapture, 1);
assert.equal(old.sampleEligibleNow, 0);
assert.equal(old.rows[0].status, "EXPIRED_SAMPLE");
assert.equal(plan({ ...coverage, evidenceGeneratedAt: time(-60) }, master, now).sampleEligibleNow, 0);
assert.equal(plan({ ...coverage, generatedAt: "2026-02-30T00:00:00Z" }, master, now).sampleEligibleNow, 0);
const injected = { ...coverage, rows: [{ symbol: "AAPL", state: "GREEN", paperEligible: true,
  approvedIndependentPaperFamilies: ["alpaca", "alpaca", "not-certified"] }] };
assert.equal(plan(injected, master, now).sampleEligibleAtCapture, 0, "duplicate and unverified families do not form independent quorum");
assert.equal(plan({ ...coverage, rows: [coverage.rows[0], coverage.rows[0]] }, master, now).identityReviews, 1);
assert.equal(plan(coverage, [...master, master[0]], now).rows[0].status, "IDENTITY_REVIEW");
console.log("Fenice world pilot per-symbol PAPER research coverage: PASS");
