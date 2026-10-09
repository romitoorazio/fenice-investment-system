import assert from "node:assert/strict";
import { interpretNasdaqPublicMarketInfo, fetchNasdaqPublicMarketStatus, ensureNasdaqObservationFresh, NASDAQ_PUBLIC_MARKET_INFO } from "../lib/market/nasdaq-public-market-status.mjs";

const now = Date.parse("2026-10-09T17:24:10Z"); // 13:24 New York during regular session
const date = new Date(now - 10_000).toUTCString();
const h = (items = {}) => new Headers({ Date: date, Age: "0", ...items });
const opened = {
  status: { rCode: 200 },
  data: {
    country: "U.S.",
    mrktStatus: "Open",
    marketIndicator: "Market Open",
    isBusinessDay: true,
    openRaw: "2026-10-09T09:30:00",
    closeRaw: "2026-10-09T16:00:00",
  },
};
const report = (value = opened, hdr = h(), clock = now) => interpretNasdaqPublicMarketInfo(value, hdr, clock);
const valid = report();
assert.equal(valid.state, "OPEN");
assert.equal(valid.confidence, "ADVISORY_ONLY");
assert.equal(valid.executionAuthoritative, false);
assert.equal(valid.liveTradingAllowed, false);
assert.equal(valid.observedAt, new Date(now - 10_000).toISOString());
assert.equal(ensureNasdaqObservationFresh(valid, now).state, "OPEN");
assert.equal(ensureNasdaqObservationFresh(valid, now + 95_000).state, "UNKNOWN", "cache cannot keep old OPEN alive");
assert.equal(ensureNasdaqObservationFresh(valid, now - 10_000).state, "UNKNOWN", "future-dated cached report must fail");
assert.equal(ensureNasdaqObservationFresh(null, now).state, "UNKNOWN");

const closed = structuredClone(opened);
closed.data.mrktStatus = "Closed";
closed.data.marketIndicator = "Market Closed";
closed.data.isBusinessDay = false;
assert.equal(report(closed).state, "CLOSED");
assert.equal(report(opened, h({ Age: "100" })).state, "UNKNOWN");
assert.equal(report(opened, h({ Date: new Date(now - 100_000).toUTCString() })).state, "UNKNOWN");
assert.equal(report(opened, h({ Date: new Date(now + 30_000).toUTCString() })).state, "UNKNOWN");
assert.equal(report(opened, new Headers()).state, "UNKNOWN");
assert.equal(report(opened, h(), NaN).state, "UNKNOWN");
assert.equal(report({ ...opened, status: { rCode: 429 } }).state, "UNKNOWN");
assert.equal(report({ ...opened, data: { ...opened.data, country: "EU" } }).state, "UNKNOWN");
assert.equal(report({ ...opened, data: { ...opened.data, marketIndicator: "Market Closed" } }).state, "UNKNOWN");
assert.equal(report({ ...opened, data: { ...opened.data, isBusinessDay: false } }).state, "UNKNOWN");
assert.equal(report({ ...opened, data: { ...opened.data, openRaw: "2026-10-08T09:30:00" } }).state, "UNKNOWN");
assert.equal(report({ ...opened, data: { ...opened.data, closeRaw: "2026-10-09T12:00:00" } }).state, "UNKNOWN");
assert.equal(report({ ...opened, data: { ...opened.data, closeRaw: "2026-10-09T09:00:00" } }).state, "UNKNOWN");
assert.equal(report({ ...opened, data: { ...opened.data, closeRaw: "bad" } }).state, "UNKNOWN");
assert.equal(report(opened, h(), Date.parse("2026-10-10T17:24:10Z")).state, "UNKNOWN", "old HTTP date cannot be reused on weekend");
const refreshed = await fetchNasdaqPublicMarketStatus({
  fetcher: async (url, init) => {
    assert.equal(url, NASDAQ_PUBLIC_MARKET_INFO);
    assert.equal(init.method, "GET");
    assert.equal(init.cache, "no-store");
    assert(!JSON.stringify(init).includes("APCA-API-SECRET-KEY"), "no broker API secrets allowed");
    return { ok: true, json: async () => opened, headers: h() };
  },
  now,
});
assert.equal(refreshed.state, "OPEN");
assert.equal(refreshed.executionAuthoritative, false, "market-info cannot authorize orders");
assert.equal((await fetchNasdaqPublicMarketStatus({ fetcher: async () => { throw new Error("private-account-marker"); }, now })).state, "UNKNOWN");
assert.equal((await fetchNasdaqPublicMarketStatus({ fetcher: async () => ({ ok: false }), now })).state, "UNKNOWN");
assert(!JSON.stringify(await fetchNasdaqPublicMarketStatus({ fetcher: async () => { throw Error("PRIVATE"); }, now })).includes("PRIVATE"), "do not leak upstream error text");
console.log("Fenice Nasdaq advisory market status provenance, freshness and no-order tests: PASS.");
