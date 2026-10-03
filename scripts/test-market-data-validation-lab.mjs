import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LAB_POLICY, auditPrimarySnapshot, collectMarketDataValidationLab, compareWithPrimary,
  planCryptoValidation, providerTimestamp, sourceFamily, validateCoinbaseProduct, validateCoinbaseTicker,
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

const calls = [];
const pacing = [];
const fixtureFetch = async (url, options) => {
  calls.push({ url, options });
  return { ok: true, json: async () => url.endsWith("/products")
    ? [product(), product("ETH"), product("SOL")]
    : url.includes("/ETH-") ? ticker({ time: undefined }) : ticker() };
};
const inputsBefore = JSON.stringify({ snapshot, quality });
const report = await collectMarketDataValidationLab({ snapshot, quality, fetchImpl: fixtureFetch,
  clock: () => now, pace: async (ms) => pacing.push(ms) });
assert.equal(JSON.stringify({ snapshot, quality }), inputsBefore, "lab must not mutate production inputs");
assert.equal(report.collection.requests, 4);
assert.equal(report.collection.collected, 2);
assert.equal(report.productionQuality.concentrationState, "BLOCKED", "never round 50.85% down into a passing gate");
assert.equal(report.productionQuality.dominantFamilyAttributionAvailable, false,
  "the summary does not contain enough rows to identify its dominant source family");
assert.equal(report.collection.statusCounts.CONFIRMED, 2);
assert.equal(report.collection.statusCounts.PROVIDER_TIMESTAMP_MISSING_OR_INVALID, 1);
assert.deepEqual(pacing, [300, 300, 300]);
for (const call of calls) {
  assert.match(call.url, /^https:\/\/api\.exchange\.coinbase\.com\/products(?:\/[A-Z]+-USD\/ticker)?$/);
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
  fetchImpl: async () => {
    rateLimitCalls += 1;
    return rateLimitCalls === 1 ? { ok: true, json: async () => [product(), product("ETH"), product("SOL")] }
      : { ok: false, status: 429 };
  } });
assert.equal(rateLimitCalls, 2, "rate limit response must stop all remaining requests");
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

const auditOnly = await collectMarketDataValidationLab({ snapshot, quality, auditOnly: true, clock: () => now,
  fetchImpl: async () => assert.fail("audit-only must never perform network calls") });
assert.equal(auditOnly.collection.requests, 0);
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
console.log("Market-data validation lab PASS: exact identities, provider timestamps, family deduplication, bounded public requests, failure reports and PAPER V6 isolation.");
