import assert from "node:assert/strict";
import { selectDirectaPaperPreflightTickers } from "../lib/trading/directa-paper-preflight.ts";

const selection = selectDirectaPaperPreflightTickers([
  { symbol: "msft", currency: "USD", assetClass: "equity" },
  { symbol: "AAPL", currency: "USD", assetClass: "stock" },
  { symbol: "SPY", currency: "USD", assetClass: "ETF" },
  { symbol: "BTC", currency: "USD", assetClass: "crypto" },
  { symbol: "MSFT", currency: "USD", assetClass: "equity" },
  { symbol: "bad symbol", currency: "USD", assetClass: "equity" },
], 5);

assert.deepEqual(selection.tickers, ["MSFT", "AAPL", "SPY"]);
assert.ok(selection.rejected.some((item) => item.symbol === "BTC" && item.reason.includes("equity/ETF")));
assert.ok(selection.rejected.some((item) => item.reason === "invalid symbol"));

const capped = selectDirectaPaperPreflightTickers(
  Array.from({ length: 100 }, (_, index) => ({ symbol: `T${index}`, assetClass: "equity", currency: "USD" })),
  200,
);
assert.equal(capped.tickers.length, 90, "Directa preflight must respect the DAPI max-90 ticker boundary");

console.log("Directa paper-preflight selection invariants: PASS");
