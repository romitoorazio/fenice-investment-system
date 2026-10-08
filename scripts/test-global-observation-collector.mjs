import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";

const run = promisify(execFile);
const directory = await mkdtemp(path.join(os.tmpdir(), "fenice-global-collector-"));
const collector = new URL("./run-global-market-data-certification.mjs", import.meta.url).pathname;
const now = Date.parse("2026-10-05T13:25:00.000Z");
const unchanged = {
  "execution-market-evidence.json": { version: 11, observations: [], generatedAt: new Date(now - 600_000).toISOString() },
  "paper-order-queue.json": { mode: "PAPER", orders: [] },
  "paper-validation-campaign.json": { fixture: true, fills: 0 },
  "paper-oms-state.json": { mode: "PAPER", executions: [], liveTradingAllowed: false, brokerConnectivityAllowed: false },
  "instrument-master.json": { instruments: [] },
};
const bytes = new Map();
try {
  for (const [name, data] of Object.entries(unchanged)) {
    const value = JSON.stringify(data); bytes.set(name, value);
    await writeFile(path.join(directory, name), value);
  }
  const registry = { version: 2, policy: "DEFAULT_DENY_DUAL_CONTROL", provider: "twelve-data", entitlements: [{
    provider: "twelve-data", exchangeMic: "XMIL", status: "VERIFIED", paperAllowed: true,
    evidenceRef: "fixture:collector-entitlement", evidenceSha256: "a".repeat(64), reviewedAt: new Date(now - 3_600_000).toISOString(),
    validUntil: new Date(now + 86_400_000).toISOString(), usageScope: "NON_DISPLAY_INTERNAL", automatedUseAllowed: true,
  }] };
  await writeFile(path.join(directory, "global-market-data-entitlements.json"), JSON.stringify(registry));
  const preload = path.join(directory, "fixture-fetch.mjs");
  await writeFile(preload, `
    Date.now = () => ${now};
    globalThis.fetch = async rawUrl => {
      const url = new URL(rawUrl);
      if (process.env.FIXTURE_SCENARIO === "disabled") throw new Error("FIXTURE_UNEXPECTED_NETWORK_REQUEST");
      if (url.hostname === "query1.finance.yahoo.com") return new Response(JSON.stringify({ chart: { result: [{ meta: {
        regularMarketPrice: 8.13, regularMarketTime: ${now / 1000 - 20}, currency: "EUR",
      } }] } }));
      if (url.hostname !== "api.twelvedata.com") throw new Error("FIXTURE_UNEXPECTED_HOST");
      if (url.pathname === "/market_state") return new Response(JSON.stringify([{ code: "XMIL", is_market_open: process.env.FIXTURE_SCENARIO !== "closed" }]));
      if (url.pathname === "/quote") return new Response(JSON.stringify({ symbol: "ENEL", mic_code: "XMIL", currency: "EUR",
        close: "8.125", timestamp: ${now / 1000 - 15}, ...(process.env.FIXTURE_SCENARIO === "error" ? { status: "error", code: 401 } : {}),
      }));
      throw new Error("FIXTURE_UNEXPECTED_ENDPOINT");
    };
  `);
  const baseEnv = { PATH: process.env.PATH, TWELVE_DATA_API_KEY: "DUMMY", FENICE_GLOBAL_OBSERVATION_DATA_DIR: directory,
    FENICE_GLOBAL_EXECUTION_PROBES: "1", FENICE_GLOBAL_REQUIRE_OPEN_SESSION: "1", FENICE_TWELVE_DATA_MIN_INTERVAL_MS: "1000",
    FENICE_TWELVE_DATA_GLOBAL_PAPER_MICS: "XMIL", FENICE_TWELVE_DATA_GLOBAL_ENTITLEMENT_REF: "fixture:collector-entitlement",
    FENICE_TWELVE_DATA_GLOBAL_ENTITLEMENT_SHA256: "a".repeat(64), FENICE_TWELVE_DATA_GLOBAL_ENTITLEMENT_CONFIRMED_AT: new Date(now - 60_000).toISOString(),
    FENICE_TWELVE_DATA_429_RETRIES: "0" };
  async function collect(scenario, extra = {}, observe = true) {
    await run(process.execPath, ["--experimental-strip-types", "--import", preload, collector, ...(observe ? ["--observe-only"] : [])], {
      env: { ...baseEnv, FIXTURE_SCENARIO: scenario, ...extra }, timeout: 15_000,
    });
    const report = JSON.parse(await readFile(path.join(directory, "global-market-data-certification.json"), "utf8"));
    assert.equal(report.mode, "OBSERVATION_ONLY");
    assert.equal(report.paperCoreMutation, false);
    assert.equal(report.liveTradingReleased, false);
    assert.equal(report.brokerConnectivityAllowed, false);
    assert.equal(report.summary.certified, 0, "one entitled source plus Yahoo cannot create an independent PAPER quorum");
    for (const [name, value] of bytes) assert.equal(await readFile(path.join(directory, name), "utf8"), value, `${name} must remain byte-identical`);
    return report;
  }
  const good = await collect("open");
  assert.equal(good.summary.totalTargets, 1);
  assert.equal(good.summary.paperEligibleTwelveData, 1);
  assert.equal(good.probes[0].twelveData.paperSessionAllowed, true);
  assert.equal(good.probes[0].twelveData.runtimeEntitlementMatched, true);
  assert.equal(good.rateLimit.maxRateLimitRetries, 0);
  assert.deepEqual(good.certifications[0].paperEligibleFamilies, ["twelve-data"], "collector normalization must preserve admission and session proofs");
  const missing = await collect("open", { FENICE_TWELVE_DATA_GLOBAL_ENTITLEMENT_CONFIRMED_AT: "" });
  assert.equal(missing.targetSelection.runtimeEntitlementClaimConfigured, false);
  assert.equal(missing.summary.paperEligibleTwelveData, 0);
  const closed = await collect("closed");
  assert.equal(closed.summary.paperEligibleTwelveData, 0);
  assert.equal(closed.probes[0].twelveData.paperSessionAllowed, false);
  const error = await collect("error");
  assert.equal(error.probes[0].twelveData.accepted, false);
  assert.equal(error.summary.paperEligibleTwelveData, 0);
  const disabled = await collect("disabled", { FENICE_GLOBAL_EXECUTION_PROBES: "0" });
  assert.equal(disabled.summary.totalTargets, 0);
  assert.deepEqual(disabled.errors, [], "zero budget must perform zero provider requests");
  await assert.rejects(collect("disabled", { FENICE_GLOBAL_EXECUTION_PROBES: "NaN" }), /GLOBAL_INVALID_PROBE_LIMIT/);
  await assert.rejects(collect("disabled", { FENICE_TWELVE_DATA_429_RETRIES: "NaN" }), /GLOBAL_INVALID_RETRY_LIMIT/);
  await assert.rejects(collect("disabled", {}, false), /GLOBAL_PAPER_CORE_MUTATION_DISABLED_DURING_ACTIVE_V6/);
  console.log("Fenice isolated global observation collector tests: PASS");
} finally { await rm(directory, { recursive: true, force: true }); }
