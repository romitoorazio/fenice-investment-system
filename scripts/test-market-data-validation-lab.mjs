import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LAB_POLICY, auditPrimarySnapshot, collectMarketDataValidationLab, compareWithPrimary, compareSynchronizedObservations,
  compareVenueObservations, planCryptoValidation, providerTimestamp, sourceFamily,
  validateCoinbaseProduct, validateCoinbaseTicker, validateCoinGeckoMarkets, validateKrakenPair, validateKrakenTrades,
} from "../lib/intelligence/market-data-validation-lab.mjs";

const now = Date.parse("2026-10-03T17:00:00Z");
const at = (seconds = 0) => new Date(now - seconds * 1000).toISOString();
const primary = (symbol = "BTC", name = "Bitcoin", overrides = {}) => ({
  symbol, name, assetClass: "Criptovaluta", currency: "USD", source: "CoinGecko",
  price: 100, observedAt: at(5), ...overrides,
});
const snapshot = { marketObservations: [primary(), primary("ETH", "Ethereum"), primary("SOL", "Solana")] };
const quality = { generatedAt: at(1), confidenceModel: { metrics: { concentrationPercent: 50.85 } },
  crossSourceValidation: { checks: [{ instrument: "SOL:USD", sources: ["CoinGecko", "Yahoo Finance independent validation"] }] } };
const product = (symbol = "BTC", overrides = {}) => ({ id: `${symbol}-USD`, base_currency: symbol,
  quote_currency: "USD", status: "online", trading_disabled: false, ...overrides });
const ticker = (overrides = {}) => ({ trade_id: 42, price: "100.1", time: at(1), ...overrides });
const geckoMarket = (symbol = "BTC", overrides = {}) => ({
  id: { BTC: "bitcoin", ETH: "ethereum", SOL: "solana" }[symbol], symbol: symbol.toLowerCase(),
  name: { BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana" }[symbol], current_price: 100, last_updated: at(2), ...overrides,
});
const geckoMarkets = () => [geckoMarket(), geckoMarket("ETH"), geckoMarket("SOL")];
const krakenAlias = (symbol) => ({ BTC: "XBT", DOGE: "XDG" }[symbol] || symbol);
const krakenPair = (symbol = "BTC", overrides = {}) => ({ base: symbol, quote: "USD",
  aclass_base: "currency", aclass_quote: "currency", status: "online",
  altname: `${krakenAlias(symbol)}USD`, wsname: `${krakenAlias(symbol)}/USD`, ...overrides });
const krakenCatalog = (symbols = ["BTC", "ETH", "SOL"]) => ({ error: [],
  result: Object.fromEntries(symbols.map((symbol) => [`${symbol}/USD`, krakenPair(symbol)])) });
const krakenTrades = (symbol = "BTC", overrides = {}) => ({ error: [], result: {
  [`${symbol}/USD`]: [["100.2", "0.5", (now - 2000) / 1000, "b", "m", "", 43]], last: String(now * 1000000),
}, ...overrides });
const krakenSymbolFromUrl = (url) => {
  const alias = new URL(url).searchParams.get("pair").replace(/USD$/, "");
  return ({ XBT: "BTC", XDG: "DOGE" }[alias] || alias);
};
const target = planCryptoValidation(snapshot, quality, now).targets[0];

assert.equal(providerTimestamp(at()), now);
assert.equal(providerTimestamp("2026-10-03T19:00:00+02:00"), now);
assert.equal(providerTimestamp("2026-10-03T17:00:00.123456Z"), now + 123);
for (const invalid of [null, "2026-10-03", "2026-10-03T17:00:00", "2026-02-30T17:00:00Z",
  "2026-10-03T25:00:00Z", "2026-10-03T17:00:00+14:30", "bad"]) {
  assert.equal(providerTimestamp(invalid), null, `ambiguous provider timestamp accepted: ${invalid}`);
}
assert.equal(sourceFamily("Yahoo Finance independent validation"), "yahoo");
assert.equal(sourceFamily("Yahoo Finance"), "yahoo");
assert.equal(sourceFamily("unverified mirror"), null);
const audit = auditPrimarySnapshot({ marketObservations: [primary(),
  primary("BTC", "Bitcoin", { source: "CoinGecko mirror label" }),
  primary("ETH", "Ethereum", { observedAt: "2026-10-03" }),
  primary("SOL", "Solana", { observedAt: at(4 * 3600 + 1) }),
  primary("ADA", "Cardano", { observedAt: at(-1) }),
  primary("BCH", "Bitcoin Cash", { source: "unknown" }),
  primary("LINK", "Chainlink", { price: Infinity }),
] }, now);
assert.equal(audit.freshUniqueObservations, 1, "different labels in one family must not inflate diversity");
assert.deepEqual(audit.familyCounts, { coingecko: 1 });
assert.equal(audit.excluded.length, 6);

const plan = planCryptoValidation({ marketObservations: [...snapshot.marketObservations,
  primary("WBTC", "Wrapped Bitcoin"), primary("BTC", "Bitcoin Cash"),
  primary("ADA", "Cardano", { currency: "EUR" }), primary("XRP", "XRP", { observedAt: at(-1) }),
  primary("BCH", "Bitcoin Cash", { observedAt: "2026-10-03" }),
  primary("LINK", "Chainlink", { price: 0 }), primary("BTC", "Bitcoin", { observedAt: at(20) }),
] }, quality, now);
assert.deepEqual(plan.targets.map((row) => row.symbol), ["BTC", "ETH", "SOL"]);
assert.equal(plan.targets[0].primaryObservedAt, at(5), "keep newest duplicate primary observation");
assert.equal(plan.excluded.length, 6);
assert.equal(planCryptoValidation({ markets: snapshot.marketObservations }, quality, now).targets.length, 0,
  "display fallback rows cannot silently become primary validation evidence");

assert.equal(validateCoinbaseProduct(target, [product()]), null);
assert.equal(validateCoinbaseProduct(target, [product("BTC", { quote_currency: "USDT" })]), "PRODUCT_IDENTITY_MISMATCH");
assert.equal(validateCoinbaseProduct(target, [product("BTC", { base_currency: "WBTC" })]), "PRODUCT_IDENTITY_MISMATCH");
assert.equal(validateCoinbaseProduct(target, [product("BTC", { id: "BTC-USDT" })]), "EXACT_USD_PRODUCT_NOT_LISTED");
assert.equal(validateCoinbaseProduct(target, [product(), product()]), "AMBIGUOUS_PRODUCT_IDENTITY");
for (const overrides of [{ status: "offline" }, { trading_disabled: true }, { trading_disabled: undefined }]) {
  assert.equal(validateCoinbaseProduct(target, [product("BTC", overrides)]), "PRODUCT_NOT_ACTIVE");
}
for (const time of [undefined, "2026-10-03", "2026-10-03T17:00:00", at(121), at(-1)]) {
  assert(validateCoinbaseTicker(target, ticker({ time }), now).reason, "retrieval time cannot replace absent or stale trade time");
}
for (const price of [null, "", -1, 0, Infinity, true, "unparseable"]) {
  assert.equal(validateCoinbaseTicker(target, ticker({ price }), now).reason, "PROVIDER_PRICE_INVALID");
}
assert.equal(validateCoinbaseTicker(target, ticker({ trade_id: null }), now).reason, "PROVIDER_TRADE_ID_INVALID");
const observation = validateCoinbaseTicker(target, ticker(), now).observation;
assert.equal(observation.observedAt, at(1));
assert.equal(observation.receivedAt, at());
assert.equal(observation.eligibility, "VALIDATION_ONLY");
assert.equal(compareWithPrimary(target, observation, now).status, "CONFIRMED");
assert.equal(compareWithPrimary(target, { ...observation, price: 101 }, now).status, "ATTENTION");
assert.equal(compareWithPrimary(target, { ...observation, price: 105 }, now).status, "DIVERGENT");
assert.equal(compareWithPrimary({ ...target, primaryObservedAt: at(302) }, observation, now).status, "INCOMPARABLE");
assert.equal(compareWithPrimary(target, { ...observation, currency: "EUR" }, now).status, "INCOMPARABLE");
assert.equal(compareWithPrimary(target, observation, now + 121000).status, "INCOMPARABLE");

const freshPrimary = validateCoinGeckoMarkets(target, geckoMarkets(), now).observation;
assert.equal(freshPrimary.observedAt, at(2));
assert.equal(freshPrimary.timestampOrigin, "provider-last-updated");
assert.equal(freshPrimary.priceSemantics, "AGGREGATED_MARKET_PRICE");
assert.equal(compareSynchronizedObservations(target, freshPrimary, observation, now).status, "CONFIRMED");
assert.equal(compareSynchronizedObservations(target, freshPrimary, { ...observation, price: 101 }, now).status, "ATTENTION");
assert.equal(compareSynchronizedObservations(target, freshPrimary, { ...observation, price: 105 }, now).status, "DIVERGENT");
for (const bad of [undefined, null, "2026-10-03", "2026-10-03T17:00:00", at(121), at(-1)]) {
  assert(validateCoinGeckoMarkets(target, [geckoMarket("BTC", { last_updated: bad })], now).reason,
    "fresh primary must use its actual provider timestamp, never receipt time or a snapshot timestamp");
}
for (const overrides of [{ symbol: "wbtc" }, { name: "Wrapped Bitcoin" }]) {
  assert.equal(validateCoinGeckoMarkets(target, [geckoMarket("BTC", overrides)], now).reason, "PRIMARY_REFRESH_IDENTITY_MISMATCH");
}
assert.equal(validateCoinGeckoMarkets(target, [geckoMarket("BTC", { id: "wrapped-bitcoin" })], now).reason, "PRIMARY_REFRESH_ID_NOT_RETURNED");
assert.equal(validateCoinGeckoMarkets(target, [geckoMarket(), geckoMarket()], now).reason, "PRIMARY_REFRESH_AMBIGUOUS_IDENTITY");
assert.equal(validateCoinGeckoMarkets(target, { error: "invalid schema" }, now).reason, "PRIMARY_REFRESH_INVALID_SCHEMA");
assert.equal(validateCoinGeckoMarkets({ ...target, coingeckoId: "wrapped-bitcoin" }, geckoMarkets(), now).reason, "PRIMARY_REFRESH_TARGET_IDENTITY_INVALID");
for (const price of [null, "", 0, -1, true, Infinity]) {
  assert.equal(validateCoinGeckoMarkets(target, [geckoMarket("BTC", { current_price: price })], now).reason, "PRIMARY_REFRESH_PRICE_INVALID");
}
for (const overrides of [{ sourceFamily: "coinbase" }, { coingeckoId: "wrapped-bitcoin" }, { currency: "EUR" },
  { symbol: "ETH" }, { name: "Wrapped Bitcoin" }, { eligibility: "PAPER" }, { validationOnly: false }]) {
  assert.equal(compareSynchronizedObservations(target, { ...freshPrimary, ...overrides }, observation, now).status, "INCOMPARABLE");
}
assert.equal(compareSynchronizedObservations(target, freshPrimary, observation, now + 121000).reason, "PRIMARY_REFRESH_PROVIDER_TIMESTAMP_STALE");

const pair = validateKrakenPair(target, krakenCatalog()).pair;
assert.deepEqual(pair, { pairId: "BTC/USD", requestPair: "XBTUSD" });
for (const overrides of [{ base: "WBTC" }, { quote: "USDT" }, { aclass_base: "tokenized_asset" },
  { aclass_quote: undefined }, { altname: "WBTCUSD" }, { wsname: "BTC/USDT" }]) {
  assert.equal(validateKrakenPair(target, { error: [], result: { "BTC/USD": krakenPair("BTC", overrides) } }).reason,
    "KRAKEN_PAIR_IDENTITY_MISMATCH");
}
assert.equal(validateKrakenPair(target, { error: [], result: { "BTC/USD": krakenPair("BTC", { status: "cancel_only" }) } }).reason,
  "KRAKEN_PAIR_NOT_ACTIVE");
assert.equal(validateKrakenPair(target, { error: [], result: { "XXBTZUSD": krakenPair() } }).reason,
  "EXACT_KRAKEN_USD_PAIR_NOT_LISTED", "require the requested canonical display identity contract");
assert.equal(validateKrakenPair({ ...target, name: "Wrapped Bitcoin" }, krakenCatalog()).reason, "KRAKEN_TARGET_IDENTITY_INVALID");
const krakenObservation = validateKrakenTrades(target, pair, krakenTrades(), now).observation;
assert.equal(krakenObservation.observedAt, at(2));
assert.equal(krakenObservation.providerTradeTimeUnixSeconds, (now - 2000) / 1000);
assert.equal(krakenObservation.timestampOrigin, "provider-last-trade");
assert.equal(compareVenueObservations(target, observation, krakenObservation, now).status, "CONFIRMED");
assert.equal(compareVenueObservations(target, observation, { ...krakenObservation, price: 101 }, now).status, "ATTENTION");
assert.equal(compareVenueObservations(target, observation, { ...krakenObservation, price: 105 }, now).status, "DIVERGENT");
for (const seconds of [undefined, null, "1791046798", 0, -1, Infinity, NaN, now / 1000 + 1, now / 1000 - 121, now]) {
  const payload = krakenTrades();
  payload.result["BTC/USD"][0][2] = seconds;
  assert(validateKrakenTrades(target, pair, payload, now).reason, "never use receipt time or the pagination cursor as trade time");
}
for (const payload of [krakenTrades("ETH"), { error: [], result: { ...krakenTrades().result, "ETH/USD": [] } }]) {
  assert.equal(validateKrakenTrades(target, pair, payload, now).reason, "KRAKEN_TRADES_IDENTITY_MISMATCH");
}
for (const trades of [[], {}, [krakenTrades().result["BTC/USD"][0], krakenTrades().result["BTC/USD"][0]]]) {
  assert.equal(validateKrakenTrades(target, pair, { error: [], result: { "BTC/USD": trades } }, now).reason,
    "KRAKEN_TRADES_INVALID_SCHEMA");
}
for (const [index, value] of [[0, true], [1, 0], [3, "unknown"], [4, "unknown"], [6, null]]) {
  const payload = krakenTrades();
  payload.result["BTC/USD"][0][index] = value;
  assert(validateKrakenTrades(target, pair, payload, now).reason);
}
for (const [payload, reason] of [[{}, "KRAKEN_RESPONSE_INVALID_SCHEMA"],
  [{ error: ["EGeneral:private response body"] }, "KRAKEN_API_ERROR"],
  [{ error: ["EAPI:Rate limit exceeded"] }, "PUBLIC_PROVIDER_RATE_LIMITED"],
  [{ error: ["EService:Throttled: 1791046800"] }, "PUBLIC_PROVIDER_RATE_LIMITED"]]) {
  assert.equal(validateKrakenTrades(target, pair, payload, now).reason, reason);
  assert.equal(validateKrakenPair(target, payload).reason, reason);
}
for (const overrides of [{ sourceFamily: "coinbase" }, { productId: "BTC/USDT" }, { requestPair: "WBTCUSD" },
  { name: "Wrapped Bitcoin" }, { currency: "EUR" }, { priceSemantics: "AGGREGATED_MARKET_PRICE" },
  { timestampOrigin: "receipt-time" }, { eligibility: "PAPER" }, { validationOnly: false }]) {
  assert.equal(compareVenueObservations(target, observation, { ...krakenObservation, ...overrides }, now).status, "INCOMPARABLE");
}
assert.equal(compareVenueObservations(target, observation, krakenObservation, now + 121000).reason,
  "COINBASE_PROVIDER_TIMESTAMP_STALE");
assert.equal(compareVenueObservations(target, observation, { ...krakenObservation, observedAt: at(121) }, now).reason,
  "KRAKEN_PROVIDER_TIMESTAMP_STALE");

const calls = [];
const pacing = [];
const fixtureFetch = async (url, options) => {
  calls.push({ url, options });
  if (url.startsWith("https://api.kraken.com/")) return { ok: true,
    json: async () => url.includes("/AssetPairs?") ? krakenCatalog() : krakenTrades(krakenSymbolFromUrl(url)) };
  return { ok: true, json: async () => url.startsWith("https://api.coingecko.com/") ? geckoMarkets() : url.endsWith("/products")
    ? [product(), product("ETH"), product("SOL")]
    : url.includes("/ETH-") ? ticker({ time: undefined }) : ticker() };
};
const inputsBefore = JSON.stringify({ snapshot, quality });
const report = await collectMarketDataValidationLab({ snapshot, quality, fetchImpl: fixtureFetch,
  clock: () => now, pace: async (ms) => pacing.push(ms) });
assert.equal(JSON.stringify({ snapshot, quality }), inputsBefore, "lab must not mutate production inputs");
assert.equal(report.version, 3);
assert.equal(report.collection.requests, 8);
assert.equal(report.collection.collected, 2);
assert.equal(report.productionQuality.concentrationState, "BLOCKED", "never round 50.85% down into a passing gate");
assert.equal(report.productionQuality.dominantFamilyAttributionAvailable, false,
  "the summary does not contain enough rows to identify its dominant source family");
assert.equal(report.collection.statusCounts.CONFIRMED, 2);
assert.equal(report.collection.statusCounts.PROVIDER_TIMESTAMP_MISSING_OR_INVALID, 1);
assert.equal(report.collection.synchronized.primaryRequests, 1, "all exact primary IDs share one bounded request");
assert.equal(report.collection.synchronized.primaryCollected, 3);
assert.equal(report.collection.synchronized.statusCounts.CONFIRMED, 2);
assert.equal(report.collection.synchronized.snapshotFallbackAllowed, false);
assert.equal(report.collection.venues.requests, 3);
assert.equal(report.collection.venues.collected, 2);
assert.equal(report.collection.venues.statusCounts.CONFIRMED, 2);
assert.equal(report.collection.venues.reasonCounts.COINBASE_OBSERVATION_NOT_COLLECTED, 1);
assert.deepEqual(pacing, [300, 300, 300, 300, 1000, 1000, 1000]);
for (const call of calls) {
  const url = new URL(call.url);
  if (url.hostname === "api.coingecko.com") {
    assert.equal(url.pathname, "/api/v3/coins/markets");
    assert.equal(url.searchParams.get("ids"), "bitcoin,ethereum,solana");
    assert.equal(url.searchParams.get("vs_currency"), "usd");
    assert.equal(url.searchParams.get("per_page"), "16");
    assert.equal(url.searchParams.get("locale"), "en");
    assert(!url.searchParams.has("symbols") && !url.searchParams.has("names"), "never fall back to ambiguous symbol searches");
  } else if (url.hostname === "api.kraken.com") {
    assert(["/0/public/AssetPairs", "/0/public/Trades"].includes(url.pathname));
    assert.equal(url.searchParams.get("assetVersion"), "1");
    if (url.pathname.endsWith("Trades")) assert.equal(url.searchParams.get("count"), "1");
    else {
      assert.equal(url.searchParams.get("aclass_base"), "currency");
      assert.equal(url.searchParams.get("execution_venue"), "international");
    }
  } else assert.match(call.url, /^https:\/\/api\.exchange\.coinbase\.com\/products(?:\/[A-Z]+-USD\/ticker)?$/);
  assert.equal(call.options.method, "GET");
  assert.equal(call.options.credentials, "omit");
  assert.equal(call.options.redirect, "error");
  assert(!Object.keys(call.options.headers).some((key) => /auth|cb-access/i.test(key)));
}
assert.equal(report.safety.paperExecutionAllowed, false);
assert.equal(report.safety.liveTradingAllowed, false);
assert.equal(report.safety.brokerConnectivityAllowed, false);
assert.equal(report.safety.feedsPaperV6DecisionData, false);
assert.equal(report.safety.upstreamDataIndependenceCertified, false);

let rateLimitCalls = 0;
const rateLimited = await collectMarketDataValidationLab({ snapshot, quality, clock: () => now, pace: async () => {},
  fetchImpl: async (url) => {
    rateLimitCalls += 1;
    return url.startsWith("https://api.coingecko.com/") ? { ok: true, json: async () => geckoMarkets() }
      : url.endsWith("/products") ? { ok: true, json: async () => [product(), product("ETH"), product("SOL")] }
      : { ok: false, status: 429 };
  } });
assert.equal(rateLimitCalls, 3, "Coinbase rate limit response must stop all remaining Coinbase requests");
assert.equal(rateLimited.collection.collected, 0);
assert.equal(rateLimited.collection.statusCounts.RATE_LIMIT_STOPPED_REMAINING_REQUESTS, 2);

const failed = await collectMarketDataValidationLab({ snapshot, quality, clock: () => now,
  fetchImpl: async () => { throw new Error("provider returned confidential payload"); } });
assert.equal(failed.collection.requests, 1);
assert.equal(failed.collection.collected, 0);
assert.equal(failed.collection.statusCounts.PUBLIC_PROVIDER_REQUEST_FAILED, 3);
assert(!JSON.stringify(failed).includes("confidential"), "provider error bodies must not leak into reports");
const invalidCatalog = await collectMarketDataValidationLab({ snapshot, quality, clock: () => now,
  fetchImpl: async () => ({ ok: true, json: async () => ({ message: "unexpected schema" }) }) });
assert.equal(invalidCatalog.collection.statusCounts.PUBLIC_PROVIDER_INVALID_CATALOG, 3);
const invalidJson = await collectMarketDataValidationLab({ snapshot, quality, clock: () => now,
  fetchImpl: async () => ({ ok: true, json: async () => { throw new Error("raw body"); } }) });
assert.equal(invalidJson.collection.statusCounts.PUBLIC_PROVIDER_INVALID_JSON, 3);
const forbidden = await collectMarketDataValidationLab({ snapshot, quality, clock: () => now,
  fetchImpl: async () => ({ ok: false, status: 403 }) });
assert.equal(forbidden.collection.statusCounts.PUBLIC_PROVIDER_HTTP_403, 3);

// Reproduce the observed six-minute snapshot skew without changing that snapshot.
const lateSnapshot = { marketObservations: snapshot.marketObservations.map((row) => ({ ...row, observedAt: at(380) })) };
const synchronized = await collectMarketDataValidationLab({ snapshot: lateSnapshot, quality,
  clock: () => now, pace: async () => {}, fetchImpl: fixtureFetch });
assert.equal(synchronized.collection.statusCounts.INCOMPARABLE, 2, "keep the original snapshot diagnosis");
assert.equal(synchronized.collection.synchronized.statusCounts.CONFIRMED, 2, "fresh exact primary quotes recover valid research comparisons");
assert.equal(lateSnapshot.marketObservations[0].observedAt, at(380), "never rewrite the snapshot timestamp");

for (const [providerReply, expectedReason] of [
  [{ ok: false, status: 429 }, "PUBLIC_PROVIDER_RATE_LIMITED"],
  [{ ok: false, status: 403 }, "PUBLIC_PROVIDER_HTTP_403"],
  [{ ok: true, json: async () => ({ error: "unexpected provider payload" }) }, "PRIMARY_REFRESH_INVALID_SCHEMA"],
  [{ ok: true, json: async () => [] }, "PRIMARY_REFRESH_ID_NOT_RETURNED"],
]) {
  let primaryCalls = 0;
  const unavailable = await collectMarketDataValidationLab({ snapshot, quality, clock: () => now, pace: async () => {},
    fetchImpl: async (url, options) => {
      if (url.startsWith("https://api.coingecko.com/")) { primaryCalls += 1; return providerReply; }
      return fixtureFetch(url, options);
    } });
  assert.equal(primaryCalls, 1, "no retries or alternate endpoints after a primary failure");
  assert.equal(unavailable.collection.statusCounts.CONFIRMED, 2, "snapshot comparison remains explicitly separate");
  assert.equal(unavailable.collection.synchronized.statusCounts.CONFIRMED, undefined, "never substitute the snapshot for a failed refresh");
  assert.equal(unavailable.collection.synchronized.reasonCounts[expectedReason], 2);
  assert(!JSON.stringify(unavailable).includes("unexpected provider payload"));
}
const stalePrimaryReport = await collectMarketDataValidationLab({ snapshot, quality, clock: () => now, pace: async () => {},
  fetchImpl: async (url, options) => url.startsWith("https://api.coingecko.com/")
    ? { ok: true, json: async () => geckoMarkets().map((row) => ({ ...row, last_updated: at(121) })) }
    : fixtureFetch(url, options) });
assert.equal(stalePrimaryReport.collection.synchronized.statusCounts.INCOMPARABLE, 3);
assert.equal(stalePrimaryReport.collection.synchronized.reasonCounts.PROVIDER_TIMESTAMP_STALE, 2);
assert.equal(stalePrimaryReport.collection.venues.statusCounts.CONFIRMED, 2,
  "two venue trades remain separate from the rejected CoinGecko refresh");
for (const reply of [{ ok: false, status: 429 }, { ok: true, json: async () => ({ error: ["EAPI:Rate limit exceeded"] }) }]) {
  let tradeCalls = 0;
  const stopped = await collectMarketDataValidationLab({ snapshot, quality, clock: () => now, pace: async () => {},
    fetchImpl: async (url, options) => {
      if (url.includes("api.kraken.com/0/public/Trades?")) { tradeCalls += 1; return reply; }
      return fixtureFetch(url, options);
    } });
  assert.equal(tradeCalls, 1, "HTTP and HTTP-200 Kraken rate limits both stop remaining requests");
  assert.equal(stopped.collection.venues.reasonCounts.PUBLIC_PROVIDER_RATE_LIMITED, 1);
  assert.equal(stopped.collection.venues.reasonCounts.RATE_LIMIT_STOPPED_REMAINING_REQUESTS, 1);
}
const privateError = await collectMarketDataValidationLab({ snapshot, quality, clock: () => now, pace: async () => {},
  fetchImpl: async (url, options) => url.startsWith("https://api.kraken.com/")
    ? { ok: true, json: async () => ({ error: ["EGeneral:confidential raw body"] }) } : fixtureFetch(url, options) });
assert.equal(privateError.collection.venues.requests, 1, "invalid catalog must not produce trade requests");
assert.equal(privateError.collection.venues.reasonCounts.KRAKEN_API_ERROR, 2);
assert(!JSON.stringify(privateError).includes("confidential"));
let venueNow = now;
const slowVenues = await collectMarketDataValidationLab({ snapshot, quality, clock: () => venueNow, pace: async () => {},
  fetchImpl: async (url, options) => {
    if (url.includes("api.kraken.com/0/public/Trades?")) {
      venueNow += 61000;
      const payload = krakenTrades(krakenSymbolFromUrl(url));
      Object.values(payload.result)[0][0][2] = (venueNow - 1000) / 1000;
      return { ok: true, json: async () => payload };
    }
    return fixtureFetch(url, options);
  } });
assert.equal(slowVenues.collection.venues.collected, 2);
assert.equal(slowVenues.collection.venues.statusCounts.CONFIRMED, undefined, "recheck Coinbase after slow Kraken collection");
assert.equal(slowVenues.collection.venues.reasonCounts.COINBASE_PROVIDER_TIMESTAMP_STALE, 2);
let delayedNow = now;
const delayed = await collectMarketDataValidationLab({ snapshot, quality, clock: () => delayedNow, pace: async () => {},
  fetchImpl: async (url, options) => {
    if (url.startsWith("https://api.coingecko.com/")) return { ok: true, json: async () => geckoMarkets() };
    if (url.endsWith("/ticker")) {
      delayedNow += 50000;
      return { ok: true, json: async () => ticker({ time: new Date(delayedNow - 1000).toISOString() }) };
    }
    return fixtureFetch(url, options);
  } });
assert.equal(delayed.collection.synchronized.primaryCollected, 3);
assert.equal(delayed.collection.synchronized.statusCounts.INCOMPARABLE, 3, "recheck both timestamps after a slow collection");
assert.equal(delayed.collection.synchronized.reasonCounts.PRIMARY_REFRESH_PROVIDER_TIMESTAMP_STALE, 3);

const auditOnly = await collectMarketDataValidationLab({ snapshot, quality, auditOnly: true, clock: () => now,
  fetchImpl: async () => assert.fail("audit-only must never perform network calls") });
assert.equal(auditOnly.collection.requests, 0);
assert.equal(auditOnly.collection.venues.requests, 0);
assert.equal(auditOnly.collection.statusCounts.AUDIT_ONLY_NO_PROVIDER_REQUEST, 3);
for (const incomplete of [{}, { generatedAt: at(25 * 3600), ...{ confidenceModel: quality.confidenceModel } },
  { generatedAt: at(-1), confidenceModel: quality.confidenceModel },
  { ...quality, confidenceModel: { metrics: { concentrationPercent: "46" } } }]) {
  const unknown = await collectMarketDataValidationLab({ snapshot: {}, quality: incomplete, auditOnly: true, clock: () => now });
  assert.equal(unknown.productionQuality.concentrationState, "UNVERIFIABLE");
}
for (const [percent, state] of [[50, "WITHIN_LIMIT"], [50.001, "BLOCKED"], [45.71, "WITHIN_LIMIT"]]) {
  const boundary = await collectMarketDataValidationLab({ snapshot: {}, auditOnly: true, clock: () => now,
    quality: { ...quality, confidenceModel: { metrics: { concentrationPercent: percent } } } });
  assert.equal(boundary.productionQuality.concentrationState, state);
}

// All sixteen identities are eligible for planning; the production collector's
// twelve-target cap must not quietly truncate the isolated research experiment.
const allNames = { BTC: "Bitcoin", ETH: "Ethereum", ADA: "Cardano", AVAX: "Avalanche", BCH: "Bitcoin Cash",
  DOGE: "Dogecoin", HBAR: "Hedera", LINK: "Chainlink", LTC: "Litecoin", NEAR: "NEAR Protocol",
  SOL: "Solana", SUI: "Sui", UNI: "Uniswap", XRP: "XRP", XLM: "Stellar", ZEC: "Zcash" };
assert.equal(planCryptoValidation({ marketObservations: Object.entries(allNames).map(([s, n]) => primary(s, n)) }, quality, now).targets.length, 16);
assert.equal(LAB_POLICY.maxTargets, 16);
assert.equal(LAB_POLICY.maxRequests, 35);
assert.equal(LAB_POLICY.krakenRequestIntervalMs, 1000);
const fullSnapshot = { marketObservations: Object.entries(allNames).map(([s, n]) => primary(s, n)) };
let fullCalls = 0;
const fullReport = await collectMarketDataValidationLab({ snapshot: fullSnapshot, quality, clock: () => now, pace: async () => {},
  fetchImpl: async (url) => {
    fullCalls += 1;
    return { ok: true, json: async () => url.includes("api.kraken.com")
      ? url.includes("/AssetPairs?") ? krakenCatalog(Object.keys(allNames)) : krakenTrades(krakenSymbolFromUrl(url))
      : url.includes("api.coingecko.com") ? geckoMarkets()
        : url.endsWith("/products") ? Object.keys(allNames).map((symbol) => product(symbol)) : ticker() };
  } });
assert.equal(fullCalls, 35, "the complete curated experiment must stay inside the public request budget");
assert.equal(fullReport.collection.venues.statusCounts.CONFIRMED, 16);
assert.equal(LAB_POLICY.providerMaxAgeSeconds, 120);
assert.equal(LAB_POLICY.comparisonMaxSkewSeconds, 300);
assert.equal(LAB_POLICY.confirmationBandPercent, 0.5);
assert.equal(LAB_POLICY.divergenceBandPercent, 2);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = await readFile(path.join(root, ".github/workflows/market-data-validation-lab.yml"), "utf8");
assert.match(workflow, /contents: read/);
assert(!/contents: write|secrets\.|git push|workflow_call|pull_request_target/.test(workflow), "lab workflow must not acquire write credentials or execute privileged PR code");
assert.match(workflow, /head_repository\.full_name == github\.repository/);
assert.match(workflow, /head_branch == 'main'/);
assert.match(workflow, /conclusion == 'success'/);
assert.match(workflow, /ref: main/);
const runner = await readFile(path.join(root, "scripts/run-market-data-validation-lab.mjs"), "utf8");
assert.match(runner, /LAB_PAPER_ISOLATION_FAILURE/);
assert.match(runner, /LAB_REQUIRES_UNCHANGED_ACTIVE_PAPER_BASELINE/);
assert.match(runner, /market-data-validation-lab\.json/);
const rejectedCli = spawnSync(process.execPath, [path.join(root, "scripts/run-market-data-validation-lab.mjs"), "--output=data/latest-snapshot.json"], { encoding: "utf8" });
assert.notEqual(rejectedCli.status, 0, "output path cannot be redirected to V6 inputs");
assert.match(rejectedCli.stderr, /LAB_UNSUPPORTED_ARGUMENT/);
console.log("Market-data validation lab PASS: exact IDs, canonical Kraken spot pairs, explicit venue trade timestamps, stale exclusion, no snapshot fallback, bounded requests, rate-limit stops and PAPER V6 isolation.");
