import assert from "node:assert/strict";
import { collectWorldMarketObservations } from "./collect-world-market-observations.mjs";

let instant = Date.parse("2026-11-04T02:23:00.000Z");
const now = () => instant;
const venues = [
  ["XTKS", "JP", "7203", "JPY", "XJPX"],
  ["XHKG", "HK", "0700", "HKD"],
  ["XMIL", "IT", "ENEL", "EUR"],
  ["XNAS", "US", "MSFT", "USD"],
  ["BVMF", "BR", "VALE3", "BRL"],
  ["XJSE", "ZA", "NPN", "ZAR"],
  ["XSAU", "SA", "2222", "SAR"],
];
const catalogue = {
  generatedAt: new Date(instant).toISOString(),
  status: "PRIVATE_RESEARCH_REFERENCES_ONLY",
  safety: { researchOnly: true },
  venues: Object.fromEntries(venues.map(([mic, country, , , operatingMic = mic]) => [mic, { country, operatingMic }])),
  references: venues.map(([mic, venueCountry, ticker, currency]) => ({ mic, venueCountry, ticker, currency, referenceOnly: true, paperAllowed: false })),
};
const states = (open = true) => [
  ...venues.map(([mic, , , , operatingMic = mic]) => ({ code: operatingMic, is_market_open: mic === "XNAS" ? false : open })),
  { code: "XASX", is_market_open: true },
];
const seen = [];
const request = (kind, params) => {
  if (kind === "market_state") return states();
  const mic = params.get("mic_code");
  const [, , symbol, currency] = venues.find(row => row[0] === mic);
  assert.equal(params.get("symbol"), symbol);
  assert.equal(params.get("interval"), "1min");
  seen.push(mic);
  return { symbol, currency, mic_code: mic === "XTKS" ? "XJPX" : mic, timestamp: now() / 1000, close: 123.4567 };
};
const run = (requestFn = request, previous = null, book = catalogue) => collectWorldMarketObservations({
  catalogue: book, previous, request: requestFn, now, delay: async () => {},
});

const first = await run();
assert.equal(first.venuesTracked, 9);
assert.equal(first.venuesWithExactState, 8);
assert.equal(first.quoteRequests, 4);
assert.equal(first.records.XNAS.quoteStatus, "NO_OPEN_SESSION_HINT");
assert.equal(first.records.XASX.quoteStatus, "NO_LISTING_REFERENCE");
assert.equal(first.records.XTKS.exactMicState, false);
assert.equal(first.records.XTKS.stateMic, "XJPX");

instant += 3_600_000;
const second = await run(request, first);
assert.equal(second.quoteRequests, 4);
assert.deepEqual(new Set(seen), new Set(["XTKS", "XHKG", "XMIL", "BVMF", "XJSE", "XSAU"]));
assert.equal([first, second].find(result => result.records.XTKS.lastQuoteAttemptAt)?.records.XTKS.quoteStatus, "MIC_UNVERIFIED");
for (const result of [first, second]) {
  assert.equal(result.liveTradingAllowed, false);
  assert.equal(result.brokerConnectivityAllowed, false);
  assert.equal(result.paperEligible, false);
  assert(!JSON.stringify(result).includes("123.4567"));
  assert(Object.values(result.records).every(record => record.authoritativeSessionVerified === false));
}

const limited = await run(kind => kind === "market_state" ? states() : { code: 429 });
assert.equal(limited.quoteRequests, 1);
const failed = await run(kind => {
  assert.equal(kind, "market_state");
  return { code: 503 };
});
assert.equal(failed.marketStateAvailable, false);
assert.equal(failed.quoteRequests, 0);
assert.equal(failed.venuesTracked, 7);

const duplicate = await run((kind, params) => kind === "market_state"
  ? [...states(), { code: "XMIL", is_market_open: false }]
  : request(kind, params));
assert.equal(duplicate.records.XMIL.state, "UNVERIFIED");
assert.equal(duplicate.records.XMIL.exactMicState, false);
assert.equal((await run(request, null, { ...catalogue, generatedAt: "2026-10-01T00:00:00.000Z" })).quoteRequests, 0);
console.log("World market collection: venue fairness, unknown sessions, rate limits and PAPER/LIVE lock PASS");
