import assert from "node:assert/strict";
import { selectDirectaPaperPreflightTickers } from "../lib/trading/directa-paper-preflight.ts";

const selection = selectDirectaPaperPreflightTickers([
  { symbol: "msft", currency: "USD", assetClass: "equity", exchangeMic: "XNAS" },
  { symbol: "AAPL", currency: "USD", assetClass: "stock", exchangeMic: "XNAS" },
  { symbol: "SPY", currency: "USD", assetClass: "ETF", exchangeMic: "ARCX" },
  { symbol: "SAP", currency: "EUR", assetClass: "equity", exchangeMic: "XETR" },
  { symbol: "BTC", currency: "USD", assetClass: "crypto", exchangeMic: "" },
  { symbol: "MSFT", currency: "USD", assetClass: "equity", exchangeMic: "XNAS" },
  { symbol: "MISSINGMIC", currency: "USD", assetClass: "equity" },
  { symbol: "bad symbol", currency: "USD", assetClass: "equity", exchangeMic: "XNAS" },
], 5, ["XNAS", "ARCX"]);

assert.deepEqual(selection.tickers, ["MSFT", "AAPL", "SPY"]);
assert.deepEqual(selection.selectedMarketMics, ["ARCX", "XNAS"]);
assert.ok(selection.rejected.some((item) => item.symbol === "BTC" && item.reason.includes("equity/ETF")));
assert.ok(selection.rejected.some((item) => item.symbol === "SAP" && item.reason.includes("XETR")));
assert.ok(selection.rejected.some((item) => item.symbol === "MISSINGMIC" && item.reason.includes("MIC missing")));
assert.ok(selection.rejected.some((item) => item.reason === "invalid symbol"));

const noMarkets = selectDirectaPaperPreflightTickers([
  { symbol: "MSFT", assetClass: "equity", currency: "USD", exchangeMic: "XNAS" },
  { symbol: "AAPL", assetClass: "equity", currency: "USD", exchangeMic: "XNAS" },
], 9, []);
assert.equal(noMarkets.tickers.length, 0, "preflight must fail closed when no market-level realtime entitlement is confirmed");

const capped = selectDirectaPaperPreflightTickers(
  Array.from({ length: 100 }, (_, index) => ({ symbol: `T${index}`, assetClass: "equity", currency: "USD", exchangeMic: "XNAS" })),
  200,
  ["XNAS"],
);
assert.equal(capped.tickers.length, 90, "Directa preflight must respect the DAPI max-90 ticker boundary");

console.log("Directa paper-preflight selection invariants: PASS");
