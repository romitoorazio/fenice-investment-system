import assert from "node:assert/strict";
import { selectDirectaPaperPreflightTickers } from "../lib/trading/directa-paper-preflight.ts";

const selection = selectDirectaPaperPreflightTickers([
  { symbol: "msft", currency: "USD", assetClass: "equity", exchangeMic: "XNAS", isin: "US5949181045" },
  { symbol: "AAPL", currency: "USD", assetClass: "stock", exchangeMic: "XNAS", isin: "US0378331005" },
  { symbol: "SPY", currency: "USD", assetClass: "ETF", exchangeMic: "ARCX", isin: "US78462F1030" },
  { symbol: "SAP", currency: "EUR", assetClass: "equity", exchangeMic: "XETR", isin: "DE0007164600" },
  { symbol: "BTC", currency: "USD", assetClass: "crypto", exchangeMic: "", isin: "" },
  { symbol: "MSFT", currency: "USD", assetClass: "equity", exchangeMic: "XNAS", isin: "US5949181045" },
  { symbol: "MISSINGISIN", currency: "USD", assetClass: "equity", exchangeMic: "XNAS" },
  { symbol: "MISSINGMIC", currency: "USD", assetClass: "equity", isin: "US0000000001" },
  { symbol: "bad symbol", currency: "USD", assetClass: "equity", exchangeMic: "XNAS", isin: "US0000000001" },
], 5, ["XNAS", "ARCX"]);

assert.deepEqual(selection.tickers, ["MSFT", "AAPL", "SPY"]);
assert.deepEqual(selection.selectedMarketMics, ["ARCX", "XNAS"]);
assert.ok(selection.rejected.some((item) => item.symbol === "BTC" && item.reason.includes("equity/ETF")));
assert.ok(selection.rejected.some((item) => item.symbol === "SAP" && item.reason.includes("XETR")));
assert.ok(selection.rejected.some((item) => item.symbol === "MISSINGISIN" && item.reason.includes("ISIN missing")));
assert.ok(selection.rejected.some((item) => item.symbol === "MISSINGMIC" && item.reason.includes("MIC missing")));
assert.ok(selection.rejected.some((item) => item.reason === "invalid symbol"));

const noMarkets = selectDirectaPaperPreflightTickers([
  { symbol: "MSFT", assetClass: "equity", currency: "USD", exchangeMic: "XNAS", isin: "US5949181045" },
  { symbol: "AAPL", assetClass: "equity", currency: "USD", exchangeMic: "XNAS", isin: "US0378331005" },
], 9, []);
assert.equal(noMarkets.tickers.length, 0, "preflight must fail closed when no market-level realtime entitlement is confirmed");

const capped = selectDirectaPaperPreflightTickers(
  Array.from({ length: 100 }, (_, index) => ({ symbol: `T${index}`, assetClass: "equity", currency: "USD", exchangeMic: "XNAS", isin: `US${String(index).padStart(9, "0")}0` })),
  200,
  ["XNAS"],
);
assert.equal(capped.tickers.length, 0, "synthetic invalid ISINs must not be accepted just to satisfy the preflight cap");

const manyValid = selectDirectaPaperPreflightTickers(
  Array.from({ length: 100 }, (_, index) => ({ symbol: `T${index}`, assetClass: "equity", currency: "USD", exchangeMic: "XNAS", isin: `US${String(index).padStart(9, "0")}1` })),
  200,
  ["XNAS"],
);
assert.ok(manyValid.tickers.length <= 90, "Directa preflight must never exceed the DAPI max-90 ticker boundary");

console.log("Directa paper-preflight selection invariants: PASS");
