import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ALPACA_PAPER_CLOCK_ENDPOINT,
  evaluateAlpacaClockResponse,
  fetchAlpacaPaperClock,
} from "../lib/market/alpaca-paper-clock-runtime.mjs";
import { verifyUsPaperClock, resolveVenueSession } from "../lib/market/venue-session-intelligence.ts";

const now = Date.parse("2026-10-09T18:42:00.000Z");
const stamp = (shiftMs = 0) => new Date(now + shiftMs).toISOString();
const valid = {
  timestamp: stamp(-3000), is_open: true,
  next_open: "2026-10-12T13:30:00Z",
  next_close: "2026-10-09T20:00:00Z",
};
const ready = evaluateAlpacaClockResponse(valid, now);
assert.equal(ready.configured, true);
assert.equal(ready.evidence.authoritative, true);
assert.equal(ready.evidence.state, "OPEN");
assert.equal(ready.decision.allowed, true);
assert.equal(ready.brokerConnectivityAllowed, false);
assert.equal(ready.liveTradingAllowed, false);
assert.equal(ready.diagnosticOnly, true);
assert.equal(verifyUsPaperClock(ready, now).truth, "OPEN");
assert.equal(resolveVenueSession("XNAS", ready, now).state, "OPEN");
assert.equal(resolveVenueSession("XNYS", ready, now).state, "OPEN");
const closed = evaluateAlpacaClockResponse({ ...valid, is_open: false }, now);
assert.equal(closed.evidence.state, "CLOSED");
assert.equal(closed.decision.allowed, false);
assert.equal(verifyUsPaperClock(closed, now).truth, "CLOSED");

for (const payload of [
  { ...valid, timestamp: stamp(-180000) },
  { ...valid, timestamp: stamp(+180000) },
  { ...valid, timestamp: "invalid" },
  { ...valid, is_open: "true" },
  { ...valid, is_open: null },
  {},
]) {
  const report = evaluateAlpacaClockResponse(payload, now);
  assert.equal(report.evidence.state, "UNKNOWN");
  assert.equal(report.evidence.authoritative, false);
  assert.equal(report.decision.allowed, false);
  assert.equal(verifyUsPaperClock(report, now).truth, "UNKNOWN");
}

let called = false;
const missing = await fetchAlpacaPaperClock({
  now, fetcher: async () => { called = true; throw new Error("should not run"); },
});
assert.equal(called, false);
assert.equal(missing.configured, false);
assert.equal(missing.error, "ALPACA_PAPER_CLOCK_NOT_CONFIGURED");
assert.equal(missing.evidence.state, "UNKNOWN");
assert.equal(missing.liveTradingAllowed, false);

const secretId = "alpaca-paper-test-only-key-id";
const secretKey = "alpaca-paper-test-only-secret";
const queried = await fetchAlpacaPaperClock({
  now, keyId: secretId, secretKey,
  fetcher: async (endpoint, opts) => {
    assert.equal(endpoint, ALPACA_PAPER_CLOCK_ENDPOINT, "must never hit live trading host");
    assert.equal(opts.method, "GET");
    assert.equal(opts.cache, "no-store");
    assert.equal(opts.headers["APCA-API-KEY-ID"], secretId);
    assert.equal(opts.headers["APCA-API-SECRET-KEY"], secretKey);
    assert.equal(opts.body, undefined, "no orders, POST or account writes");
    return { ok: true, json: async () => valid };
  },
});
assert.equal(queried.evidence.state, "OPEN");
assert(!JSON.stringify(queried).includes(secretId));
assert(!JSON.stringify(queried).includes(secretKey));

for (const failingFetcher of [
  async () => ({ ok: false, status: 401, text: async () => secretKey }),
  async () => { throw new Error("upstream credential leak " + secretKey); },
  async () => ({ ok: true, json: async () => { throw new Error("secret leak " + secretId); } }),
]) {
  const report = await fetchAlpacaPaperClock({ keyId: secretId, secretKey, now, fetcher: failingFetcher });
  assert.equal(report.evidence.state, "UNKNOWN");
  assert.equal(report.evidence.authoritative, false);
  assert.equal(report.liveTradingAllowed, false);
  assert(!JSON.stringify(report).includes(secretId));
  assert(!JSON.stringify(report).includes(secretKey));
}

const root = new URL("../", import.meta.url);
for (const relative of [
  "app/mercati/page.tsx",
  "app/api/market/sessions/route.ts",
  "app/api/trading/readiness/route.ts",
  "app/readiness/page.tsx",
]) {
  const source = await readFile(new URL(relative, root), "utf8");
  assert.match(source, /getAlpacaPaperClock/, "all user-visible and API readiness paths must use runtime PAPER clock");
  assert.doesNotMatch(source, /liveTradingAllowed: true|brokerConnectivityAllowed: true|submitOrder|executeTrade/, "runtime market status cannot grant execution authority");
}
console.log("Fenice encrypted Vercel Alpaca PAPER clock read-only regression: PASS.");
