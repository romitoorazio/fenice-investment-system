import assert from "node:assert/strict";
import {
  deduplicateExecutionEvidence,
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

const normalized = normalizeExecutionEvidence({
  symbol: " enel ",
  currency: "eur",
  source: "Provider A",
  price: 8.5,
  observedAt: "2026-09-21T12:00:00Z",
});
assert.ok(normalized);
assert.equal(normalized.symbol, "ENEL");
assert.equal(normalized.currency, "EUR");
assert.equal(normalized.observedAt, "2026-09-21T12:00:00.000Z");

assert.equal(normalizeExecutionEvidence({ symbol: "ENEL", currency: "EUR", source: "A", price: -1, observedAt: "2026-09-21T12:00:00Z" }), null);
assert.equal(normalizeExecutionEvidence({ symbol: "ENEL", currency: "EUR", source: "A", price: 8.5, observedAt: "bad-date" }), null);

const deduped = deduplicateExecutionEvidence([
  { symbol: "ENEL", currency: "EUR", source: "A", price: 8.4, observedAt: "2026-09-21T11:00:00Z" },
  { symbol: "ENEL", currency: "EUR", source: "A", price: 8.5, observedAt: "2026-09-21T12:00:00Z" },
  { symbol: "ENEL", currency: "EUR", source: "B", price: 8.51, observedAt: "2026-09-21T12:00:10Z" },
]);
assert.equal(deduped.length, 2);
assert.equal(deduped.find((item) => item.source === "A")?.price, 8.5);

console.log("Fenice execution market-data routing tests: PASS");
