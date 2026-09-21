import assert from "node:assert/strict";
import {
  deduplicateExecutionEvidence,
  inferExecutionSourceFamily,
  isTwelveDataPaperCandidate,
  isTwelveDataUsRealtimeVenue,
  normalizeExecutionEvidence,
  stooqSymbolForInstrument,
  yahooSymbolForInstrument,
} from "../lib/trading/execution-market-data.ts";

assert.equal(yahooSymbolForInstrument({ symbol: "ENEL", exchangeMic: "XMIL", assetClass: "equity" }), "ENEL.MI");
assert.equal(yahooSymbolForInstrument({ symbol: "SIE", exchangeMic: "XETR", assetClass: "equity" }), "SIE.DE");
assert.equal(yahooSymbolForInstrument({ symbol: "MC", exchangeMic: "XPAR", assetClass: "equity" }), "MC.PA");
assert.equal(yahooSymbolForInstrument({ symbol: "VOD", exchangeMic: "XLON", assetClass: "equity" }), "VOD.L");
assert.equal(yahooSymbolForInstrument({ symbol: "ASML", exchangeMic: "XAMS", assetClass: "equity" }), "ASML.AS");
assert.equal(yahooSymbolForInstrument({ symbol: "IBE", exchangeMic: "XMAD", assetClass: "equity" }), "IBE.MC");
assert.equal(yahooSymbolForInstrument({ symbol: "NOVN", exchangeMic: "XSWX", assetClass: "equity" }), "NOVN.SW");
assert.equal(yahooSymbolForInstrument({ symbol: "NVDA", exchangeMic: "XNAS", assetClass: "equity" }), "NVDA");
assert.equal(yahooSymbolForInstrument({ symbol: "BTC", assetClass: "crypto" }), "BTC-USD");
assert.equal(stooqSymbolForInstrument({ symbol: "AAPL", exchangeMic: "XNAS" }), "aapl.us");
assert.equal(stooqSymbolForInstrument({ symbol: "ENEL", exchangeMic: "XMIL" }), "enel.it");
assert.equal(stooqSymbolForInstrument({ symbol: "VOD", exchangeMic: "XLON" }), "vod.uk");
assert.equal(stooqSymbolForInstrument({ symbol: "ASML", exchangeMic: "XAMS" }), "asml.nl");
assert.equal(stooqSymbolForInstrument({ symbol: "7203", exchangeMic: "XTKS" }), null);
assert.equal(inferExecutionSourceFamily("Yahoo Finance execution validation"), "yahoo");
assert.equal(inferExecutionSourceFamily("Coinbase Exchange execution validation"), "coinbase");
assert.equal(inferExecutionSourceFamily("Twelve Data realtime quote"), "twelve-data");

assert.equal(isTwelveDataPaperCandidate({ symbol: "MSFT", currency: "USD", exchangeMic: "XNAS", assetClass: "equity" }), true);
assert.equal(isTwelveDataPaperCandidate({ symbol: "TSM", currency: "USD", assetClass: "equity" }), true, "US-traded ADR candidates with incomplete master metadata should be probed and venue-verified from provider response");
assert.equal(isTwelveDataPaperCandidate({ symbol: "ENEL", currency: "EUR", exchangeMic: "XMIL", assetClass: "equity" }), false);
assert.equal(isTwelveDataPaperCandidate({ symbol: "BTC", currency: "USD", assetClass: "crypto" }), false);
assert.equal(isTwelveDataUsRealtimeVenue({ mic_code: "XNAS", exchange: "NASDAQ", currency: "USD" }), true);
assert.equal(isTwelveDataUsRealtimeVenue({ exchange: "NYSE", currency: "USD" }), true);
assert.equal(isTwelveDataUsRealtimeVenue({ exchange: "NASDAQ Global Select Market", currency: "USD" }), true);
assert.equal(isTwelveDataUsRealtimeVenue({ mic_code: "XPAR", exchange: "Euronext Paris", currency: "EUR" }), false);
assert.equal(isTwelveDataUsRealtimeVenue({ exchange: "Unknown", currency: "USD" }), false, "unknown USD venue must fail closed");

const normalized = normalizeExecutionEvidence({
  symbol: " enel ",
  currency: "eur",
  source: "Yahoo Finance execution validation",
  eligibility: "PAPER",
  price: 8.5,
  observedAt: "2026-09-21T12:00:00Z",
});
assert.ok(normalized);
assert.equal(normalized.symbol, "ENEL");
assert.equal(normalized.currency, "EUR");
assert.equal(normalized.sourceFamily, "yahoo");
assert.equal(normalized.eligibility, "PAPER");
assert.equal(normalized.observedAt, "2026-09-21T12:00:00.000Z");

const legacy = normalizeExecutionEvidence({
  symbol: "ENEL",
  currency: "EUR",
  source: "Legacy Provider",
  price: 8.5,
  observedAt: "2026-09-21T12:00:00Z",
});
assert.equal(legacy?.eligibility, "VALIDATION_ONLY", "untagged evidence must fail closed to validation-only");

assert.equal(normalizeExecutionEvidence({ symbol: "ENEL", currency: "EUR", source: "A", price: -1, observedAt: "2026-09-21T12:00:00Z" }), null);
assert.equal(normalizeExecutionEvidence({ symbol: "ENEL", currency: "EUR", source: "A", price: 8.5, observedAt: "bad-date" }), null);

const deduped = deduplicateExecutionEvidence([
  { symbol: "ENEL", currency: "EUR", source: "A label 1", sourceFamily: "provider-a", eligibility: "PAPER", price: 8.4, observedAt: "2026-09-21T11:00:00Z" },
  { symbol: "ENEL", currency: "EUR", source: "A label 2", sourceFamily: "provider-a", eligibility: "PAPER", price: 8.5, observedAt: "2026-09-21T12:00:00Z" },
  { symbol: "ENEL", currency: "EUR", source: "B", sourceFamily: "provider-b", eligibility: "PAPER", price: 8.51, observedAt: "2026-09-21T12:00:10Z" },
]);
assert.equal(deduped.length, 2);
assert.equal(deduped.find((item) => item.sourceFamily === "provider-a")?.price, 8.5);

const eligibilityPreferred = deduplicateExecutionEvidence([
  { symbol: "NVDA", currency: "USD", source: "P", sourceFamily: "same", eligibility: "PAPER", price: 100, observedAt: "2026-09-21T12:00:00Z" },
  { symbol: "NVDA", currency: "USD", source: "V", sourceFamily: "same", eligibility: "VALIDATION_ONLY", price: 101, observedAt: "2026-09-21T12:01:00Z" },
]);
assert.equal(eligibilityPreferred.length, 1);
assert.equal(eligibilityPreferred[0].eligibility, "PAPER", "fresh validation-only data must not replace eligible evidence from same family");

console.log("Fenice execution market-data routing tests: PASS");
