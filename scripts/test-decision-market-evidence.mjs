import assert from "node:assert/strict";
import { assessDecisionEvidence } from "../lib/ui/decision-market-evidence.ts";

const instruments = [
  { ticker: "AAPL", status: "active", currency: "USD", assetClass: "equity", exchangeMic: "XNAS" },
  { ticker: "ENEL", status: "active", currency: "EUR", assetClass: "equity", exchangeMic: "XMIL" },
  { ticker: "BTC", status: "active", currency: "USD", assetClass: "crypto" },
];
const quote = {
  symbol: "AAPL",
  state: "SOURCE_CANDIDATE_ONLY",
  snapshotPaperEligible: true,
  freshVerifiedFamilies: ["alpaca", "twelve-data"],
  quoteCurrencies: ["USD"],
};
const venue = { state: "OPEN", authoritative: true, paperQuoteRefreshCandidate: true };
const defaults = {
  symbol: "AAPL", researchCurrency: "USD", researchFresh: true,
  instruments, quote, quoteSnapshotCurrent: true,
  quoteGateReady: true, venue,
};
function assess(patch = {}) { return assessDecisionEvidence({ ...defaults, ...patch }); }
const informational = assess();
assert.equal(informational.paperReviewCandidate, true);
assert.equal(informational.actionAllowed, false, "evidence is not an order");
assert.equal(informational.liveTradingAllowed, false);
assert.equal(informational.brokerPositionVerified, false);
const locked = [
  { researchFresh: false },
  { quoteSnapshotCurrent: false },
  { quoteGateReady: false },
  { venue: { ...venue, state: "CLOSED" } },
  { venue: { ...venue, authoritative: false } },
  { venue: null },
  { quote: null },
  { quote: { ...quote, freshVerifiedFamilies: ["alpaca"] } },
  { quote: { ...quote, snapshotPaperEligible: false } },
  { quote: { ...quote, state: "CURRENCY_NOT_VERIFIED" } },
  { quote: { ...quote, quoteCurrencies: ["EUR"] } },
  { quote: { ...quote, quoteCurrencies: [] } },
  { researchCurrency: "EUR" },
  { symbol: "UNKNOWN" },
  { symbol: "BTC", quote: { ...quote, symbol: "BTC" } },
  { symbol: "ENEL", researchCurrency: "EUR", quote: { ...quote, symbol: "ENEL", quoteCurrencies: ["EUR"] }, venue: { ...venue, authoritative: false } },
  { instruments: [...instruments, { ...instruments[0] }] },
];
for (const patch of locked) {
  const result = assess(patch);
  assert.equal(result.paperReviewCandidate, false, JSON.stringify(patch));
  assert.equal(result.actionAllowed, false);
  assert.equal(result.liveTradingAllowed, false);
  assert.equal(result.brokerPositionVerified, false);
}
assert.match(assess({ quoteSnapshotCurrent: false }).priceStatus, /scaduto/);
assert.match(assess({ quote: { ...quote, quoteCurrencies: ["EUR"] } }).priceStatus, /Valute/);
assert.match(assess({ venue: { ...venue, state: "CLOSED" } }).marketStatus, /chiusa/);
console.log("Decisioni evidence and fail-closed PAPER review: PASS");
