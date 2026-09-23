import assert from "node:assert/strict";
import {
  reconcileFinraGlobalSourceHealth,
  recomputeGlobalSourceHealth,
} from "../lib/intelligence/global-source-health-reconcile.mjs";

const registry = {
  sources: [
    { id: "critical", authority: "institutional", critical: true },
    { id: "finra-fixed-income", authority: "regulator", critical: false, endpoint: "https://api.finra.org/data/group/fixedIncomeMarket/name/treasuryDailyAggregates?limit=1" },
    { id: "market", authority: "market-data", critical: false },
  ],
};
const rawReport = recomputeGlobalSourceHealth({
  generatedAt: "2026-09-23T10:00:00.000Z",
  sources: [
    { id: "critical", critical: true, status: "healthy" },
    { id: "finra-fixed-income", critical: false, status: "failed", httpStatus: 401, detail: "HTTP 401", checkedAt: "2026-09-23T10:00:00.000Z" },
    { id: "market", critical: false, status: "healthy" },
  ],
}, registry);

const unconfigured = await reconcileFinraGlobalSourceHealth(rawReport, registry, {
  env: {},
  now: new Date("2026-09-23T10:01:00.000Z"),
});
const finraUnconfigured = unconfigured.sources.find((source) => source.id === "finra-fixed-income");
assert.equal(finraUnconfigured.status, "unconfigured");
assert.equal(finraUnconfigured.anonymousProbe.httpStatus, 401);
assert.equal(unconfigured.reliabilityScore, rawReport.reliabilityScore, "failed -> unconfigured must not increase score");
assert.equal(unconfigured.gate, rawReport.gate);
assert.equal(unconfigured.reconciliation.finraPublicOAuth.scoreEffect, "none-vs-failed");

const calls = [];
const fakeFetch = async (url, options = {}) => {
  calls.push({ url: String(url), authorization: options?.headers?.authorization || "" });
  if (String(url).includes("ews.fip.finra.org")) {
    assert.match(options.headers.authorization, /^Basic /);
    return { ok: true, status: 200, async json() { return { access_token: "oauth-test" }; } };
  }
  assert.equal(options.headers.authorization, "Bearer oauth-test");
  return { ok: true, status: 200, async json() { return [{ tradeDate: "2026-09-22" }, { tradeDate: "2026-09-21" }]; } };
};
const healthy = await reconcileFinraGlobalSourceHealth(rawReport, registry, {
  env: { FINRA_CLIENT_ID: "client", FINRA_CLIENT_SECRET: "secret" },
  fetchImpl: fakeFetch,
  now: new Date("2026-09-23T10:02:00.000Z"),
});
const finraHealthy = healthy.sources.find((source) => source.id === "finra-fixed-income");
assert.equal(finraHealthy.status, "healthy");
assert.equal(finraHealthy.oauthVerified, true);
assert(healthy.reliabilityScore > rawReport.reliabilityScore, "score may improve only after verified OAuth data succeeds");
assert.equal(calls.length, 2);

const oauthFailure = await reconcileFinraGlobalSourceHealth(rawReport, registry, {
  env: { FINRA_CLIENT_ID: "client", FINRA_CLIENT_SECRET: "secret" },
  fetchImpl: async () => ({ ok: false, status: 401, async json() { return {}; } }),
  now: new Date("2026-09-23T10:03:00.000Z"),
});
assert.equal(oauthFailure.sources.find((source) => source.id === "finra-fixed-income")?.status, "failed");
assert.equal(oauthFailure.reliabilityScore, rawReport.reliabilityScore);

console.log("Fenice global source-health FINRA reconciliation tests: PASS");
