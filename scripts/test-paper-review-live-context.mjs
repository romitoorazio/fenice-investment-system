import assert from "node:assert/strict";
import {
  fetchFreshPaperReviewContext,
  paperReviewCredentialsFromEnvironment,
} from "../lib/ui/paper-review-live-context.ts";

const now = Date.parse("2026-10-06T17:40:00.000Z");
const seconds = (iso) => Math.floor(Date.parse(iso) / 1000);
const calls = [];

const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

const fetchImpl = async (input) => {
  const url = String(input);
  calls.push(url);
  if (url === "https://paper-api.alpaca.markets/v2/clock") {
    return response({
      timestamp: "2026-10-06T17:39:55.000Z",
      is_open: true,
      next_open: "2026-10-07T13:30:00Z",
      next_close: "2026-10-06T20:00:00Z",
    });
  }
  if (url.includes("/stocks/SPY/quotes/latest")) {
    return response({ quote: { bp: 780.9, ap: 781.1, t: "2026-10-06T17:39:56.000Z" } });
  }
  if (url.includes("/stocks/MSFT/quotes/latest")) {
    return response({ quote: { bp: 532.9, ap: 533.1, t: "2026-10-06T17:39:57.000Z" } });
  }
  if (url.includes("api.twelvedata.com/quote") && url.includes("SPY")) {
    return response({
      symbol: "SPY",
      exchange: "NYSE ARCA",
      currency: "USD",
      close: "781.02",
      timestamp: seconds("2026-10-06T17:39:00.000Z"),
    });
  }
  if (url.includes("api.twelvedata.com/quote") && url.includes("MSFT")) {
    return response({
      symbol: "MSFT",
      exchange: "NASDAQ",
      currency: "USD",
      close: "533.02",
      last_quote_at: seconds("2026-10-06T17:39:58.000Z"),
    });
  }
  if (url.includes("api.twelvedata.com/exchange_rate")) {
    return response({
      symbol: "USD/EUR",
      rate: "0.8882",
      timestamp: seconds("2026-10-06T17:39:50.000Z"),
    });
  }
  throw new Error(`unexpected URL: ${url}`);
};

const credentials = {
  alpacaKeyId: "test-key",
  alpacaSecretKey: "test-secret",
  twelveDataApiKey: "test-twelve",
};

const report = await fetchFreshPaperReviewContext({
  instruments: [
    { symbol: "SPY", currency: "USD", assetClass: "ETF", exchangeMic: "ARCX" },
    { symbol: "MSFT", currency: "USD", assetClass: "equity", exchangeMic: "XNAS" },
  ],
  credentials,
  now,
  fetchImpl,
});

assert.equal(report.safety.readOnly, true);
assert.equal(report.safety.writesAllowed, false);
assert.equal(report.safety.brokerSubmissionAllowed, false);
assert.equal(report.safety.liveTradingAllowed, false);
assert.equal(report.safety.certificationEvidenceMutationAllowed, false);
assert.deepEqual(report.requestedSymbols, ["SPY", "MSFT"]);
assert.equal(report.marketSession.configured, true);
assert.equal(report.marketSession.decision.allowed, true);
assert.equal(report.observations.length, 4);
assert(report.observations.every((item) => item.eligibility === "PAPER"));
assert.deepEqual(
  [...new Set(report.observations.map((item) => item.sourceFamily))].sort(),
  ["alpaca", "twelve-data"],
);
assert.equal(report.fx?.ratesToEuro.USD.rate, 0.8882);
assert.equal(report.errors.length, 0);
assert.equal(calls.filter((url) => url.includes("exchange_rate")).length, 1);

const deduped = await fetchFreshPaperReviewContext({
  instruments: [
    { symbol: "SPY", currency: "USD", assetClass: "ETF", exchangeMic: "ARCX" },
    { symbol: "spy", currency: "USD", assetClass: "ETF", exchangeMic: "ARCX" },
    { symbol: "MSFT", currency: "USD", assetClass: "equity", exchangeMic: "XNAS" },
    { symbol: "AAPL", currency: "USD", assetClass: "equity", exchangeMic: "XNAS" },
    { symbol: "QQQ", currency: "USD", assetClass: "ETF", exchangeMic: "XNAS" },
  ],
  credentials,
  now,
  fetchImpl: async (input) => {
    const url = String(input);
    if (url.includes("/stocks/AAPL/quotes/latest")) return response({ quote: { bp: 332, ap: 333, t: "2026-10-06T17:39:58Z" } });
    if (url.includes("api.twelvedata.com/quote") && url.includes("AAPL")) return response({ symbol: "AAPL", exchange: "NASDAQ", currency: "USD", close: "332.5", timestamp: seconds("2026-10-06T17:39:30Z") });
    return fetchImpl(input);
  },
});
assert.deepEqual(deduped.requestedSymbols, ["SPY", "MSFT", "AAPL"], "review refresh must deduplicate and cap provider calls at three symbols");

const noCredentials = await fetchFreshPaperReviewContext({
  instruments: [{ symbol: "SPY", currency: "USD", assetClass: "ETF", exchangeMic: "ARCX" }],
  credentials: {},
  now,
  fetchImpl: async () => { throw new Error("network must not be needed without credentials"); },
});
assert.equal(noCredentials.observations.length, 0);
assert.equal(noCredentials.marketSession.decision.allowed, false);
assert(noCredentials.errors.includes("ALPACA_CLOCK_NOT_CONFIGURED"));
assert(noCredentials.errors.some((item) => item.includes("ALPACA_MARKET_DATA_NOT_CONFIGURED")));
assert(noCredentials.errors.some((item) => item.includes("TWELVE_DATA_NOT_CONFIGURED")));
assert(noCredentials.errors.includes("FX_NOT_FRESH_OR_CONFIGURED"));

const stale = await fetchFreshPaperReviewContext({
  instruments: [{ symbol: "SPY", currency: "USD", assetClass: "ETF", exchangeMic: "ARCX" }],
  credentials,
  now,
  fetchImpl: async (input) => {
    const url = String(input);
    if (url === "https://paper-api.alpaca.markets/v2/clock") {
      return response({ timestamp: "2026-10-06T17:39:55Z", is_open: true });
    }
    if (url.includes("/stocks/SPY/quotes/latest")) {
      return response({ quote: { bp: 780, ap: 781, t: "2026-10-06T17:30:00Z" } });
    }
    if (url.includes("api.twelvedata.com/quote")) {
      return response({ symbol: "SPY", exchange: "NYSE ARCA", currency: "USD", close: "780.5", timestamp: seconds("2026-10-06T17:30:00Z") });
    }
    if (url.includes("exchange_rate")) {
      return response({ rate: "0.888", timestamp: seconds("2026-10-06T17:39:50Z") });
    }
    throw new Error("unexpected");
  },
});
assert.equal(stale.observations.length, 0, "stale prices must never be promoted into review evidence");
assert(stale.errors.some((item) => item.includes("INVALID_OR_STALE_ALPACA_IEX_QUOTE")));
assert(stale.errors.some((item) => item.includes("INVALID_OR_STALE_TWELVE_DATA_QUOTE")));

const envCredentials = paperReviewCredentialsFromEnvironment({
  APCA_API_KEY_ID: "a",
  APCA_API_SECRET_KEY: "b",
  TWELVE_DATA_API_KEY: "c",
});
assert.deepEqual(envCredentials, {
  alpacaKeyId: "a",
  alpacaSecretKey: "b",
  twelveDataApiKey: "c",
});

console.log("Fenice read-only fresh PAPER review context tests: PASS");
