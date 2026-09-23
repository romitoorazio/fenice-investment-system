import assert from "node:assert/strict";
import {
  computeIntelligenceConfidence,
  computeSourceConcentration,
  deriveCryptoVenueTargets,
  deriveStooqTargets,
  filterFreshValidationEvidence,
  parseStooqTimestamp,
  settleWithConcurrency,
} from "../lib/intelligence/quality-engine.mjs";
import {
  recoverFinra,
  recoverOptionalIntelligenceSources,
} from "../lib/intelligence/optional-source-recovery.mjs";

const observations = [
  { symbol: "BTC", name: "Bitcoin", assetClass: "Criptovaluta", currency: "USD", source: "CoinGecko" },
  { symbol: "ETH", name: "Ethereum", assetClass: "Criptovaluta", currency: "USD", source: "CoinGecko" },
  { symbol: "SPY", assetClass: "ETF", currency: "USD", source: "Alpha Vantage" },
  { symbol: "QQQ", assetClass: "ETF", currency: "USD", source: "Alpha Vantage" },
];

const cryptoTargets = deriveCryptoVenueTargets(observations, 12);
assert.deepEqual(cryptoTargets.map(([symbol]) => symbol), ["BTC", "ETH"]);

const stooqTargets = deriveStooqTargets(observations, [["spy.us", "SPY", "ETF"]], 10);
assert(stooqTargets.some(([, symbol]) => symbol === "SPY"));
assert(stooqTargets.some(([, symbol]) => symbol === "QQQ"));
assert(!stooqTargets.some(([, symbol]) => symbol === "BTC"));

assert.equal(
  parseStooqTimestamp("2026-09-23", "16:00:00", "Europe/Warsaw"),
  "2026-09-23T14:00:00.000Z",
  "Stooq summer timestamps must respect Warsaw daylight saving time",
);
assert.equal(
  parseStooqTimestamp("2026-01-21", "16:00:00", "Europe/Warsaw"),
  "2026-01-21T15:00:00.000Z",
  "Stooq winter timestamps must respect Warsaw standard time",
);
assert.equal(parseStooqTimestamp("2026-09-23", "bad", "Europe/Warsaw"), null);
assert.equal(parseStooqTimestamp("bad", "16:00:00", "Europe/Warsaw"), null);
assert.equal(parseStooqTimestamp("2026-09-23", "16:00:00", "Not/AZone"), null);

assert.equal(computeSourceConcentration([
  { source: "A" }, { source: "A" }, { source: "B" }, { source: "C" },
]), 0.5);

const now = Date.parse("2026-09-21T18:00:00Z");
const freshEvidence = filterFreshValidationEvidence([
  { symbol: "BTC", assetClass: "Criptovaluta", observedAt: new Date(now - 2 * 3_600_000).toISOString() },
  { symbol: "ETH", assetClass: "Criptovaluta", observedAt: new Date(now - 5 * 3_600_000).toISOString() },
  { symbol: "SPY", assetClass: "ETF", observedAt: new Date(now - 72 * 3_600_000).toISOString() },
  { symbol: "QQQ", assetClass: "ETF", observedAt: new Date(now - 120 * 3_600_000).toISOString() },
  { symbol: "RXRX", assetClass: "AI Biotech", observedAt: "2026-09-21" },
  { symbol: "MISSING", assetClass: "ETF", observedAt: null },
], { now });
assert.deepEqual(freshEvidence.map((item) => item.symbol), ["BTC", "SPY"]);

const dateOnlyAllowedForNonCrossValidationUse = filterFreshValidationEvidence([
  { symbol: "RXRX", assetClass: "AI Biotech", observedAt: "2026-09-21" },
], { now, requirePreciseTimestamp: false });
assert.equal(dateOnlyAllowedForNonCrossValidationUse.length, 1);

const freshHealthAt = new Date(now - 60 * 60 * 1000).toISOString();

const healthy = computeIntelligenceConfidence({
  sourceQuality: [
    { state: "operativo", qualityScore: 98 },
    { state: "operativo", qualityScore: 96 },
    { state: "parziale", qualityScore: 90 },
    { state: "errore", qualityScore: 8 },
  ],
  criticalHealth: { gate: "GREEN", ready: 9, total: 9 },
  healthReportGeneratedAt: freshHealthAt,
  validations: Array.from({ length: 12 }, () => ({ status: "confermato" })),
  sourceCount: 4,
  assetClassCount: 4,
  concentration: 0.42,
  now,
});
assert(healthy.confidence >= 90, `healthy confidence too low: ${healthy.confidence}`);
assert.equal(healthy.metrics.criticalHealthFresh, true);

// Regression from the 2026-09-23 live audit: 8 hard confirmations plus 12
// non-divergent crypto ATTENTION checks must not collapse confidence merely
// because evidence crossed the confirmation boundary by a small amount. The
// consensus engine supplies bounded credits; the global 90 threshold is not
// lowered and divergent evidence still fails closed below.
const liveLikeAttentionCredits = [
  0.185, 1, 1, 0.629, 0.646, 1, 1, 0.831, 0.851, 0.907, 0.945, 1,
];
const gradedAttention = computeIntelligenceConfidence({
  sourceQuality: [
    { state: "operativo", qualityScore: 93 },
    { state: "operativo", qualityScore: 93 },
    { state: "parziale", qualityScore: 91.8 },
    { state: "errore", qualityScore: 8 },
  ],
  criticalHealth: { gate: "GREEN", ready: 9, total: 9 },
  healthReportGeneratedAt: freshHealthAt,
  validations: [
    ...Array.from({ length: 8 }, () => ({ status: "confermato" })),
    ...liveLikeAttentionCredits.map((confidenceCredit) => ({ status: "attenzione", confidenceCredit })),
  ],
  sourceCount: 3,
  assetClassCount: 4,
  concentration: 0.4627,
  now,
});
assert(gradedAttention.confidence >= 90, `graded non-divergent evidence should remain institutionally usable, got ${gradedAttention.confidence}`);
assert.equal(gradedAttention.metrics.divergent, 0);
assert.equal(gradedAttention.metrics.attention, 12);
assert(gradedAttention.metrics.weightedValidationCredit > 17.9);
assert(gradedAttention.metrics.validationCreditPercent > 89);

const legacyAttentionWithoutCredit = computeIntelligenceConfidence({
  sourceQuality: [{ state: "operativo", qualityScore: 100 }],
  criticalHealth: { gate: "GREEN", ready: 9, total: 9 },
  healthReportGeneratedAt: freshHealthAt,
  validations: [
    ...Array.from({ length: 9 }, () => ({ status: "confermato" })),
    { status: "attenzione" },
  ],
  sourceCount: 4,
  assetClassCount: 4,
  concentration: 0.2,
  now,
});
assert.equal(legacyAttentionWithoutCredit.metrics.weightedValidationCredit, 9, "ATTENTION without consensus-engine credit must remain fail-closed at zero contribution");

const missingCritical = computeIntelligenceConfidence({
  sourceQuality: [{ state: "operativo", qualityScore: 100 }],
  criticalHealth: { gate: "RED", ready: 8, total: 9 },
  healthReportGeneratedAt: freshHealthAt,
  validations: Array.from({ length: 20 }, () => ({ status: "confermato" })),
  sourceCount: 5,
  assetClassCount: 5,
  concentration: 0.2,
  now,
});
assert(missingCritical.confidence <= 74);

const staleCriticalHealth = computeIntelligenceConfidence({
  sourceQuality: [{ state: "operativo", qualityScore: 100 }],
  criticalHealth: { gate: "GREEN", ready: 9, total: 9 },
  healthReportGeneratedAt: new Date(now - 30 * 60 * 60 * 1000).toISOString(),
  validations: Array.from({ length: 20 }, () => ({ status: "confermato" })),
  sourceCount: 5,
  assetClassCount: 5,
  concentration: 0.2,
  now,
});
assert.equal(staleCriticalHealth.metrics.criticalHealthFresh, false);
assert(staleCriticalHealth.confidence <= 74, `stale critical health must cap confidence, got ${staleCriticalHealth.confidence}`);

const missingHealthTimestamp = computeIntelligenceConfidence({
  sourceQuality: [{ state: "operativo", qualityScore: 100 }],
  criticalHealth: { gate: "GREEN", ready: 9, total: 9 },
  validations: Array.from({ length: 20 }, () => ({ status: "confermato" })),
  sourceCount: 5,
  assetClassCount: 5,
  concentration: 0.2,
  now,
});
assert.equal(missingHealthTimestamp.metrics.criticalHealthFresh, false);
assert(missingHealthTimestamp.confidence <= 74);

const divergent = computeIntelligenceConfidence({
  sourceQuality: [{ state: "operativo", qualityScore: 100 }],
  criticalHealth: { gate: "GREEN", ready: 9, total: 9 },
  healthReportGeneratedAt: freshHealthAt,
  validations: [
    ...Array.from({ length: 12 }, () => ({ status: "confermato" })),
    { status: "divergente", confidenceCredit: 1 },
  ],
  sourceCount: 5,
  assetClassCount: 5,
  concentration: 0.2,
  now,
});
assert(divergent.confidence <= 84);
assert.equal(divergent.metrics.weightedValidationCredit, 12, "divergent rows must ignore any attempted positive confidence credit");

let active = 0;
let peak = 0;
const tasks = Array.from({ length: 20 }, (_, index) => async () => {
  active += 1;
  peak = Math.max(peak, active);
  await new Promise((resolve) => setTimeout(resolve, 2));
  active -= 1;
  return index;
});
const results = await settleWithConcurrency(tasks, 4);
assert.equal(results.filter((item) => item.status === "fulfilled").length, 20);
assert(peak <= 4, `concurrency exceeded: ${peak}`);

const recoverySnapshot = {
  providers: [
    { id: "gdelt", name: "GDELT", state: "errore", coverage: [] },
    { id: "finra-fixed-income", name: "FINRA Fixed Income API", state: "errore", coverage: [] },
  ],
  discoveries: [],
};
const recoveryHealth = [];
const fakeGdeltFetch = async (url) => {
  assert(String(url).includes("api.gdeltproject.org"));
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        articles: [{
          title: "Quantum company raises funding round",
          seendate: "20260923T120000Z",
          domain: "example.test",
          url: "https://example.test/story",
        }],
      };
    },
  };
};
const optionalRecovery = await recoverOptionalIntelligenceSources(recoverySnapshot, recoveryHealth, {
  env: {},
  fetchImpl: fakeGdeltFetch,
  timeoutMs: 1_000,
});
assert.equal(optionalRecovery.gdelt.state, "operativo");
assert.equal(optionalRecovery.gdelt.successes, 2);
assert.equal(recoverySnapshot.providers.find((item) => item.id === "gdelt")?.state, "operativo");
assert.equal(recoverySnapshot.providers.find((item) => item.id === "finra-fixed-income")?.state, "non configurato");
assert.equal(recoveryHealth.find((item) => item.id === "finra-fixed-income")?.status, "unconfigured");
assert.equal(recoverySnapshot.discoveries.length, 1);

const finraSnapshot = { providers: [], discoveries: [] };
const finraHealth = [];
const finraCalls = [];
const fakeFinraFetch = async (url, options = {}) => {
  finraCalls.push({ url: String(url), authorization: options?.headers?.authorization || "" });
  if (String(url).includes("ews.fip.finra.org")) {
    return { ok: true, status: 200, async json() { return { access_token: "test-token" }; } };
  }
  if (String(url).includes("api.finra.org")) {
    assert.equal(options?.headers?.authorization, "Bearer test-token");
    return {
      ok: true,
      status: 200,
      async json() {
        return [{ tradeDate: "2026-09-22", dealerCustomerVolume: 1.2 }];
      },
    };
  }
  throw new Error(`unexpected URL ${url}`);
};
const finraRecovery = await recoverFinra(finraSnapshot, finraHealth, {
  env: { FINRA_CLIENT_ID: "client", FINRA_CLIENT_SECRET: "secret" },
  fetchImpl: fakeFinraFetch,
  timeoutMs: 1_000,
});
assert.equal(finraRecovery.state, "operativo");
assert.equal(finraSnapshot.providers.find((item) => item.id === "finra-fixed-income")?.state, "operativo");
assert.equal(finraHealth.find((item) => item.id === "finra-fixed-income")?.status, "healthy");
assert.equal(finraCalls.length, 2);
assert(finraCalls[0].authorization.startsWith("Basic "));

console.log("Fenice intelligence quality engine tests: PASS");
