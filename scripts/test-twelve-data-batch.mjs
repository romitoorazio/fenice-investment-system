import assert from "node:assert/strict";
import { parseTwelveDataQuoteTime, unwrapTwelveDataBatchQuote } from "../lib/trading/twelve-data-batch.mjs";

const batch = {
  SPY: {
    symbol: "SPY",
    exchange: "NYSE Arca",
    mic_code: "ARCX",
    close: "690.10",
    timestamp: 1790169900,
    last_quote_at: 1790170020,
  },
  AAPL: {
    status: "ok",
    data: {
      symbol: "AAPL",
      exchange: "NASDAQ",
      mic_code: "XNAS",
      close: "242.50",
      timestamp: 1790169900,
      last_quote_at: 1790170080,
    },
  },
};

assert.equal(unwrapTwelveDataBatchQuote(batch, "SPY")?.symbol, "SPY");
assert.equal(unwrapTwelveDataBatchQuote(batch, "aapl")?.symbol, "AAPL");
assert.equal(unwrapTwelveDataBatchQuote(batch, "MSFT"), null);
assert.equal(unwrapTwelveDataBatchQuote({ symbol: "MSFT", close: "500" }, "MSFT")?.symbol, "MSFT");
assert.equal(unwrapTwelveDataBatchQuote({ QQQ: { status: "error", code: 429 } }, "QQQ"), null);

const verified = parseTwelveDataQuoteTime({ timestamp: 1790169900, last_quote_at: 1790170080 });
assert.equal(verified.paperTimestampVerified, true);
assert.equal(verified.source, "last_quote_at");
assert.equal(verified.observedAt, new Date(1790170080 * 1000).toISOString());

const candleOnly = parseTwelveDataQuoteTime({ timestamp: 1790169900 });
assert.equal(candleOnly.paperTimestampVerified, false);
assert.equal(candleOnly.source, "candle_timestamp_validation_only");
assert.equal(candleOnly.observedAt, new Date(1790169900 * 1000).toISOString());

const missing = parseTwelveDataQuoteTime({});
assert.equal(missing.paperTimestampVerified, false);
assert.equal(missing.observedAt, null);

console.log("Fenice Twelve Data batch quote tests: PASS");
