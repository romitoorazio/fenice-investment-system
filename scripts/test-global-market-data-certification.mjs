import assert from "node:assert/strict";
import {
  GLOBAL_MARKET_SENTINELS,
  certifyGlobalInstrument,
  isTwelveDataGlobalPaperCandidate,
  twelveDataGlobalQuoteUrl,
  verifyTwelveDataGlobalQuote,
} from "../lib/trading/global-market-data-certification.ts";

const now = Date.parse("2026-09-27T09:00:30.000Z");
const enel = GLOBAL_MARKET_SENTINELS.find((item) => item.symbol === "ENEL");
assert.ok(enel);
assert.equal(isTwelveDataGlobalPaperCandidate(enel), true);
assert.equal(isTwelveDataGlobalPaperCandidate({ symbol: "AAPL", exchangeMic: "XNAS", currency: "USD", assetClass: "equity" }), false, "global extension must not silently alter the existing US collector scope");
assert.equal(isTwelveDataGlobalPaperCandidate({ symbol: "ENEL", currency: "EUR", assetClass: "equity" }), false, "missing MIC must fail closed");

const url = new URL(twelveDataGlobalQuoteUrl(enel, "secret-test-key"));
assert.equal(url.hostname, "api.twelvedata.com");
assert.equal(url.pathname, "/quote");
assert.equal(url.searchParams.get("symbol"), "ENEL");
assert.equal(url.searchParams.get("mic_code"), "XMIL");
assert.equal(url.searchParams.get("interval"), "1min");
assert.equal(url.searchParams.get("apikey"), "secret-test-key");

const good = verifyTwelveDataGlobalQuote(enel, {
  symbol: "ENEL",
  exchange: "Euronext Milan",
  mic_code: "XMIL",
  currency: "EUR",
  close: "8.125",
  timestamp: Math.floor(Date.parse("2026-09-27T09:00:00.000Z") / 1000),
}, now);
assert.equal(good.accepted, true);
assert.equal(good.fresh, true);
assert.equal(good.eligibility, "PAPER");
assert.equal(good.evidence?.eligibility, "PAPER");
assert.equal(good.identity.micMatched, true);
assert.equal(good.identity.currencyMatched, true);

const wrongVenue = verifyTwelveDataGlobalQuote(enel, {
  symbol: "ENEL",
  exchange: "Some other venue",
  mic_code: "XPAR",
  currency: "EUR",
  close: "8.125",
  timestamp: Math.floor(Date.parse("2026-09-27T09:00:00.000Z") / 1000),
}, now);
assert.equal(wrongVenue.accepted, false);
assert.equal(wrongVenue.eligibility, "VALIDATION_ONLY");
assert.equal(wrongVenue.evidence, null);
assert.ok(wrongVenue.reasons.some((reason) => reason.includes("MIC mismatch")));

const wrongCurrency = verifyTwelveDataGlobalQuote(enel, {
  symbol: "ENEL",
  mic_code: "XMIL",
  currency: "USD",
  close: "8.125",
  timestamp: Math.floor(Date.parse("2026-09-27T09:00:00.000Z") / 1000),
}, now);
assert.equal(wrongCurrency.accepted, false);
assert.ok(wrongCurrency.reasons.some((reason) => reason.includes("currency mismatch")));

const stale = verifyTwelveDataGlobalQuote(enel, {
  symbol: "ENEL",
  mic_code: "XMIL",
  currency: "EUR",
  close: "8.125",
  timestamp: Math.floor(Date.parse("2026-09-27T08:45:00.000Z") / 1000),
}, now);
assert.equal(stale.accepted, true, "correct identity may remain useful as validation evidence even when stale");
assert.equal(stale.fresh, false);
assert.equal(stale.eligibility, "VALIDATION_ONLY");
assert.equal(stale.evidence?.eligibility, "VALIDATION_ONLY");

const onePaper = certifyGlobalInstrument(enel, [good.evidence], now);
assert.equal(onePaper.state, "DEGRADED");
assert.equal(onePaper.allowNewRisk, false);
assert.deepEqual(onePaper.paperEligibleFamilies, ["twelve-data"]);

const certified = certifyGlobalInstrument(enel, [
  good.evidence,
  {
    symbol: "ENEL",
    currency: "EUR",
    assetClass: "equity",
    source: "Independent broker exact-venue quote",
    sourceFamily: "broker-independent",
    eligibility: "PAPER",
    price: 8.13,
    observedAt: "2026-09-27T09:00:05.000Z",
    provenanceVerified: true,
  },
], now);
assert.equal(certified.state, "CERTIFIED");
assert.equal(certified.allowNewRisk, true);
assert.equal(certified.quorum.independentSources, 2);

const divergent = certifyGlobalInstrument(enel, [
  good.evidence,
  {
    symbol: "ENEL",
    currency: "EUR",
    source: "Independent broker exact-venue quote",
    sourceFamily: "broker-independent",
    eligibility: "PAPER",
    price: 8.8,
    observedAt: "2026-09-27T09:00:05.000Z",
  },
], now);
assert.equal(divergent.allowNewRisk, false);
assert.notEqual(divergent.state, "CERTIFIED");
assert.ok(divergent.quorum.reasons.some((reason) => reason.includes("spread exceeds")));

assert.equal(GLOBAL_MARKET_SENTINELS.filter((item) => item.tier === "EUROPE_CORE").length, 7);
assert.ok(GLOBAL_MARKET_SENTINELS.some((item) => item.exchangeMic === "XTKS"));
assert.ok(GLOBAL_MARKET_SENTINELS.some((item) => item.exchangeMic === "XHKG"));
assert.ok(GLOBAL_MARKET_SENTINELS.some((item) => item.exchangeMic === "XASX"));
assert.ok(GLOBAL_MARKET_SENTINELS.some((item) => item.exchangeMic === "XTSE"));

console.log("Fenice global market-data certification tests: PASS");
